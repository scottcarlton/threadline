-- ============================================================
-- Fix order number truncation past sequence 9
-- ============================================================
--
-- generate_order_number() rendered order numbers as
-- COALESCE(_prefix, '') || LPAD(_seq::TEXT, GREATEST(_pad, 1), '0').
-- LPAD truncates when the target width is shorter than the input
-- string, it is not a no-op. organizations.order_number_pad_width and
-- brands.order_number_pad_width both default to 0, so GREATEST(_pad, 1)
-- resolved to a width of 1 for any org that has not customised padding.
-- Once the sequence reached two digits, LPAD('10', 1, '0') truncated to
-- '1', colliding with sequence 1 on the global unique constraint
-- orders_order_number_key. Order creation failed with 23505 for the
-- 10th order onward, permanently, because the counter kept advancing
-- while every generated value kept truncating to an already-used digit.
--
-- Fix: floor the pad width at LENGTH(_seq::TEXT) so LPAD can only ever
-- extend the rendered number, never truncate it.
--
-- No data backfill needed. order_number is stored on insert, not
-- recomputed, so existing rows are unaffected. Any org that already hit
-- the collision will simply succeed on its next insert, because its
-- counter has already advanced past the colliding sequence value.

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

  -- Empty/null prefix is allowed, produces a bare numeric. LPAD pads up to
  -- the target width but truncates the input if the width is shorter, so
  -- the pad width must never fall below the sequence's own digit count or
  -- the render will be cut down and collide with an earlier sequence.
  NEW.order_number := COALESCE(_prefix, '') || LPAD(_seq::TEXT, GREATEST(_pad, LENGTH(_seq::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ============================================================
-- Defensive hardening: generate_expense_number() has the same defect
-- class (LPAD with a hardcoded width of 5), but it is not an active bug
-- today, since it would only trigger past 99999 expenses for a single
-- org. Applying the same floor here pre-emptively so it can never
-- truncate and collide, without changing anything else about the
-- function.
-- ============================================================

CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TRIGGER AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  SELECT slug INTO org_slug FROM public.organizations WHERE id = NEW.organization_id;
  SELECT COUNT(*) + 1 INTO seq_num FROM public.brand_expenses WHERE organization_id = NEW.organization_id;
  NEW.expense_number := 'EXP-' || UPPER(LEFT(org_slug, 3)) || '-' || LPAD(seq_num::TEXT, GREATEST(5, LENGTH(seq_num::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
