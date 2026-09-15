-- Once fulfillment has started, only the brand may move the ship window.
--
-- `start_ship_date` / `expected_ship_date` are negotiated between the rep and
-- the buyer while the order is being sold, and the rep owns them through
-- draft -> submitted -> confirmed. The moment the brand marks the order
-- 'preparing' the window stops being a negotiation: the warehouse is picking
-- against those dates. A rep editing them at that point silently rewrites the
-- commitment the brand is actively working to.
--
-- This is the database layer of the same three-layer shape used by
-- 20260909000001_rep_orgs_cannot_set_fulfillment_status.sql. The route carries
-- the same rule with a readable UI (src/routes/orders/[id]/+page.svelte hides
-- the ShipWindowPicker), and mayEditShipWindow() in
-- src/lib/utils/order-status-permissions.ts is the shared predicate.

-- ───────────────────────────────────────────────────────────────────────────
-- Why a trigger rather than a WITH CHECK
-- ───────────────────────────────────────────────────────────────────────────
--
-- Same two reasons as the fulfillment-status trigger.
--
-- 1. WITH CHECK sees only NEW. The rule is about *changing* the dates while the
--    order sits in a fulfillment status, which needs OLD to compare against.
--
-- 2. The actor is not derivable from the row. An order's organization_id is
--    always the rep org, including federated orders the brand fulfills, so
--    branching on the row's org would block the brand instead of the rep.
--
-- The check is therefore actor-based and identical to
-- reject_non_brand_fulfillment_status(): the writer must be a member of a
-- brand-type org that owns the order's brand. For a manual brand (a brands row
-- a rep org owns locally, org_type = 'rep') nobody qualifies -- but a manual
-- brand's orders can never reach 'preparing' in the first place, because that
-- same trigger stops them at 'confirmed'. So this adds no new dead end.
--
-- OLD.status is the gate, not NEW.status: the brand's own
-- confirmed -> preparing transition writes status and nothing else, and a
-- window edit and a status change never arrive in the same UPDATE from any
-- code path today.

create or replace function public.reject_non_brand_ship_window_change()
returns trigger as $$
begin
	if old.status in ('preparing', 'shipped', 'delivered')
		and (
			new.start_ship_date is distinct from old.start_ship_date
			or new.expected_ship_date is distinct from old.expected_ship_date
		)
		and not exists (
			select 1
			from brands b
			join organizations o on o.id = b.organization_id
			where b.id = new.brand_id
				and o.org_type = 'brand'
				and b.organization_id in (select get_user_org_ids())
		)
	then
		raise exception 'Only the brand can change the ship window once fulfillment has started (order %, status %)',
			old.id, old.status
			using errcode = 'insufficient_privilege';
	end if;
	return new;
end;
$$ language plpgsql
security definer
set search_path = public;

comment on function public.reject_non_brand_ship_window_change() is
	'Rejects a start_ship_date/expected_ship_date change on an order already in preparing/shipped/delivered unless the writer is a member of the brand-type org that owns the order''s brand. Fires before RLS WITH CHECK, so it also covers service-role writes.';

-- Scoped to the two window columns: every other update (tracking_number,
-- carrier, shipping_cost, notes, line edits) skips this check entirely.
drop trigger if exists orders_brand_only_ship_window on public.orders;
create trigger orders_brand_only_ship_window
	before update of start_ship_date, expected_ship_date on public.orders
	for each row execute function public.reject_non_brand_ship_window_change();
