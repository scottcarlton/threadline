-- Add commission rate to brands
ALTER TABLE brands ADD COLUMN commission_rate DECIMAL(5,2) DEFAULT 0;

-- Add shipped amount to orders
ALTER TABLE orders ADD COLUMN shipped_amount DECIMAL(12,2);

-- Per-account commission rate overrides
CREATE TABLE commission_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rate DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, account_id)
);

ALTER TABLE commission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Overrides visible to org members"
  ON commission_overrides FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can manage overrides"
  ON commission_overrides FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update overrides"
  ON commission_overrides FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete overrides"
  ON commission_overrides FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
