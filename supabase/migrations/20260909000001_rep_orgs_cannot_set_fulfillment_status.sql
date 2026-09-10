-- Only the brand may mark an order preparing, shipped, or delivered.
--
-- Those three statuses describe the brand physically fulfilling the order:
-- picking it, handing it to a carrier, and the carrier delivering it. A rep
-- sells the order but never observes any of that, so a rep-side user setting
-- them writes `preparing_at` / `shipped_at` / `delivered_at` timestamps for
-- events nobody witnessed.
--
-- Before this migration nothing stopped them. `orders` UPDATE is granted to
-- admin/owner/member/sales in the owning org with no column restriction, and
-- `/api/orders/[id]/status` validated only the transition graph
-- (draft -> submitted -> confirmed -> preparing -> shipped -> delivered),
-- never who was asking. An MBISR could walk an order all the way to delivered.
--
-- This is the database layer of a three-layer fix; the route ladder
-- (src/routes/orders/[id]/+page.svelte, src/routes/orders/+page.svelte) and
-- the endpoints (/api/orders/[id]/status, the AI update_order_status tool)
-- carry the same rule with a readable error.

-- ───────────────────────────────────────────────────────────────────────────
-- Why a trigger rather than a WITH CHECK
-- ───────────────────────────────────────────────────────────────────────────
--
-- Two reasons.
--
-- 1. WITH CHECK sees only NEW. It can express "the row must not be shipped",
--    which would also reject a rep editing a note on an order the brand
--    already shipped. The rule is about *changing* status, so it needs OLD.
--
-- 2. The actor is not derivable from the row. An order's organization_id is
--    always the rep org, including federated orders the brand fulfills, so
--    branching on the row's org would block the brand instead of the rep.
--
-- The check is therefore actor-based: the writer must be a member of a
-- brand-type org that owns the order's brand. For a federated order that is
-- the connected BOA (auto_federate_order() matches on
-- brands.organization_id = org_connections.brand_org_id, so a federated
-- order's brand_id already points at the brand org's own brands row). For a
-- brand row a rep org owns locally -- a "manual brand", org_type = 'rep' --
-- nobody qualifies.
--
-- That last case is deliberate and currently incomplete. A manual brand has no
-- brand-side actor at all today: it never federates (auto_federate_order()
-- matches oc.brand_org_id = b.organization_id, and brand_org_id always points
-- at an org_type = 'brand' org), there is no brand portal, and org_type is
-- written once at onboarding and never updated. So a manual brand's orders now
-- stop at 'confirmed'. That is the accepted trade rather than an oversight:
-- the rule is that reps do not report fulfillment, and the missing half is a
-- brand portal for manual brands, tracked as follow-on work. Do not "fix" this
-- by exempting manual brands -- that reintroduces exactly what this blocks.
--
-- Like reject_orders_organization_id_change(), this fires ahead of RLS and so
-- also covers service-role writes. No server path sets these statuses through
-- supabaseAdmin today (the only admin-client orders UPDATE is the buyer
-- note-to-order conversion, which sets 'submitted'), and seed data INSERTs its
-- statuses rather than updating into them, so nothing legitimate is caught.

create or replace function public.reject_non_brand_fulfillment_status()
returns trigger as $$
begin
	if new.status is distinct from old.status
		and new.status in ('preparing', 'shipped', 'delivered')
		and not exists (
			select 1
			from brands b
			join organizations o on o.id = b.organization_id
			where b.id = new.brand_id
				and o.org_type = 'brand'
				and b.organization_id in (select get_user_org_ids())
		)
	then
		raise exception 'Only the brand can mark an order preparing, shipped, or delivered (order %, attempted status %)',
			old.id, new.status
			using errcode = 'insufficient_privilege';
	end if;
	return new;
end;
$$ language plpgsql
security definer
set search_path = public;

comment on function public.reject_non_brand_fulfillment_status() is
	'Rejects a status change into preparing/shipped/delivered unless the writer is a member of the brand-type org that owns the order''s brand. Fires before RLS WITH CHECK, so it also covers service-role writes.';

-- Scoped to the status column: every other update (tracking_number, carrier,
-- shipping_cost, notes, line edits) skips this check entirely.
drop trigger if exists orders_brand_only_fulfillment_status on public.orders;
create trigger orders_brand_only_fulfillment_status
	before update of status on public.orders
	for each row execute function public.reject_non_brand_fulfillment_status();
