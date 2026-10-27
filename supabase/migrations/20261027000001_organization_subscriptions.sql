-- Platform billing: one Stripe customer and at most one subscription per org.
--
-- This is the org's Threadline subscription, not order invoicing (that is
-- invoices / invoice_payments). Plans and prices live in Stripe; this table
-- is a mirror of the subscription state the app needs, kept current by the
-- Stripe webhook (src/routes/api/webhooks/stripe). Stripe is the source of
-- truth: a row is only ever rewritten from a freshly retrieved Subscription.
--
-- An org with no row is on beta: full access, no charge.
--
-- Reads: admin/owner of the org (billing is an account-level op, see Notion
-- "Roles & Access"). Writes: server only, through supabaseAdmin, from the
-- checkout endpoint and the webhook. No write policies, and the write grants
-- are revoked from the request roles so a missing policy can't be the only
-- thing standing in the way.

create table if not exists public.organization_subscriptions (
	organization_id uuid primary key
		references public.organizations(id) on delete cascade,
	stripe_customer_id text not null unique,
	stripe_subscription_id text unique,
	-- One of src/lib/billing/plans.ts PLAN_KEYS. Null until a subscription exists.
	plan text,
	-- Stripe's Subscription.status, verbatim. Null until a subscription exists.
	-- Deliberately not a CHECK: the set is Stripe's and can grow, and a
	-- constraint would turn a new value into a dropped webhook write.
	status text,
	current_period_end timestamptz,
	cancel_at_period_end boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),

	constraint organization_subscriptions_plan_check check (
		plan is null or plan in (
			'rep_starter', 'rep_pro', 'rep_max_pro',
			'brand_starter', 'brand_growth', 'brand_max'
		)
	),
	-- A subscription id and its plan/status arrive together from the webhook.
	constraint organization_subscriptions_sub_fields_together check (
		(stripe_subscription_id is null) = (plan is null)
		and (stripe_subscription_id is null) = (status is null)
	)
);

create trigger organization_subscriptions_set_updated_at
	before update on public.organization_subscriptions
	for each row execute function update_updated_at();

alter table public.organization_subscriptions enable row level security;

create policy "Org admin/owner can view subscription"
	on public.organization_subscriptions for select
	to authenticated
	using (get_user_role(organization_id) in ('admin', 'owner'));

revoke all on public.organization_subscriptions from anon;
revoke insert, update, delete, truncate on public.organization_subscriptions from authenticated;
