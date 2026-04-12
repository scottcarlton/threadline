-- Territories
CREATE TABLE territories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  assigned_to UUID REFERENCES organization_members(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link accounts to territories (optional)
ALTER TABLE accounts ADD COLUMN territory_id UUID REFERENCES territories(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Territories visible to org members"
  ON territories FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert territories"
  ON territories FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update territories"
  ON territories FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete territories"
  ON territories FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
