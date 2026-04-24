-- ============================================================
-- Phase 2b: Brand-scoped territories
-- Adds territories.brand_id (nullable). NULL = own-org territory;
-- NOT NULL = owned by a specific brand. Opens federated SELECT so
-- connected reps can read a brand's territory map.
-- ============================================================

ALTER TABLE territories
  ADD COLUMN brand_id UUID REFERENCES brands(id) ON DELETE CASCADE;

CREATE INDEX idx_territories_brand_id
  ON territories(brand_id)
  WHERE brand_id IS NOT NULL;

-- Integrity: a brand-scoped territory must be in the same org as its brand.
CREATE OR REPLACE FUNCTION validate_territory_brand_org()
RETURNS TRIGGER AS $$
DECLARE
  b_org UUID;
BEGIN
  IF NEW.brand_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO b_org FROM brands WHERE id = NEW.brand_id;

  IF b_org IS NULL THEN
    RAISE EXCEPTION 'brand_id references a nonexistent brand';
  END IF;

  IF b_org != NEW.organization_id THEN
    RAISE EXCEPTION 'territory.brand_id must belong to the same organization as the territory';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

CREATE TRIGGER trg_validate_territory_brand_org
  BEFORE INSERT OR UPDATE OF brand_id, organization_id ON territories
  FOR EACH ROW
  EXECUTE FUNCTION validate_territory_brand_org();

-- ============================================================
-- Federation: a connected org can read the other side's
-- brand-scoped territories (SELECT only). Own-org territories
-- remain visible only to direct org members via the existing policy.
-- ============================================================

CREATE POLICY "Connected orgs read brand-scoped territories"
  ON territories FOR SELECT
  USING (
    brand_id IS NOT NULL
    AND organization_id IN (SELECT get_connected_org_ids())
  );

-- ============================================================
-- Relax member_territories SELECT: either side of an assignment
-- must be able to see it. Without this, a rep admin can't tell
-- that their rep is assigned to a connected brand's territory.
-- ============================================================

DROP POLICY IF EXISTS "Member territories visible to org members" ON member_territories;

CREATE POLICY "Member territories visible to either side"
  ON member_territories FOR SELECT
  USING (
    territory_id IN (
      SELECT id FROM territories WHERE is_org_member(organization_id)
    )
    OR organization_member_id IN (
      SELECT id FROM organization_members WHERE is_org_member(organization_id)
    )
  );

COMMENT ON COLUMN territories.brand_id IS
  'When set, this territory is defined by a specific brand (the brand must belong to the same org). NULL means the territory is rep-internal / org-wide. Brand-scoped territories are federated-readable by connected orgs.';
