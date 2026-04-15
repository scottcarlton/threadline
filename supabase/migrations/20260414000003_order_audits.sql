-- Order revision history / audit trail.
-- Trigger-based so every mutation path (UI, API, agent tools) gets captured.

create table public.order_audits (
	id uuid primary key default gen_random_uuid(),
	order_id uuid not null references public.orders(id) on delete cascade,
	actor_id uuid references auth.users(id),
	event_type text not null check (
		event_type in (
			'status_changed',
			'field_changed',
			'line_added',
			'line_removed',
			'line_changed',
			'order_created',
			'order_cancelled'
		)
	),
	field text,
	before_value jsonb,
	after_value jsonb,
	created_at timestamptz not null default now()
);

create index order_audits_order_id_idx on public.order_audits (order_id, created_at desc);

-- RLS mirrors order_comments: members of the owning org OR any org the order
-- is federated to can read. Writes are trigger-driven (no INSERT policy needed
-- for user-facing code; inserts come from SECURITY DEFINER triggers).
alter table public.order_audits enable row level security;

create policy "Users can view audits for accessible orders"
	on public.order_audits for select
	using (
		order_id in (
			select id from public.orders where organization_id in (
				select organization_id from public.organization_members where profile_id = auth.uid()
			)
		)
		or order_id in (
			select order_id from public.federated_order_links
			where target_org_id in (select get_user_org_ids())
			and status = 'active'
		)
	);

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger: orders UPDATE
-- Logs status changes and header field changes. auth.uid() inside a trigger
-- returns the session user; store null if somehow the session is missing.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.log_order_audit()
returns trigger as $$
declare
	actor uuid := auth.uid();
begin
	if tg_op = 'INSERT' then
		insert into public.order_audits (order_id, actor_id, event_type, after_value)
		values (
			new.id,
			coalesce(actor, new.created_by),
			'order_created',
			jsonb_build_object(
				'status', new.status,
				'order_type', new.order_type,
				'brand_id', new.brand_id,
				'account_id', new.account_id,
				'total_amount', new.total_amount
			)
		);
		return new;
	end if;

	if tg_op = 'UPDATE' then
		if new.status is distinct from old.status then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (
				new.id, actor,
				case when new.status = 'cancelled' then 'order_cancelled' else 'status_changed' end,
				'status',
				to_jsonb(old.status),
				to_jsonb(new.status)
			);
		end if;

		-- Tracked header fields — excludes derived (total_amount), timestamp
		-- fields (covered by the status change), and freeform_name (internal).
		if new.expected_ship_date is distinct from old.expected_ship_date then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'expected_ship_date', to_jsonb(old.expected_ship_date), to_jsonb(new.expected_ship_date));
		end if;
		if new.start_ship_date is distinct from old.start_ship_date then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'start_ship_date', to_jsonb(old.start_ship_date), to_jsonb(new.start_ship_date));
		end if;
		if new.delivery_id is distinct from old.delivery_id then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'delivery_id', to_jsonb(old.delivery_id), to_jsonb(new.delivery_id));
		end if;
		if new.location_id is distinct from old.location_id then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'location_id', to_jsonb(old.location_id), to_jsonb(new.location_id));
		end if;
		if new.account_id is distinct from old.account_id then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'account_id', to_jsonb(old.account_id), to_jsonb(new.account_id));
		end if;
		if new.notes is distinct from old.notes then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'notes', to_jsonb(old.notes), to_jsonb(new.notes));
		end if;
		if new.cancelled_reason is distinct from old.cancelled_reason then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (new.id, actor, 'field_changed', 'cancelled_reason', to_jsonb(old.cancelled_reason), to_jsonb(new.cancelled_reason));
		end if;
	end if;

	return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger orders_audit_insert
	after insert on public.orders
	for each row execute function public.log_order_audit();

create trigger orders_audit_update
	after update on public.orders
	for each row execute function public.log_order_audit();

-- ───────────────────────────────────────────────────────────────────────────
-- Trigger: order_lines INSERT / UPDATE / DELETE
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.log_order_line_audit()
returns trigger as $$
declare
	actor uuid := auth.uid();
	-- Build a compact snapshot of the line for readability in the UI.
	line_snapshot jsonb;
begin
	if tg_op = 'INSERT' then
		line_snapshot := jsonb_build_object(
			'style_number', new.style_number,
			'description', new.description,
			'color', new.color,
			'size', new.size,
			'qty', new.qty,
			'unit_price', new.unit_price
		);
		insert into public.order_audits (order_id, actor_id, event_type, after_value)
		values (new.order_id, actor, 'line_added', line_snapshot);
		return new;
	end if;

	if tg_op = 'UPDATE' then
		-- Only log if something meaningful changed (skip pure timestamp updates).
		if (
			new.qty is distinct from old.qty
			or new.unit_price is distinct from old.unit_price
			or new.color is distinct from old.color
			or new.size is distinct from old.size
			or new.removed_at is distinct from old.removed_at
		) then
			insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
			values (
				new.order_id,
				actor,
				case when new.removed_at is not null and old.removed_at is null then 'line_removed'
					 else 'line_changed' end,
				'line',
				jsonb_build_object(
					'style_number', old.style_number,
					'color', old.color,
					'size', old.size,
					'qty', old.qty,
					'unit_price', old.unit_price
				),
				jsonb_build_object(
					'style_number', new.style_number,
					'color', new.color,
					'size', new.size,
					'qty', new.qty,
					'unit_price', new.unit_price
				)
			);
		end if;
		return new;
	end if;

	if tg_op = 'DELETE' then
		line_snapshot := jsonb_build_object(
			'style_number', old.style_number,
			'description', old.description,
			'color', old.color,
			'size', old.size,
			'qty', old.qty,
			'unit_price', old.unit_price
		);
		insert into public.order_audits (order_id, actor_id, event_type, before_value)
		values (old.order_id, actor, 'line_removed', line_snapshot);
		return old;
	end if;

	return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger order_lines_audit
	after insert or update or delete on public.order_lines
	for each row execute function public.log_order_line_audit();
