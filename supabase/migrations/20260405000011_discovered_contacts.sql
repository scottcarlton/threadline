-- Discovered contacts from inbox scanning
CREATE TABLE discovered_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'dismissed')),
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 1,
  discovered_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, email)
);

-- RLS
ALTER TABLE discovered_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Discovered contacts visible to org members"
  ON discovered_contacts FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Members can insert discovered contacts"
  ON discovered_contacts FOR INSERT
  WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Members can update discovered contacts"
  ON discovered_contacts FOR UPDATE
  USING (is_org_member(organization_id));

CREATE POLICY "Admins can delete discovered contacts"
  ON discovered_contacts FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
