-- ============================================================
-- Organization Agents
-- ============================================================

-- Agent trigger type enum
CREATE TYPE agent_trigger_type AS ENUM ('event', 'schedule');

-- Org agents — custom AI agents defined by organization admins
CREATE TABLE org_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  icon TEXT DEFAULT 'bot',
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

-- Agent triggers — event or schedule-based automation
CREATE TABLE org_agent_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES org_agents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_type agent_trigger_type NOT NULL,
  event_name TEXT,
  cron_expression TEXT,
  trigger_prompt TEXT NOT NULL,
  notify_channel TEXT DEFAULT 'none',
  is_active BOOLEAN DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_trigger CHECK (
    (trigger_type = 'event' AND event_name IS NOT NULL) OR
    (trigger_type = 'schedule' AND cron_expression IS NOT NULL)
  )
);

-- Agent run history
CREATE TABLE org_agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES org_agents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_id UUID REFERENCES org_agent_triggers(id) ON DELETE SET NULL,
  triggered_by TEXT NOT NULL,
  input_prompt TEXT NOT NULL,
  output_text TEXT,
  tools_used TEXT[],
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_org_agents_org ON org_agents(organization_id);
CREATE INDEX idx_org_agents_slug ON org_agents(organization_id, slug);
CREATE INDEX idx_org_agent_triggers_agent ON org_agent_triggers(agent_id);
CREATE INDEX idx_org_agent_triggers_event ON org_agent_triggers(event_name) WHERE trigger_type = 'event' AND is_active = TRUE;
CREATE INDEX idx_org_agent_runs_agent ON org_agent_runs(agent_id);
CREATE INDEX idx_org_agent_runs_org ON org_agent_runs(organization_id);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE org_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_agent_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_agent_runs ENABLE ROW LEVEL SECURITY;

-- Agents: all org members can see, admin/owner can manage
CREATE POLICY "Agents visible to org members"
  ON org_agents FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert agents"
  ON org_agents FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update agents"
  ON org_agents FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete agents"
  ON org_agents FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Triggers: all org members can see, admin/owner can manage
CREATE POLICY "Triggers visible to org members"
  ON org_agent_triggers FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert triggers"
  ON org_agent_triggers FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update triggers"
  ON org_agent_triggers FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete triggers"
  ON org_agent_triggers FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Runs: all org members can see, any member can insert (for user-invoked runs)
CREATE POLICY "Runs visible to org members"
  ON org_agent_runs FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Org members can insert runs"
  ON org_agent_runs FOR INSERT
  WITH CHECK (is_org_member(organization_id));
