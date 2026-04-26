-- Phase 5 of organization redesign: Commerce > Shipping.
--
-- Strategy: ADD-ONLY in this migration. Existing text columns
-- (`organizations.default_shipping_method`, `accounts.shipping_method`,
-- `orders.shipping_method`) stay untouched because the order flow still
-- reads them. The settings writers in this PR dual-write the linked
-- method's name into the legacy text columns so /orders/new keeps
-- working with stale readers. A follow-up PR migrates the readers,
-- then drops the legacy columns. orders.shipping_method stays free-form
-- text by design — historical orders should preserve the method name as
-- it was at order time.

-- New table: per-org shipping methods.
CREATE TABLE organization_shipping_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('flat', 'calculated', 'free')),
  cost_amount NUMERIC(12, 2),
  delivery_window TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX organization_shipping_methods_org_idx
  ON organization_shipping_methods (organization_id);

ALTER TABLE organization_shipping_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read shipping methods"
  ON organization_shipping_methods FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert shipping methods"
  ON organization_shipping_methods FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update shipping methods"
  ON organization_shipping_methods FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete shipping methods"
  ON organization_shipping_methods FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Org-level shipping config additions.
ALTER TABLE organizations
  ADD COLUMN shipping_use_business_address BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN shipping_from_line1 TEXT,
  ADD COLUMN shipping_from_line2 TEXT,
  ADD COLUMN shipping_from_city TEXT,
  ADD COLUMN shipping_from_state TEXT,
  ADD COLUMN shipping_from_zip TEXT,
  ADD COLUMN shipping_from_country TEXT,
  ADD COLUMN shipping_free_threshold_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN shipping_free_threshold_amount NUMERIC(12, 2),
  ADD COLUMN default_shipping_method_id UUID REFERENCES organization_shipping_methods(id) ON DELETE SET NULL;

-- Per-account override.
ALTER TABLE accounts
  ADD COLUMN shipping_method_id UUID REFERENCES organization_shipping_methods(id) ON DELETE SET NULL;

-- Backfill: every distinct existing default_shipping_method value (per org)
-- becomes a method row, then organizations.default_shipping_method_id is
-- linked. cost_type defaults to 'flat' (the most common case); admins can
-- adjust after migration.
INSERT INTO organization_shipping_methods (organization_id, name, cost_type)
SELECT DISTINCT o.id, o.default_shipping_method, 'flat'
FROM organizations o
WHERE o.default_shipping_method IS NOT NULL
  AND o.default_shipping_method <> '';

UPDATE organizations o
SET default_shipping_method_id = m.id
FROM organization_shipping_methods m
WHERE o.id = m.organization_id
  AND o.default_shipping_method = m.name
  AND o.default_shipping_method_id IS NULL;

-- Backfill accounts: for each account with a non-null shipping_method,
-- ensure a method row exists for the account's org with that name, then
-- link.
INSERT INTO organization_shipping_methods (organization_id, name, cost_type)
SELECT DISTINCT a.organization_id, a.shipping_method, 'flat'
FROM accounts a
WHERE a.shipping_method IS NOT NULL
  AND a.shipping_method <> ''
  AND NOT EXISTS (
    SELECT 1 FROM organization_shipping_methods m
    WHERE m.organization_id = a.organization_id
      AND m.name = a.shipping_method
  );

UPDATE accounts a
SET shipping_method_id = m.id
FROM organization_shipping_methods m
WHERE a.organization_id = m.organization_id
  AND a.shipping_method = m.name
  AND a.shipping_method_id IS NULL;
