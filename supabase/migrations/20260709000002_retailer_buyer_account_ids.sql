-- ============================================================
-- SP3: Retailer shopping via linked accounts
--
-- Extends get_buyer_account_ids() — the single choke point every buyer RLS
-- policy resolves through (directly for accounts/orders/order_lines, or via
-- get_buyer_brand_ids() for brands/products/variants/images/seasons) — to also
-- return accounts linked to a retailer org the caller is a member of, through
-- accounts.retailer_org_id.
--
-- One function; every downstream buyer policy inherits retailer scope. No new
-- policies. See docs/superpowers/specs/
-- 2026-07-10-retailer-shopping-via-linked-accounts-design.md.
--
-- Security:
--   * Link is necessary, NOT sufficient. Setting retailer_org_id grants nothing
--     on its own — a retailer sees a brand only when a linked account ALSO has an
--     account_brand_access row (the same brand-side grant that gates every
--     account_users buyer). The brand stays in control.
--   * No cross-tenant leak: the retailer arm is scoped by om.profile_id =
--     auth.uid() (the caller's own memberships) and o.org_type = 'retailer'
--     (a stray FK to a rep/brand org cannot widen access for that org's members).
--   * Legacy account_users buyers are untouched: the first arm is byte-for-byte
--     the original; UNION only ADDS rows (and de-dupes an account that is both).
-- ============================================================

CREATE OR REPLACE FUNCTION get_buyer_account_ids()
RETURNS SETOF UUID AS $$
  SELECT account_id FROM account_users WHERE profile_id = auth.uid()
  UNION
  SELECT a.id FROM accounts a
  JOIN organizations o ON o.id = a.retailer_org_id AND o.org_type = 'retailer'
  JOIN organization_members om ON om.organization_id = o.id
  WHERE om.profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;
