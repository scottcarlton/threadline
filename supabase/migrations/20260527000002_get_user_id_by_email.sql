CREATE OR REPLACE FUNCTION get_user_id_by_email(lookup_email text)
RETURNS TABLE(id uuid) AS $$
  SELECT id FROM auth.users WHERE email = lower(lookup_email);
$$ LANGUAGE sql SECURITY DEFINER STABLE;
