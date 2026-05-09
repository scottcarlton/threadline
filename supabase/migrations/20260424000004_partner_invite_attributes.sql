-- ============================================================
-- Carry per-partner attributes through the org-level connect link.
-- Mirrors connection_member_invites (manages_others, territory_ids)
-- so the brand admin can pre-set them when generating the partner
-- link via AddPartnerModal. On accept, /api/connections/request
-- applies them to connection_members + member_territories for the
-- requesting user.
-- ============================================================

ALTER TABLE connection_invites
  ADD COLUMN manages_others BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN territory_ids  UUID[]  NOT NULL DEFAULT '{}';

COMMENT ON COLUMN connection_invites.manages_others IS
  'Pre-set by the brand admin when sharing the partner link. Applied to the connection_members row for whoever accepts.';

COMMENT ON COLUMN connection_invites.territory_ids IS
  'Brand-owned territory ids to assign to the accepting rep at accept time. Validated server-side to belong to the brand org.';
