-- Configurable order source types
CREATE TABLE source_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Add source_type_id to orders (for non-show sources like Road, JOOR)
ALTER TABLE orders ADD COLUMN source_type_id UUID REFERENCES source_types(id);

-- RLS
ALTER TABLE source_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Source types visible to org members"
  ON source_types FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can manage source types"
  ON source_types FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update source types"
  ON source_types FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete source types"
  ON source_types FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Seed default source types for existing orgs
INSERT INTO source_types (organization_id, name, sort_order)
SELECT o.id, s.name, s.sort
FROM organizations o
CROSS JOIN (VALUES ('Road', 1), ('JOOR', 2)) AS s(name, sort);

-- Seed source types for new organizations
CREATE OR REPLACE FUNCTION seed_default_sources()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.source_types (organization_id, name, sort_order) VALUES
    (NEW.id, 'Road', 1),
    (NEW.id, 'JOOR', 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER seed_org_sources
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_default_sources();
