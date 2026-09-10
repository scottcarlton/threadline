-- Brand-scope the orders UPDATE policy, and give it a WITH CHECK.
--
-- "Admin/owner/member/sales can update orders"
-- (supabase/migrations/20260408000001_sales_order_rls.sql) is role-only:
--
--   USING (get_user_role(organization_id) IN ('admin','owner','member','sales'))
--
-- A member or sales user's member_brand_access scoping therefore constrains
-- what they can SELECT and INSERT but not what they can UPDATE. A sales user
-- scoped to brand A could update any order in the org, including orders for
-- brands they cannot even see. Per docs/brd/roles-permissions.md 4.4, editing
-- orders is Scoped for Member and Sales, not All.
--
-- The missing WITH CHECK is the second half: with none, Postgres reuses the
-- USING expression as the check, so before this migration nothing constrained
-- the resulting row's brand_id either.
--
-- The scoping expression is copied verbatim from the SELECT policy
-- "Orders visible to org members (brand-scoped)"
-- (supabase/migrations/20260418000011_orders_select_federated_brands.sql)
-- rather than from the INSERT policy. That keeps the invariant that a user
-- can only edit what they can read: the INSERT policy extends the
-- connected-brand arm to sales/guest as well, but the SELECT policy
-- deliberately does not, so an UPDATE modelled on INSERT would grant sales
-- users write access to rows they cannot read. The unscoped-MBISR-Sales case
-- stays where it is already tracked, under the A.2a helper gap; this
-- migration neither widens nor narrows it.
--
-- Recursion: neither expression references orders. get_user_brand_ids and
-- get_user_role are SECURITY DEFINER, and the brands subquery is the same one
-- the SELECT and INSERT policies on orders already run, so it is proven not to
-- recurse. See supabase/migrations/20260901000001_fix_orders_update_recursion.sql
-- for the 42P17 this table earned the hard way.

DROP POLICY IF EXISTS "Admin/owner/member/sales can update orders" ON orders;

CREATE POLICY "Admin/owner/member/sales can update orders"
  ON orders FOR UPDATE
  USING (
    (
      brand_id IN (SELECT get_user_brand_ids(organization_id))
      OR (
        get_user_role(organization_id) IN ('admin', 'owner', 'member')
        AND brand_id IN (
          SELECT b.id FROM brands b
          WHERE b.organization_id IN (SELECT get_connected_org_ids())
        )
      )
    )
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  )
  WITH CHECK (
    (
      brand_id IN (SELECT get_user_brand_ids(organization_id))
      OR (
        get_user_role(organization_id) IN ('admin', 'owner', 'member')
        AND brand_id IN (
          SELECT b.id FROM brands b
          WHERE b.organization_id IN (SELECT get_connected_org_ids())
        )
      )
    )
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  );
