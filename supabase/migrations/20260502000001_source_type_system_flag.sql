-- Add is_system flag to source_types so buyer-originated sources (Portal)
-- are hidden from rep source pickers but available for order filtering.

ALTER TABLE source_types ADD COLUMN is_system BOOLEAN NOT NULL DEFAULT FALSE;

-- Seed "Portal" for every existing org
INSERT INTO source_types (organization_id, name, sort_order, is_system)
SELECT o.id, 'Portal', 99, TRUE
FROM organizations o
ON CONFLICT (organization_id, name) DO UPDATE SET is_system = TRUE;

-- Update the seed trigger to include Portal for new orgs
CREATE OR REPLACE FUNCTION seed_default_sources()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.source_types (organization_id, name, sort_order, is_system) VALUES
    (NEW.id, 'Road', 1, FALSE),
    (NEW.id, 'JOOR', 2, FALSE),
    (NEW.id, 'Portal', 99, TRUE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
