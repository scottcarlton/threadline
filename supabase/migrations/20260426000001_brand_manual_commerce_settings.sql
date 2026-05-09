-- Brand-side commerce settings for rep-org manual brands.
--
-- A "manual brand" is a `brands` row whose owning organization is `org_type='rep'`
-- — i.e. a rep org has authored a brand record for an outside brand they sell
-- but who isn't on Threadline as a Brand Org. For these brands, commerce
-- settings (taxes, shipping, returns, payments, order numbering, commission
-- defaults) live on the `brands` row itself, edited by admin/owner of the
-- owning rep org via a modal on /brands/[id].
--
-- Brand Org-owned brands continue to read commerce settings from
-- `organizations` and the existing `organization_*` satellite tables. The
-- order-creation resolver branches on the brand's owning `org_type`.
--
-- This migration is purely additive on the brand side. Nothing is dropped
-- from `organizations` or its satellites. The one removal is
-- `accounts.shipping_method_id` — its FK only resolves to
-- `organization_shipping_methods` and so doesn't generalize to manual brands.
-- Other account override columns (commission_rate_override,
-- order_minimum_override, payment_preference, payment_terms, shipping_method
-- as free-text) are kept since they're brand-agnostic.

-- ── 1. Commerce columns on `brands` ──────────────────────────────────────
-- All nullable; only populated on rep-owned manual brands. BO-owned brands
-- (org_type='brand') leave these NULL and the order resolver reads from
-- `organizations` instead.

ALTER TABLE brands
  -- Orders
  ADD COLUMN order_number_prefix TEXT,
  ADD COLUMN next_order_number INTEGER,
  ADD COLUMN order_number_pad_width INTEGER
    CHECK (order_number_pad_width IS NULL OR (order_number_pad_width >= 0 AND order_number_pad_width <= 12)),
  ADD COLUMN order_minimum_enabled BOOLEAN,
  ADD COLUMN order_minimum_amount NUMERIC(12, 2),
  ADD COLUMN handling_fee_amount NUMERIC(12, 2),
  ADD COLUMN default_commission_rate DECIMAL(5, 2),

  -- Taxes
  ADD COLUMN taxes_pricing_display TEXT
    CHECK (taxes_pricing_display IS NULL OR taxes_pricing_display IN ('exclusive', 'inclusive')),
  ADD COLUMN taxes_us_sales_tax_enabled BOOLEAN,
  ADD COLUMN taxes_us_ein TEXT,
  ADD COLUMN taxes_us_general_rate NUMERIC(5, 2),
  ADD COLUMN taxes_vat_enabled BOOLEAN,
  ADD COLUMN taxes_vat_registration TEXT,
  ADD COLUMN taxes_vat_rate NUMERIC(5, 2),
  ADD COLUMN taxes_gst_enabled BOOLEAN,
  ADD COLUMN taxes_gst_registration TEXT,
  ADD COLUMN taxes_gst_rate NUMERIC(5, 2),

  -- Shipping (default_shipping_method_id FK added after brand_shipping_methods exists)
  ADD COLUMN shipping_use_business_address BOOLEAN,
  ADD COLUMN shipping_from_line1 TEXT,
  ADD COLUMN shipping_from_line2 TEXT,
  ADD COLUMN shipping_from_city TEXT,
  ADD COLUMN shipping_from_state TEXT,
  ADD COLUMN shipping_from_zip TEXT,
  ADD COLUMN shipping_from_country TEXT,
  ADD COLUMN shipping_free_threshold_enabled BOOLEAN,
  ADD COLUMN shipping_free_threshold_amount NUMERIC(12, 2),

  -- Returns
  ADD COLUMN returns_window_days INTEGER,
  ADD COLUMN returns_policy_text TEXT,
  ADD COLUMN returns_use_ship_from_address BOOLEAN,
  ADD COLUMN returns_address_line1 TEXT,
  ADD COLUMN returns_address_line2 TEXT,
  ADD COLUMN returns_address_city TEXT,
  ADD COLUMN returns_address_state TEXT,
  ADD COLUMN returns_address_zip TEXT,
  ADD COLUMN returns_address_country TEXT,
  ADD COLUMN returns_restocking_fee_type TEXT
    CHECK (returns_restocking_fee_type IS NULL OR returns_restocking_fee_type IN ('percent', 'flat')),
  ADD COLUMN returns_restocking_fee_value NUMERIC(8, 2),
  ADD COLUMN returns_buyer_pays_shipping BOOLEAN,

  -- Payments
  ADD COLUMN payments_processor TEXT
    CHECK (payments_processor IS NULL OR payments_processor IN ('stripe', 'manual')),
  ADD COLUMN payments_stripe_account_id TEXT,
  ADD COLUMN payments_stripe_link_enabled BOOLEAN,
  ADD COLUMN payments_required_deposit_enabled BOOLEAN,
  ADD COLUMN payments_required_deposit_percent NUMERIC(5, 2),
  ADD COLUMN payments_deposit_account_name TEXT,
  ADD COLUMN payments_deposit_account_last4 TEXT,
  ADD COLUMN payments_surcharge_pass_to_buyer BOOLEAN,
  ADD COLUMN accepted_payment_methods TEXT[],
  ADD COLUMN default_payment_method TEXT,
  ADD COLUMN default_payment_terms TEXT;

-- ── 2. brand_sales_tax_rates ─────────────────────────────────────────────
-- Same shape as organization_sales_tax_rates but keyed on brand_id. Used by
-- the order resolver only when the brand's owning org_type='rep'.

CREATE TABLE brand_sales_tax_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,
  rate NUMERIC(5, 2) NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('origin', 'destination')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, state_code)
);

ALTER TABLE brand_sales_tax_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: own-org members + federated reads (mirrors brand_terms canonical
-- pattern from permissions §A.6). A connected org sees the brand's rates.
CREATE POLICY "Brand tax rates visible to org members"
  ON brand_sales_tax_rates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_sales_tax_rates.brand_id
        AND (
          is_org_member(b.organization_id)
          OR b.organization_id IN (SELECT get_connected_org_ids())
        )
    )
  );

-- INSERT/UPDATE/DELETE: admin/owner of the brand's owning org only.
CREATE POLICY "Brand tax rates managed by admin/owner"
  ON brand_sales_tax_rates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_sales_tax_rates.brand_id
        AND get_user_role(b.organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Brand tax rates updated by admin/owner"
  ON brand_sales_tax_rates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_sales_tax_rates.brand_id
        AND get_user_role(b.organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Brand tax rates deleted by admin/owner"
  ON brand_sales_tax_rates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_sales_tax_rates.brand_id
        AND get_user_role(b.organization_id) IN ('admin', 'owner')
    )
  );

-- ── 3. brand_shipping_methods ────────────────────────────────────────────

CREATE TABLE brand_shipping_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('flat', 'calculated', 'free')),
  cost_amount NUMERIC(12, 2),
  delivery_window TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE brand_shipping_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand shipping methods visible to org members"
  ON brand_shipping_methods FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_shipping_methods.brand_id
        AND (
          is_org_member(b.organization_id)
          OR b.organization_id IN (SELECT get_connected_org_ids())
        )
    )
  );

CREATE POLICY "Brand shipping methods managed by admin/owner"
  ON brand_shipping_methods FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_shipping_methods.brand_id
        AND get_user_role(b.organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Brand shipping methods updated by admin/owner"
  ON brand_shipping_methods FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_shipping_methods.brand_id
        AND get_user_role(b.organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Brand shipping methods deleted by admin/owner"
  ON brand_shipping_methods FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM brands b
      WHERE b.id = brand_shipping_methods.brand_id
        AND get_user_role(b.organization_id) IN ('admin', 'owner')
    )
  );

-- ── 4. brands.default_shipping_method_id FK ──────────────────────────────
-- Added after brand_shipping_methods exists so the FK target resolves.

ALTER TABLE brands
  ADD COLUMN default_shipping_method_id UUID REFERENCES brand_shipping_methods(id);

-- ── 5. accounts.shipping_method_id removal ───────────────────────────────
-- The FK only resolved to organization_shipping_methods, which makes no
-- sense for manual brands owned by rep orgs. The free-text
-- `accounts.shipping_method` column is kept as a brand-agnostic override.
-- A per-account-per-brand junction can be reintroduced later if needed.

ALTER TABLE accounts
  DROP COLUMN IF EXISTS shipping_method_id;

-- ── 6. Order-number generator rewrite ────────────────────────────────────
-- The pre-existing generator at 20260405000002_domain_tables.sql:129–145 had
-- three bugs that were never caught:
--   1. Non-atomic — SELECT COUNT(*) + 1 races under concurrent inserts.
--   2. Ignored organizations.order_number_prefix (used UPPER(LEFT(slug, 3))).
--   3. Ignored organizations.order_number_pad_width (hardcoded LPAD(.., 6, '0')).
--   4. Ignored organizations.next_order_number entirely.
--
-- The /organization/orders panel let users set the prefix and pad width but
-- the trigger was a no-op against those config columns.
--
-- This rewrite:
--   * Reads prefix / next-number / pad-width from the right source row,
--     branching on the brand's owning org_type.
--   * Increments via UPDATE … RETURNING for atomicity (single statement,
--     row-locked).
--   * Falls back gracefully when manual-brand counters are NULL (treats
--     missing pad/prefix as defaults so an INSERT before the rep configures
--     commerce settings still produces a valid number).

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  _org_type TEXT;
  _brand_org_id UUID;
  _seq INTEGER;
  _prefix TEXT;
  _pad INTEGER;
BEGIN
  -- Look up the brand's owning org_type. The brand is the source of truth
  -- for which counter to advance — not the order's organization_id (which
  -- can differ for rep-owned manual brand orders, though for BO brands
  -- they coincide).
  SELECT o.org_type, b.organization_id
  INTO _org_type, _brand_org_id
  FROM brands b
  JOIN organizations o ON o.id = b.organization_id
  WHERE b.id = NEW.brand_id;

  IF _org_type = 'rep' THEN
    -- Manual brand path — counter lives on `brands`. Initialize to 1 if
    -- the rep hasn't configured commerce settings yet.
    UPDATE brands
      SET next_order_number = COALESCE(next_order_number, 1) + 1
      WHERE id = NEW.brand_id
      RETURNING
        COALESCE(next_order_number - 1, 1),
        order_number_prefix,
        COALESCE(order_number_pad_width, 0)
      INTO _seq, _prefix, _pad;
  ELSE
    -- BO path — counter lives on `organizations`.
    UPDATE organizations
      SET next_order_number = COALESCE(next_order_number, 1) + 1
      WHERE id = _brand_org_id
      RETURNING
        COALESCE(next_order_number - 1, 1),
        order_number_prefix,
        COALESCE(order_number_pad_width, 0)
      INTO _seq, _prefix, _pad;
  END IF;

  -- Empty/null prefix is allowed — produces a bare numeric. Pad of 0 means
  -- no leading zeros (LPAD with width <= length is a no-op).
  NEW.order_number := COALESCE(_prefix, '') || LPAD(_seq::TEXT, GREATEST(_pad, 1), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
