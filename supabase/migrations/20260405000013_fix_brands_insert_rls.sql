-- Fix conflicting INSERT policies on brands
DROP POLICY IF EXISTS "Admin/owner can insert brands" ON brands;
DROP POLICY IF EXISTS "Members can insert brands for their org" ON brands;
DROP POLICY IF EXISTS "Authorized users can insert brands" ON brands;

-- Helper: check if user can write to brands in an org
CREATE OR REPLACE FUNCTION can_write_brands(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id
      AND profile_id = auth.uid()
      AND role IN ('admin', 'owner', 'member')
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE POLICY "Authorized users can insert brands"
  ON brands FOR INSERT
  WITH CHECK (can_write_brands(organization_id));
