-- Stripped-down brand INSERT policy. Any authenticated user can insert a brand.
-- Intentionally simple to isolate whether the failure is RLS at all.

DROP POLICY IF EXISTS "Authorized users can insert brands" ON brands;
DROP POLICY IF EXISTS "Admin/owner can insert brands" ON brands;
DROP POLICY IF EXISTS "Members can insert brands for their org" ON brands;
DROP POLICY IF EXISTS "Org members can insert brands" ON brands;
DROP POLICY IF EXISTS "Anyone authenticated can insert brands" ON brands;

CREATE POLICY "Anyone authenticated can insert brands"
  ON brands FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
