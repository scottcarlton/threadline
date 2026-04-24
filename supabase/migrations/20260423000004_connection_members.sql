-- ============================================================
-- Phase 4: Connected-member invites
-- Lets a brand org invite a specific user from a connected rep org
-- and store per-connection attributes for them (manages_others).
-- Territory assignments still live in `member_territories` — the
-- brand's territories are cross-org-assignable after Phase 2b.
-- ============================================================

CREATE TABLE connection_members (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_connection_id UUID NOT NULL REFERENCES org_connections(id) ON DELETE CASCADE,
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manages_others    BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_connection_id, profile_id)
);

CREATE INDEX idx_connection_members_profile ON connection_members(profile_id);
CREATE INDEX idx_connection_members_connection ON connection_members(org_connection_id);

CREATE TABLE connection_member_invites (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_connection_id UUID NOT NULL REFERENCES org_connections(id) ON DELETE CASCADE,
  target_email      TEXT NOT NULL,
  territory_ids     UUID[] NOT NULL DEFAULT '{}',
  manages_others    BOOLEAN NOT NULL DEFAULT false,
  token             TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  invited_by        UUID REFERENCES profiles(id),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at       TIMESTAMPTZ,
  accepted_by       UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_connection_member_invites_connection
  ON connection_member_invites(org_connection_id);
CREATE INDEX idx_connection_member_invites_token
  ON connection_member_invites(token);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE connection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_member_invites ENABLE ROW LEVEL SECURITY;

-- connection_members: visible to members of either org on the connection
-- (same pattern as org_connections).
CREATE POLICY "Connection members visible to involved orgs"
  ON connection_members FOR SELECT
  USING (
    org_connection_id IN (
      SELECT id FROM org_connections
       WHERE rep_org_id IN (SELECT get_user_org_ids())
          OR brand_org_id IN (SELECT get_user_org_ids())
    )
  );

-- Only admin/owner on either side of the connection can write.
-- (In practice the brand admin drives this, but the rep's own admin
-- removing their user should also work.)
CREATE POLICY "Connection members: admin/owner of either org can manage"
  ON connection_members FOR ALL
  USING (
    org_connection_id IN (
      SELECT id FROM org_connections
       WHERE rep_org_id IN (
               SELECT organization_id FROM organization_members
                WHERE profile_id = auth.uid() AND role IN ('admin','owner')
             )
          OR brand_org_id IN (
               SELECT organization_id FROM organization_members
                WHERE profile_id = auth.uid() AND role IN ('admin','owner')
             )
    )
  );

-- connection_member_invites: brand admin/owner can manage; anyone can read by token.
CREATE POLICY "Connection member invites: readable by token"
  ON connection_member_invites FOR SELECT
  USING (true);

CREATE POLICY "Connection member invites: brand admin/owner writes"
  ON connection_member_invites FOR ALL
  USING (
    org_connection_id IN (
      SELECT id FROM org_connections
       WHERE brand_org_id IN (
               SELECT organization_id FROM organization_members
                WHERE profile_id = auth.uid() AND role IN ('admin','owner')
             )
    )
  );

COMMENT ON TABLE connection_members IS
  'Per-connection attributes for a user in the rep side of an active org_connection. Used to carry manages_others in a brand-context without polluting the user''s own-org organization_members row.';

COMMENT ON TABLE connection_member_invites IS
  'Pending invitations from a brand org admin to a specific user (by email) on the rep side of a connection. On accept, creates a connection_members row and applies the listed territory_ids to member_territories.';
