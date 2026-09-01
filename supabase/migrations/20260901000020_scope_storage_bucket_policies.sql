-- ============================================================================
-- Close the unauthenticated storage.objects holes on brand-assets,
-- expense-receipts, and the write side of organization-logos.
--
-- brand-assets and expense-receipts: the six policies created in
-- 20260405000010_brand_assets.sql and 20260410000002_brand_expenses.sql have
-- USING/WITH CHECK expressions of only `bucket_id = '...'`, with no auth or
-- org predicate, and polroles of {0} (PUBLIC, which includes anon). An
-- unauthenticated client can list, download, upload, and delete objects in
-- both buckets. Both buckets are `public = false`, so this is the policies,
-- not bucket publicity.
--
-- organization-logos: the SELECT policy is deliberately PUBLIC (the bucket
-- is `public = true` by design -- see 20260425000001_org_profile_fields.sql
-- -- so the app header and partner-facing pages like /connect/[code] can
-- render <img src> without re-signing). But its INSERT and DELETE policies
-- have the same `bucket_id = '...'`-only shape as the other two buckets'
-- write policies, named "Authenticated users can upload/delete..." while
-- actually granting PUBLIC. Public read is correct there; public write is
-- not -- anon can overwrite or delete any organization's logo. Left SELECT
-- alone, fixed INSERT/DELETE with the same pattern as the other buckets.
--
-- Fix, for every INSERT/DELETE/SELECT touched: restrict `TO authenticated`
-- (the single most important change -- it excludes anon at the role level,
-- not just by predicate), with real scoping:
--
--   SELECT: delegate to the table that already models visibility for that
--   object (brand_assets, product_images, show_date_documents, and
--   expense_receipts). A subquery inside a policy runs with the caller's
--   privileges, so this inherits those tables' own RLS -- including
--   federation on brand_assets -- instead of re-deriving and eventually
--   drifting from it.
--
--   INSERT/DELETE: scope by the organization id in the first path segment,
--   AND by the caller's role in that org, matching each owning table's own
--   write policy as closely as a path-only check can. All five upload
--   endpoints build paths as `${orgId}/...` and write via supabaseAdmin,
--   which bypasses RLS entirely -- but these policies still have to be
--   correct for any direct client path, and the owning DB row is usually
--   written after the storage object, so an EXISTS-against-the-table check
--   would fail at upload time. The first path segment is the only thing
--   available for the org half of the check; get_user_role() covers the
--   role half.
--
--   brand-assets holds three different owning tables, whose own INSERT/
--   DELETE policies are:
--     brand_assets:          admin/owner/member
--     product_images:        admin/owner/member
--     show_date_documents:   admin/owner            (narrower)
--   The storage-level write policy uses admin/owner/member -- the ceiling
--   shared by two of the three -- rather than the show_date_documents
--   floor, because a member permitted to write an object under a
--   shows/-prefixed path at the storage layer still cannot create the
--   corresponding show_date_documents row (that table's own INSERT policy
--   is admin/owner only, and the real write path goes through
--   supabaseAdmin anyway, not a direct authenticated client). Tightening
--   the storage policy below admin/owner/member would incorrectly block a
--   legitimate direct-client brand_assets/product_images write.
--
--   expense-receipts' owning table is expense_receipts, whose INSERT policy
--   is admin/owner/member/sales (reps submitting their own expenses) and
--   whose DELETE policy is narrower still -- own draft (submitted_by =
--   auth.uid() AND status = 'draft') OR admin/owner, a row-level condition
--   that cannot be reconstructed from the path alone. The storage INSERT
--   policy below matches admin/owner/member/sales; the storage DELETE
--   policy uses admin/owner only, the safe superset of "definitely allowed
--   regardless of row ownership" rather than attempting to approximate the
--   own-draft branch.
--
-- Five upload endpoints write into these buckets (all via supabaseAdmin):
--   src/routes/api/brands/[id]/assets/+server.ts           -> brand-assets,       brand_assets row
--   src/lib/server/products/upload-image.ts                -> brand-assets,       product_images row
--   src/routes/api/shows/[dateId]/documents/+server.ts      -> brand-assets,       show_date_documents row
--   src/routes/api/expenses/[id]/receipts/+server.ts        -> expense-receipts,   expense_receipts row
--   src/routes/api/upload/receipt/+server.ts                -> expense-receipts,   expense_receipts row
--   src/routes/api/organization/logo/+server.ts             -> organization-logos, organizations.logo_storage_path
--
-- No UPDATE policy is added for any bucket, deliberately: every write in
-- this app either creates a brand-new object path (timestamped) or
-- upserts via delete+insert (organization/logo). If a future direct client
-- write calls `.upload(..., { upsert: true })` against an existing path
-- under one of the scoped buckets, it will fail with a permission error,
-- not silently overwrite -- add an UPDATE policy deliberately if that
-- becomes a real use case, rather than treating this as an oversight.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Drop the eight unscoped write/read policies by name (six on brand-assets/
-- expense-receipts, plus organization-logos' two write policies).
-- organization-logos' SELECT policy, "Anyone can read organization logos",
-- is untouched -- that bucket is deliberately public-readable.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can read expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete organization logos" ON storage.objects;

-- ----------------------------------------------------------------------------
-- brand-assets: holds brand_assets, product_images, and show_date_documents
-- rows (all three tables have a `file_path` column pointing into this
-- bucket).
-- ----------------------------------------------------------------------------

CREATE POLICY "Brand assets readable via owning record"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      EXISTS (SELECT 1 FROM public.brand_assets a WHERE a.file_path = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.product_images i WHERE i.file_path = storage.objects.name)
      OR EXISTS (
        SELECT 1 FROM public.show_date_documents d WHERE d.file_path = storage.objects.name
      )
    )
  );

-- Guard the ::uuid cast: a CASE expression is evaluated in order (unlike
-- AND/OR, whose short-circuiting is not guaranteed by the standard or by
-- Postgres), so the cast only ever runs once the regex has confirmed the
-- first path segment is a well-formed UUID. A legacy or malformed object
-- whose first segment is not a UUID -- including the empty array
-- storage.foldername() returns for a bucket-root object with no `/`, whose
-- `[1]` is NULL -- falls through to `else false`: denied, not an error.
CREATE POLICY "Brand assets writable by owning org member"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.get_user_role(((storage.foldername(name))[1])::uuid) IN ('admin', 'owner', 'member')
      ELSE false
    END
  );

CREATE POLICY "Brand assets deletable by owning org member"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.get_user_role(((storage.foldername(name))[1])::uuid) IN ('admin', 'owner', 'member')
      ELSE false
    END
  );

-- ----------------------------------------------------------------------------
-- expense-receipts
-- ----------------------------------------------------------------------------

CREATE POLICY "Expense receipts readable via owning record"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND EXISTS (SELECT 1 FROM public.expense_receipts r WHERE r.file_path = storage.objects.name)
  );

CREATE POLICY "Expense receipts writable by owning org member"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.get_user_role(((storage.foldername(name))[1])::uuid) IN ('admin', 'owner', 'member', 'sales')
      ELSE false
    END
  );

-- Narrower than the INSERT policy: expense_receipts' own DELETE policy is
-- (submitted_by = auth.uid() AND status = 'draft') OR admin/owner, a
-- row-level condition that cannot be reconstructed from the path alone.
-- admin/owner is the safe subset that is always allowed regardless of who
-- submitted the receipt or its status.
CREATE POLICY "Expense receipts deletable by owning org admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.get_user_role(((storage.foldername(name))[1])::uuid) IN ('admin', 'owner')
      ELSE false
    END
  );

-- ----------------------------------------------------------------------------
-- organization-logos: write side only. SELECT stays PUBLIC by design.
-- Path convention (src/routes/api/organization/logo/+server.ts) is
-- `${orgId}/logo.${ext}` -- same first-path-segment-is-org-id shape as the
-- other two buckets. Logo writes are gated admin/owner at the app layer
-- (requireAdmin in src/lib/server/auth/require-admin.ts); mirror that here.
-- ----------------------------------------------------------------------------

CREATE POLICY "Organization logos writable by owning org admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'organization-logos'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.get_user_role(((storage.foldername(name))[1])::uuid) IN ('admin', 'owner')
      ELSE false
    END
  );

CREATE POLICY "Organization logos deletable by owning org admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'organization-logos'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN public.get_user_role(((storage.foldername(name))[1])::uuid) IN ('admin', 'owner')
      ELSE false
    END
  );

-- ----------------------------------------------------------------------------
-- The new SELECT policies above do an EXISTS lookup by file_path per object
-- access, with no existing index to serve it.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_brand_assets_file_path ON public.brand_assets (file_path);
CREATE INDEX IF NOT EXISTS idx_product_images_file_path ON public.product_images (file_path);
CREATE INDEX IF NOT EXISTS idx_expense_receipts_file_path ON public.expense_receipts (file_path);
CREATE INDEX IF NOT EXISTS idx_show_date_documents_file_path ON public.show_date_documents (file_path);
