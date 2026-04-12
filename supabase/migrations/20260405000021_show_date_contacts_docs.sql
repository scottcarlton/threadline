-- Add contact fields to show_dates
ALTER TABLE show_dates ADD COLUMN contact_name TEXT;
ALTER TABLE show_dates ADD COLUMN contact_email TEXT;
ALTER TABLE show_dates ADD COLUMN contact_phone TEXT;

-- Documents/contracts attached to show dates
CREATE TABLE show_date_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_date_id UUID NOT NULL REFERENCES show_dates(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE show_date_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Show date docs visible to org members"
  ON show_date_documents FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert show date docs"
  ON show_date_documents FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete show date docs"
  ON show_date_documents FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));
