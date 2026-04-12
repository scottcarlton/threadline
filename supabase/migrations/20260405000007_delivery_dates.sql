-- Season delivery dates (recurring month/day targets)
CREATE TABLE season_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  delivery_month INTEGER NOT NULL CHECK (delivery_month BETWEEN 1 AND 12),
  delivery_day INTEGER NOT NULL CHECK (delivery_day BETWEEN 1 AND 31),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add delivery assignment to orders
ALTER TABLE orders ADD COLUMN delivery_id UUID REFERENCES season_deliveries(id);

-- RLS
ALTER TABLE season_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deliveries visible to org members"
  ON season_deliveries FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert deliveries"
  ON season_deliveries FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update deliveries"
  ON season_deliveries FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete deliveries"
  ON season_deliveries FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Seed default delivery dates for existing organizations
INSERT INTO season_deliveries (organization_id, season_id, label, delivery_month, delivery_day, sort_order)
SELECT o.id, s.id, d.label, d.month, d.day, d.sort
FROM organizations o
JOIN seasons s ON s.organization_id = o.id
CROSS JOIN (VALUES
  ('Spring', '1/30', 1, 30, 1),
  ('Spring', '2/28', 2, 28, 2),
  ('Spring', '3/30', 3, 30, 3),
  ('Summer', '4/30', 4, 30, 4),
  ('Summer', '5/30', 5, 30, 5),
  ('Summer', '6/30', 6, 30, 6),
  ('Fall',   '7/30', 7, 30, 7),
  ('Fall',   '8/30', 8, 30, 8),
  ('Fall',   '9/30', 9, 30, 9),
  ('Holiday','10/30', 10, 30, 10),
  ('Holiday','11/30', 11, 30, 11),
  ('Holiday','12/30', 12, 30, 12)
) AS d(season_name, label, month, day, sort)
WHERE s.name = d.season_name;

-- Also seed deliveries when new seasons are created via the org trigger
-- Update the seed_default_seasons function to also create deliveries
CREATE OR REPLACE FUNCTION seed_default_seasons()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert seasons
  INSERT INTO public.seasons (organization_id, name, sort_order) VALUES
    (NEW.id, 'Spring', 1),
    (NEW.id, 'Summer', 2),
    (NEW.id, 'Fall', 3),
    (NEW.id, 'Resort', 4),
    (NEW.id, 'Holiday', 5);

  -- Insert default delivery dates
  INSERT INTO public.season_deliveries (organization_id, season_id, label, delivery_month, delivery_day, sort_order)
  SELECT NEW.id, s.id, d.label, d.month, d.day, d.sort
  FROM public.seasons s
  CROSS JOIN (VALUES
    ('Spring', '1/30', 1, 30, 1),
    ('Spring', '2/28', 2, 28, 2),
    ('Spring', '3/30', 3, 30, 3),
    ('Summer', '4/30', 4, 30, 4),
    ('Summer', '5/30', 5, 30, 5),
    ('Summer', '6/30', 6, 30, 6),
    ('Fall',   '7/30', 7, 30, 7),
    ('Fall',   '8/30', 8, 30, 8),
    ('Fall',   '9/30', 9, 30, 9),
    ('Holiday','10/30', 10, 30, 10),
    ('Holiday','11/30', 11, 30, 11),
    ('Holiday','12/30', 12, 30, 12)
  ) AS d(season_name, label, month, day, sort)
  WHERE s.organization_id = NEW.id AND s.name = d.season_name;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
