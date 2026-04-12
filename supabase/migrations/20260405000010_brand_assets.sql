-- Brand assets / resources
CREATE TABLE brand_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Assets visible to org members"
  ON brand_assets FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner/member can insert assets"
  ON brand_assets FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can delete assets"
  ON brand_assets FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: org members can read, admin/owner/member can upload/delete
CREATE POLICY "Org members can read brand assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'brand-assets');

CREATE POLICY "Members can upload brand assets"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'brand-assets');

CREATE POLICY "Members can delete brand assets"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'brand-assets');
