-- ============================================================
-- Retailer self-signup: retailers, retailer_users, accounts.retailer_id
--
-- A retailer is NOT an organizations row. Widening
-- organizations.org_type to include 'retailer' would push a third org type
-- through every `.eq('organization_id', ...)` filter, every RLS policy
-- that assumes rep|brand, and get_connected_org_ids(). See
-- docs/superpowers/specs/2026-07-09-retailer-signup-design.md.
--
-- A retailer user is a buyer with an identity but (initially) zero accounts.
-- ============================================================

CREATE TABLE retailers (
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

-- No slug. create-org slugifies and 409s on collision; two real retailers can
-- legitimately share a business name, and a uniqueness constraint here would
-- reject valid signups. Retailers have no public URL in v1.

CREATE TABLE retailer_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  retailer_id UUID NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer', 'buyer_admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(retailer_id, profile_id)
);

CREATE INDEX idx_retailer_users_profile_id ON retailer_users(profile_id);

-- The seam for phase-2 brand-initiated linking. Written by nothing in v1.
ALTER TABLE accounts ADD COLUMN retailer_id UUID REFERENCES retailers(id) ON DELETE SET NULL;
CREATE INDEX idx_accounts_retailer_id ON accounts(retailer_id) WHERE retailer_id IS NOT NULL;

-- ============================================================
-- Helpers (SECURITY DEFINER, so they bypass RLS and cannot recurse)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_retailer_ids()
RETURNS SETOF UUID AS $$
  SELECT retailer_id FROM retailer_users WHERE profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_retailer_admin(_retailer_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM retailer_users
    WHERE retailer_id = _retailer_id
      AND profile_id = auth.uid()
      AND role = 'buyer_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- RLS — deliberately closed.
--
-- No brand or rep can read `retailers` in v1. The cross-org searchable
-- directory is the first table scoped by neither org nor connection; phase 2
-- opens that read surface deliberately, with its own review and its own
-- public/private column split. It does not arrive as a side effect of signup.
--
-- There is no INSERT policy on either table: rows are created exclusively by
-- supabaseAdmin in createRetailer() (@supabase/ssr drops the JWT on writes).
-- ============================================================

ALTER TABLE retailers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Retailer users see own retailer"
  ON retailers FOR SELECT
  USING (id IN (SELECT get_user_retailer_ids()));

CREATE POLICY "Retailer admins update own retailer"
  ON retailers FOR UPDATE
  USING (is_retailer_admin(id))
  WITH CHECK (is_retailer_admin(id));

ALTER TABLE retailer_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Retailer users see own membership"
  ON retailer_users FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Retailer users see teammates"
  ON retailer_users FOR SELECT
  USING (retailer_id IN (SELECT get_user_retailer_ids()));

CREATE POLICY "Retailer admins manage team"
  ON retailer_users FOR UPDATE
  USING (is_retailer_admin(retailer_id))
  WITH CHECK (is_retailer_admin(retailer_id));

CREATE POLICY "Retailer admins remove team"
  ON retailer_users FOR DELETE
  USING (is_retailer_admin(retailer_id));
