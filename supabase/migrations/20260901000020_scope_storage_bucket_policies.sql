-- ============================================================================
-- Close the unauthenticated storage.objects hole on brand-assets and
-- expense-receipts.
--
-- The six policies created in 20260405000010_brand_assets.sql and
-- 20260410000002_brand_expenses.sql have USING/WITH CHECK expressions of
-- only `bucket_id = '...'`, with no auth or org predicate, and polroles of
-- {0} (PUBLIC, which includes anon). An unauthenticated client can list,
-- download, upload, and delete objects in both buckets. Both buckets are
-- `public = false`, so this is the policies, not bucket publicity.
--
-- Fix: drop and recreate all six, every one restricted `TO authenticated`
-- (the single most important change -- it excludes anon at the role level,
-- not just by predicate), with real scoping:
--
--   SELECT: delegate to the table that already models visibility for that
--   object (brand_assets, product_images, expense_receipts). A subquery
--   inside a policy runs with the caller's privileges, so this inherits
--   those tables' own RLS -- including federation -- instead of
--   re-deriving and eventually drifting from it.
--
--   INSERT/DELETE: scope by the organization id in the first path segment.
--   All three upload endpoints (src/routes/api/brands/[id]/assets,
--   src/routes/api/expenses/[id]/receipts, src/routes/api/upload/receipt,
--   src/lib/server/products/upload-image.ts) build paths as
--   `${orgId}/...` and write via supabaseAdmin, which bypasses RLS
--   entirely -- but these policies still have to be correct for any
--   direct client path, and the owning DB row is usually written after
--   the storage object, so an EXISTS-against-the-table check would fail
--   at upload time. The first path segment is the only thing available.
--
-- organization-logos is deliberately public-readable and is untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Drop the six unscoped policies by name.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Org members can read expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete expense receipts" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Members can upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Members can delete brand assets" ON storage.objects;

-- ----------------------------------------------------------------------------
-- brand-assets: holds both brand_assets rows and product_images rows
-- (src/lib/server/products/upload-image.ts uploads product images into
-- this bucket under `${orgId}/products/${productId}/...`).
-- ----------------------------------------------------------------------------

CREATE POLICY "Brand assets readable via owning record"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (
      EXISTS (SELECT 1 FROM public.brand_assets a WHERE a.file_path = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.product_images i WHERE i.file_path = storage.objects.name)
    )
  );

-- Guard the ::uuid cast: a CASE expression is evaluated in order (unlike
-- AND/OR, whose short-circuiting is not guaranteed by the standard or by
-- Postgres), so the cast only ever runs once the regex has confirmed the
-- first path segment is a well-formed UUID. A legacy or malformed object
-- whose first segment is not a UUID falls through to `else false` --
-- denied, not an error.
CREATE POLICY "Brand assets writable by owning org"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_org_ids())
      ELSE false
    END
  );

CREATE POLICY "Brand assets deletable by owning org"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_org_ids())
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

CREATE POLICY "Expense receipts writable by owning org"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_org_ids())
      ELSE false
    END
  );

CREATE POLICY "Expense receipts deletable by owning org"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND CASE
      WHEN (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_org_ids())
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
