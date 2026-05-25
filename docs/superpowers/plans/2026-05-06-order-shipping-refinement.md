# Order Shipping Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `preparing` status between Confirmed and Shipped, with fulfillment fields (tracking number, carrier, shipping cost), a shipment details UI, a ship confirmation dialog, and role-aware notifications.

**Architecture:** New Supabase migration adds the enum value and columns. The status API gains `preparing` transitions and smarter notification routing based on `locals.orgType`. The order detail page gets a Shipment Details section (editable during `preparing`, read-only after `shipped`) and a confirmation dialog on "Mark as Shipped." The order list page adds `preparing` to all status maps. The spotlight utility includes `preparing` in its "in-flight" check.

**Tech Stack:** SvelteKit 5 + Svelte 5 runes, Supabase (Postgres), Tailwind CSS v4, Bits UI, Brevo (email), Vitest

**Spec:** `docs/superpowers/specs/2026-05-06-order-shipping-refinement-design.md`

---

### Task 1: Supabase Migration — Enum + Columns + Audit Trigger

**Files:**

- Create: `supabase/migrations/20260506000001_order_preparing_status.sql`

This migration adds `preparing` to the `order_status` enum, adds shipment columns to `orders`, adds the `preparing_at` timestamp, and extends the audit trigger to track the new fields.

- [ ] **Step 1: Create the migration file**

```sql
-- Add 'preparing' status to order_status enum (between confirmed and shipped)
alter type public.order_status add value if not exists 'preparing' before 'shipped';

-- Add shipment detail columns
alter table public.orders
  add column if not exists preparing_at timestamptz,
  add column if not exists tracking_number text,
  add column if not exists carrier text,
  add column if not exists shipping_cost numeric;

-- Extend the audit trigger to track new shipment fields
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
```

- [ ] **Step 2: Apply migration to local Supabase**

Run: `bunx supabase db reset` (or `bunx supabase migration up` if you prefer incremental)

Expected: Migration applies cleanly with no errors. The `order_status` enum now includes `preparing`.

- [ ] **Step 3: Verify the migration**

Run: `bunx supabase db lint` (if available) or connect to local DB and check:

```sql
select enum_range(null::order_status);
select column_name, data_type from information_schema.columns where table_name = 'orders' and column_name in ('preparing_at', 'tracking_number', 'carrier', 'shipping_cost');
```

Expected: `preparing` appears between `confirmed` and `shipped` in the enum. All four new columns exist.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506000001_order_preparing_status.sql
git commit -m "feat: add preparing status, shipment columns, and audit tracking"
```

---

### Task 2: TypeScript Types — OrderStatus + Carrier Constants

**Files:**

- Modify: `src/lib/types/database.ts:10-16` (add `preparing` to OrderStatus union)
- Create: `src/lib/utils/carriers.ts` (carrier list + tracking URL builder)

- [ ] **Step 1: Add `preparing` to OrderStatus**

In `src/lib/types/database.ts`, update the `OrderStatus` type:

```typescript
export type OrderStatus =
	| 'draft'
	| 'submitted'
	| 'confirmed'
	| 'preparing'
	| 'shipped'
	| 'delivered'
	| 'cancelled';
```

- [ ] **Step 2: Create carrier utility**

Create `src/lib/utils/carriers.ts`:

```typescript
export const CARRIERS = ['UPS', 'FedEx', 'USPS', 'DHL', 'Freight', 'Other'] as const;
export type Carrier = (typeof CARRIERS)[number];

const TRACKING_URLS: Partial<Record<Carrier, (trackingNumber: string) => string>> = {
	UPS: (t) => `https://www.ups.com/track?tracknum=${encodeURIComponent(t)}`,
	FedEx: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
	USPS: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`,
	DHL: (t) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(t)}`
};

export function trackingUrl(carrier: string | null, trackingNumber: string | null): string | null {
	if (!carrier || !trackingNumber) return null;
	const builder = TRACKING_URLS[carrier as Carrier];
	return builder ? builder(trackingNumber) : null;
}
```

- [ ] **Step 3: Write test for carrier utility**

Create `src/lib/utils/carriers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { trackingUrl, CARRIERS } from './carriers';

describe('trackingUrl', () => {
	it('returns UPS tracking URL', () => {
		const url = trackingUrl('UPS', '1Z999AA10123456784');
		expect(url).toBe('https://www.ups.com/track?tracknum=1Z999AA10123456784');
	});

	it('returns FedEx tracking URL', () => {
		const url = trackingUrl('FedEx', '123456789012');
		expect(url).toBe('https://www.fedex.com/fedextrack/?trknbr=123456789012');
	});

	it('returns USPS tracking URL', () => {
		const url = trackingUrl('USPS', '9400111899223033');
		expect(url).toBe('https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223033');
	});

	it('returns DHL tracking URL', () => {
		const url = trackingUrl('DHL', '1234567890');
		expect(url).toBe('https://www.dhl.com/us-en/home/tracking.html?tracking-id=1234567890');
	});

	it('returns null for Freight carrier', () => {
		expect(trackingUrl('Freight', 'ABC123')).toBeNull();
	});

	it('returns null for Other carrier', () => {
		expect(trackingUrl('Other', 'ABC123')).toBeNull();
	});

	it('returns null when carrier is null', () => {
		expect(trackingUrl(null, '123')).toBeNull();
	});

	it('returns null when tracking number is null', () => {
		expect(trackingUrl('UPS', null)).toBeNull();
	});

	it('encodes special characters in tracking number', () => {
		const url = trackingUrl('UPS', '1Z 999&AA');
		expect(url).toBe('https://www.ups.com/track?tracknum=1Z%20999%26AA');
	});

	it('exports expected carrier list', () => {
		expect(CARRIERS).toEqual(['UPS', 'FedEx', 'USPS', 'DHL', 'Freight', 'Other']);
	});
});
```

- [ ] **Step 4: Run the test**

Run: `bun run test:run -- src/lib/utils/carriers.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/database.ts src/lib/utils/carriers.ts src/lib/utils/carriers.test.ts
git commit -m "feat: add preparing to OrderStatus, carrier constants and tracking URL builder"
```

---

### Task 3: Status API — Preparing Transitions + Shipment Fields + Notification Routing

**Files:**

- Modify: `src/routes/api/orders/[id]/status/+server.ts`

The status API must:

1. Allow `confirmed → preparing` and `preparing → shipped` transitions
2. Accept optional `tracking_number`, `carrier`, `shipping_cost` in the request body when transitioning to `shipped` (or anytime during `preparing`)
3. Route notifications based on actor org type per the spec notification matrix

- [ ] **Step 1: Update the status API**

Replace the entire content of `src/routes/api/orders/[id]/status/+server.ts`:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sendOrderEmail } from '$lib/server/order-emails.js';
import type { OrderEmailEvent } from '$lib/server/order-emails.js';
import { createNotification, notifyBrandAdmins } from '$lib/server/notifications.js';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
	draft: ['submitted'],
	submitted: ['confirmed'],
	confirmed: ['preparing', 'cancelled'],
	preparing: ['shipped', 'cancelled'],
	shipped: ['delivered']
};

const TIMESTAMP_FIELD: Record<string, string> = {
	submitted: 'submitted_at',
	confirmed: 'confirmed_at',
	preparing: 'preparing_at',
	shipped: 'shipped_at',
	delivered: 'delivered_at',
	cancelled: 'cancelled_at'
};

const EMAIL_EVENTS: Record<string, OrderEmailEvent> = {
	submitted: 'submitted',
	confirmed: 'confirmed',
	preparing: 'preparing',
	shipped: 'shipped',
	delivered: 'delivered'
};

export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
	const { supabase, organization, user, orgType } = locals;
	if (!organization || !user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const newStatus = body.status;
	if (!newStatus || typeof newStatus !== 'string') {
		return json({ error: 'Missing status' }, { status: 400 });
	}

	const { data: order, error: fetchErr } = await supabase
		.from('orders')
		.select('id, order_number, status, total_amount, brand_id, account_id, created_by')
		.eq('id', params.id)
		.single();

	if (fetchErr || !order) {
		return json({ error: 'Order not found' }, { status: 404 });
	}

	const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
	if (!allowed.includes(newStatus)) {
		return json(
			{ error: `Cannot transition from ${order.status} to ${newStatus}` },
			{ status: 400 }
		);
	}

	const updateData: Record<string, unknown> = {
		status: newStatus,
		updated_at: new Date().toISOString()
	};
	if (TIMESTAMP_FIELD[newStatus]) {
		updateData[TIMESTAMP_FIELD[newStatus]] = new Date().toISOString();
	}

	// Accept shipment fields when transitioning to shipped (from the confirm dialog)
	if (newStatus === 'shipped') {
		if (body.tracking_number !== undefined)
			updateData.tracking_number = body.tracking_number || null;
		if (body.carrier !== undefined) updateData.carrier = body.carrier || null;
		if (body.shipping_cost !== undefined) {
			const cost = parseFloat(body.shipping_cost);
			updateData.shipping_cost = isNaN(cost) ? null : cost;
		}
	}

	const { error: updateErr } = await supabase.from('orders').update(updateData).eq('id', order.id);

	if (updateErr) {
		return json({ error: updateErr.message }, { status: 500 });
	}

	// Fire-and-forget email
	const emailEvent = EMAIL_EVENTS[newStatus];
	if (emailEvent) {
		sendOrderEmail(emailEvent, order, url.origin);
	}

	// In-app notifications — routed by actor org type
	const orderLink = `/orders/${order.id}`;
	const actorIsBrand = orgType === 'brand';

	if (newStatus === 'submitted') {
		notifyBrandAdmins(order.brand_id, user.id, {
			type: 'order_submitted',
			title: 'New order submitted',
			body: `Order ${order.order_number} has been submitted`,
			link: orderLink
		});
	} else if (newStatus === 'confirmed') {
		if (actorIsBrand) {
			// Brand confirmed → notify rep (order creator)
			createNotification({
				organizationId: organization.id,
				userId: order.created_by,
				actorUserId: user.id,
				type: 'order_confirmed',
				title: 'Order confirmed',
				body: `Order ${order.order_number} has been confirmed`,
				link: orderLink
			});
		} else {
			// Rep/buyer confirmed → notify brand admins
			notifyBrandAdmins(order.brand_id, user.id, {
				type: 'order_confirmed',
				title: 'Order confirmed',
				body: `Order ${order.order_number} has been confirmed`,
				link: orderLink
			});
		}
	} else if (newStatus === 'preparing') {
		// Notify rep (order creator) + buyer contacts get email (via sendOrderEmail above)
		createNotification({
			organizationId: organization.id,
			userId: order.created_by,
			actorUserId: user.id,
			type: 'order_preparing',
			title: 'Order preparing to ship',
			body: `Order ${order.order_number} is being prepared for shipment`,
			link: orderLink
		});
	} else if (newStatus === 'shipped') {
		// Buyer contacts get email (via sendOrderEmail above) — no in-app notification
		// since buyers use email, not the in-app notification system
	}

	return json({ success: true, status: newStatus });
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run check`
Expected: 0 errors (the `OrderEmailEvent` type will need updating in the next task)

Note: This step may show a type error for `'preparing'` not being in `OrderEmailEvent`. That's expected — Task 4 fixes it.

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/orders/[id]/status/+server.ts
git commit -m "feat: status API supports preparing transitions and role-aware notifications"
```

---

### Task 4: Order Emails — Preparing Event + Shipped Tracking

**Files:**

- Modify: `src/lib/server/order-emails.ts`

Add `preparing` as an email event and enhance the `shipped` email to include tracking info.

- [ ] **Step 1: Update order-emails.ts**

In `src/lib/server/order-emails.ts`, update the `OrderEmailEvent` type and add the new events.

Change line 5:

```typescript
export type OrderEmailEvent =
	| 'submitted'
	| 'created'
	| 'confirmed'
	| 'preparing'
	| 'shipped'
	| 'delivered';
```

Update the `OrderContext` type to include shipment fields (the status API will pass the full order row, but the fields may not be on the context yet since it's fetched before the update). Instead, update `sendOrderEmail` to accept optional shipment fields and re-fetch them for the shipped email.

Replace the `sendOrderEmail` function (starting at line 138) with:

```typescript
export async function sendOrderEmail(
	event: OrderEmailEvent,
	order: OrderContext,
	origin: string
): Promise<void> {
	try {
		const { accountName, brandName } = await resolveOrderContext(order);
		const orderUrl = `${origin}/orders/${order.id}`;
		const total = fmt.format(order.total_amount);

		// For shipped emails, fetch current shipment fields from DB
		let shipmentInfo = '';
		if (event === 'shipped') {
			const { data: freshOrder } = await supabaseAdmin
				.from('orders')
				.select('tracking_number, carrier, expected_ship_date')
				.eq('id', order.id)
				.single();
			if (freshOrder) {
				const parts: string[] = [];
				if (freshOrder.carrier) parts.push(`Carrier: ${freshOrder.carrier}`);
				if (freshOrder.tracking_number) {
					const { trackingUrl } = await import('$lib/utils/carriers.js');
					const url = trackingUrl(freshOrder.carrier, freshOrder.tracking_number);
					parts.push(
						url
							? `Tracking: <a href="${url}">${freshOrder.tracking_number}</a>`
							: `Tracking: ${freshOrder.tracking_number}`
					);
				}
				if (parts.length > 0) shipmentInfo = `<br>${parts.join('<br>')}`;
			}
		}

		// For preparing emails, fetch expected ship date
		let prepInfo = '';
		if (event === 'preparing') {
			const { data: freshOrder } = await supabaseAdmin
				.from('orders')
				.select('start_ship_date, expected_ship_date')
				.eq('id', order.id)
				.single();
			if (freshOrder?.start_ship_date) {
				const d = new Date(freshOrder.start_ship_date + 'T00:00:00Z');
				const formatted = d.toLocaleDateString('en-US', {
					month: 'long',
					day: 'numeric',
					year: 'numeric',
					timeZone: 'UTC'
				});
				prepInfo = `<br>Expected ship date: ${formatted}`;
			}
		}

		const emailConfigs: Record<
			OrderEmailEvent,
			{ recipients: () => Promise<Recipient[]>; subject: string; body: string }
		> = {
			submitted: {
				recipients: async () => {
					const [admins, buyers] = await Promise.all([
						resolveBrandAdminRecipients(order.brand_id),
						resolveBuyerRecipients(order.account_id)
					]);
					return [...admins, ...buyers];
				},
				subject: `New order submitted: ${order.order_number}`,
				body: `A new order has been submitted for <strong>${accountName}</strong> (${brandName}).<br>Total: ${total}`
			},
			created: {
				recipients: async () => {
					const email = await resolveAuthEmail(order.created_by);
					const orgId = await resolveCreatorOrgId(order.created_by);
					return email ? [{ email, profileId: order.created_by, orgId }] : [];
				},
				subject: `Order created: ${order.order_number}`,
				body: `An order has been created for <strong>${accountName}</strong> (${brandName}).<br>Total: ${total}`
			},
			confirmed: {
				recipients: async () => {
					const r: Recipient[] = await resolveBuyerRecipients(order.account_id);
					const repEmail = await resolveAuthEmail(order.created_by);
					const repOrgId = await resolveCreatorOrgId(order.created_by);
					if (repEmail) r.push({ email: repEmail, profileId: order.created_by, orgId: repOrgId });
					return r;
				},
				subject: `Order confirmed: ${order.order_number}`,
				body: `Order <strong>${order.order_number}</strong> for ${accountName} (${brandName}) has been confirmed.<br>Total: ${total}`
			},
			preparing: {
				recipients: async () => {
					const r: Recipient[] = await resolveBuyerRecipients(order.account_id);
					const repEmail = await resolveAuthEmail(order.created_by);
					const repOrgId = await resolveCreatorOrgId(order.created_by);
					if (repEmail) r.push({ email: repEmail, profileId: order.created_by, orgId: repOrgId });
					return r;
				},
				subject: `Order preparing to ship: ${order.order_number}`,
				body: `Order <strong>${order.order_number}</strong> for ${accountName} (${brandName}) is being prepared for shipment.${prepInfo}<br>Total: ${total}`
			},
			shipped: {
				recipients: async () => {
					return resolveBuyerRecipients(order.account_id);
				},
				subject: `Order shipped: ${order.order_number}`,
				body: `Order <strong>${order.order_number}</strong> for ${accountName} (${brandName}) has shipped.${shipmentInfo}<br>Total: ${total}`
			},
			delivered: {
				recipients: async () => {
					const r: Recipient[] = await resolveBuyerRecipients(order.account_id);
					const repEmail = await resolveAuthEmail(order.created_by);
					const repOrgId = await resolveCreatorOrgId(order.created_by);
					if (repEmail) r.push({ email: repEmail, profileId: order.created_by, orgId: repOrgId });
					return r;
				},
				subject: `Order delivered: ${order.order_number}`,
				body: `Order <strong>${order.order_number}</strong> for ${accountName} (${brandName}) has been delivered.<br>Total: ${total}`
			}
		};

		const config = emailConfigs[event];
		const recipients = await config.recipients();
		if (recipients.length === 0) return;

		const tpl = notification({
			title: config.subject,
			body: config.body,
			actionUrl: orderUrl,
			actionLabel: 'View Order'
		});

		for (const r of recipients) {
			const allowed = await checkEmailPreference(r.profileId, r.orgId, 'order_updates');
			if (!allowed) continue;

			await sendEmail({
				to: r.email,
				...tpl,
				template: `order_${event}`,
				relatedType: 'order',
				relatedId: order.id
			});
		}
	} catch (err) {
		console.error(`[order-emails] Failed to send ${event} email for ${order.order_number}:`, err);
	}
}
```

Key changes from the original:

- `OrderEmailEvent` now includes `'preparing'`
- `shipped` recipients: buyer contacts only (no rep) per notification matrix
- `shipped` body: includes carrier + tracking number with clickable tracking URL
- `preparing` event added: rep + buyer contacts, includes expected ship date
- `preparing` body: mentions the brand is preparing the order

- [ ] **Step 2: Verify TypeScript compiles**

Run: `bun run check`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/order-emails.ts
git commit -m "feat: preparing email event and shipped email includes tracking info"
```

---

### Task 5: Spotlight Utility — Include `preparing` in In-Flight Check

**Files:**

- Modify: `src/lib/utils/order-spotlight.ts:54`

The spotlight utility checks `status === 'submitted' || status === 'confirmed'` for its "in-flight" orders. Orders in `preparing` status should also be considered in-flight for ship window attention.

- [ ] **Step 1: Update the in-flight condition**

In `src/lib/utils/order-spotlight.ts`, change line 54 from:

```typescript
const inFlight = (status === 'submitted' || status === 'confirmed') && !shipped;
```

to:

```typescript
const inFlight =
	(status === 'submitted' || status === 'confirmed' || status === 'preparing') && !shipped;
```

- [ ] **Step 2: Run existing spotlight tests (if any)**

Run: `bun run test:run -- src/lib/utils/order-spotlight`
Expected: Either tests pass or no test file exists (the spotlight utility may not have tests yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/order-spotlight.ts
git commit -m "feat: spotlight includes preparing orders in ship window attention checks"
```

---

### Task 6: Order Detail Page — Shipment Details Section + Ship Confirmation Dialog

**Files:**

- Modify: `src/routes/orders/[id]/+page.svelte`

This is the largest UI task. It updates:

1. Status maps (`statusLabels`, `statusBadgeColors`, `statusFlow`, `brandAllowedNext`, `advanceActionLabel`, `timeline`, `statusContext`)
2. Adds a Shipment Details section (editable during `preparing`, read-only after)
3. Adds a "Mark as Shipped" confirmation dialog
4. Updates `canEdit` to exclude `preparing` from general editing (shipment fields have their own edit flow)

- [ ] **Step 1: Update status maps and timeline**

In the `<script>` section of `src/routes/orders/[id]/+page.svelte`:

Add `'preparing'` to `statusLabels` (after `confirmed`):

```typescript
const statusLabels: Record<string, string> = {
	draft: 'Draft',
	submitted: 'Submitted',
	confirmed: 'Confirmed',
	preparing: 'Preparing',
	shipped: 'Shipped',
	delivered: 'Delivered',
	cancelled: 'Cancelled'
};
```

Add `'preparing'` to `statusBadgeColors`:

```typescript
const statusBadgeColors: Record<string, string> = {
	draft: 'bg-zinc-100 text-zinc-600',
	submitted: 'bg-amber-50 text-amber-700',
	confirmed: 'bg-blue-50 text-blue-700',
	preparing: 'bg-violet-50 text-violet-700',
	shipped: 'bg-indigo-50 text-indigo-700',
	delivered: 'bg-emerald-50 text-emerald-700',
	cancelled: 'bg-red-50 text-red-700'
};
```

Update `statusFlow` to route through `preparing`:

```typescript
const statusFlow: Record<string, OrderStatus[]> = {
	draft: ['submitted', 'cancelled'],
	submitted: ['confirmed', 'cancelled'],
	confirmed: ['preparing', 'cancelled'],
	preparing: ['shipped', 'cancelled'],
	shipped: ['delivered'],
	delivered: [],
	cancelled: []
};
```

Update `brandAllowedNext`:

```typescript
const brandAllowedNext: Record<string, OrderStatus[]> = {
	submitted: ['confirmed', 'cancelled'],
	confirmed: ['preparing', 'cancelled'],
	preparing: ['shipped', 'cancelled'],
	shipped: ['delivered']
};
```

Update `advanceActionLabel`:

```typescript
const advanceActionLabel: Record<string, string> = {
	submitted: 'Submit',
	confirmed: 'Mark confirmed',
	preparing: 'Prepare shipment',
	shipped: 'Mark shipped',
	delivered: 'Mark delivered'
};
```

Update `timeline` to include preparing:

```typescript
const timeline = $derived([
	{ status: 'draft', label: 'Draft', date: order.created_at },
	{ status: 'submitted', label: 'Submitted', date: order.submitted_at },
	{ status: 'confirmed', label: 'Confirmed', date: order.confirmed_at },
	{ status: 'preparing', label: 'Preparing', date: order.preparing_at },
	{ status: 'shipped', label: 'Shipped', date: order.shipped_at },
	{ status: 'delivered', label: 'Delivered', date: order.delivered_at }
]);
```

- [ ] **Step 2: Update statusContext**

Replace the `confirmed` and `shipped` cases in the `statusContext` derived, and add `preparing`:

```typescript
case 'confirmed': {
	const head = `Confirmed${order.confirmed_at ? ` · ${longDate(order.confirmed_at as string)}` : ''}.`;
	const tail = isBrandSide
		? 'Start preparing this order for shipment.'
		: 'Awaiting preparation — the brand will begin fulfillment.';
	return `${head} ${tail}`;
}
case 'preparing': {
	const head = `Preparing${order.preparing_at ? ` · ${longDate(order.preparing_at as string)}` : ''}.`;
	const tail = isBrandSide
		? 'Fill in shipment details. Mark as Shipped when the order leaves your warehouse.'
		: 'The brand is preparing this order for shipment.';
	return `${head} ${tail}`;
}
case 'shipped':
	return `Shipped${order.shipped_at ? ` · ${longDate(order.shipped_at as string)}` : ''}. Move to Delivered once the buyer receives it.`;
```

- [ ] **Step 3: Update canEdit to exclude preparing from general line-item editing**

Update the `canEdit` derived to also exclude `preparing` from general editing (the shipment fields have their own save flow):

```typescript
const canEdit = $derived(
	data.isBuyer
		? order.status === 'draft' && order.created_by === data.user?.id
		: data.membership?.role !== 'guest' &&
				order.status !== 'preparing' &&
				order.status !== 'shipped' &&
				order.status !== 'delivered' &&
				order.status !== 'cancelled'
);
```

- [ ] **Step 4: Add shipment detail state and save functions**

Add these variables and functions in the `<script>` section (after the `saveShippedAmount` function around line 848):

```typescript
// ── Shipment details (preparing + shipped) ──────────────────────────
import { CARRIERS } from '$lib/utils/carriers.js';
import { trackingUrl } from '$lib/utils/carriers.js';

const carrierItems = CARRIERS.map((c) => ({ value: c, label: c }));
const isPreparingOrLater = $derived(
	order.status === 'preparing' || order.status === 'shipped' || order.status === 'delivered'
);
const isPreparing = $derived(order.status === 'preparing');
const shipmentReadOnly = $derived(!isPreparing);

let shipCarrier = $state('');
let shipTracking = $state('');
let shipCost = $state('');
let savingShipmentField = $state(false);

$effect(() => {
	shipCarrier = ((order as Record<string, unknown>).carrier as string) ?? '';
	shipTracking = ((order as Record<string, unknown>).tracking_number as string) ?? '';
	const cost = (order as Record<string, unknown>).shipping_cost;
	shipCost = cost != null ? String(cost) : '';
});

async function saveShipmentField(field: string, value: unknown) {
	savingShipmentField = true;
	await supabase
		.from('orders')
		.update({ [field]: value, updated_at: new Date().toISOString() })
		.eq('id', order.id);
	savingShipmentField = false;
	invalidateAll();
}

// ── Ship confirmation dialog ────────────────────────────────────────
let shipConfirmOpen = $state(false);
let shipConfirmCarrier = $state('');
let shipConfirmTracking = $state('');
let shipConfirmCost = $state('');
let shippingOrder = $state(false);

function openShipConfirm() {
	shipConfirmCarrier = shipCarrier;
	shipConfirmTracking = shipTracking;
	shipConfirmCost = shipCost;
	shipConfirmOpen = true;
}

async function confirmShip() {
	shippingOrder = true;
	const res = await fetch(`/api/orders/${order.id}/status`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			status: 'shipped',
			tracking_number: shipConfirmTracking || null,
			carrier: shipConfirmCarrier || null,
			shipping_cost: shipConfirmCost || null
		})
	});
	shippingOrder = false;
	shipConfirmOpen = false;
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		toast.error(body.error ?? 'Could not mark as shipped');
		return;
	}
	toast.success('Order marked as shipped');
	invalidateAll();
	fetchOrderAttentionCount();
}
```

- [ ] **Step 5: Override the "Mark shipped" button to open the confirm dialog instead**

The current stepper renders advance buttons via `updateStatus(nextStatus)`. For `shipped`, we need to intercept and open the dialog instead. Update the button `onclick` in the stepper section (around line 1207):

Replace:

```svelte
{#each nextStatuses.filter((s) => s !== 'cancelled') as nextStatus (nextStatus)}
	<Button size="sm" onclick={() => updateStatus(nextStatus)}>
		{advanceActionLabel[nextStatus] ?? statusLabels[nextStatus] ?? nextStatus}
	</Button>
{/each}
```

With:

```svelte
{#each nextStatuses.filter((s) => s !== 'cancelled') as nextStatus (nextStatus)}
	<Button
		size="sm"
		onclick={() => {
			if (nextStatus === 'shipped') {
				openShipConfirm();
			} else {
				updateStatus(nextStatus);
			}
		}}
	>
		{advanceActionLabel[nextStatus] ?? statusLabels[nextStatus] ?? nextStatus}
	</Button>
{/each}
```

- [ ] **Step 6: Add Shipment Details section to the template**

Add this section after the Ship window band (after the closing `</section>` of the status card, around line 1380, before the "Ship to / Bill to / Payment" section):

```svelte
<!-- ── Shipment Details (preparing + shipped + delivered) ──────── -->
{#if isPreparingOrLater && order.order_type !== 'note'}
	<section class="rounded-lg border bg-muted/30 px-6 py-5">
		<h2 class="text-sm font-medium">Shipment Details</h2>
		<div class="mt-4 grid gap-4 sm:grid-cols-3">
			<div>
				<Label>Carrier</Label>
				{#if isPreparing}
					<SelectField
						items={carrierItems}
						bind:value={shipCarrier}
						placeholder="Select carrier"
						onValueChange={(v) => saveShipmentField('carrier', v || null)}
					/>
				{:else}
					<p class="mt-1 text-sm">{shipCarrier || '—'}</p>
				{/if}
			</div>
			<div>
				<Label>Tracking number</Label>
				{#if isPreparing}
					<Input
						bind:value={shipTracking}
						placeholder="Enter tracking number"
						onblur={() => saveShipmentField('tracking_number', shipTracking || null)}
					/>
				{:else if shipTracking}
					{@const url = trackingUrl(shipCarrier, shipTracking)}
					{#if url}
						<a
							href={url}
							target="_blank"
							rel="noopener"
							class="mt-1 block text-sm text-blue-600 hover:underline">{shipTracking}</a
						>
					{:else}
						<p class="mt-1 text-sm">{shipTracking}</p>
					{/if}
				{:else}
					<p class="mt-1 text-sm text-muted-foreground">—</p>
				{/if}
			</div>
			<div>
				<Label>Shipping cost</Label>
				{#if isPreparing}
					<Input
						type="number"
						bind:value={shipCost}
						placeholder="0.00"
						onblur={() => {
							const v = parseFloat(shipCost);
							saveShipmentField('shipping_cost', isNaN(v) ? null : v);
						}}
					/>
				{:else}
					<p class="mt-1 text-sm">{shipCost ? fmt.format(Number(shipCost)) : '—'}</p>
				{/if}
			</div>
		</div>
	</section>
{/if}
```

- [ ] **Step 7: Add Ship Confirmation Dialog**

Add this dialog at the end of the template (before the closing `</div>` of the page wrapper, near the other dialogs like the cancel dialog):

```svelte
<!-- ── Ship Confirmation Dialog ───────────────────────────────── -->
<Dialog.Root bind:open={shipConfirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
		>
			<Dialog.Title class="text-lg font-semibold">Ship Order</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Confirm shipment details for {order.order_number}. Empty fields can be updated later.
			</Dialog.Description>

			<div class="mt-4 space-y-4">
				<div>
					<Label>Carrier</Label>
					<SelectField
						items={carrierItems}
						bind:value={shipConfirmCarrier}
						placeholder="Select carrier"
					/>
				</div>
				<div>
					<Label>Tracking number</Label>
					<Input bind:value={shipConfirmTracking} placeholder="Enter tracking number" />
				</div>
				<div>
					<Label>Shipping cost</Label>
					<Input type="number" bind:value={shipConfirmCost} placeholder="0.00" />
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-3">
				<Button
					variant="outline"
					onclick={() => (shipConfirmOpen = false)}
					disabled={shippingOrder}
				>
					Cancel
				</Button>
				<Button onclick={confirmShip} loading={shippingOrder}>Ship Order</Button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
```

- [ ] **Step 8: Verify TypeScript compiles**

Run: `bun run check`
Expected: 0 errors. The new fields (`preparing_at`, `tracking_number`, `carrier`, `shipping_cost`) may not be in the generated Supabase types yet — cast as needed with `(order as Record<string, unknown>)`.

- [ ] **Step 9: Commit**

```bash
git add src/routes/orders/[id]/+page.svelte
git commit -m "feat: shipment details section, ship confirmation dialog, preparing status in stepper"
```

---

### Task 7: Order List Page — Preparing Status in Filters + Badges

**Files:**

- Modify: `src/routes/orders/+page.svelte`

Add `preparing` to all status-related maps in the order list page.

- [ ] **Step 1: Update statusTabs**

In `src/routes/orders/+page.svelte`, add `'preparing'` after `'confirmed'` in the `statusTabs` array (line 231):

```typescript
const statusTabs = [
	'all',
	'draft',
	'submitted',
	'confirmed',
	'preparing',
	'shipped',
	'delivered',
	'cancelled'
] as const;
```

- [ ] **Step 2: Update statusLabels**

Add `preparing: 'Preparing'` after the `confirmed` entry (around line 244):

```typescript
const statusLabels: Record<string, string> = {
	all: 'All',
	draft: 'Draft',
	submitted: 'Submitted',
	confirmed: 'Confirmed',
	preparing: 'Preparing',
	shipped: 'Shipped',
	delivered: 'Delivered',
	cancelled: 'Cancelled'
};
```

- [ ] **Step 3: Update statusBadgeColors and statusDotColors**

Add `preparing` entries:

```typescript
const statusBadgeColors: Record<string, string> = {
	draft: 'bg-zinc-100 text-zinc-600',
	submitted: 'bg-amber-50 text-amber-700',
	confirmed: 'bg-blue-50 text-blue-700',
	preparing: 'bg-violet-50 text-violet-700',
	shipped: 'bg-indigo-50 text-indigo-700',
	delivered: 'bg-emerald-50 text-emerald-700',
	cancelled: 'bg-red-50 text-red-700'
};
const statusDotColors: Record<string, string> = {
	draft: 'bg-zinc-400',
	submitted: 'bg-amber-500',
	confirmed: 'bg-blue-500',
	preparing: 'bg-violet-500',
	shipped: 'bg-indigo-500',
	delivered: 'bg-emerald-500',
	cancelled: 'bg-red-500'
};
```

- [ ] **Step 4: Verify no type errors**

Run: `bun run check`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/routes/orders/+page.svelte
git commit -m "feat: preparing status in order list filters, badges, and dot colors"
```

---

### Task 8: Verify End-to-End

- [ ] **Step 1: Run type check**

Run: `bun run check`
Expected: 0 errors

- [ ] **Step 2: Run tests**

Run: `bun run test:run`
Expected: All tests pass, including the new carrier utility tests.

- [ ] **Step 3: Apply migration to local DB**

Run: `bunx supabase db reset` from the project root.
Expected: All migrations apply cleanly.

- [ ] **Step 4: Start dev server and test manually**

Run: `bun run dev`

Test the following flow:

1. Navigate to an order in `confirmed` status
2. Verify the stepper shows: Draft — Submitted — Confirmed — **Preparing** — Shipped — Delivered
3. Click "Prepare shipment" — status should change to `preparing`
4. Verify the Shipment Details section appears with editable Carrier, Tracking, and Cost fields
5. Enter a carrier and tracking number, verify they auto-save on blur
6. Click "Mark shipped" — verify the confirmation dialog opens with the fields pre-filled
7. Click "Ship Order" — verify status transitions to `shipped` and fields become read-only
8. Verify tracking number shows as a clickable link (for UPS/FedEx/USPS/DHL carriers)
9. Navigate to the order list — verify `Preparing` appears in status filters and badge colors

- [ ] **Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes"
```
