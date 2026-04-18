-- Fix brands INSERT RLS: replace the SECURITY DEFINER function call with a direct
-- inline EXISTS check. The function version was silently rejecting legitimate INSERTs
-- (see: Demo Rep Admin of Acme Consulting unable to create independent MBISR brands).
--
-- Root cause candidates eliminated by this migration:
--   1. SECURITY DEFINER function indirection hiding auth.uid() mismatches
--   2. Volatile SQL function caching
--   3. Any stale policy rows left behind by partial migration state

DROP POLICY IF EXISTS "Authorized users can insert brands" ON brands;
DROP POLICY IF EXISTS "Admin/owner can insert brands" ON brands;
DROP POLICY IF EXISTS "Members can insert brands for their org" ON brands;
DROP POLICY IF EXISTS "Org members can insert brands" ON brands;

CREATE POLICY "Org members can insert brands"
  ON brands FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = brands.organization_id
        AND om.profile_id = auth.uid()
        AND om.role IN ('admin', 'owner', 'member')
    )
  );
