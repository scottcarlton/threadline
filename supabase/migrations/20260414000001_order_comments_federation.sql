-- Extend order_comments so brand orgs can post/read notes on federated orders.
-- source_org_id records who authored the comment (rep org vs brand org) so the UI can label them.

alter table public.order_comments
  add column if not exists source_org_id uuid references public.organizations(id);

-- Backfill existing comments with the order's owning org (rep side).
update public.order_comments c
  set source_org_id = o.organization_id
  from public.orders o
  where c.order_id = o.id and c.source_org_id is null;

-- Replace the SELECT policy: allow members of the owning org OR of any org the order is
-- federated to (brand side).
drop policy if exists "Users can view comments on orders in their org" on public.order_comments;

create policy "Users can view comments on orders they have access to"
  on public.order_comments for select
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

-- Replace the INSERT policy: same expansion (non-guest members of either side).
drop policy if exists "Non-guest users can create comments" on public.order_comments;

create policy "Non-guest users can create comments"
  on public.order_comments for insert
  with check (
    author_id = auth.uid()
    and (
      order_id in (
        select id from public.orders where organization_id in (
          select organization_id from public.organization_members
          where profile_id = auth.uid() and role != 'guest'
        )
      )
      or order_id in (
        select order_id from public.federated_order_links
        where target_org_id in (
          select organization_id from public.organization_members
          where profile_id = auth.uid() and role != 'guest'
        )
        and status = 'active'
      )
    )
  );
