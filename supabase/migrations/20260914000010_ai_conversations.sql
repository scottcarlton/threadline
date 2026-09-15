-- Persisted threads for the in-app AI assistant dock.
--
-- Visibility is person-scoped and nothing else: profile_id = auth.uid(),
-- with no organization_id predicate and no federation arm. That is a
-- product decision, not an oversight. A user reaches every conversation
-- they have ever had regardless of which org was active at the time, the
-- same shape already used by email_connections, cart_items, and
-- order_views.
--
-- organization_id is still recorded on the row. It is not used for
-- visibility; it tells the resume path which org's data the thread was
-- built against, so resuming can align the active org before handing the
-- history to a model that holds org-scoped tools.
--
-- No DELETE policy on either table. Nothing in the product deletes a
-- conversation today, and a policy that grants nothing is clearer than one
-- that exists unused.

create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ai_conversations_profile_recent_idx
  on public.ai_conversations (profile_id, updated_at desc);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create index ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "Users read their own conversations"
  on public.ai_conversations for select
  using (profile_id = auth.uid());

create policy "Users create their own conversations"
  on public.ai_conversations for insert
  with check (profile_id = auth.uid());

create policy "Users update their own conversations"
  on public.ai_conversations for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Users read messages in their own conversations"
  on public.ai_messages for select
  using (
    conversation_id in (
      select id from public.ai_conversations where profile_id = auth.uid()
    )
  );

create policy "Users add messages to their own conversations"
  on public.ai_messages for insert
  with check (
    conversation_id in (
      select id from public.ai_conversations where profile_id = auth.uid()
    )
  );
