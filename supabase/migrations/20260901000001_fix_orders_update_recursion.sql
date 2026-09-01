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
