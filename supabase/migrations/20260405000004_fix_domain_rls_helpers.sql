-- Replace is_org_member and get_user_role to use the non-recursive helpers

CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN org_id IN (SELECT get_user_org_ids());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_user_role(org_id UUID)
RETURNS user_role AS $$
BEGIN
  RETURN get_member_role_in_org(org_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
