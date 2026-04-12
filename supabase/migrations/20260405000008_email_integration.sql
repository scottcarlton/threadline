-- Gmail OAuth tokens per user
CREATE TABLE email_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'gmail',
  email_address TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, provider)
);

-- Email activity log
CREATE TABLE email_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sent_by UUID NOT NULL REFERENCES profiles(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  related_type TEXT,
  related_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email connections"
  ON email_connections FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users can insert own email connections"
  ON email_connections FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own email connections"
  ON email_connections FOR UPDATE
  USING (profile_id = auth.uid());

CREATE POLICY "Users can delete own email connections"
  ON email_connections FOR DELETE
  USING (profile_id = auth.uid());

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Email log visible to org members"
  ON email_log FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can insert email log"
  ON email_log FOR INSERT
  WITH CHECK (is_org_member(organization_id));
