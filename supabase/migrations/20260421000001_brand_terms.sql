-- Brand-scoped, versioned T&Cs. One row per brand is is_current = TRUE;
-- past versions are preserved for audit. Orders record the terms_id they
-- agreed to at submit time so the exact language can be reproduced later.

CREATE TABLE brand_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL DEFAULT 'Terms & Conditions',
  body TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one current row per brand. Past versions keep is_current = FALSE.
CREATE UNIQUE INDEX brand_terms_one_current_per_brand
  ON brand_terms(brand_id) WHERE is_current;

CREATE INDEX brand_terms_brand_id_idx ON brand_terms(brand_id);
CREATE INDEX brand_terms_organization_id_idx ON brand_terms(organization_id);

-- Trigger: when a new is_current row lands, demote any prior current row
-- for the same brand. Keeps the unique partial index satisfiable.
CREATE OR REPLACE FUNCTION public.demote_prior_brand_terms()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.brand_terms
      SET is_current = FALSE
      WHERE brand_id = NEW.brand_id
        AND id <> NEW.id
        AND is_current;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER brand_terms_demote_prior
  BEFORE INSERT OR UPDATE OF is_current ON public.brand_terms
  FOR EACH ROW
  EXECUTE FUNCTION public.demote_prior_brand_terms();

ALTER TABLE brand_terms ENABLE ROW LEVEL SECURITY;

-- SELECT: owning-org members, plus connected rep orgs (so reps can read
-- terms for brands they sell). Federation direction matches existing brand
-- visibility — see docs/brd/permissions-implementation-map.md §A.4.
CREATE POLICY "Brand terms visible to org members"
  ON brand_terms FOR SELECT
  USING (
    is_org_member(organization_id)
    OR brand_id IN (
      SELECT b.id
      FROM brands b
      WHERE b.organization_id IN (SELECT get_connected_org_ids())
    )
  );

CREATE POLICY "Admin/owner can insert brand terms"
  ON brand_terms FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update brand terms"
  ON brand_terms FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete brand terms"
  ON brand_terms FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
