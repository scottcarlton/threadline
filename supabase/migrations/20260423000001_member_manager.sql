-- ============================================================
-- Phase 1: Manager capability on organization_members
-- Adds manages_others flag + manager_id link, invitation fields
-- to carry them forward, and recursive helper functions for the
-- transitive "members under me" set.
-- ============================================================

-- Columns on organization_members
ALTER TABLE organization_members
  ADD COLUMN manages_others BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN manager_id UUID REFERENCES organization_members(id) ON DELETE SET NULL;

CREATE INDEX idx_organization_members_manager_id
  ON organization_members(manager_id)
  WHERE manager_id IS NOT NULL;

-- Columns on invitations (copied onto the new org_member row at accept time)
ALTER TABLE invitations
  ADD COLUMN manages_others BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN manager_id UUID REFERENCES organization_members(id) ON DELETE SET NULL;

-- ============================================================
-- Integrity: manager_id must reference a member in the same org
-- whose role is admin/owner OR who has manages_others = true.
-- Also rejects self-reference and cycles.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_org_member_manager()
RETURNS TRIGGER AS $$
DECLARE
  mgr_org_id UUID;
  mgr_role user_role;
  mgr_manages_others BOOLEAN;
  cycle_hit BOOLEAN;
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'manager_id cannot reference the member itself';
  END IF;

  SELECT organization_id, role, manages_others
    INTO mgr_org_id, mgr_role, mgr_manages_others
  FROM organization_members
  WHERE id = NEW.manager_id;

  IF mgr_org_id IS NULL THEN
    RAISE EXCEPTION 'manager_id references a nonexistent member';
  END IF;

  IF mgr_org_id != NEW.organization_id THEN
    RAISE EXCEPTION 'manager must be in the same organization';
  END IF;

  IF mgr_role NOT IN ('admin', 'owner') AND COALESCE(mgr_manages_others, false) = false THEN
    RAISE EXCEPTION 'manager must have role admin/owner or manages_others = true';
  END IF;

  -- Cycle check: walk ancestors of NEW.manager_id; bail if we hit NEW.id
  WITH RECURSIVE ancestors AS (
    SELECT om.id, om.manager_id
      FROM organization_members om
     WHERE om.id = NEW.manager_id
    UNION
    SELECT om.id, om.manager_id
      FROM organization_members om
      JOIN ancestors a ON om.id = a.manager_id
  )
  SELECT EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_hit;

  IF cycle_hit THEN
    RAISE EXCEPTION 'manager_id would create a management cycle';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER trg_validate_org_member_manager
  BEFORE INSERT OR UPDATE OF manager_id, organization_id ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION validate_org_member_manager();

-- If a manager loses their manager authority (role demoted or manages_others toggled off),
-- detach anyone who pointed at them. Keeps the invariant without cascading surprises.
CREATE OR REPLACE FUNCTION detach_reports_on_manager_demote()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (
       OLD.manages_others IS DISTINCT FROM NEW.manages_others
       OR OLD.role IS DISTINCT FROM NEW.role
     ) THEN
    IF NOT (NEW.role IN ('admin', 'owner') OR NEW.manages_others = true) THEN
      UPDATE organization_members
        SET manager_id = NULL
        WHERE manager_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER trg_detach_reports_on_manager_demote
  AFTER UPDATE OF role, manages_others ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION detach_reports_on_manager_demote();

-- ============================================================
-- Helpers: transitive rollup of members under a viewer
-- ============================================================

-- Returns every org_member id in the manager subtree of viewer_member_id (excluding self).
CREATE OR REPLACE FUNCTION get_managed_member_ids(viewer_member_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
    WITH RECURSIVE managed AS (
      SELECT om.id
        FROM organization_members om
       WHERE om.manager_id = viewer_member_id
      UNION
      SELECT om.id
        FROM organization_members om
        JOIN managed m ON om.manager_id = m.id
    )
    SELECT id FROM managed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Returns every profile_id under viewer_member_id's subtree (excluding self).
CREATE OR REPLACE FUNCTION get_managed_profile_ids(viewer_member_id UUID)
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT om.profile_id
      FROM organization_members om
     WHERE om.id IN (SELECT get_managed_member_ids(viewer_member_id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

GRANT EXECUTE ON FUNCTION get_managed_member_ids(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_managed_profile_ids(UUID) TO authenticated;

COMMENT ON COLUMN organization_members.manages_others IS
  'When true, this member can invite/own other members and see data for members whose manager_id is (transitively) this row.';

COMMENT ON COLUMN organization_members.manager_id IS
  'Optional link to the org_member who manages this member. The referenced member must be in the same organization and have role admin/owner OR manages_others = true (enforced by trigger).';

COMMENT ON FUNCTION get_managed_member_ids(UUID) IS
  'Transitive closure: every org_member in the subtree under the given member (excluding self). Used by the sales visibility rollup.';

COMMENT ON FUNCTION get_managed_profile_ids(UUID) IS
  'Transitive closure: every profile_id under the given member. Convenient for created_by filters.';
