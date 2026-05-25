-- Add channel column to orders to track how the order entered the system.
-- Channel is distinct from source_type (Road, JOOR, etc.) which tracks
-- the business context. Channel is auto-set and not user-editable.

CREATE TYPE order_channel AS ENUM ('web-rep', 'web-buyer', 'email', 'whatsapp', 'sms');

ALTER TABLE orders ADD COLUMN channel order_channel;

-- Backfill existing orders:
-- Orders with source_type pointing to the "Portal" system source → web-buyer
-- Everything else → web-rep (the only channel that existed before)
UPDATE orders
SET channel = CASE
  WHEN source_type_id IN (
    SELECT id FROM source_types WHERE name = 'Portal' AND is_system = TRUE
  ) THEN 'web-buyer'::order_channel
  ELSE 'web-rep'::order_channel
END;

-- Now make it NOT NULL with a default for legacy code paths
ALTER TABLE orders ALTER COLUMN channel SET NOT NULL;
ALTER TABLE orders ALTER COLUMN channel SET DEFAULT 'web-rep';

-- Clear the Portal source_type_id from backfilled orders since channel now carries that info
UPDATE orders
SET source_type_id = NULL
WHERE source_type_id IN (
  SELECT id FROM source_types WHERE name = 'Portal' AND is_system = TRUE
);

-- Remove Portal from source_types (no longer needed)
DELETE FROM source_types WHERE name = 'Portal' AND is_system = TRUE;

-- Update the seed trigger to stop creating Portal for new orgs
CREATE OR REPLACE FUNCTION seed_default_sources()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.source_types (organization_id, name, sort_order, is_system) VALUES
    (NEW.id, 'Road', 1, FALSE),
    (NEW.id, 'JOOR', 2, FALSE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
