-- ============================================================
-- Phase 3: Federation Infrastructure
-- Cross-org connections and data visibility
-- ============================================================

-- Connection status type
CREATE TYPE connection_status AS ENUM ('pending', 'active', 'suspended', 'disconnected');

-- Org connections: the backbone of federation
CREATE TABLE org_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rep_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rep_brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  status connection_status NOT NULL DEFAULT 'pending',
  commission_rate DECIMAL(5,2),
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  requested_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(rep_org_id, brand_org_id)
);

-- Connection invite codes for brands to share
CREATE TABLE connection_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  max_uses INTEGER DEFAULT 0,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Federated order links: cross-org order visibility
CREATE TABLE federated_order_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES org_connections(id) ON DELETE CASCADE,
  source_org_id UUID NOT NULL REFERENCES organizations(id),
  target_org_id UUID NOT NULL REFERENCES organizations(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_id, target_org_id)
);

-- Federated account links: cross-org account visibility
CREATE TABLE federated_account_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES org_connections(id) ON DELETE CASCADE,
  source_org_id UUID NOT NULL REFERENCES organizations(id),
  target_org_id UUID NOT NULL REFERENCES organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, target_org_id)
);

-- Add connection_id to orders for tracking federation source
ALTER TABLE orders ADD COLUMN connection_id UUID REFERENCES org_connections(id) ON DELETE SET NULL;

-- ============================================================
-- RLS Policies — Federation Tables
-- ============================================================

ALTER TABLE org_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE federated_order_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE federated_account_links ENABLE ROW LEVEL SECURITY;

-- Org connections: visible to members of either org
CREATE POLICY "Connection visible to involved orgs"
  ON org_connections FOR SELECT
  USING (
    rep_org_id IN (SELECT get_user_org_ids())
    OR brand_org_id IN (SELECT get_user_org_ids())
  );

-- Admin/owner of either org can manage connections
CREATE POLICY "Admin can manage connections"
  ON org_connections FOR ALL
  USING (
    rep_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
    OR brand_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Connection invites: visible to brand org members
CREATE POLICY "Brand members see their invites"
  ON connection_invites FOR SELECT
  USING (brand_org_id IN (SELECT get_user_org_ids()));

-- Brand admin/owner can manage invites
CREATE POLICY "Brand admin can manage invites"
  ON connection_invites FOR ALL
  USING (
    brand_org_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Anyone can look up an invite by code (for joining)
CREATE POLICY "Anyone can read invite by code"
  ON connection_invites FOR SELECT
  USING (true);

-- Federated order links: visible to source or target org
CREATE POLICY "Federated order links visible to involved orgs"
  ON federated_order_links FOR SELECT
  USING (
    source_org_id IN (SELECT get_user_org_ids())
    OR target_org_id IN (SELECT get_user_org_ids())
  );

-- Federated account links: visible to source or target org
CREATE POLICY "Federated account links visible to involved orgs"
  ON federated_account_links FOR SELECT
  USING (
    source_org_id IN (SELECT get_user_org_ids())
    OR target_org_id IN (SELECT get_user_org_ids())
  );

-- ============================================================
-- Additive RLS: Brand org sees federated orders
-- ============================================================

-- Brand org members can see orders federated to them
CREATE POLICY "Brand sees federated orders"
  ON orders FOR SELECT
  USING (
    id IN (
      SELECT order_id FROM federated_order_links
      WHERE target_org_id IN (SELECT get_user_org_ids())
      AND status = 'active'
    )
  );

-- Brand org admin/owner can update status on federated orders
CREATE POLICY "Brand updates federated order status"
  ON orders FOR UPDATE
  USING (
    id IN (
      SELECT order_id FROM federated_order_links
      WHERE target_org_id IN (SELECT get_user_org_ids())
      AND status = 'active'
    )
    AND get_user_role(organization_id) IS NULL
  );

-- Brand org members can see order lines for federated orders
CREATE POLICY "Brand sees federated order lines"
  ON order_lines FOR SELECT
  USING (
    order_id IN (
      SELECT order_id FROM federated_order_links
      WHERE target_org_id IN (SELECT get_user_org_ids())
      AND status = 'active'
    )
  );

-- Brand org members can see federated accounts
CREATE POLICY "Brand sees federated accounts"
  ON accounts FOR SELECT
  USING (
    id IN (
      SELECT account_id FROM federated_account_links
      WHERE target_org_id IN (SELECT get_user_org_ids())
    )
  );

-- ============================================================
-- Auto-Federation Trigger
-- ============================================================

-- When a rep creates an order for a connected brand, auto-federate
CREATE OR REPLACE FUNCTION auto_federate_order()
RETURNS TRIGGER AS $$
DECLARE
  conn RECORD;
BEGIN
  -- Find an active connection for this order's brand
  SELECT oc.id, oc.brand_org_id INTO conn
  FROM org_connections oc
  JOIN brands b ON b.id = NEW.brand_id
  WHERE oc.rep_org_id = NEW.organization_id
    AND oc.rep_brand_id = NEW.brand_id
    AND oc.status = 'active'
  LIMIT 1;

  IF conn.id IS NOT NULL THEN
    -- Link the order to the connection
    UPDATE orders SET connection_id = conn.id WHERE id = NEW.id;

    -- Create federated order link
    INSERT INTO federated_order_links (order_id, connection_id, source_org_id, target_org_id)
    VALUES (NEW.id, conn.id, NEW.organization_id, conn.brand_org_id)
    ON CONFLICT (order_id, target_org_id) DO NOTHING;

    -- Create federated account link if not already linked
    INSERT INTO federated_account_links (account_id, connection_id, source_org_id, target_org_id)
    VALUES (NEW.account_id, conn.id, NEW.organization_id, conn.brand_org_id)
    ON CONFLICT (account_id, target_org_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER federate_new_order
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION auto_federate_order();

-- ============================================================
-- Helper: get federated order IDs for an org
-- ============================================================

CREATE OR REPLACE FUNCTION get_federated_order_ids(target_org UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
    SELECT order_id FROM federated_order_links
    WHERE target_org_id = target_org AND status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Helper: get federated account IDs for an org
CREATE OR REPLACE FUNCTION get_federated_account_ids(target_org UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
    SELECT account_id FROM federated_account_links
    WHERE target_org_id = target_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;
