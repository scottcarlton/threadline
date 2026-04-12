-- Allow sales role to manage appointments
DROP POLICY "Admin/owner/member can insert appointments" ON appointments;
CREATE POLICY "Admin/owner/member/sales can insert appointments"
  ON appointments FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales'));

DROP POLICY "Admin/owner/member can update appointments" ON appointments;
CREATE POLICY "Admin/owner/member/sales can update appointments"
  ON appointments FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales'));

DROP POLICY "Admin/owner/member can delete appointments" ON appointments;
CREATE POLICY "Admin/owner/member/sales can delete appointments"
  ON appointments FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales'));
