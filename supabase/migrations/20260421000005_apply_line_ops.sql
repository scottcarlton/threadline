-- Atomic application of order-line edits with correct acting-user
-- attribution. The /api/orders/[id]/lines PATCH endpoint runs under
-- service-role (supabaseAdmin) because @supabase/ssr drops the JWT on
-- writes. Without a real auth.uid() the line-audit trigger falls back to
-- orders.created_by (see 20260420000002_audit_acting_user.sql:120-122),
-- which mis-attributes federated edits (e.g. BOA editing a rep-owned
-- order) to the original rep.
--
-- This function runs all ops in a single transaction, seeds
-- app.acting_user via set_acting_user() first, and the existing
-- line-audit trigger reads it via current_acting_user(). That gives us
-- accurate attribution AND atomicity in one call.

create or replace function public.apply_line_ops(
	actor uuid,
	order_id uuid,
	ops jsonb
) returns jsonb as $$
declare
	op jsonb;
	applied int := 0;
	failed int := 0;
	errors jsonb := '[]'::jsonb;
	max_sort int;
	next_sort int;
	current_qty int;
	current_original_qty int;
	new_qty int;
	patch_qty int;
	patch_color text;
	has_color_patch boolean;
begin
	-- Seed the acting user for this transaction so the order_lines audit
	-- trigger attributes every op below to the correct actor.
	perform public.set_acting_user(actor);

	-- Compute the starting sort_order for new inserts (ops that are pure
	-- updates/removes don't need this, but the query is cheap).
	select coalesce(max(sort_order), 0)
	into max_sort
	from public.order_lines
	where order_lines.order_id = apply_line_ops.order_id
		and removed_at is null;
	next_sort := max_sort;

	for op in select * from jsonb_array_elements(ops) loop
		begin
			if op->>'kind' = 'insert' then
				next_sort := next_sort + 1;
				insert into public.order_lines (
					order_id,
					product_id,
					style_number,
					description,
					color,
					size,
					qty,
					unit_price,
					sort_order
				) values (
					apply_line_ops.order_id,
					nullif(op->'row'->>'product_id', '')::uuid,
					op->'row'->>'style_number',
					nullif(op->'row'->>'description', ''),
					nullif(op->'row'->>'color', ''),
					nullif(op->'row'->>'size', ''),
					(op->'row'->>'qty')::int,
					coalesce((op->'row'->>'unit_price')::numeric, 0),
					next_sort
				);
				applied := applied + 1;

			elsif op->>'kind' = 'update' then
				-- Snapshot the line's current qty so we can preserve
				-- original_qty on first change (matches the client-side
				-- behavior in saveLineEdits before this fix).
				select qty, original_qty
				into current_qty, current_original_qty
				from public.order_lines
				where id = (op->>'id')::uuid;

				patch_qty := (op->'patch'->>'qty')::int;
				has_color_patch := op->'patch' ? 'color';
				patch_color := op->'patch'->>'color';

				update public.order_lines
				set
					qty = case when op->'patch' ? 'qty' then patch_qty else qty end,
					color = case
						when has_color_patch then nullif(patch_color, '')
						else color
					end,
					original_qty = case
						when op->'patch' ? 'qty' and current_original_qty is null
							then current_qty
						else original_qty
					end
				where id = (op->>'id')::uuid;
				applied := applied + 1;

			elsif op->>'kind' = 'soft_remove' then
				update public.order_lines
				set
					removed_at = now(),
					removed_reason = null
				where id = (op->>'id')::uuid;
				applied := applied + 1;

			else
				failed := failed + 1;
				errors := errors || jsonb_build_object(
					'op', op,
					'message', 'unknown op kind'
				);
			end if;
		exception when others then
			failed := failed + 1;
			errors := errors || jsonb_build_object(
				'op', op,
				'message', sqlerrm
			);
		end;
	end loop;

	return jsonb_build_object(
		'ok', failed = 0,
		'applied', applied,
		'failed', failed,
		'errors', errors
	);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.apply_line_ops(uuid, uuid, jsonb) to service_role;
