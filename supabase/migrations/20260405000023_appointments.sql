-- Appointments for shows
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  show_date_id UUID REFERENCES show_dates(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  appointment_type TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' or 'walkin'
  location_type TEXT NOT NULL DEFAULT 'show',  -- 'show', 'road', 'phone', 'video', 'other'
  location_detail TEXT,  -- address, phone number, video link, etc.
  scheduled_date DATE,
  scheduled_time TIME,
  duration_minutes INTEGER DEFAULT 30,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Appointments visible to org members"
  ON appointments FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner/member can insert appointments"
  ON appointments FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can update appointments"
  ON appointments FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can delete appointments"
  ON appointments FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));
