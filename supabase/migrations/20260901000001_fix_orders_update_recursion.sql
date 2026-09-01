-- Fix infinite recursion (42P17) on every UPDATE to orders.
--
-- "Brand admin updates federated order status"
-- (supabase/migrations/20260530000001_security_review_fixes.sql) has a
-- WITH CHECK clause that subqueries orders from inside an orders policy:
--
--   WITH CHECK (
--     organization_id = (SELECT organization_id FROM orders o2 WHERE o2.id = orders.id)
--   )
--
-- orders is RLS-enabled, so planning that subquery re-applies orders' own
-- RLS policies, which re-evaluates this same UPDATE policy's WITH CHECK,
-- which selects from orders again. Unconditional recursion. Postgres
-- evaluates all permissive policies' check expressions on an UPDATE, so
-- this poisons every UPDATE to orders regardless of which policy would
-- otherwise apply, and regardless of table contents. Only the service role,
-- which bypasses RLS, is unaffected.

-- ───────────────────────────────────────────────────────────────────────────
-- Change 1: drop and recreate the policy without the recursive WITH CHECK
-- ───────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Brand admin updates federated order status" ON orders;

-- Same USING expression as before. It references only federated_order_links
-- and organization_members, never orders itself, so there is no
-- self-reference. With no explicit WITH CHECK, Postgres reuses the USING
-- expression as the check for an UPDATE policy, which is likewise free of
-- self-reference.
CREATE POLICY "Brand admin updates federated order status"
  ON orders FOR UPDATE
  USING (
    id IN (
      SELECT order_id FROM federated_order_links
      WHERE target_org_id IN (SELECT get_user_org_ids())
      AND status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM federated_order_links fol
      JOIN organization_members om ON om.organization_id = fol.target_org_id
      WHERE fol.order_id = orders.id
      AND om.profile_id = auth.uid()
      AND om.role IN ('admin', 'owner')
    )
  );

-- ───────────────────────────────────────────────────────────────────────────
-- Change 2: enforce organization_id immutability with a trigger
-- ───────────────────────────────────────────────────────────────────────────

-- The dropped WITH CHECK was trying to stop a federated brand admin from
-- reassigning an order to a different organization. A trigger is the
-- correct tool for column immutability, and it is strictly stronger than
-- the original: it also covers service-role code paths, which bypass RLS
-- entirely and which the WITH CHECK never protected.
create or replace function public.reject_orders_organization_id_change()
returns trigger as $$
begin
	if new.organization_id is distinct from old.organization_id then
		raise exception 'orders.organization_id is immutable: cannot reassign order % from organization % to %',
			old.id, old.organization_id, new.organization_id
			using errcode = 'insufficient_privilege';
	end if;
	return new;
end;
$$ language plpgsql;

-- Scoped to the organization_id column so ordinary updates (status,
-- tracking_number, carrier, shipping_cost, notes, and so on) skip this
-- check entirely.
create trigger orders_no_organization_id_change
	before update of organization_id on public.orders
	for each row execute function public.reject_orders_organization_id_change();

-- ───────────────────────────────────────────────────────────────────────────
-- Change 3: scope buyer order updates to draft, moving only to draft/submitted
-- ───────────────────────────────────────────────────────────────────────────

-- "Buyers can update own draft orders" (supabase/migrations/20260407000001_buyer_portal.sql)
-- is named for draft orders but its USING expression never checks status,
-- and it has no WITH CHECK. With the recursion above blocking every UPDATE
-- to orders, this gap was unreachable; fixing the recursion makes it
-- reachable again, so it is closed in the same migration rather than left
-- open. Without this, a buyer could update an order in any status and set
-- status to any value, including confirmed, shipped, or cancelled -- states
-- that belong to the brand/rep side of the lifecycle.
--
-- The sibling INSERT policy "Buyers can create draft orders" already
-- restricts creation to status = 'draft'. The only buyer-side transition is
-- draft -> submitted; everything from confirmed onward is brand or rep
-- side, and there is no buyer cancel flow today.
DROP POLICY IF EXISTS "Buyers can update own draft orders" ON orders;

CREATE POLICY "Buyers can update own draft orders"
  ON orders FOR UPDATE
  USING (
    account_id IN (SELECT get_buyer_account_ids())
    AND created_by = auth.uid()
    AND status = 'draft'
  )
  WITH CHECK (
    account_id IN (SELECT get_buyer_account_ids())
    AND created_by = auth.uid()
    AND status IN ('draft', 'submitted')
  );
