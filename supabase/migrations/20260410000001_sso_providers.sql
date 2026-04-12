-- ============================================================
-- SAML SSO Provider Configuration
-- ============================================================

-- Track which Supabase SSO provider belongs to which organization
CREATE TABLE organization_sso_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supabase_provider_id TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'saml',
  display_name TEXT,
  metadata_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(organization_id, domain)
);

-- SSO enforcement policy on the organization
ALTER TABLE organizations ADD COLUMN sso_enforced BOOLEAN NOT NULL DEFAULT false;

-- RLS
ALTER TABLE organization_sso_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admin/owner can view SSO providers"
  ON organization_sso_providers FOR SELECT
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can insert SSO providers"
  ON organization_sso_providers FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can update SSO providers"
  ON organization_sso_providers FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Org admin/owner can delete SSO providers"
  ON organization_sso_providers FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Index for domain lookups during login
CREATE INDEX idx_org_sso_domain ON organization_sso_providers(domain);
