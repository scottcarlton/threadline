-- Add 'preparing' status to order_status enum
alter type public.order_status add value if not exists 'preparing' before 'shipped';

-- Add shipment columns to orders table
alter table public.orders
  add column if not exists preparing_at timestamptz,
  add column if not exists tracking_number text,
  add column if not exists carrier text,
  add column if not exists shipping_cost numeric;

-- Replace log_order_audit() function to track new shipment fields
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
    -- New shipment fields
    if new.tracking_number is distinct from old.tracking_number then
      insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
      values (new.id, actor, 'field_changed', 'tracking_number', to_jsonb(old.tracking_number), to_jsonb(new.tracking_number));
    end if;
    if new.carrier is distinct from old.carrier then
      insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
      values (new.id, actor, 'field_changed', 'carrier', to_jsonb(old.carrier), to_jsonb(new.carrier));
    end if;
    if new.shipping_cost is distinct from old.shipping_cost then
      insert into public.order_audits (order_id, actor_id, event_type, field, before_value, after_value)
      values (new.id, actor, 'field_changed', 'shipping_cost', to_jsonb(old.shipping_cost), to_jsonb(new.shipping_cost));
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;
