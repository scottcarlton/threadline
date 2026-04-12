-- Allow users to read their own brand access entries
CREATE POLICY "Users can view own brand access"
  ON member_brand_access FOR SELECT
  USING (
    member_id IN (
      SELECT id FROM organization_members WHERE profile_id = auth.uid()
    )
  );
