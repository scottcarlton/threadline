-- Phase 2 of organization redesign: Profile cleanup.
-- Adds optional Identity fields (legal_business_name, tagline,
-- logo_storage_path) and required Regional defaults (time_zone,
-- currency_code) to organizations. Address columns are already
-- structured; country was added in 20260417000005_org_address.

ALTER TABLE organizations
  ADD COLUMN legal_business_name TEXT,
  ADD COLUMN tagline TEXT CHECK (length(tagline) <= 80),
  ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN currency_code TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN logo_storage_path TEXT;

-- Storage bucket for org logos. Public so the app header and partner-
-- facing pages (e.g. /connect/[code]) can render <img src> directly
-- without re-signing on every render. Existing buckets (brand-assets,
-- expense-receipts) are private with signed URLs because their content
-- is sensitive; logos are not.
INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-logos', 'organization-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can read organization logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'organization-logos');

CREATE POLICY "Authenticated users can upload organization logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'organization-logos');

CREATE POLICY "Authenticated users can delete organization logos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'organization-logos');
