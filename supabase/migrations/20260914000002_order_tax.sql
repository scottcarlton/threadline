-- Compute sales tax on orders.
--
-- Spec: Notion > Threadline > Projects > Order Invoicing (SCO-175).
--
-- This is the first thing in the product that applies tax. Brands have been
-- able to configure it since 20260425000003_org_taxes.sql (US per-state rates,
-- VAT, GST) and 20260426000001 (the manual-brand equivalents), and nothing has
-- ever charged a cent of it.
--
-- ───────────────────────────────────────────────────────────────────────────
-- Why this lives in the database rather than the app layer
-- ───────────────────────────────────────────────────────────────────────────
--
-- A rep writes the order, but the tax config belongs to the brand, and a rep
-- cannot read it: `organizations` has no rep-to-brand SELECT policy (only
-- "Org visible to members" and "Brand can view connected rep organizations"),
-- and `organization_sales_tax_rates` is `is_org_member` only. A SECURITY
-- DEFINER trigger can read it on their behalf while never exposing it, which
-- is exactly why a rep can see the resulting number but never the rates
-- behind it.
--
-- It also means no write path can forget. Orders are written from the order
-- routes, the status endpoint, the AI tools, and the buyer portal; a trigger
-- covers all of them and anything added later.
--
-- The rule therefore lives here and ONLY here. There is deliberately no
-- TypeScript twin: two implementations of tax rules drift, and this is the one
-- place in the product where being wrong is a legal problem rather than a UX
-- problem. Consumers read `orders.tax_amount`. Behaviour is pinned by
-- tests/rls/order-tax.test.ts.
--
-- ───────────────────────────────────────────────────────────────────────────
-- NULL is not zero
-- ───────────────────────────────────────────────────────────────────────────
--
-- `tax_amount` is NULL when tax cannot be determined yet (sales tax is on but
-- no address resolves) and 0 when it has been determined that none is owed.
-- Zero is a claim; NULL is the absence of one. Surfaces render NULL as
-- "Estimated at invoicing" rather than $0.00.
--
-- ───────────────────────────────────────────────────────────────────────────
-- What it must not touch
-- ───────────────────────────────────────────────────────────────────────────
--
-- `orders.total_amount` is merchandise only and feeds commission (see
-- src/lib/utils/order-total.ts). Tax is a separate column and is never summed
-- into it; doing so would inflate every rep's commission by the tax rate.

ALTER TABLE orders
  ADD COLUMN tax_amount NUMERIC(12, 2);

COMMENT ON COLUMN orders.tax_amount IS
  'Sales tax on the merchandise subtotal, maintained by recalc_order_tax(). NULL means not determinable yet (no resolvable address), which is not the same as zero. Never included in total_amount, which feeds commission.';

-- ---------------------------------------------------------------------------
-- compute_order_tax
-- ---------------------------------------------------------------------------
--
-- Split out from the trigger so the test suite can call it directly with a
-- known order and assert on the number, rather than inferring the rule from
-- side effects.

CREATE OR REPLACE FUNCTION public.compute_order_tax(
  p_brand_id UUID,
  p_location_id UUID,
  p_account_id UUID,
  p_subtotal NUMERIC
)
RETURNS NUMERIC AS $$
DECLARE
  v_owner_org_id UUID;
  v_org_type TEXT;

  -- Normalized config, resolved from `brands` for a rep-owned manual brand
  -- and from `organizations` for a real brand org. Mirrors the branch in
  -- src/lib/server/orders/resolve-order-settings.ts, which is the app-side
  -- resolver for the same split.
  v_pricing_display TEXT;
  v_us_enabled BOOLEAN;
  v_us_general_rate NUMERIC;
  v_vat_enabled BOOLEAN;
  v_vat_rate NUMERIC;
  v_gst_enabled BOOLEAN;
  v_gst_rate NUMERIC;

  v_ship_from_state TEXT;
  v_ship_to_state TEXT;
  v_ship_to_country TEXT;

  v_rate NUMERIC;
  v_is_us BOOLEAN;
BEGIN
  IF p_brand_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT b.organization_id, o.org_type
    INTO v_owner_org_id, v_org_type
    FROM brands b
    JOIN organizations o ON o.id = b.organization_id
   WHERE b.id = p_brand_id;

  IF v_owner_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_org_type = 'rep' THEN
    -- Manual brand: commerce settings live on the brands row.
    SELECT
      COALESCE(b.taxes_pricing_display, 'exclusive'),
      COALESCE(b.taxes_us_sales_tax_enabled, FALSE),
      b.taxes_us_general_rate,
      COALESCE(b.taxes_vat_enabled, FALSE),
      b.taxes_vat_rate,
      COALESCE(b.taxes_gst_enabled, FALSE),
      b.taxes_gst_rate,
      b.shipping_from_state
    INTO
      v_pricing_display, v_us_enabled, v_us_general_rate,
      v_vat_enabled, v_vat_rate, v_gst_enabled, v_gst_rate,
      v_ship_from_state
    FROM brands b
    WHERE b.id = p_brand_id;
  ELSE
    SELECT
      COALESCE(o.taxes_pricing_display, 'exclusive'),
      COALESCE(o.taxes_us_sales_tax_enabled, FALSE),
      o.taxes_us_general_rate,
      COALESCE(o.taxes_vat_enabled, FALSE),
      o.taxes_vat_rate,
      COALESCE(o.taxes_gst_enabled, FALSE),
      o.taxes_gst_rate,
      o.shipping_from_state
    INTO
      v_pricing_display, v_us_enabled, v_us_general_rate,
      v_vat_enabled, v_vat_rate, v_gst_enabled, v_gst_rate,
      v_ship_from_state
    FROM organizations o
    WHERE o.id = v_owner_org_id;
  END IF;

  -- Nothing switched on: the brand has decided it does not charge tax. That
  -- is a determined answer, so zero rather than NULL.
  IF NOT v_us_enabled AND NOT v_vat_enabled AND NOT v_gst_enabled THEN
    RETURN 0;
  END IF;

  -- Ship-to: the order's shipping location, falling back to the account's own
  -- address when no location row is attached.
  IF p_location_id IS NOT NULL THEN
    SELECT NULLIF(BTRIM(UPPER(al.state)), ''), NULLIF(BTRIM(UPPER(al.country)), '')
      INTO v_ship_to_state, v_ship_to_country
      FROM account_locations al
     WHERE al.id = p_location_id;
  END IF;

  IF v_ship_to_state IS NULL AND p_account_id IS NOT NULL THEN
    SELECT NULLIF(BTRIM(UPPER(a.state)), ''), NULLIF(BTRIM(UPPER(a.country)), '')
      INTO v_ship_to_state, v_ship_to_country
      FROM accounts a
     WHERE a.id = p_account_id;
  END IF;

  v_ship_from_state := NULLIF(BTRIM(UPPER(v_ship_from_state)), '');

  -- A null country is treated as US: both accounts.country and
  -- account_locations.country are TEXT DEFAULT 'US', so an empty value means
  -- nobody changed it rather than "somewhere else".
  v_is_us := v_ship_to_country IS NULL
    OR v_ship_to_country IN ('US', 'USA', 'UNITED STATES');

  IF v_is_us THEN
    -- A US sale with only VAT/GST configured is out of scope for those
    -- systems, so nothing is owed.
    IF NOT v_us_enabled THEN
      RETURN 0;
    END IF;

    -- US sales tax is resolved from an address. With neither endpoint known,
    -- a per-state row could still change the answer, so the honest result is
    -- "not yet known" rather than a zero we cannot support.
    IF v_ship_to_state IS NULL AND v_ship_from_state IS NULL THEN
      RETURN NULL;
    END IF;

    -- Precedence, in order:
    --
    --   1. A `destination` row on the ship-to state. The buyer's state taxes
    --      the sale, the common modern rule, so it wins when both match.
    --   2. An `origin` row on the ship-from state. Origin sourcing is
    --      normally an intrastate rule, so it only applies when the
    --      destination state has no row of its own.
    --   3. The US-wide general rate, defined by its own migration
    --      (20260425000007) as the rate that "applies when no per-state rate
    --      matches; works alongside the per-state table". Manual brands
    --      usually have no per-state rows and land here directly.
    --   4. Nothing: no nexus configured for this sale.
    --
    -- A state has exactly one row and therefore exactly one sourcing mode
    -- (UNIQUE on (organization_id, state_code) / (brand_id, state_code)). The
    -- mode decides which address selects the row, which is what the settings
    -- UI tells the user it does.
    IF v_org_type = 'rep' THEN
      SELECT r.rate INTO v_rate
        FROM brand_sales_tax_rates r
       WHERE r.brand_id = p_brand_id
         AND r.tax_type = 'destination'
         AND BTRIM(UPPER(r.state_code)) = v_ship_to_state
       LIMIT 1;

      IF v_rate IS NULL THEN
        SELECT r.rate INTO v_rate
          FROM brand_sales_tax_rates r
         WHERE r.brand_id = p_brand_id
           AND r.tax_type = 'origin'
           AND BTRIM(UPPER(r.state_code)) = v_ship_from_state
         LIMIT 1;
      END IF;
    ELSE
      SELECT r.rate INTO v_rate
        FROM organization_sales_tax_rates r
       WHERE r.organization_id = v_owner_org_id
         AND r.tax_type = 'destination'
         AND BTRIM(UPPER(r.state_code)) = v_ship_to_state
       LIMIT 1;

      IF v_rate IS NULL THEN
        SELECT r.rate INTO v_rate
          FROM organization_sales_tax_rates r
         WHERE r.organization_id = v_owner_org_id
           AND r.tax_type = 'origin'
           AND BTRIM(UPPER(r.state_code)) = v_ship_from_state
         LIMIT 1;
      END IF;
    END IF;

    IF v_rate IS NULL THEN
      v_rate := v_us_general_rate;
    END IF;

  ELSIF v_vat_enabled THEN
    v_rate := v_vat_rate;
  ELSIF v_gst_enabled THEN
    v_rate := v_gst_rate;
  ELSE
    -- Non-US sale, only US sales tax configured.
    RETURN 0;
  END IF;

  IF v_rate IS NULL OR v_rate <= 0 OR COALESCE(p_subtotal, 0) <= 0 THEN
    RETURN 0;
  END IF;

  -- Under tax-exclusive pricing the tax sits on top of the subtotal. Under
  -- tax-inclusive pricing it is already inside the line prices, so it is
  -- backed out instead and the payable total does not move. Reversing these
  -- overcharges every buyer by the full rate.
  IF v_pricing_display = 'inclusive' THEN
    RETURN ROUND(p_subtotal - (p_subtotal / (1 + v_rate / 100)), 2);
  END IF;

  RETURN ROUND(p_subtotal * v_rate / 100, 2);
END;
$$ LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.compute_order_tax(UUID, UUID, UUID, NUMERIC) IS
  'Sales tax on a merchandise subtotal, resolved from the brand owner''s tax config. SECURITY DEFINER so it can read config a rep writing the order cannot see. Returns NULL when undeterminable, 0 when determined to be none.';

-- ---------------------------------------------------------------------------
-- recalc_order_tax
-- ---------------------------------------------------------------------------
--
-- BEFORE, not AFTER, and so it assigns NEW.tax_amount instead of issuing its
-- own UPDATE against orders. An AFTER trigger that updated the same row would
-- re-enter itself; a BEFORE trigger simply mutates the row on its way in.
--
-- This composes with the existing update_order_total(), which is an AFTER
-- trigger on order_lines that runs `UPDATE orders SET total_amount = ...`.
-- That UPDATE fires this trigger with the new subtotal already in place, so
-- editing a line recalculates tax without needing a second trigger on
-- order_lines.

CREATE OR REPLACE FUNCTION public.recalc_order_tax()
RETURNS TRIGGER AS $$
BEGIN
  NEW.tax_amount := public.compute_order_tax(
    NEW.brand_id,
    NEW.location_id,
    NEW.account_id,
    NEW.total_amount
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public;

COMMENT ON FUNCTION public.recalc_order_tax() IS
  'Keeps orders.tax_amount current. BEFORE trigger so it assigns NEW rather than re-entering via its own UPDATE.';

CREATE TRIGGER orders_recalc_tax
  BEFORE INSERT OR UPDATE OF total_amount, location_id, account_id, brand_id, status
  ON orders
  FOR EACH ROW EXECUTE FUNCTION public.recalc_order_tax();

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
--
-- Existing orders have no tax figure. A no-op UPDATE would not fire the
-- trigger above (its column list does not include a bare touch), so the value
-- is computed directly here.

UPDATE orders o
SET tax_amount = public.compute_order_tax(o.brand_id, o.location_id, o.account_id, o.total_amount);
