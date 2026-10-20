-- SCO-204: create an account and its locations in one transaction, keyed by
-- a client-generated id so a retry cannot duplicate it.
--
-- Before this, /accounts/new inserted `accounts` and then `account_locations`
-- as two requests. A failure on the second left an account with no locations,
-- and a retry after a dropped response created a second account. Offline sync
-- replays queued creates, so both have to be impossible.
--
-- SECURITY INVOKER on purpose: /accounts/new calls this through
-- locals.supabase, so the existing INSERT policies on both tables still decide
-- who may create an account in which org. Nothing here widens that.
--
-- Replay: if p_account_id already exists in p_org_id, nothing is inserted and
-- `inserted` is false, so the caller can skip its side effects (audit,
-- integration event, buyer invite). An id that exists anywhere else, or that
-- the caller cannot see, is a collision and raises unique_violation.

create or replace function public.create_account_with_locations(
  p_account_id uuid,
  p_org_id uuid,
  p_account jsonb,
  p_locations jsonb default '[]'::jsonb
)
returns table (account_id uuid, inserted boolean)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_account_id is null or p_org_id is null then
    raise exception 'Account id and organization id are required'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.accounts (
    id, organization_id, business_name, website, phone,
    address_line1, address_line2, city, state, zip,
    contact_first_name, contact_last_name, contact_email, contact_phone,
    notes, payment_preference
  ) values (
    p_account_id,
    p_org_id,
    p_account->>'business_name',
    nullif(p_account->>'website', ''),
    nullif(p_account->>'phone', ''),
    nullif(p_account->>'address_line1', ''),
    nullif(p_account->>'address_line2', ''),
    nullif(p_account->>'city', ''),
    nullif(p_account->>'state', ''),
    nullif(p_account->>'zip', ''),
    nullif(p_account->>'contact_first_name', ''),
    nullif(p_account->>'contact_last_name', ''),
    nullif(p_account->>'contact_email', ''),
    nullif(p_account->>'contact_phone', ''),
    nullif(p_account->>'notes', ''),
    nullif(p_account->>'payment_preference', '')
  )
  on conflict (id) do nothing;

  if not found then
    if exists (
      select 1 from public.accounts a
       where a.id = p_account_id and a.organization_id = p_org_id
    ) then
      return query select p_account_id, false;
      return;
    end if;
    raise exception 'Account id is already in use'
      using errcode = 'unique_violation';
  end if;

  insert into public.account_locations (
    id, account_id, organization_id, label, is_default, sort_order,
    address_line1, address_line2, city, state, zip, phone,
    contact_first_name, contact_last_name, contact_email
  )
  select
    coalesce(nullif(l->>'id', '')::uuid, gen_random_uuid()),
    p_account_id,
    p_org_id,
    l->>'label',
    coalesce((l->>'is_default')::boolean, false),
    coalesce((l->>'sort_order')::int, 0),
    nullif(l->>'address_line1', ''),
    nullif(l->>'address_line2', ''),
    nullif(l->>'city', ''),
    nullif(l->>'state', ''),
    nullif(l->>'zip', ''),
    nullif(l->>'phone', ''),
    nullif(l->>'contact_first_name', ''),
    nullif(l->>'contact_last_name', ''),
    nullif(l->>'contact_email', '')
  from jsonb_array_elements(coalesce(p_locations, '[]'::jsonb)) as l;

  return query select p_account_id, true;
end;
$$;

-- Supabase grants new functions to anon directly, not through PUBLIC, so name
-- the roles (see tests/rls/definer-grants.test.ts).
revoke execute on function public.create_account_with_locations(uuid, uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_account_with_locations(uuid, uuid, jsonb, jsonb)
  to authenticated, service_role;
