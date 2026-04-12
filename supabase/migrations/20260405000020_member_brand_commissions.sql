-- Per-brand commission rates for each team member
CREATE TABLE member_brand_commissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, brand_id)
);

-- RLS
ALTER TABLE member_brand_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Member brand commissions visible to org members"
  ON member_brand_commissions FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert member brand commissions"
  ON member_brand_commissions FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update member brand commissions"
  ON member_brand_commissions FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete member brand commissions"
  ON member_brand_commissions FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
