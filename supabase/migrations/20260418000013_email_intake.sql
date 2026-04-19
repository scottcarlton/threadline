-- Email intake: inbound email ordering infrastructure
-- SCO-112

-- ============================================================
-- 1. Enable extensions: pg_trgm (fuzzy match) + citext (case-insensitive email)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============================================================
-- 2. Add email_intake_enabled to organization_members
-- ============================================================
ALTER TABLE organization_members
  ADD COLUMN email_intake_enabled boolean NOT NULL DEFAULT false;

-- ============================================================
-- 3. Email intake status enum
-- ============================================================
CREATE TYPE email_intake_status AS ENUM (
  'received', 'parsed', 'submitted', 'needs_review', 'needs_routing', 'rejected'
);

-- ============================================================
-- 4. Email intakes table (audit + state)
-- ============================================================
CREATE TABLE email_intakes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid REFERENCES organizations(id),         -- nullable until routed
  from_email        citext NOT NULL,
  to_email          citext NOT NULL,
  subject           text,
  message_id        text NOT NULL UNIQUE,                       -- idempotency key
  resend_email_id   text NOT NULL,                              -- Resend received email ID
  parsed_json       jsonb,
  status            email_intake_status NOT NULL DEFAULT 'received',
  order_id          uuid REFERENCES orders(id),
  error_reason      text,
  needs_review_reasons jsonb,                                   -- structured [{lineIndex, reason}]
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_intakes_org_status ON email_intakes(organization_id, status);
CREATE INDEX email_intakes_from_email ON email_intakes(from_email);
CREATE INDEX email_intakes_message_id ON email_intakes(message_id);

-- ============================================================
-- 5. Email intake line resolutions (per-line diagnostics)
-- ============================================================
CREATE TABLE email_intake_line_resolutions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id        uuid NOT NULL REFERENCES email_intakes(id) ON DELETE CASCADE,
  line_index       int NOT NULL,
  raw_text         text NOT NULL,
  matched_product_id uuid REFERENCES products(id),
  confidence       numeric(4,3),                                -- 0.000–1.000
  issues           jsonb,                                       -- [{code, detail}]
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_intake_line_resolutions_intake ON email_intake_line_resolutions(intake_id);

-- ============================================================
-- 6. Trigram indexes for fuzzy matching
-- ============================================================
CREATE INDEX IF NOT EXISTS accounts_business_name_trgm ON accounts USING GIN (business_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_name_trgm          ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS brands_name_trgm            ON brands   USING GIN (name gin_trgm_ops);

-- ============================================================
-- 7. Trigram matching RPC functions
-- ============================================================

-- Match accounts by business_name similarity
CREATE OR REPLACE FUNCTION trigram_match_accounts(
  p_org_id uuid,
  p_search text,
  p_limit int DEFAULT 2
)
RETURNS TABLE(id uuid, business_name text, similarity real) AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.business_name, similarity(a.business_name, p_search) AS similarity
  FROM accounts a
  WHERE a.organization_id = p_org_id
    AND similarity(a.business_name, p_search) > 0.1
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Match brands by name similarity
CREATE OR REPLACE FUNCTION trigram_match_brands(
  p_org_id uuid,
  p_search text,
  p_limit int DEFAULT 1
)
RETURNS TABLE(id uuid, name text, similarity real) AS $$
BEGIN
  RETURN QUERY
  SELECT b.id, b.name, similarity(b.name, p_search) AS similarity
  FROM brands b
  WHERE b.organization_id = p_org_id
    AND similarity(b.name, p_search) > 0.1
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Match products by name similarity (optionally scoped to a brand)
CREATE OR REPLACE FUNCTION trigram_match_products(
  p_org_id uuid,
  p_search text,
  p_limit int DEFAULT 2,
  p_brand_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, similarity real) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, similarity(p.name, p_search) AS similarity
  FROM products p
  WHERE p.organization_id = p_org_id
    AND (p_brand_id IS NULL OR p.brand_id = p_brand_id)
    AND similarity(p.name, p_search) > 0.1
  ORDER BY similarity DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 8. RLS policies for email_intakes
-- ============================================================

ALTER TABLE email_intakes ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (webhook handler uses service role)
-- Org members can read their own org's intakes
CREATE POLICY "org_members_read_intakes" ON email_intakes
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE profile_id = auth.uid()
    )
  );

-- Org members with rep/admin/owner role can update intakes for their org
CREATE POLICY "org_members_update_intakes" ON email_intakes
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.profile_id = auth.uid()
        AND om.role IN ('admin', 'owner', 'member', 'sales')
    )
  );

-- ============================================================
-- 9. RLS policies for email_intake_line_resolutions
-- ============================================================

ALTER TABLE email_intake_line_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_read_line_resolutions" ON email_intake_line_resolutions
  FOR SELECT
  USING (
    intake_id IN (
      SELECT ei.id FROM email_intakes ei
      WHERE ei.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 10. updated_at trigger for email_intakes
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_email_intakes_updated_at
  BEFORE UPDATE ON email_intakes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
