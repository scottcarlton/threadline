-- One connection_invites row per brand org.
-- Always-on shareable link: no expiry, unlimited uses, rotated only on explicit refresh.
-- Replaces the old "generate targeted invite" flow.

-- 1. Schema shape: add last_used_at, allow expiry to be NULL (always-on),
--    allow created_by to be NULL (the org-creation trigger runs in service-role
--    contexts where auth.uid() is NULL).
ALTER TABLE connection_invites
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ALTER COLUMN expires_at DROP NOT NULL,
  ALTER COLUMN created_by DROP NOT NULL;

-- 2. Normalize all existing rows to the always-on model: no expiry, unlimited uses.
--    Pre-existing rows from the old "targeted invite" flow may still carry a 30-day
--    expiry and a max_uses cap; the new model treats every invite as always-on.
UPDATE connection_invites
   SET expires_at = NULL,
       max_uses = 0;

-- 3. Dedupe existing rows: keep the most recent per brand org, drop the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY brand_org_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM connection_invites
)
DELETE FROM connection_invites
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4. Enforce one row per brand org going forward.
ALTER TABLE connection_invites
  ADD CONSTRAINT connection_invites_one_per_org UNIQUE (brand_org_id);

-- 5. Backfill: seed an invite for every brand org that doesn't have one yet.
INSERT INTO connection_invites (brand_org_id, code, created_by, expires_at, max_uses)
SELECT
  o.id,
  encode(gen_random_bytes(16), 'hex'),
  (
    SELECT om.profile_id
    FROM organization_members om
    WHERE om.organization_id = o.id
      AND om.role IN ('admin', 'owner')
    ORDER BY om.created_at ASC
    LIMIT 1
  ),
  NULL,
  0
FROM organizations o
WHERE o.org_type = 'brand'
  AND NOT EXISTS (
    SELECT 1 FROM connection_invites ci WHERE ci.brand_org_id = o.id
  );

-- 6. Trigger: auto-create one invite whenever a brand org is created.
CREATE OR REPLACE FUNCTION create_connection_invite_for_brand_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.org_type = 'brand' THEN
    INSERT INTO connection_invites (brand_org_id, code, created_by, expires_at, max_uses)
    VALUES (
      NEW.id,
      encode(gen_random_bytes(16), 'hex'),
      auth.uid(),
      NULL,
      0
    )
    ON CONFLICT (brand_org_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_connection_invite ON organizations;
CREATE TRIGGER trg_create_connection_invite
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION create_connection_invite_for_brand_org();
