-- Follow-up fixes for the organization redesign:
--   * order_number_pad_width — lets organizations zero-pad their order
--     numbers (e.g. PO-0000001 with prefix=PO- and pad_width=7).
--   * taxes_us_general_rate — single US-wide rate that applies when no
--     per-state rate matches; works alongside the per-state table.
--   * Backfill brands.contact_email for existing self-brands where it's
--     null, using the email of the earliest admin/owner in the
--     organization. New orgs get this set at onboarding time.

ALTER TABLE organizations
  ADD COLUMN order_number_pad_width INTEGER NOT NULL DEFAULT 0
    CHECK (order_number_pad_width >= 0 AND order_number_pad_width <= 12),
  ADD COLUMN taxes_us_general_rate NUMERIC(5, 2);

UPDATE brands b
SET contact_email = creators.email
FROM (
  SELECT DISTINCT ON (om.organization_id)
    om.organization_id,
    au.email
  FROM organization_members om
  JOIN auth.users au ON au.id = om.profile_id
  WHERE om.role IN ('admin', 'owner')
  ORDER BY om.organization_id, om.created_at ASC
) creators
WHERE b.organization_id = creators.organization_id
  AND b.is_self_brand = TRUE
  AND b.contact_email IS NULL;
