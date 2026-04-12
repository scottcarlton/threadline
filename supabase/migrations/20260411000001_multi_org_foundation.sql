-- ============================================================
-- Phase 1: Multi-Org Foundation
-- Adds org_type to organizations, is_self_brand to brands,
-- get_user_org_ids() helper, and auto-create self-brand trigger
-- ============================================================

-- Add org_type column to organizations
ALTER TABLE organizations ADD COLUMN org_type TEXT NOT NULL DEFAULT 'rep'
  CHECK (org_type IN ('rep', 'brand'));

-- Add is_self_brand to brands (brand orgs auto-get a self-brand record)
ALTER TABLE brands ADD COLUMN is_self_brand BOOLEAN NOT NULL DEFAULT FALSE;

-- Helper: get all organization IDs for the current user
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
BEGIN
  RETURN QUERY
    SELECT organization_id FROM organization_members
    WHERE profile_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public;

-- Auto-create self-brand when a brand org is created
CREATE OR REPLACE FUNCTION create_self_brand()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_type = 'brand' THEN
    INSERT INTO public.brands (organization_id, name, is_self_brand, is_active)
    VALUES (NEW.id, NEW.name, TRUE, TRUE);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER auto_create_self_brand
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION create_self_brand();

-- Also handle org_type being updated to 'brand' (in case of future need)
CREATE OR REPLACE FUNCTION create_self_brand_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.org_type = 'brand' AND OLD.org_type != 'brand' THEN
    -- Only create if no self-brand exists yet
    IF NOT EXISTS (SELECT 1 FROM brands WHERE organization_id = NEW.id AND is_self_brand = TRUE) THEN
      INSERT INTO public.brands (organization_id, name, is_self_brand, is_active)
      VALUES (NEW.id, NEW.name, TRUE, TRUE);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER auto_create_self_brand_on_update
  AFTER UPDATE OF org_type ON organizations
  FOR EACH ROW EXECUTE FUNCTION create_self_brand_on_update();
