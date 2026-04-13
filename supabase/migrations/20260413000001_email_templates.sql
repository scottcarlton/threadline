-- Email templates for reusable message patterns
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body text not null default '',
  category text not null default 'general',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

create policy "Users can view templates for their org"
  on public.email_templates for select
  using (organization_id in (
    select organization_id from public.organization_members where profile_id = auth.uid()
  ));

create policy "Non-guest users can manage templates"
  on public.email_templates for all
  using (organization_id in (
    select organization_id from public.organization_members where profile_id = auth.uid() and role != 'guest'
  ));

-- Seed common templates for existing orgs
insert into public.email_templates (organization_id, name, subject, body, category)
select id, 'Follow-Up', 'Following up on our conversation', 'Hi,

I wanted to follow up on our recent conversation. Please let me know if you have any questions or if there''s anything else I can help with.

Looking forward to hearing from you.

Thank you', 'follow_up' from public.organizations
union all
select id, 'Order Confirmation', 'Your order has been confirmed', 'Hi,

Thank you for your order. I''m happy to confirm that everything has been received and is being processed.

I''ll keep you updated on the shipping timeline. Please don''t hesitate to reach out if you need anything in the meantime.

Thank you for your business', 'order' from public.organizations
union all
select id, 'Show Invitation', 'You''re invited to visit us at the upcoming show', 'Hi,

I wanted to personally invite you to visit us at the upcoming show. We have some exciting new styles to share with you this season.

Would you like to schedule a time to meet? I''d love to walk you through the new collection.

Looking forward to seeing you there', 'show' from public.organizations;
