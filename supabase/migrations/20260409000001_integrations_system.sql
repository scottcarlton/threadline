-- Organization-scoped integration connections
CREATE TABLE integration_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  external_account_id TEXT,
  external_account_name TEXT,
  config JSONB DEFAULT '{}',
  connected_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);

-- Sync/export audit log
CREATE TABLE integration_sync_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  details JSONB DEFAULT '{}',
  error_message TEXT,
  triggered_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_integration_connections_org ON integration_connections(organization_id);
CREATE INDEX idx_integration_sync_log_connection ON integration_sync_log(connection_id);
CREATE INDEX idx_integration_sync_log_org ON integration_sync_log(organization_id);

-- RLS
ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Connections visible to org members"
  ON integration_connections FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert connections"
  ON integration_connections FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update connections"
  ON integration_connections FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete connections"
  ON integration_connections FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

ALTER TABLE integration_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sync log visible to org members"
  ON integration_sync_log FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert sync log"
  ON integration_sync_log FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));
