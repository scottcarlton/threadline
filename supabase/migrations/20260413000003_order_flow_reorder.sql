-- ============================================================
-- Order Flow Reorder (SCO-129)
-- - order_type enum + column ('order' | 'note')
-- - freeform_name + nullable account_id with check constraints
-- - account_locations table (multi-location accounts)
-- - orders.location_id for routing
-- ============================================================

-- ---- 1. Order type ----
CREATE TYPE order_type AS ENUM ('order', 'note');

ALTER TABLE orders
  ADD COLUMN order_type order_type NOT NULL DEFAULT 'order';

-- ---- 2. Freeform account support ----
ALTER TABLE orders
  ADD COLUMN freeform_name TEXT;

-- Drop NOT NULL on account_id so freeform orders (no linked account yet) can exist as drafts.
ALTER TABLE orders
  ALTER COLUMN account_id DROP NOT NULL;

-- Either an account is linked OR a freeform_name is provided (or both, after upgrade).
ALTER TABLE orders
  ADD CONSTRAINT orders_account_or_freeform
  CHECK (account_id IS NOT NULL OR freeform_name IS NOT NULL);

-- A freeform-only order (no account_id) cannot leave draft; submitting requires upgrading to a real account.
ALTER TABLE orders
  ADD CONSTRAINT orders_freeform_only_draft
  CHECK (account_id IS NOT NULL OR status = 'draft');

-- ---- 3. Account locations ----
CREATE TABLE account_locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  contact_first_name TEXT,
  contact_last_name TEXT,
  contact_email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX account_locations_account_id_idx ON account_locations(account_id);
CREATE INDEX account_locations_organization_id_idx ON account_locations(organization_id);

-- Only one default per account.
CREATE UNIQUE INDEX account_locations_one_default_per_account
  ON account_locations(account_id) WHERE is_default;

-- Backfill: one default location per existing account, copying the address fields.
INSERT INTO account_locations (
  account_id, organization_id, label, contact_first_name, contact_last_name, contact_email, phone,
  address_line1, address_line2, city, state, zip, country, is_default, sort_order
)
SELECT
  id, organization_id, 'Primary', contact_first_name, contact_last_name, contact_email, phone,
  address_line1, address_line2, city, state, zip, country, TRUE, 0
FROM accounts;

-- ---- 4. Orders link to a location ----
ALTER TABLE orders
  ADD COLUMN location_id UUID REFERENCES account_locations(id) ON DELETE SET NULL;

CREATE INDEX orders_location_id_idx ON orders(location_id);

-- ---- 5. RLS on account_locations (mirror accounts pattern) ----
ALTER TABLE account_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Account locations visible to org members"
  ON account_locations FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner/member can insert account locations"
  ON account_locations FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can update account locations"
  ON account_locations FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner can delete account locations"
  ON account_locations FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
