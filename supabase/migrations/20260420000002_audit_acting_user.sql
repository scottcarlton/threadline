-- Service-role writes (supabaseAdmin) have no JWT, so auth.uid() returns
-- NULL inside trigger functions and the resulting audit rows show "Unknown"
-- as the actor. This migration plumbs a transaction-local acting-user
-- signal so server code can attribute writes correctly while keeping the
-- existing trigger-based audit pipeline.

-- Set the acting user for the current transaction. Callers wrap an
-- audited write in a SECURITY DEFINER function that calls this first;
-- subsequent triggers in the same transaction read the value.
create or replace function public.set_acting_user(actor uuid)
returns void as $$
begin
  perform set_config('app.acting_user', coalesce(actor::text, ''), true);
end;
$$ language plpgsql;

-- Resolve the effective actor: prefer auth.uid() (real authenticated
-- session), then the transaction-local app.acting_user, otherwise NULL.
-- Wrapped in security invoker so auth.uid() reads the *caller's* session.
create or replace function public.current_acting_user()
returns uuid as $$
declare
  v_actor uuid := auth.uid();
  v_setting text;
begin
  if v_actor is not null then
    return v_actor;
  end if;
  v_setting := current_setting('app.acting_user', true);
  if v_setting is null or v_setting = '' then
    return null;
  end if;
  return v_setting::uuid;
exception when others then
  return null;
end;
$$ language plpgsql security invoker;

-- Rewrite the orders audit trigger to use the resolver. INSERT keeps its
-- creator fallback; UPDATE branches use the resolver only (no schema
-- column to fall back to for editor-of-record).
create or replace function public.log_order_audit()
returns trigger as $$
declare
  actor uuid := public.current_acting_user();
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

-- Rewrite the order_lines audit trigger. INSERT and DELETE add the
-- parent order's creator as a final fallback so attribution always
-- resolves to *someone* even if a write path forgets to set the
-- acting user.
create or replace function public.log_order_line_audit()
returns trigger as $$
declare
  actor uuid := public.current_acting_user();
  line_snapshot jsonb;
begin
  if tg_op = 'INSERT' then
    if actor is null then
      select o.created_by into actor from public.orders o where o.id = new.order_id;
    end if;
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
    if actor is null then
      select o.created_by into actor from public.orders o where o.id = old.order_id;
    end if;
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

-- Service-role-friendly RPC: sets the acting user, then inserts lines.
-- The set_config + INSERT share a single transaction so the line-audit
-- trigger picks up the acting user via current_acting_user().
create or replace function public.insert_order_lines_with_actor(
  actor uuid,
  lines jsonb
)
returns setof public.order_lines as $$
begin
  perform public.set_acting_user(actor);
  return query
    insert into public.order_lines (
      order_id, product_id, variant_id, style_number, description,
      color, size, qty, unit_price, sort_order
    )
    select
      (l->>'order_id')::uuid,
      nullif(l->>'product_id', '')::uuid,
      nullif(l->>'variant_id', '')::uuid,
      l->>'style_number',
      nullif(l->>'description', ''),
      nullif(l->>'color', ''),
      nullif(l->>'size', ''),
      (l->>'qty')::int,
      coalesce((l->>'unit_price')::numeric, 0),
      coalesce((l->>'sort_order')::int, 0)
    from jsonb_array_elements(lines) as l
    returning *;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.set_acting_user(uuid) to authenticated, service_role;
grant execute on function public.current_acting_user() to authenticated, service_role;
grant execute on function public.insert_order_lines_with_actor(uuid, jsonb) to service_role;
