# Stitch-Assisted Brand Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let brand orgs finish operational setup via a Stitch AI guided flow or manual links, tracked by a checklist on the /insight page.

**Architecture:** Single `getSetupStatus(orgId)` completion engine shared by the insight page and Stitch. New AI tools for org settings. Auto-seeded shipping methods on brand org creation. `org_setup_status` table tracks explicitly skipped sections.

**Tech Stack:** SvelteKit 2 + Svelte 5, Supabase (Postgres + supabaseAdmin for writes), Anthropic SDK (existing Stitch integration), Zod schemas, TypeScript.

**Spec:** `docs/superpowers/specs/2026-05-17-stitch-onboarding-design.md`

---

### Task 1: Database — `org_setup_status` table + RLS

**Files:**

- Create: `supabase/migrations/20260517000001_org_setup_status.sql`

This migration creates the table that tracks which setup sections a user has explicitly skipped/declined. It also seeds default shipping methods for existing brand orgs that don't have any.

- [ ] **Step 1: Write the migration**

```sql
-- org_setup_status: tracks skipped/declined setup sections
create table org_setup_status (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  section text not null,
  status text not null default 'pending',
  updated_at timestamptz not null default now(),
  unique(organization_id, section)
);

alter table org_setup_status enable row level security;

create policy "org_setup_status_select"
  on org_setup_status for select using (
    organization_id in (
      select organization_id from organization_members where profile_id = auth.uid()
    )
  );

create policy "org_setup_status_all"
  on org_setup_status for all using (
    organization_id in (
      select organization_id from organization_members where profile_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply migration locally**

Run: `cd /Users/scottcarlton/Sites/threadline/.worktrees/stitch-onboarding && bunx supabase db push --local`

Verify: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d org_setup_status"`

Expected: Table with columns id, organization_id, section, status, updated_at.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260517000001_org_setup_status.sql
git commit -m "feat: add org_setup_status table for tracking skipped setup sections"
```

---

### Task 2: Auto-seed default shipping methods for brand orgs

**Files:**

- Modify: `src/routes/api/onboarding/create-org/+server.ts`

When a brand org is created, seed three default shipping methods so the shipping setup step is about confirming defaults, not building from scratch.

- [ ] **Step 1: Read the existing create-org endpoint**

Read `src/routes/api/onboarding/create-org/+server.ts` to understand the current flow. The endpoint creates the org, creates admin membership, and for brand orgs sets the self-brand contact email. We'll add shipping method seeding after the brand-org block (after line 94).

- [ ] **Step 2: Add shipping method seeding**

After the existing brand-org self-brand block (the `if (validOrgType === 'brand' && session.user.email)` section), add:

```typescript
// Seed default shipping methods for brand orgs
if (validOrgType === 'brand') {
	await supabaseAdmin.from('organization_shipping_methods').insert([
		{
			organization_id: org.id,
			name: 'Ground',
			cost_type: 'flat',
			delivery_window: '5–7 business days'
		},
		{
			organization_id: org.id,
			name: 'Express',
			cost_type: 'flat',
			delivery_window: '2–3 business days'
		},
		{
			organization_id: org.id,
			name: 'Overnight',
			cost_type: 'flat',
			delivery_window: '1 business day'
		}
	]);
}
```

Note: `cost_amount` is left null — the user sets it during setup. The methods exist so Stitch can present them for selection.

- [ ] **Step 3: Verify by creating a test brand org**

Use the app to create a new brand org through onboarding, then verify:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select name, cost_type, delivery_window from organization_shipping_methods order by created_at desc limit 3"
```

Expected: Three rows (Ground, Express, Overnight).

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/onboarding/create-org/+server.ts
git commit -m "feat: auto-seed default shipping methods for new brand orgs"
```

---

### Task 3: Completion engine — `getSetupStatus()`

**Files:**

- Create: `src/lib/server/setup-status.ts`
- Create: `src/lib/server/setup-status.test.ts`

Single function that queries the database and returns per-section completion booleans. Used by both the insight page and Stitch AI.

- [ ] **Step 1: Write the test**

```typescript
// src/lib/server/setup-status.test.ts
import { describe, it, expect } from 'vitest';
import { deriveSetupStatus } from './setup-status.js';

describe('deriveSetupStatus', () => {
	const baseOrg = {
		address_line1: null,
		city: null,
		state: null,
		zip: null,
		time_zone: 'America/Los_Angeles',
		shipping_use_business_address: true,
		shipping_from_line1: null,
		default_shipping_method_id: null,
		default_payment_terms: null,
		returns_window_days: 0,
		taxes_us_sales_tax_enabled: false,
		taxes_vat_enabled: false,
		taxes_gst_enabled: false
	};

	it('returns all false for empty org', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: []
		});
		expect(status.address).toBe(false);
		expect(status.shipping).toBe(false);
		expect(status.payments).toBe(false);
		expect(status.products).toBe(false);
		expect(status.accounts).toBe(false);
		expect(status.members).toBe(false);
	});

	it('address complete when all fields populated', () => {
		const status = deriveSetupStatus(
			{ ...baseOrg, address_line1: '123 Main', city: 'LA', state: 'CA', zip: '90001' },
			{
				shippingMethodCount: 0,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.address).toBe(true);
		expect(status.profile).toBe(true);
	});

	it('shipping complete when methods exist, default set, and address resolved via business address', () => {
		const status = deriveSetupStatus(
			{
				...baseOrg,
				address_line1: '123 Main',
				city: 'LA',
				state: 'CA',
				zip: '90001',
				shipping_use_business_address: true,
				default_shipping_method_id: 'some-uuid'
			},
			{
				shippingMethodCount: 3,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.shipping).toBe(true);
	});

	it('payments complete when default_payment_terms is set', () => {
		const status = deriveSetupStatus(
			{ ...baseOrg, default_payment_terms: 'net_30' },
			{
				shippingMethodCount: 0,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.payments).toBe(true);
	});

	it('taxes complete when skipped', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: ['taxes']
		});
		expect(status.taxes).toBe(true);
	});

	it('taxes complete when any system enabled', () => {
		const status = deriveSetupStatus(
			{ ...baseOrg, taxes_us_sales_tax_enabled: true },
			{
				shippingMethodCount: 0,
				productCount: 0,
				accountCount: 0,
				memberCount: 1,
				skippedSections: []
			}
		);
		expect(status.taxes).toBe(true);
	});

	it('returns complete when skipped', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: ['returns']
		});
		expect(status.returns).toBe(true);
	});

	it('products complete when count > 0', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 1,
			accountCount: 0,
			memberCount: 1,
			skippedSections: []
		});
		expect(status.products).toBe(true);
	});

	it('members complete when count > 1 (beyond owner)', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 2,
			skippedSections: []
		});
		expect(status.members).toBe(true);
	});

	it('members complete when skipped', () => {
		const status = deriveSetupStatus(baseOrg, {
			shippingMethodCount: 0,
			productCount: 0,
			accountCount: 0,
			memberCount: 1,
			skippedSections: ['members']
		});
		expect(status.members).toBe(true);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test:run -- src/lib/server/setup-status.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/server/setup-status.ts
import { supabaseAdmin } from './supabase.js';

export type SetupStatus = {
	address: boolean;
	shipping: boolean;
	payments: boolean;
	orders: boolean;
	taxes: boolean;
	returns: boolean;
	profile: boolean;
	products: boolean;
	accounts: boolean;
	members: boolean;
};

type OrgFields = {
	address_line1: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	time_zone: string | null;
	shipping_use_business_address: boolean;
	shipping_from_line1: string | null;
	default_shipping_method_id: string | null;
	default_payment_terms: string | null;
	returns_window_days: number;
	taxes_us_sales_tax_enabled: boolean;
	taxes_vat_enabled: boolean;
	taxes_gst_enabled: boolean;
};

type CountData = {
	shippingMethodCount: number;
	productCount: number;
	accountCount: number;
	memberCount: number;
	skippedSections: string[];
};

export function deriveSetupStatus(org: OrgFields, counts: CountData): SetupStatus {
	const hasAddress = Boolean(org.address_line1 && org.city && org.state && org.zip);

	const shipFromResolved = org.shipping_use_business_address
		? hasAddress
		: Boolean(org.shipping_from_line1);

	const hasShipping =
		counts.shippingMethodCount > 0 && Boolean(org.default_shipping_method_id) && shipFromResolved;

	const skipped = new Set(counts.skippedSections);

	return {
		address: hasAddress,
		shipping: hasShipping,
		payments: Boolean(org.default_payment_terms),
		orders: skipped.has('orders'),
		taxes:
			skipped.has('taxes') ||
			org.taxes_us_sales_tax_enabled ||
			org.taxes_vat_enabled ||
			org.taxes_gst_enabled,
		returns: skipped.has('returns') || org.returns_window_days > 0,
		profile: hasAddress && Boolean(org.time_zone),
		products: counts.productCount > 0,
		accounts: counts.accountCount > 0,
		members: counts.memberCount > 1 || skipped.has('members')
	};
}

export async function getSetupStatus(orgId: string): Promise<SetupStatus> {
	const [orgResult, shippingResult, productResult, accountResult, memberResult, skipResult] =
		await Promise.all([
			supabaseAdmin
				.from('organizations')
				.select(
					'address_line1, city, state, zip, time_zone, shipping_use_business_address, shipping_from_line1, default_shipping_method_id, default_payment_terms, returns_window_days, taxes_us_sales_tax_enabled, taxes_vat_enabled, taxes_gst_enabled'
				)
				.eq('id', orgId)
				.single(),
			supabaseAdmin
				.from('organization_shipping_methods')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('products')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('accounts')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('organization_members')
				.select('id', { count: 'exact', head: true })
				.eq('organization_id', orgId),
			supabaseAdmin
				.from('org_setup_status')
				.select('section')
				.eq('organization_id', orgId)
				.in('status', ['skipped', 'completed'])
		]);

	const org = orgResult.data as OrgFields;

	return deriveSetupStatus(org, {
		shippingMethodCount: shippingResult.count ?? 0,
		productCount: productResult.count ?? 0,
		accountCount: accountResult.count ?? 0,
		memberCount: memberResult.count ?? 0,
		skippedSections: (skipResult.data ?? []).map((r) => (r as { section: string }).section)
	});
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:run -- src/lib/server/setup-status.test.ts`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/setup-status.ts src/lib/server/setup-status.test.ts
git commit -m "feat: add setup status completion engine with tests"
```

---

### Task 4: New AI tools — org settings + setup status

**Files:**

- Modify: `src/lib/server/ai-tools.ts` (add tool handler functions + switch cases)
- Modify: `src/routes/api/ai/+server.ts` (add tool definitions to `_toolDefinitions` array)

Add 7 new tools: `check_setup_status`, `update_org_settings`, `update_org_shipping`, `update_org_payments`, `update_org_taxes`, `update_org_returns`, `skip_setup_section`.

- [ ] **Step 1: Add switch cases in `executeToolCall`**

In `src/lib/server/ai-tools.ts`, add these cases before the `default:` case (around line 143):

```typescript
case 'check_setup_status':
  return checkSetupStatus(ctx);
case 'update_org_settings':
  return updateOrgSettings(toolInput, ctx);
case 'update_org_shipping':
  return updateOrgShipping(toolInput, ctx);
case 'update_org_payments':
  return updateOrgPayments(toolInput, ctx);
case 'update_org_taxes':
  return updateOrgTaxes(toolInput, ctx);
case 'update_org_returns':
  return updateOrgReturns(toolInput, ctx);
case 'skip_setup_section':
  return skipSetupSection(toolInput, ctx);
```

- [ ] **Step 2: Add the import**

At the top of `src/lib/server/ai-tools.ts`, add:

```typescript
import { getSetupStatus } from './setup-status.js';
```

- [ ] **Step 3: Write the `checkSetupStatus` handler**

Add at the bottom of `src/lib/server/ai-tools.ts`:

```typescript
async function checkSetupStatus(ctx: ToolContext): Promise<ToolResult> {
	try {
		const status = await getSetupStatus(ctx.organizationId);
		return { success: true, data: status };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to check setup status'
		};
	}
}
```

- [ ] **Step 4: Write the `updateOrgSettings` handler**

This saves org profile fields (address, timezone, etc.). Add:

```typescript
async function updateOrgSettings(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		const update: Record<string, unknown> = {};
		if (input.address_line1 !== undefined) update.address_line1 = input.address_line1;
		if (input.address_line2 !== undefined) update.address_line2 = input.address_line2;
		if (input.city !== undefined) update.city = input.city;
		if (input.state !== undefined) update.state = input.state;
		if (input.zip !== undefined) update.zip = input.zip;
		if (input.country !== undefined) update.country = input.country;
		if (input.time_zone !== undefined) update.time_zone = input.time_zone;
		if (input.legal_business_name !== undefined)
			update.legal_business_name = input.legal_business_name;

		if (Object.keys(update).length === 0) {
			return { success: false, error: 'No fields provided to update' };
		}

		update.updated_at = new Date().toISOString();
		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', ctx.organizationId);

		if (error) return { success: false, error: error.message };
		return {
			success: true,
			data: { updated: Object.keys(update).filter((k) => k !== 'updated_at') }
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to update settings'
		};
	}
}
```

- [ ] **Step 5: Write the `updateOrgShipping` handler**

```typescript
async function updateOrgShipping(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		const update: Record<string, unknown> = {};

		if (input.use_business_address !== undefined)
			update.shipping_use_business_address = input.use_business_address;
		if (input.shipping_from_line1 !== undefined)
			update.shipping_from_line1 = input.shipping_from_line1;
		if (input.shipping_from_line2 !== undefined)
			update.shipping_from_line2 = input.shipping_from_line2;
		if (input.shipping_from_city !== undefined)
			update.shipping_from_city = input.shipping_from_city;
		if (input.shipping_from_state !== undefined)
			update.shipping_from_state = input.shipping_from_state;
		if (input.shipping_from_zip !== undefined) update.shipping_from_zip = input.shipping_from_zip;
		if (input.shipping_from_country !== undefined)
			update.shipping_from_country = input.shipping_from_country;
		if (input.default_shipping_method_id !== undefined)
			update.default_shipping_method_id = input.default_shipping_method_id;
		if (input.free_threshold_enabled !== undefined)
			update.shipping_free_threshold_enabled = input.free_threshold_enabled;
		if (input.free_threshold_amount !== undefined)
			update.shipping_free_threshold_amount = input.free_threshold_amount;

		if (Object.keys(update).length === 0) {
			return { success: false, error: 'No fields provided to update' };
		}

		update.updated_at = new Date().toISOString();
		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', ctx.organizationId);

		if (error) return { success: false, error: error.message };

		// If setting default by name, look up the method ID
		if (input.default_method_name && typeof input.default_method_name === 'string') {
			const { data: method } = await supabaseAdmin
				.from('organization_shipping_methods')
				.select('id')
				.eq('organization_id', ctx.organizationId)
				.ilike('name', `%${input.default_method_name}%`)
				.limit(1)
				.maybeSingle();

			if (method) {
				await supabaseAdmin
					.from('organizations')
					.update({ default_shipping_method_id: method.id, updated_at: new Date().toISOString() })
					.eq('id', ctx.organizationId);
			}
		}

		return {
			success: true,
			data: { updated: Object.keys(update).filter((k) => k !== 'updated_at') }
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to update shipping'
		};
	}
}
```

- [ ] **Step 6: Write the `updateOrgPayments` handler**

```typescript
async function updateOrgPayments(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		const update: Record<string, unknown> = {};

		if (input.accepted_methods !== undefined)
			update.accepted_payment_methods = input.accepted_methods;
		if (input.default_method !== undefined) update.default_payment_method = input.default_method;
		if (input.default_terms !== undefined) update.default_payment_terms = input.default_terms;
		if (input.required_deposit_enabled !== undefined)
			update.payments_required_deposit_enabled = input.required_deposit_enabled;
		if (input.required_deposit_percent !== undefined)
			update.payments_required_deposit_percent = input.required_deposit_percent;

		if (Object.keys(update).length === 0) {
			return { success: false, error: 'No fields provided to update' };
		}

		update.updated_at = new Date().toISOString();
		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', ctx.organizationId);

		if (error) return { success: false, error: error.message };
		return {
			success: true,
			data: { updated: Object.keys(update).filter((k) => k !== 'updated_at') }
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to update payments'
		};
	}
}
```

- [ ] **Step 7: Write the `updateOrgTaxes` handler**

```typescript
async function updateOrgTaxes(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		const update: Record<string, unknown> = {};

		if (input.pricing_display !== undefined) update.taxes_pricing_display = input.pricing_display;
		if (input.us_sales_tax_enabled !== undefined)
			update.taxes_us_sales_tax_enabled = input.us_sales_tax_enabled;
		if (input.us_ein !== undefined) update.taxes_us_ein = input.us_ein;
		if (input.us_general_rate !== undefined) update.taxes_us_general_rate = input.us_general_rate;
		if (input.vat_enabled !== undefined) update.taxes_vat_enabled = input.vat_enabled;
		if (input.vat_registration !== undefined)
			update.taxes_vat_registration = input.vat_registration;
		if (input.vat_rate !== undefined) update.taxes_vat_rate = input.vat_rate;
		if (input.gst_enabled !== undefined) update.taxes_gst_enabled = input.gst_enabled;
		if (input.gst_registration !== undefined)
			update.taxes_gst_registration = input.gst_registration;
		if (input.gst_rate !== undefined) update.taxes_gst_rate = input.gst_rate;

		if (Object.keys(update).length === 0) {
			return { success: false, error: 'No fields provided to update' };
		}

		update.updated_at = new Date().toISOString();
		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', ctx.organizationId);

		if (error) return { success: false, error: error.message };
		return {
			success: true,
			data: { updated: Object.keys(update).filter((k) => k !== 'updated_at') }
		};
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : 'Failed to update taxes' };
	}
}
```

- [ ] **Step 8: Write the `updateOrgReturns` handler**

```typescript
async function updateOrgReturns(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	try {
		const update: Record<string, unknown> = {};

		if (input.window_days !== undefined) update.returns_window_days = input.window_days;
		if (input.policy_text !== undefined) update.returns_policy_text = input.policy_text || null;
		if (input.use_ship_from_address !== undefined)
			update.returns_use_ship_from_address = input.use_ship_from_address;
		if (input.address_line1 !== undefined)
			update.returns_address_line1 = input.address_line1 || null;
		if (input.address_line2 !== undefined)
			update.returns_address_line2 = input.address_line2 || null;
		if (input.address_city !== undefined) update.returns_address_city = input.address_city || null;
		if (input.address_state !== undefined)
			update.returns_address_state = input.address_state || null;
		if (input.address_zip !== undefined) update.returns_address_zip = input.address_zip || null;
		if (input.address_country !== undefined)
			update.returns_address_country = input.address_country || null;
		if (input.restocking_fee_type !== undefined)
			update.returns_restocking_fee_type = input.restocking_fee_type;
		if (input.restocking_fee_value !== undefined)
			update.returns_restocking_fee_value = input.restocking_fee_value;
		if (input.buyer_pays_shipping !== undefined)
			update.returns_buyer_pays_shipping = input.buyer_pays_shipping;

		if (Object.keys(update).length === 0) {
			return { success: false, error: 'No fields provided to update' };
		}

		update.updated_at = new Date().toISOString();
		const { error } = await supabaseAdmin
			.from('organizations')
			.update(update)
			.eq('id', ctx.organizationId);

		if (error) return { success: false, error: error.message };
		return {
			success: true,
			data: { updated: Object.keys(update).filter((k) => k !== 'updated_at') }
		};
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to update returns'
		};
	}
}
```

- [ ] **Step 9: Write the `skipSetupSection` handler**

```typescript
async function skipSetupSection(
	input: Record<string, unknown>,
	ctx: ToolContext
): Promise<ToolResult> {
	const section = input.section as string;
	const validSections = ['orders', 'taxes', 'returns', 'members', 'products', 'accounts'];
	if (!validSections.includes(section)) {
		return {
			success: false,
			error: `Invalid section: ${section}. Must be one of: ${validSections.join(', ')}`
		};
	}

	const status = input.status === 'completed' ? 'completed' : 'skipped';

	try {
		const { error } = await supabaseAdmin.from('org_setup_status').upsert(
			{
				organization_id: ctx.organizationId,
				section,
				status,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'organization_id,section' }
		);

		if (error) return { success: false, error: error.message };
		return { success: true, data: { section, status } };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : 'Failed to update section status'
		};
	}
}
```

- [ ] **Step 10: Add tool definitions to `_toolDefinitions`**

In `src/routes/api/ai/+server.ts`, add these to the `_toolDefinitions` array (before the closing `]`):

```typescript
{
  name: 'check_setup_status',
  description: 'Check which organization setup sections are complete, incomplete, or skipped. Returns a boolean map of all sections.',
  input_schema: {
    type: 'object' as const,
    properties: {},
    required: []
  }
},
{
  name: 'update_org_settings',
  description: 'Update organization profile settings (business address, timezone, legal name).',
  input_schema: {
    type: 'object' as const,
    properties: {
      address_line1: { type: 'string', description: 'Street address line 1' },
      address_line2: { type: 'string', description: 'Street address line 2' },
      city: { type: 'string', description: 'City' },
      state: { type: 'string', description: 'State/province code' },
      zip: { type: 'string', description: 'ZIP/postal code' },
      country: { type: 'string', description: 'ISO 2-letter country code' },
      time_zone: { type: 'string', description: 'IANA timezone (e.g. America/New_York)' },
      legal_business_name: { type: 'string', description: 'Legal business name' }
    },
    required: []
  }
},
{
  name: 'update_org_shipping',
  description: 'Update organization shipping configuration (ship-from address, default method, free threshold).',
  input_schema: {
    type: 'object' as const,
    properties: {
      use_business_address: { type: 'boolean', description: 'Use business address as ship-from' },
      shipping_from_line1: { type: 'string', description: 'Custom ship-from address line 1' },
      shipping_from_line2: { type: 'string', description: 'Custom ship-from address line 2' },
      shipping_from_city: { type: 'string', description: 'Custom ship-from city' },
      shipping_from_state: { type: 'string', description: 'Custom ship-from state' },
      shipping_from_zip: { type: 'string', description: 'Custom ship-from ZIP' },
      shipping_from_country: { type: 'string', description: 'Custom ship-from country code' },
      default_shipping_method_id: { type: 'string', description: 'UUID of the default shipping method' },
      default_method_name: { type: 'string', description: 'Name of default shipping method (fuzzy match)' },
      free_threshold_enabled: { type: 'boolean', description: 'Enable free shipping threshold' },
      free_threshold_amount: { type: 'number', description: 'Order amount for free shipping' }
    },
    required: []
  }
},
{
  name: 'update_org_payments',
  description: 'Update organization payment configuration (accepted methods, default terms, deposits).',
  input_schema: {
    type: 'object' as const,
    properties: {
      accepted_methods: {
        type: 'array',
        items: { type: 'string' },
        description: 'Accepted payment method codes: credit_card, ach, check, wire, other'
      },
      default_method: { type: 'string', description: 'Default payment method code' },
      default_terms: { type: 'string', description: 'Default payment terms: net_15, net_30, net_60, net_90, cod, prepaid, other' },
      required_deposit_enabled: { type: 'boolean', description: 'Require deposit on orders' },
      required_deposit_percent: { type: 'number', description: 'Deposit percentage (0-100)' }
    },
    required: []
  }
},
{
  name: 'update_org_taxes',
  description: 'Update organization tax configuration (US sales tax, VAT, GST).',
  input_schema: {
    type: 'object' as const,
    properties: {
      pricing_display: { type: 'string', description: 'Tax display mode: exclusive or inclusive' },
      us_sales_tax_enabled: { type: 'boolean', description: 'Enable US sales tax' },
      us_ein: { type: 'string', description: 'US EIN/tax ID' },
      us_general_rate: { type: 'number', description: 'US general tax rate (0-100)' },
      vat_enabled: { type: 'boolean', description: 'Enable VAT' },
      vat_registration: { type: 'string', description: 'VAT registration number' },
      vat_rate: { type: 'number', description: 'VAT rate (0-100)' },
      gst_enabled: { type: 'boolean', description: 'Enable GST' },
      gst_registration: { type: 'string', description: 'GST registration number' },
      gst_rate: { type: 'number', description: 'GST rate (0-100)' }
    },
    required: []
  }
},
{
  name: 'update_org_returns',
  description: 'Update organization return policy (window, restocking fee, return address).',
  input_schema: {
    type: 'object' as const,
    properties: {
      window_days: { type: 'number', description: 'Return window in days (0 = no returns)' },
      policy_text: { type: 'string', description: 'Return policy text (markdown)' },
      use_ship_from_address: { type: 'boolean', description: 'Use ship-from address for returns' },
      address_line1: { type: 'string', description: 'Return address line 1' },
      address_line2: { type: 'string', description: 'Return address line 2' },
      address_city: { type: 'string', description: 'Return address city' },
      address_state: { type: 'string', description: 'Return address state' },
      address_zip: { type: 'string', description: 'Return address ZIP' },
      address_country: { type: 'string', description: 'Return address country code' },
      restocking_fee_type: { type: 'string', description: 'Fee type: percent or flat' },
      restocking_fee_value: { type: 'number', description: 'Restocking fee value' },
      buyer_pays_shipping: { type: 'boolean', description: 'Buyer pays return shipping' }
    },
    required: []
  }
},
{
  name: 'skip_setup_section',
  description: 'Mark a setup section as skipped/not applicable or explicitly completed. Valid sections: orders, taxes, returns, members, products, accounts.',
  input_schema: {
    type: 'object' as const,
    properties: {
      section: { type: 'string', description: 'Section to update: orders, taxes, returns, members, products, accounts' },
      status: { type: 'string', description: 'Status to set: skipped (default) or completed' }
    },
    required: ['section']
  }
}
```

- [ ] **Step 11: Add new tools to WRITE_TOOLS set**

In `src/routes/api/ai/+server.ts`, find the `WRITE_TOOLS` set and add the new tool names:

```typescript
'update_org_settings',
'update_org_shipping',
'update_org_payments',
'update_org_taxes',
'update_org_returns',
'skip_setup_section',
```

- [ ] **Step 12: Run type check**

Run: `bun run check`

Expected: 0 errors.

- [ ] **Step 13: Commit**

```bash
git add src/lib/server/ai-tools.ts src/routes/api/ai/+server.ts
git commit -m "feat: add AI tools for org settings, shipping, payments, taxes, returns, and setup skip"
```

---

### Task 5: Setup system prompt for Stitch

**Files:**

- Modify: `src/lib/server/ai-prompts.ts` (add `SETUP_PROMPT` export)
- Modify: `src/routes/api/ai/+server.ts` (inject setup prompt when agent is 'setup')

When "Help finish setup" is sent from the insight page, Stitch receives a setup-specific system prompt alongside the main prompt. This prompt contains the scripted step sequence, gateway questions, and instructions for one-question-at-a-time interaction.

- [ ] **Step 1: Add `SETUP_PROMPT` to `ai-prompts.ts`**

Add this export to `src/lib/server/ai-prompts.ts`:

```typescript
export const SETUP_PROMPT = `You are in SETUP MODE. The user has asked for help finishing their organization setup.

## Your behavior

1. Call check_setup_status FIRST to see what's already done.
2. Follow the step sequence below, SKIPPING any step that's already complete.
3. Ask ONE question at a time. Wait for the answer before moving on.
4. After each answer, save the data with the appropriate tool, confirm briefly, then ask the next question.
5. Where options exist (payment methods, terms, shipping methods), present them as a list the user can pick from.
6. Keep momentum — brief confirmation + next question. No long explanations.

## Step Sequence

### Phase 1 — Required

1. **Business address** — "What's your business address?" Save with update_org_settings.
2. **Ship-from address** — "Should we use this as your shipping address too?" If yes, call update_org_shipping with use_business_address=true. If no, ask for the separate address.
3. **Default shipping method** — First call query_data to list the org's shipping methods. Present them and ask "Which should be the default?" Save with update_org_shipping using default_method_name.
4. **Payment methods** — "Which payment methods do you accept?" Options: Credit Card, ACH/Bank Transfer, Check, Wire Transfer, Other. Save with update_org_payments (accepted_methods array using codes: credit_card, ach, check, wire, other).
5. **Payment terms** — "What are your default payment terms?" Options: Net 15, Net 30, Net 60, Net 90, COD, Prepaid, Other. Save with update_org_payments (default_terms using codes: net_15, net_30, net_60, net_90, cod, prepaid, other).

### Phase 2 — Optional

6. **Order settings** — "Want to customize your order settings? (numbering, minimums, commission) We can skip this for now — defaults work fine." If skip, call skip_setup_section with section="orders". If yes, ask each sub-question one at a time.
7. **Taxes** — "Do you have any tax requirements?" If no, call skip_setup_section with section="taxes". If yes, ask which system (US sales tax, VAT, GST) then collect rates.
8. **Returns** — "Do you want to set up a return policy?" If no, call skip_setup_section with section="returns". If yes, ask return window, then restocking fee, then return address — one at a time.

### Phase 3 — Seed Data

9. **Products** — "Let's get some products in. Have a spreadsheet or lookbook to upload, or want to add one manually?" Upload path or use add_product tool. User can skip for later.
10. **Accounts** — "Do you have existing buyer accounts to bring in? Upload a spreadsheet or we can add one now." Upload path or use create_account tool. User can skip for later.
11. **Members** — "Want to invite any team members or sales partners?" If no, call skip_setup_section with section="members". If yes, collect name + email.

## Rules

- NEVER ask more than one question per message.
- ALWAYS call check_setup_status before starting to know what to skip.
- When presenting options, list them clearly. Don't make the user guess or type from memory.
- After completing all steps, summarize what was set up and congratulate them.
- If the user wants to skip any step, respect that immediately and move on.`;
```

- [ ] **Step 2: Inject setup prompt in the API handler**

In `src/routes/api/ai/+server.ts`, find where `agentPrompt` is used to build the system blocks (around lines 992-1007). The existing code already supports an `agentPrompt` field sent from the client. Read the exact code to find the injection point, then ensure the setup prompt is included when `agentId === 'setup'`.

In the POST handler where request body is parsed, the client sends `agentId`. Find where `agentPrompt` is constructed and add:

```typescript
// After parsing the request body
const setupMode = agentId === 'setup';
const effectiveAgentPrompt = setupMode ? SETUP_PROMPT : agentPrompt;
```

Import `SETUP_PROMPT` alongside the existing imports:

```typescript
import { MAIN_STATIC_PROMPT, CLASSIFIER_PROMPT, SETUP_PROMPT } from '$lib/server/ai-prompts.js';
```

Then use `effectiveAgentPrompt` wherever `agentPrompt` was used in the system blocks.

- [ ] **Step 3: Run type check**

Run: `bun run check`

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/ai-prompts.ts src/routes/api/ai/+server.ts
git commit -m "feat: add setup system prompt for Stitch onboarding flow"
```

---

### Task 6: Insight page — setup checklist + Stitch trigger

**Files:**

- Modify: `src/routes/insight/+page.server.ts` (add setup status to brand load)
- Modify: `src/routes/insight/+page.svelte` (replace existing brand checklist with new setup checklist)

Replace the existing 4-item brand checklist with the new setup checklist from the wireframe. Add "Use Stitch" button that fires a prompt to the AI chat panel.

- [ ] **Step 1: Add setup status to server load**

In `src/routes/insight/+page.server.ts`, import `getSetupStatus`:

```typescript
import { getSetupStatus } from '$lib/server/setup-status.js';
```

In the `loadBrandInsight` function (around line 664), call `getSetupStatus` alongside the existing queries. Add near the top of the function:

```typescript
const setupStatus = await getSetupStatus(primaryOrgId);
```

Replace the existing checklist computation (around lines 875-899) with:

```typescript
const setupComplete = setupStatus.address && setupStatus.shipping && setupStatus.payments;

const checklist = {
	...setupStatus,
	setupComplete,
	// Legacy fields for backwards compat during transition
	hasProducts: setupStatus.products,
	hasConnectedRep: activeReps.length > 0 || (salesRepCount.count ?? 0) > 0,
	hasOrder: federatedOrders.length > 0,
	hasTeammates: setupStatus.members,
	complete: setupComplete && setupStatus.products && setupStatus.accounts
};
```

Update the return object to include `setupStatus`:

```typescript
return {
	...existingReturnFields,
	setupStatus,
	brandChecklist: checklist as typeof checklist | null
};
```

- [ ] **Step 2: Update the insight page component**

In `src/routes/insight/+page.svelte`, replace the existing brand onboarding checklist (lines ~529-607) with the new setup checklist UI based on the wireframe. This section needs to:

1. Show the header "{firstName}, let's finish setting you up." with subtitle
2. Show the "Finish setup" card with Use Stitch / Manual / Contact us buttons
3. Show Settings column (Orders, Shipping, Returns, Payments, Taxes) with completion circles and "Setup" links
4. Show System column (Products, Accounts, Members) with completion circles and "Setup" links
5. Show Profile with completion circle

The "Use Stitch" button calls `handleShortcut('Help me finish setting up my organization')` — this is the existing function at line 498 that sends a message to the AI chat via `conversation.sendMessage()`. Pass `agentId: 'setup'` to trigger the setup prompt.

Read the existing `handleShortcut` function and the `conversation.sendMessage` signature to understand how to pass the agentId. The conversation store's `sendMessage` takes a message string — check if there's a way to also pass agent context, or if the agentId needs to be set on the store before sending.

Build the UI following existing card patterns in the codebase (Card, CardHeader, CardContent from ui components). Use the wireframe layout with the two-column grid for Settings and System.

**Important:** Read the actual component file before making changes. Match existing import patterns and component usage. Do NOT use `text-xs`. Use Bits UI components where appropriate.

- [ ] **Step 3: Test in browser**

Run: `bun run dev`

Navigate to `/insight` as a brand admin. Verify:

- Setup checklist appears with correct completion status
- "Use Stitch" opens the AI chat with setup context
- "Setup" links navigate to correct `/organization/*` pages
- Completion circles reflect actual data state

- [ ] **Step 4: Run type check**

Run: `bun run check`

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/routes/insight/+page.server.ts src/routes/insight/+page.svelte
git commit -m "feat: add setup checklist to brand insight page with Stitch trigger"
```

---

### Task 7: Wire `agentId` through conversation store

**Files:**

- Modify: `src/lib/stores/conversation.ts` (accept agentId parameter in sendMessage)
- Modify: `src/routes/api/ai/+server.ts` (read agentId from request body if not already)

The conversation store's `sendMessage` needs to accept and forward an `agentId` so the API handler can detect setup mode.

- [ ] **Step 1: Read the current `sendMessage` signature**

Read `src/lib/stores/conversation.ts` around lines 130-165 to understand the current parameter shape and request body construction.

- [ ] **Step 2: Add `agentId` parameter**

Modify the `sendMessage` function to accept an optional `agentId` parameter. If the function currently takes a string, change it to accept an options object or add a second parameter. Pass `agentId` in the request body alongside the existing fields.

Check if `agentId` is already in the request body construction (line ~151-159). If it is, just ensure the caller can set it. If not, add it.

- [ ] **Step 3: Update the insight page to pass agentId**

In `src/routes/insight/+page.svelte`, update the "Use Stitch" button handler to pass `agentId: 'setup'` when calling `conversation.sendMessage`.

- [ ] **Step 4: Verify in the API handler**

In `src/routes/api/ai/+server.ts`, confirm that `agentId` is read from the request body and used to select the setup prompt (from Task 5).

- [ ] **Step 5: Run type check**

Run: `bun run check`

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores/conversation.ts src/routes/insight/+page.svelte src/routes/api/ai/+server.ts
git commit -m "feat: wire agentId through conversation store for setup mode"
```

---

### Task 8: End-to-end testing and polish

**Files:**

- Various (bug fixes found during testing)

- [ ] **Step 1: Run full test suite**

Run: `bun run test:run`

Expected: All tests pass.

- [ ] **Step 2: Run type check**

Run: `bun run check`

Expected: 0 errors.

- [ ] **Step 3: Manual E2E test — Stitch path**

1. Start dev server: `bun run dev`
2. Log in as brand admin
3. Navigate to `/insight`
4. Verify checklist shows with correct incomplete sections
5. Click "Use Stitch"
6. Verify Stitch opens and starts the setup flow
7. Answer each question through Phase 1 (address, shipping, payments)
8. Verify data is saved (check `/organization/shipping`, `/organization/payments`)
9. Skip Phase 2 optional sections
10. Verify checklist updates on `/insight` after refreshing

- [ ] **Step 4: Manual E2E test — Manual path**

1. On `/insight`, click "Setup" next to Shipping
2. Verify it navigates to `/organization/shipping`
3. Make a change and save
4. Navigate back to `/insight`
5. Verify the shipping circle is now filled

- [ ] **Step 5: Manual E2E test — Resume flow**

1. Start Stitch setup, answer 2 questions, close the chat
2. Navigate away, come back to `/insight`
3. Click "Use Stitch" again
4. Verify Stitch picks up from where setup left off (skips completed steps)

- [ ] **Step 6: Commit any bug fixes**

```bash
git add -A
git commit -m "fix: address issues found during E2E testing"
```
