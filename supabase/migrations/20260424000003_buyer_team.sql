-- Multi-user buyer accounts: introduce buyer_admin role and let buyer admins
-- self-serve team management without rep involvement (SCO-40).

-- Constrain the role values to a small enum-like set. Existing rows default to
-- 'buyer' (per the original buyer_portal migration), so this is safe.
ALTER TABLE account_users
  ADD CONSTRAINT account_users_role_check
  CHECK (role IN ('buyer', 'buyer_admin'));

-- Optional role override carried by an invitation. NULL means "use the
-- inviter's default" — for rep-side invites we promote the first invitee to
-- buyer_admin automatically; for buyer-admin invites this stays NULL and the
-- invitee joins as a regular buyer.
ALTER TABLE buyer_invitations
  ADD COLUMN role TEXT
  CHECK (role IS NULL OR role IN ('buyer', 'buyer_admin'));

-- Helper: is the caller a buyer_admin for the given account? Used by the
-- new buyer-side RLS policies and by the team-management endpoints.
CREATE OR REPLACE FUNCTION is_buyer_admin_of(target_account_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_users
    WHERE account_id = target_account_id
      AND profile_id = auth.uid()
      AND role = 'buyer_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Buyer admins can read every account_users row for any account they admin
-- (so the team page can list teammates, not only their own row).
CREATE POLICY "Buyer admins see team for their accounts"
  ON account_users FOR SELECT
  USING (is_buyer_admin_of(account_id));

-- Buyer admins can add new buyers to accounts they admin (writes still go
-- through supabaseAdmin in the API; this policy is defense-in-depth).
CREATE POLICY "Buyer admins can insert account users for their accounts"
  ON account_users FOR INSERT
  WITH CHECK (is_buyer_admin_of(account_id));

-- Buyer admins can remove any teammate from accounts they admin, except
-- themselves. Self-removal would risk leaving an account with no admin.
CREATE POLICY "Buyer admins can delete teammates from their accounts"
  ON account_users FOR DELETE
  USING (is_buyer_admin_of(account_id) AND profile_id <> auth.uid());

-- Buyer admins can issue invitations for accounts they admin.
CREATE POLICY "Buyer admins can insert invitations for their accounts"
  ON buyer_invitations FOR INSERT
  WITH CHECK (is_buyer_admin_of(account_id));
