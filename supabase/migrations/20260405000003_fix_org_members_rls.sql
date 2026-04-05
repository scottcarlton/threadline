-- Fix infinite recursion in organization_members RLS policies
-- The old policies referenced organization_members in their own subqueries.
-- Fix: use a SECURITY DEFINER function that bypasses RLS for the lookup.

-- Helper function to get org IDs for current user (bypasses RLS)
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Helper: get user role in a specific org (bypasses RLS)
CREATE OR REPLACE FUNCTION get_member_role_in_org(org_id UUID)
RETURNS user_role AS $$
  SELECT role FROM organization_members
  WHERE organization_id = org_id AND profile_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Drop old policies
DROP POLICY IF EXISTS "Members visible to fellow members" ON organization_members;
DROP POLICY IF EXISTS "Admin/owner can manage members" ON organization_members;

-- Recreate without self-reference
CREATE POLICY "Members visible to fellow members"
  ON organization_members FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Admin/owner can insert members"
  ON organization_members FOR INSERT
  WITH CHECK (get_member_role_in_org(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update members"
  ON organization_members FOR UPDATE
  USING (get_member_role_in_org(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete members"
  ON organization_members FOR DELETE
  USING (get_member_role_in_org(organization_id) IN ('admin', 'owner'));

-- Also fix organizations policies that reference organization_members
DROP POLICY IF EXISTS "Org visible to members" ON organizations;
DROP POLICY IF EXISTS "Admin can update org" ON organizations;

CREATE POLICY "Org visible to members"
  ON organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids()));

CREATE POLICY "Admin can update org"
  ON organizations FOR UPDATE
  USING (get_member_role_in_org(id) = 'admin');

-- Fix profiles policy that references organization_members
DROP POLICY IF EXISTS "Users can view profiles in their org" ON profiles;

CREATE POLICY "Users can view profiles in their org"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT om.profile_id FROM organization_members om
      WHERE om.organization_id IN (SELECT get_user_org_ids())
    )
  );

-- Fix invitations policies that reference organization_members
DROP POLICY IF EXISTS "Admin/owner can view invitations" ON invitations;
DROP POLICY IF EXISTS "Admin/owner can create invitations" ON invitations;
DROP POLICY IF EXISTS "Admin/owner can manage invitations" ON invitations;

CREATE POLICY "Admin/owner can view invitations"
  ON invitations FOR SELECT
  USING (get_member_role_in_org(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can create invitations"
  ON invitations FOR INSERT
  WITH CHECK (get_member_role_in_org(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can manage invitations"
  ON invitations FOR UPDATE
  USING (get_member_role_in_org(organization_id) IN ('admin', 'owner'));
