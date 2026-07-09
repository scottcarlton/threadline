-- ============================================================
-- Store self-signup: stores, store_users, accounts.store_id
--
-- A store (retailer) is NOT an organizations row. Widening
-- organizations.org_type to include 'store' would push a third org type
-- through every `.eq('organization_id', ...)` filter, every RLS policy
-- that assumes rep|brand, and get_connected_org_ids(). See
-- docs/superpowers/specs/2026-07-09-store-signup-design.md.
--
-- A store user is a buyer with an identity but (initially) zero accounts.
-- ============================================================

CREATE TABLE stores (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_name           TEXT NOT NULL,
  website                 TEXT,
  phone                   TEXT,
  address_line1           TEXT,
  address_line2           TEXT,
  city                    TEXT,
  state                   TEXT,
  zip                     TEXT,
  country                 TEXT DEFAULT 'US',
  onboarding_step         INT NOT NULL DEFAULT 1,
  onboarding_completed_at TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- No slug. create-org slugifies and 409s on collision; two real stores can
-- legitimately share a business name, and a uniqueness constraint here would
-- reject valid signups. Stores have no public URL in v1.

CREATE TABLE store_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'buyer_admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, profile_id)
);

CREATE INDEX idx_store_users_profile_id ON store_users(profile_id);

-- The seam for phase-2 brand-initiated linking. Written by nothing in v1.
ALTER TABLE accounts ADD COLUMN store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
CREATE INDEX idx_accounts_store_id ON accounts(store_id) WHERE store_id IS NOT NULL;

-- ============================================================
-- Helpers (SECURITY DEFINER, so they bypass RLS and cannot recurse)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM store_users WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_store_admin(_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_users
    WHERE store_id = _store_id
      AND profile_id = auth.uid()
      AND role = 'buyer_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RLS — deliberately closed.
--
-- No brand or rep can read `stores` in v1. The cross-org searchable
-- directory is the first table scoped by neither org nor connection; phase 2
-- opens that read surface deliberately, with its own review and its own
-- public/private column split. It does not arrive as a side effect of signup.
--
-- There is no INSERT policy on either table: rows are created exclusively by
-- supabaseAdmin in createStore() (@supabase/ssr drops the JWT on writes).
-- ============================================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store users see own store"
  ON stores FOR SELECT
  USING (id IN (SELECT get_user_store_ids()));

CREATE POLICY "Store admins update own store"
  ON stores FOR UPDATE
  USING (is_store_admin(id))
  WITH CHECK (is_store_admin(id));

ALTER TABLE store_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store users see own membership"
  ON store_users FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Store users see teammates"
  ON store_users FOR SELECT
  USING (store_id IN (SELECT get_user_store_ids()));

CREATE POLICY "Store admins manage team"
  ON store_users FOR UPDATE
  USING (is_store_admin(store_id))
  WITH CHECK (is_store_admin(store_id));

CREATE POLICY "Store admins remove team"
  ON store_users FOR DELETE
  USING (is_store_admin(store_id));
