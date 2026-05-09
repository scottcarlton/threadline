-- Phase 4 of organization redesign: Commerce > Taxes.
-- Adds the three independently-toggled tax systems (US sales tax, VAT,
-- GST) to organizations plus a separate table for per-state US sales
-- tax rates. RLS pattern mirrors `commission_overrides` (own-org table,
-- admin/owner writes).

ALTER TABLE organizations
  ADD COLUMN taxes_pricing_display TEXT NOT NULL DEFAULT 'exclusive'
    CHECK (taxes_pricing_display IN ('exclusive', 'inclusive')),
  ADD COLUMN taxes_us_sales_tax_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN taxes_us_ein TEXT,
  ADD COLUMN taxes_vat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN taxes_vat_registration TEXT,
  ADD COLUMN taxes_vat_rate NUMERIC(5, 2),
  ADD COLUMN taxes_gst_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN taxes_gst_registration TEXT,
  ADD COLUMN taxes_gst_rate NUMERIC(5, 2);

CREATE TABLE organization_sales_tax_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  state_code TEXT NOT NULL,
  rate NUMERIC(5, 2) NOT NULL,
  tax_type TEXT NOT NULL CHECK (tax_type IN ('origin', 'destination')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, state_code)
);

CREATE INDEX organization_sales_tax_rates_org_idx
  ON organization_sales_tax_rates (organization_id);

ALTER TABLE organization_sales_tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read sales tax rates"
  ON organization_sales_tax_rates FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert sales tax rates"
  ON organization_sales_tax_rates FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update sales tax rates"
  ON organization_sales_tax_rates FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete sales tax rates"
  ON organization_sales_tax_rates FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
