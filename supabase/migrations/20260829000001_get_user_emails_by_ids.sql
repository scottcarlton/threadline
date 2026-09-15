-- Reverse of get_user_id_by_email: resolve a set of user ids to their emails.
--
-- Added because several call sites were paging through auth.users with an
-- unpaginated listUsers() and scanning the first page, which silently stopped
-- finding anyone once the user table outgrew that page.
--
-- Mirrors the shape and security posture of get_user_id_by_email
-- (20260527000002): security definer, stable, service-role only.

CREATE OR REPLACE FUNCTION public.get_user_emails_by_ids(lookup_ids uuid[])
RETURNS TABLE(id uuid, email text) AS $$
  SELECT u.id, u.email::text FROM auth.users u WHERE u.id = ANY(lookup_ids);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION public.get_user_emails_by_ids(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_emails_by_ids(uuid[]) TO service_role;
