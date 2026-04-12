-- ============================================================
-- Buyer Portal: account_users, account_brand_access, buyer_invitations
-- ============================================================

-- Account users (buyer login linked to accounts)
CREATE TABLE account_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'buyer',
  invited_by UUID REFERENCES profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, profile_id)
);

-- Which brands an account can browse/order from
CREATE TABLE account_brand_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, brand_id)
);

-- Buyer invitations (separate from org invitations)
CREATE TABLE buyer_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_account_users_profile ON account_users(profile_id);
CREATE INDEX idx_account_users_account ON account_users(account_id);
CREATE INDEX idx_account_brand_access_account ON account_brand_access(account_id);
CREATE INDEX idx_account_brand_access_brand ON account_brand_access(brand_id);
CREATE INDEX idx_buyer_invitations_token ON buyer_invitations(token);

-- ============================================================
-- RLS Helper Functions
-- ============================================================

-- Get account IDs the current user is a buyer for
CREATE OR REPLACE FUNCTION get_buyer_account_ids()
RETURNS SETOF UUID AS $$
  SELECT account_id FROM account_users WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Get brand IDs accessible to a buyer (through their accounts)
CREATE OR REPLACE FUNCTION get_buyer_brand_ids()
RETURNS SETOF UUID AS $$
  SELECT DISTINCT brand_id FROM account_brand_access
  WHERE account_id IN (SELECT get_buyer_account_ids());
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Check if current user is a buyer
CREATE OR REPLACE FUNCTION is_buyer_user()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM account_users WHERE profile_id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RLS on new tables
-- ============================================================

ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see own memberships"
  ON account_users FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Org members see account users for their accounts"
  ON account_users FOR SELECT
  USING (
    account_id IN (
      SELECT a.id FROM accounts a WHERE is_org_member(a.organization_id)
    )
  );

CREATE POLICY "Org admin/owner can insert account users"
  ON account_users FOR INSERT
  WITH CHECK (
    account_id IN (
      SELECT a.id FROM accounts a
      WHERE get_user_role(a.organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Org admin/owner can update account users"
  ON account_users FOR UPDATE
  USING (
    account_id IN (
      SELECT a.id FROM accounts a
      WHERE get_user_role(a.organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Org admin/owner can delete account users"
  ON account_users FOR DELETE
  USING (
    account_id IN (
      SELECT a.id FROM accounts a
      WHERE get_user_role(a.organization_id) IN ('admin', 'owner')
    )
  );

-- account_brand_access
ALTER TABLE account_brand_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see their brand access"
  ON account_brand_access FOR SELECT
  USING (account_id IN (SELECT get_buyer_account_ids()));

CREATE POLICY "Org members see brand access"
  ON account_brand_access FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Org admin/owner can insert brand access"
  ON account_brand_access FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can update brand access"
  ON account_brand_access FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can delete brand access"
  ON account_brand_access FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- buyer_invitations
ALTER TABLE buyer_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read buyer invitation by token"
  ON buyer_invitations FOR SELECT
  USING (true);

CREATE POLICY "Org admin/owner can insert buyer invitations"
  ON buyer_invitations FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can update buyer invitations"
  ON buyer_invitations FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can delete buyer invitations"
  ON buyer_invitations FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- ============================================================
-- Additive RLS policies on existing tables for buyers
-- (Postgres OR-based: if ANY SELECT policy passes, row is visible)
-- ============================================================

-- Brands: buyers see brands they have access to
CREATE POLICY "Brands visible to buyers"
  ON brands FOR SELECT
  USING (id IN (SELECT get_buyer_brand_ids()));

-- Products: buyers see products from accessible brands
CREATE POLICY "Products visible to buyers"
  ON products FOR SELECT
  USING (brand_id IN (SELECT get_buyer_brand_ids()));

-- Product variants: buyers see variants of accessible products
CREATE POLICY "Product variants visible to buyers"
  ON product_variants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_id AND p.brand_id IN (SELECT get_buyer_brand_ids())
    )
  );

-- Product images: buyers see images of accessible products
CREATE POLICY "Product images visible to buyers"
  ON product_images FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_id AND p.brand_id IN (SELECT get_buyer_brand_ids())
    )
  );

-- Accounts: buyers see their own accounts
CREATE POLICY "Buyers see own accounts"
  ON accounts FOR SELECT
  USING (id IN (SELECT get_buyer_account_ids()));

-- Orders: buyers see orders for their accounts
CREATE POLICY "Buyers see own account orders"
  ON orders FOR SELECT
  USING (account_id IN (SELECT get_buyer_account_ids()));

-- Orders: buyers can insert draft orders for their accounts with accessible brands
CREATE POLICY "Buyers can create draft orders"
  ON orders FOR INSERT
  WITH CHECK (
    account_id IN (SELECT get_buyer_account_ids())
    AND brand_id IN (SELECT get_buyer_brand_ids())
    AND status = 'draft'
  );

-- Orders: buyers can update their draft orders (e.g. submit)
CREATE POLICY "Buyers can update own draft orders"
  ON orders FOR UPDATE
  USING (
    account_id IN (SELECT get_buyer_account_ids())
    AND created_by = auth.uid()
  );

-- Order lines: buyers see lines for their orders
CREATE POLICY "Buyers see own order lines"
  ON order_lines FOR SELECT
  USING (
    order_id IN (
      SELECT id FROM orders WHERE account_id IN (SELECT get_buyer_account_ids())
    )
  );

-- Order lines: buyers can insert lines on their draft orders
CREATE POLICY "Buyers can insert lines on draft orders"
  ON order_lines FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders
      WHERE account_id IN (SELECT get_buyer_account_ids())
        AND status = 'draft'
        AND created_by = auth.uid()
    )
  );

-- Order lines: buyers can update lines on their draft orders
CREATE POLICY "Buyers can update lines on draft orders"
  ON order_lines FOR UPDATE
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE account_id IN (SELECT get_buyer_account_ids())
        AND status = 'draft'
        AND created_by = auth.uid()
    )
  );

-- Order lines: buyers can delete lines on their draft orders
CREATE POLICY "Buyers can delete lines on draft orders"
  ON order_lines FOR DELETE
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE account_id IN (SELECT get_buyer_account_ids())
        AND status = 'draft'
        AND created_by = auth.uid()
    )
  );

-- Seasons: buyers can see seasons (needed for order context)
CREATE POLICY "Buyers see seasons via brand access"
  ON seasons FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM account_brand_access
      WHERE account_id IN (SELECT get_buyer_account_ids())
    )
  );
