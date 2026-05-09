-- ============================================================
-- Default territories per organization.
-- Mirrors the seed_default_seasons trigger so every new org lands
-- with a sensible US-regional split out of the box. Brand-scoping
-- (territories.brand_id) stays NULL — these are org-wide.
-- ============================================================

CREATE OR REPLACE FUNCTION seed_default_territories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.territories (organization_id, name) VALUES
    (NEW.id, 'Northeast'),
    (NEW.id, 'Southeast'),
    (NEW.id, 'Midwest'),
    (NEW.id, 'West Coast');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER seed_org_territories
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_default_territories();

-- Backfill: orgs that don't have any territories get the defaults.
INSERT INTO territories (organization_id, name)
SELECT o.id, t.name
FROM organizations o
CROSS JOIN (VALUES
  ('Northeast'), ('Southeast'), ('Midwest'), ('West Coast')
) AS t(name)
WHERE NOT EXISTS (
  SELECT 1 FROM territories WHERE organization_id = o.id
);
