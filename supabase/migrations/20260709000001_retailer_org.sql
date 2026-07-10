-- ============================================================
-- Retailers as first-class organizations (org_type = 'retailer')
--
-- A retailer IS an `organizations` row now. The founding user is an
-- `organization_members` admin, exactly like a rep or brand org. This
-- supersedes the v1 `retailers`/`retailer_users` tables — retailers are no
-- longer a bespoke directory but a real org type that flows through the
-- existing membership + onboarding machinery.
--
-- A retailer org has no self-brand, no seasons, and no shipping methods
-- (those are brand-org concerns). It reaches the buyer portal via `isBuyer`,
-- resolved from org_type in hooks.server.ts — not via absence of membership.
-- See docs/superpowers/specs/2026-07-10-retailer-org-identity-design.md.
-- ============================================================

-- Widen org_type to admit retailers. The auto_create_self_brand trigger only
-- fires for org_type='brand', so retailer orgs are correctly skipped.
ALTER TABLE organizations DROP CONSTRAINT organizations_org_type_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_org_type_check CHECK (org_type IN ('rep', 'brand', 'retailer'));

-- The seam for SP4 brand-initiated linking: a brand's private `accounts` row
-- will point at the shared retailer org it represents. Written by nothing in
-- SP1 — it exists now so SP4 is one line, not a migration against the busiest
-- table in the schema.
ALTER TABLE accounts
  ADD COLUMN retailer_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_accounts_retailer_org_id
  ON accounts(retailer_org_id) WHERE retailer_org_id IS NOT NULL;
