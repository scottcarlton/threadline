-- SCO-204: write one order submission (an optional inline account, every
-- order, every line) in a single transaction, keyed by client-generated ids.
--
-- Before this, submitOrder inserted the freeform account, then each order,
-- then its lines, as separate requests. A failure part way left an orphan
-- account or some orders without the rest, and a retry after a dropped
-- response duplicated everything. Offline sync replays queued submissions,
-- so both have to be impossible.
--
-- SECURITY DEFINER and service-role only, like insert_order_lines_with_actor
-- which this replaces for submitOrder. The caller (submitOrder, through
-- supabaseAdmin) has already authorized every id against the writer's scope
-- (SCO-203); this function trusts its input the same way the old inserts did.
--
-- Replay: an order id that already exists in the same org and was created by
-- the same actor returns its stored order_number with inserted = false, so the
-- caller skips audit, email, notifications and integration events. Any other
-- existing id is a collision and raises unique_violation.
--
-- Existence is checked BEFORE inserting rather than with ON CONFLICT: the
-- set_order_number BEFORE INSERT trigger fires even when ON CONFLICT then
-- skips the row, and would burn an order number on every replay. A concurrent
-- duplicate still hits the primary key; that is caught in a subtransaction
-- (which also rolls back the counter bump) and re-checked as a replay.

create or replace function public.create_order_submission(
  p_actor uuid,
  p_account jsonb,
  p_orders jsonb
)
returns table (order_id uuid, order_number text, inserted boolean)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  o jsonb;
  v_id uuid;
  v_org uuid;
  v_number text;
  v_account_id uuid;
begin
  if p_actor is null then
    raise exception 'Actor is required' using errcode = 'invalid_parameter_value';
  end if;

  -- Order and line audit triggers read the actor from here.
  perform public.set_acting_user(p_actor);

  if p_account is not null and jsonb_typeof(p_account) = 'object' then
    v_account_id := (p_account->>'id')::uuid;
    v_org := (p_account->>'organization_id')::uuid;
    if not exists (select 1 from public.accounts a where a.id = v_account_id) then
      insert into public.accounts (
        id, organization_id, business_name,
        contact_first_name, contact_last_name, contact_email, phone,
        address_line1, city, state, zip
      ) values (
        v_account_id,
        v_org,
        p_account->>'business_name',
        nullif(p_account->>'contact_first_name', ''),
        nullif(p_account->>'contact_last_name', ''),
        nullif(p_account->>'contact_email', ''),
        nullif(p_account->>'phone', ''),
        nullif(p_account->>'address_line1', ''),
        nullif(p_account->>'city', ''),
        nullif(p_account->>'state', ''),
        nullif(p_account->>'zip', '')
      );
    elsif not exists (
      select 1 from public.accounts a where a.id = v_account_id and a.organization_id = v_org
    ) then
      raise exception 'Account id is already in use' using errcode = 'unique_violation';
    end if;
  end if;

  for o in select * from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) loop
    v_id := (o->>'id')::uuid;
    v_org := (o->>'organization_id')::uuid;
    v_number := null;

    select ord.order_number into v_number
      from public.orders ord
     where ord.id = v_id and ord.organization_id = v_org and ord.created_by = p_actor;

    if v_number is not null then
      order_id := v_id; order_number := v_number; inserted := false;
      return next;
      continue;
    end if;

    begin
      insert into public.orders (
        id, organization_id, order_type, account_id, freeform_name,
        location_id, bill_to_location_id, brand_id, season_id, order_year,
        delivery_id, expected_ship_date, start_ship_date, status, total_amount,
        payment_preference, payment_terms, shipping_method, po_number, notes,
        rep_user_id, channel, source_type_id, show_date_id, show_id,
        terms_id, terms_agreed_by, terms_agreed_at, created_by,
        submitted_at, confirmed_at
      )
      select
        r.id, r.organization_id, r.order_type, r.account_id, r.freeform_name,
        r.location_id, r.bill_to_location_id, r.brand_id, r.season_id, r.order_year,
        r.delivery_id, r.expected_ship_date, r.start_ship_date, r.status, r.total_amount,
        r.payment_preference, r.payment_terms, r.shipping_method, r.po_number, r.notes,
        r.rep_user_id, r.channel, r.source_type_id, r.show_date_id, r.show_id,
        r.terms_id, r.terms_agreed_by, r.terms_agreed_at, p_actor,
        r.submitted_at, r.confirmed_at
      from jsonb_populate_record(null::public.orders, o - 'lines') r
      returning orders.order_number into v_number;
    exception when unique_violation then
      select ord.order_number into v_number
        from public.orders ord
       where ord.id = v_id and ord.organization_id = v_org and ord.created_by = p_actor;
      if v_number is null then
        raise exception 'Order id is already in use' using errcode = 'unique_violation';
      end if;
      order_id := v_id; order_number := v_number; inserted := false;
      return next;
      continue;
    end;

    insert into public.order_lines (
      order_id, product_id, variant_id, style_number, description,
      color, size, qty, unit_price, sort_order
    )
    select
      v_id, l.product_id, l.variant_id, l.style_number, nullif(l.description, ''),
      nullif(l.color, ''), nullif(l.size, ''), l.qty, coalesce(l.unit_price, 0),
      coalesce(l.sort_order, 0)
    from jsonb_populate_recordset(null::public.order_lines, coalesce(o->'lines', '[]'::jsonb)) l;

    order_id := v_id; order_number := v_number; inserted := true;
    return next;
  end loop;
end;
$$;

-- Supabase grants new functions to anon and authenticated directly, so name
-- them (see tests/rls/definer-grants.test.ts).
revoke execute on function public.create_order_submission(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_order_submission(uuid, jsonb, jsonb) to service_role;
