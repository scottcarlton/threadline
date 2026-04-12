-- ============================================================
-- Insight Actions — Pre-computed prescriptive insights
-- ============================================================

CREATE TABLE insight_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),  -- NULL = org-wide (admin sees all)
  insight_type TEXT NOT NULL,             -- 'revenue_leakage', 'order_gap', 'call_queue', etc.
  entity_type TEXT,                       -- 'account', 'order', 'brand'
  entity_id UUID,
  priority_score INTEGER DEFAULT 50,      -- 0-100, drives sort order
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',            -- flexible payload (amounts, comparisons, context)
  status TEXT DEFAULT 'active',           -- 'active', 'dismissed', 'acted', 'expired'
  acted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Primary query index: active insights for an org, sorted by priority
CREATE INDEX idx_insight_actions_org_status
  ON insight_actions(organization_id, status, priority_score DESC);

-- Fast lookup by entity (e.g. all insights for a specific account)
CREATE INDEX idx_insight_actions_entity
  ON insight_actions(entity_type, entity_id) WHERE status = 'active';

-- Expiry cleanup index
CREATE INDEX idx_insight_actions_expires
  ON insight_actions(expires_at) WHERE expires_at IS NOT NULL AND status = 'active';

-- ============================================================
-- RLS — Users see org-wide + their own insights
-- ============================================================

ALTER TABLE insight_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see org-wide and own insights"
  ON insight_actions FOR SELECT
  USING (
    is_org_member(organization_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Admin/owner can insert insights"
  ON insight_actions FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update insights"
  ON insight_actions FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- Users can dismiss/act on their own insights
CREATE POLICY "Users can update own insights"
  ON insight_actions FOR UPDATE
  USING (
    is_org_member(organization_id)
    AND (user_id IS NULL OR user_id = auth.uid())
  );

CREATE POLICY "Admin/owner can delete insights"
  ON insight_actions FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
