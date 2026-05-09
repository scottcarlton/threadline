-- System/transactional email log (Resend).
-- Distinct from email_log, which tracks user-initiated Gmail sends scoped to an organization.
CREATE TABLE transactional_email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  related_type TEXT,
  related_id UUID,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX transactional_email_log_to_email_idx ON transactional_email_log (to_email);
CREATE INDEX transactional_email_log_related_idx ON transactional_email_log (related_type, related_id);

ALTER TABLE transactional_email_log ENABLE ROW LEVEL SECURITY;

-- Writes happen via service role only; no client-side policies needed.
-- Org members can read their org's transactional mail for auditing.
CREATE POLICY "Transactional email visible to org members"
  ON transactional_email_log FOR SELECT
  USING (organization_id IS NOT NULL AND is_org_member(organization_id));
