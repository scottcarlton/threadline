-- ============================================================
-- Phase 2: Multi-territory assignment for sales members
-- Replaces territories.assigned_to (single) with a join table
-- (organization_member_id, territory_id) supporting many-to-many.
-- ============================================================

CREATE TABLE member_territories (
  organization_member_id UUID NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  territory_id           UUID NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_member_id, territory_id)
);

CREATE INDEX idx_member_territories_territory_id ON member_territories(territory_id);

-- Backfill: every territories.assigned_to becomes one member_territories row.
INSERT INTO member_territories (organization_member_id, territory_id)
SELECT t.assigned_to, t.id
  FROM territories t
 WHERE t.assigned_to IS NOT NULL
ON CONFLICT DO NOTHING;

-- Drop the legacy single-assignee column; the join table is now the source of truth.
ALTER TABLE territories DROP COLUMN assigned_to;

-- Invitations carry the pending territory assignment set, applied on accept.
ALTER TABLE invitations ADD COLUMN territory_ids UUID[] NOT NULL DEFAULT '{}';

-- ============================================================
-- RLS mirrors territories: org members read; admin/owner write.
-- ============================================================

ALTER TABLE member_territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Member territories visible to org members"
  ON member_territories FOR SELECT
  USING (
    territory_id IN (
      SELECT id FROM territories
       WHERE is_org_member(organization_id)
    )
  );

CREATE POLICY "Admin/owner can insert member territories"
  ON member_territories FOR INSERT
  WITH CHECK (
    territory_id IN (
      SELECT id FROM territories
       WHERE get_user_role(organization_id) IN ('admin', 'owner')
    )
  );

CREATE POLICY "Admin/owner can delete member territories"
  ON member_territories FOR DELETE
  USING (
    territory_id IN (
      SELECT id FROM territories
       WHERE get_user_role(organization_id) IN ('admin', 'owner')
    )
  );

COMMENT ON TABLE member_territories IS
  'Many-to-many between organization_members and territories. Sales reps can cover multiple territories, and each territory can have multiple reps.';
