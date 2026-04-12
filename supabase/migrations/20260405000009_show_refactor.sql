-- ============================================================
-- Refactor shows into series + dates
-- ============================================================

-- Create show_dates table for specific occurrences
CREATE TABLE show_dates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  venue TEXT,
  city TEXT,
  state TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(show_id, year, month)
);

-- Migrate existing show data into show_dates
INSERT INTO show_dates (show_id, organization_id, year, month, venue, city, state, start_date, end_date, notes)
SELECT
  id, organization_id,
  COALESCE(year, EXTRACT(YEAR FROM COALESCE(start_date, NOW()))::INTEGER),
  COALESCE(EXTRACT(MONTH FROM start_date)::INTEGER, 1),
  venue, city, state, start_date, end_date, notes
FROM shows
WHERE start_date IS NOT NULL OR year IS NOT NULL;

-- Add show_date_id to orders (replaces show_id)
ALTER TABLE orders ADD COLUMN show_date_id UUID REFERENCES show_dates(id);

-- Migrate existing order show_id references to show_date_id
UPDATE orders o
SET show_date_id = sd.id
FROM show_dates sd
WHERE o.show_id = sd.show_id
  AND o.show_id IS NOT NULL;

-- Drop old columns from shows (keep it as a series/template)
ALTER TABLE shows DROP COLUMN IF EXISTS season_id;
ALTER TABLE shows DROP COLUMN IF EXISTS year;
ALTER TABLE shows DROP COLUMN IF EXISTS venue;
ALTER TABLE shows DROP COLUMN IF EXISTS city;
ALTER TABLE shows DROP COLUMN IF EXISTS state;
ALTER TABLE shows DROP COLUMN IF EXISTS start_date;
ALTER TABLE shows DROP COLUMN IF EXISTS end_date;

-- Create show_visits table
CREATE TABLE show_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  show_date_id UUID NOT NULL REFERENCES show_dates(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'saw',
  notes TEXT,
  is_new_account BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(show_date_id, account_id)
);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE show_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Show dates visible to org members"
  ON show_dates FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert show dates"
  ON show_dates FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update show dates"
  ON show_dates FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete show dates"
  ON show_dates FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

ALTER TABLE show_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Show visits visible to org members"
  ON show_visits FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner/member can insert show visits"
  ON show_visits FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can update show visits"
  ON show_visits FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can delete show visits"
  ON show_visits FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));
