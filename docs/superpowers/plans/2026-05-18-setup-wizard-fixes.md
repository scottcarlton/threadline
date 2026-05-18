# Setup Wizard Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the brand onboarding setup wizard so every step works flawlessly — proper validation, theme-consistent UI, correct save logic, error feedback, forward/back navigation, and tests.

**Architecture:** The wizard is a step-form card rendered inside the AI dock (above the chat input) via `SetupQuestionCard.svelte`, driven by the `setupWizard` store. Each step posts to `/api/setup/save` which writes to the `organizations` table or `org_setup_status`. The completion engine in `setup-status.ts` is the source of truth for what's done. We fix the defects in each layer without changing the architecture.

**Tech Stack:** SvelteKit 5 (runes), Svelte stores, Zod v4, Bits UI primitives, svelte-sonner, Vitest, Supabase (supabaseAdmin)

---

### Task 1: Delete Dead Code

The abandoned `SetupWizard.svelte` (341 lines, untracked) duplicates step definitions and confuses reviewers. Remove it.

**Files:**

- Delete: `src/lib/components/setup/SetupWizard.svelte`

- [ ] **Step 1: Delete the file**

```bash
rm src/lib/components/setup/SetupWizard.svelte
```

- [ ] **Step 2: Verify no imports reference it**

```bash
grep -rn 'SetupWizard' src/ --include='*.svelte' --include='*.ts'
```

Expected: Only hits for `SetupQuestionCard` and `setup-wizard` store — no `SetupWizard.svelte` imports.

- [ ] **Step 3: Commit**

```bash
git add -A src/lib/components/setup/SetupWizard.svelte
git commit -m "chore: remove abandoned SetupWizard.svelte draft"
```

---

### Task 2: Add Zod Schema + Tests for Setup Save

The save endpoint takes raw `{ step, value }` with no validation. Add a Zod schema that validates each step's payload, and a `parseAddress` that uses structured fields instead of free-text comma-splitting.

**Files:**

- Create: `src/lib/schemas/setup-save.ts`
- Create: `src/lib/schemas/setup-save.test.ts`

- [ ] **Step 1: Write the schema**

Create `src/lib/schemas/setup-save.ts`:

```typescript
import { z } from 'zod';

const addressPayload = z.object({
	step: z.literal('address'),
	value: z.object({
		line1: z.string().trim().min(1, 'Address is required').max(255),
		line2: z.string().trim().max(255).default(''),
		city: z.string().trim().min(1, 'City is required').max(255),
		state: z.string().trim().min(1, 'State is required').max(64),
		zip: z.string().trim().min(1, 'ZIP is required').max(20),
		country: z.string().trim().length(2).default('US')
	})
});

const shipFromPayload = z.object({
	step: z.literal('ship-from'),
	value: z.enum(['yes', 'skip'])
});

const shippingDefaultPayload = z.object({
	step: z.literal('shipping-default'),
	value: z.union([z.literal('skip'), z.string().uuid('Must be a valid shipping method ID')])
});

const paymentMethodsPayload = z.object({
	step: z.literal('payment-methods'),
	value: z.union([
		z.literal('skip'),
		z.array(z.enum(['credit_card', 'ach', 'check', 'wire', 'other'])).min(1, 'Select at least one')
	])
});

const paymentTermsPayload = z.object({
	step: z.literal('payment-terms'),
	value: z.union([
		z.literal('skip'),
		z.enum(['net_15', 'net_30', 'net_60', 'net_90', 'cod', 'prepaid'])
	])
});

const gatewayPayload = z.object({
	step: z.enum(['orders', 'taxes', 'returns']),
	value: z.enum(['yes', 'skip'])
});

export const setupSaveSchema = z.discriminatedUnion('step', [
	addressPayload,
	shipFromPayload,
	shippingDefaultPayload,
	paymentMethodsPayload,
	paymentTermsPayload
]);

export const setupGatewaySchema = gatewayPayload;

export type SetupSaveInput = z.infer<typeof setupSaveSchema>;
export type SetupGatewayInput = z.infer<typeof setupGatewaySchema>;
```

- [ ] **Step 2: Write tests**

Create `src/lib/schemas/setup-save.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { setupSaveSchema, setupGatewaySchema } from './setup-save.js';

describe('setupSaveSchema', () => {
	it('validates address with structured fields', () => {
		const result = setupSaveSchema.safeParse({
			step: 'address',
			value: { line1: '123 Main St', city: 'New York', state: 'NY', zip: '10001' }
		});
		expect(result.success).toBe(true);
	});

	it('rejects address missing required fields', () => {
		const result = setupSaveSchema.safeParse({
			step: 'address',
			value: { line1: '', city: '', state: '', zip: '' }
		});
		expect(result.success).toBe(false);
	});

	it('defaults country to US', () => {
		const result = setupSaveSchema.safeParse({
			step: 'address',
			value: { line1: '123 Main', city: 'LA', state: 'CA', zip: '90001' }
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.value.country).toBe('US');
		}
	});

	it('validates ship-from yes/skip', () => {
		expect(setupSaveSchema.safeParse({ step: 'ship-from', value: 'yes' }).success).toBe(true);
		expect(setupSaveSchema.safeParse({ step: 'ship-from', value: 'skip' }).success).toBe(true);
		expect(setupSaveSchema.safeParse({ step: 'ship-from', value: 'maybe' }).success).toBe(false);
	});

	it('validates shipping-default requires UUID or skip', () => {
		expect(setupSaveSchema.safeParse({ step: 'shipping-default', value: 'skip' }).success).toBe(
			true
		);
		expect(
			setupSaveSchema.safeParse({
				step: 'shipping-default',
				value: '550e8400-e29b-41d4-a716-446655440000'
			}).success
		).toBe(true);
		expect(setupSaveSchema.safeParse({ step: 'shipping-default', value: 'Ground' }).success).toBe(
			false
		);
	});

	it('validates payment methods array', () => {
		const result = setupSaveSchema.safeParse({
			step: 'payment-methods',
			value: ['credit_card', 'ach']
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid payment method', () => {
		const result = setupSaveSchema.safeParse({
			step: 'payment-methods',
			value: ['bitcoin']
		});
		expect(result.success).toBe(false);
	});

	it('validates payment terms enum', () => {
		expect(setupSaveSchema.safeParse({ step: 'payment-terms', value: 'net_30' }).success).toBe(
			true
		);
		expect(setupSaveSchema.safeParse({ step: 'payment-terms', value: 'net_999' }).success).toBe(
			false
		);
	});
});

describe('setupGatewaySchema', () => {
	it('validates orders/taxes/returns with yes/skip', () => {
		expect(setupGatewaySchema.safeParse({ step: 'orders', value: 'yes' }).success).toBe(true);
		expect(setupGatewaySchema.safeParse({ step: 'taxes', value: 'skip' }).success).toBe(true);
		expect(setupGatewaySchema.safeParse({ step: 'returns', value: 'skip' }).success).toBe(true);
	});

	it('rejects unknown step', () => {
		expect(setupGatewaySchema.safeParse({ step: 'billing', value: 'skip' }).success).toBe(false);
	});
});
```

- [ ] **Step 3: Run tests**

```bash
bun run test:run
```

Expected: All tests pass including the new schema tests.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/setup-save.ts src/lib/schemas/setup-save.test.ts
git commit -m "feat: add Zod validation schema for setup save endpoint"
```

---

### Task 3: Rewrite the Save Endpoint

Replace the unvalidated save endpoint with one that uses the new Zod schema. Fix: address uses structured fields (not free-text parsing), shipping-default uses UUID (not fuzzy `ilike`), ship-from skip is a no-op (not incorrectly setting `shipping_use_business_address`), gateway "yes" steps record `completed` status.

**Files:**

- Modify: `src/routes/api/setup/save/+server.ts` (full rewrite)

- [ ] **Step 1: Rewrite the endpoint**

Replace `src/routes/api/setup/save/+server.ts` with:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { setupSaveSchema, setupGatewaySchema } from '$lib/schemas/setup-save.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.session || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const orgId = locals.organization.id;
	const raw = await request.json();

	// Try structured steps first, then gateway steps
	const parsed = setupSaveSchema.safeParse(raw);
	if (parsed.success) {
		return handleStructuredStep(orgId, parsed.data);
	}

	const gateway = setupGatewaySchema.safeParse(raw);
	if (gateway.success) {
		return handleGatewayStep(orgId, gateway.data);
	}

	return json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
};

async function handleStructuredStep(
	orgId: string,
	data: import('$lib/schemas/setup-save.js').SetupSaveInput
) {
	try {
		switch (data.step) {
			case 'address': {
				const v = data.value;
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						address_line1: v.line1,
						address_line2: v.line2,
						city: v.city,
						state: v.state,
						zip: v.zip,
						country: v.country,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}

			case 'ship-from': {
				if (data.value === 'yes') {
					const { error } = await supabaseAdmin
						.from('organizations')
						.update({
							shipping_use_business_address: true,
							updated_at: new Date().toISOString()
						})
						.eq('id', orgId);
					if (error) throw error;
				}
				// 'skip' is a no-op — don't set any flag
				break;
			}

			case 'shipping-default': {
				if (data.value === 'skip') break;
				// value is a UUID — exact match, no fuzzy lookup
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						default_shipping_method_id: data.value,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}

			case 'payment-methods': {
				if (data.value === 'skip') break;
				const methods = data.value;
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						accepted_payment_methods: methods,
						default_payment_method: methods[0],
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}

			case 'payment-terms': {
				if (data.value === 'skip') break;
				const { error } = await supabaseAdmin
					.from('organizations')
					.update({
						default_payment_terms: data.value,
						updated_at: new Date().toISOString()
					})
					.eq('id', orgId);
				if (error) throw error;
				break;
			}
		}

		return json({ success: true });
	} catch (err) {
		console.error(`[setup/save] step=${data.step}`, err);
		return json({ error: 'Save failed' }, { status: 500 });
	}
}

async function handleGatewayStep(
	orgId: string,
	data: import('$lib/schemas/setup-save.js').SetupGatewayInput
) {
	try {
		const status = data.value === 'yes' ? 'completed' : 'skipped';
		const { error } = await supabaseAdmin.from('org_setup_status').upsert(
			{
				organization_id: orgId,
				section: data.step,
				status,
				updated_at: new Date().toISOString()
			},
			{ onConflict: 'organization_id,section' }
		);
		if (error) throw error;
		return json({ success: true });
	} catch (err) {
		console.error(`[setup/save] gateway step=${data.step}`, err);
		return json({ error: 'Save failed' }, { status: 500 });
	}
}
```

- [ ] **Step 2: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 3: Run tests**

```bash
bun run test:run
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add src/routes/api/setup/save/+server.ts
git commit -m "fix: rewrite setup save endpoint with Zod validation, structured address, exact shipping lookup"
```

---

### Task 4: Fix the Setup Completion Engine

Two defects: (1) `orders` status only checks `skipped` — "yes" (now stored as `completed` in `org_setup_status`) should also mark it complete. (2) The `loadBrandInsight` products count query at line 899 is unscoped — it counts ALL products, not just the brand's.

**Files:**

- Modify: `src/lib/server/setup-status.ts:56-57`
- Modify: `src/routes/insight/+page.server.ts:899`
- Modify: `src/lib/server/setup-status.test.ts`

- [ ] **Step 1: Fix `deriveSetupStatus` — orders checks both skipped and completed**

In `src/lib/server/setup-status.ts`, change line 56:

```typescript
// Before:
orders: skipped.has('orders'),

// After:
orders: skipped.has('orders') || skipped.has('orders:completed'),
```

Wait — the `skippedSections` array comes from `org_setup_status` rows with status `skipped` or `completed`. We need to include completed rows in the lookup. The `getSetupStatus` query at line 100 already fetches both:

```typescript
.in('status', ['skipped', 'completed'])
```

So if a user answers "yes" to orders (which now upserts `status: 'completed'`), the section name `'orders'` will be in `skippedSections`. The field name `skippedSections` is misleading but the logic works. No code change needed here — the fix was in Task 3 (the endpoint now writes `status: 'completed'` for "yes" answers).

Rename `skippedSections` to `resolvedSections` for clarity. In `src/lib/server/setup-status.ts`:

Replace `skippedSections` with `resolvedSections` in:

- The `CountData` type (line 37)
- The `deriveSetupStatus` function (line 50)
- The `getSetupStatus` function (line 110)

```typescript
// CountData type — line 37
type CountData = {
	shippingMethodCount: number;
	productCount: number;
	accountCount: number;
	memberCount: number;
	resolvedSections: string[];
};

// deriveSetupStatus — line 50
const resolved = new Set(counts.resolvedSections);

// All references: skipped.has → resolved.has
orders: resolved.has('orders'),
taxes: resolved.has('taxes') || org.taxes_us_sales_tax_enabled || org.taxes_vat_enabled || org.taxes_gst_enabled,
returns: resolved.has('returns') || org.returns_window_days > 0,
members: counts.memberCount > 1 || resolved.has('members'),

// getSetupStatus — line 110
resolvedSections: (skipResult.data ?? []).map((r) => (r as { section: string }).section)
```

- [ ] **Step 2: Fix unscoped products query in `loadBrandInsight`**

In `src/routes/insight/+page.server.ts`, line 899, add the missing org scope:

```typescript
// Before:
admin.from('products').select('id', { count: 'exact', head: true }).eq('is_active', true),

// After:
admin.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', primaryOrgId).eq('is_active', true),
```

- [ ] **Step 3: Update tests**

In `src/lib/server/setup-status.test.ts`, rename all `skippedSections` to `resolvedSections`:

Search and replace `skippedSections` → `resolvedSections` throughout the file.

Also add a test for `orders` being marked complete when resolved (not just skipped):

```typescript
it('orders complete when resolved (skipped or completed)', () => {
	const status = deriveSetupStatus(baseOrg, {
		shippingMethodCount: 0,
		productCount: 0,
		accountCount: 0,
		memberCount: 1,
		resolvedSections: ['orders']
	});
	expect(status.orders).toBe(true);
});
```

- [ ] **Step 4: Run tests and type check**

```bash
bun run check && bun run test:run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/setup-status.ts src/lib/server/setup-status.test.ts src/routes/insight/+page.server.ts
git commit -m "fix: rename skippedSections to resolvedSections, scope products query to org, handle 'completed' gateway status"
```

---

### Task 5: Rewrite SetupQuestionCard with Bits UI + Theme Tokens

Replace raw `<input>` and `<button>` with Bits UI primitives (`Input`, `Button`, `Checkbox`). Replace hardcoded zinc colors with theme tokens. Add `>` forward arrow. Add toast feedback on save errors. Change address step to structured fields. Change shipping-default to pass method UUID instead of name.

**Files:**

- Modify: `src/lib/components/setup/SetupQuestionCard.svelte` (full rewrite)
- Modify: `src/lib/stores/setup-wizard.ts` (update `SetupStep` type for structured address + method IDs)

- [ ] **Step 1: Update the store type**

In `src/lib/stores/setup-wizard.ts`, update `SetupStep` to support structured address input and method IDs:

```typescript
import { writable } from 'svelte/store';

export type SetupStep = {
	id: string;
	question: string;
	type: 'address' | 'single' | 'multi' | 'yesno';
	options?: { label: string; value: string }[];
	skipLabel?: string;
};

type SetupWizardState = {
	active: boolean;
	steps: SetupStep[];
	currentIndex: number;
	answers: Record<string, unknown>;
};

function createSetupWizardStore() {
	const { subscribe, set, update } = writable<SetupWizardState>({
		active: false,
		steps: [],
		currentIndex: 0,
		answers: {}
	});

	return {
		subscribe,
		start(steps: SetupStep[]) {
			set({ active: true, steps, currentIndex: 0, answers: {} });
		},
		goBack() {
			update((s) => {
				if (s.currentIndex > 0) {
					return { ...s, currentIndex: s.currentIndex - 1 };
				}
				return s;
			});
		},
		goNext() {
			update((s) => {
				if (s.currentIndex < s.steps.length - 1) {
					return { ...s, currentIndex: s.currentIndex + 1 };
				}
				return s;
			});
		},
		saveAnswer(stepId: string, answer: unknown) {
			update((s) => {
				return { ...s, answers: { ...s.answers, [stepId]: answer } };
			});
		},
		close() {
			set({ active: false, steps: [], currentIndex: 0, answers: {} });
		}
	};
}

export const setupWizard = createSetupWizardStore();
```

- [ ] **Step 2: Rewrite SetupQuestionCard**

Replace `src/lib/components/setup/SetupQuestionCard.svelte`:

```svelte
<script lang="ts">
	import { setupWizard } from '$lib/stores/setup-wizard.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let wizard = $derived($setupWizard);
	let step = $derived(wizard.steps[wizard.currentIndex]);
	let isFirst = $derived(wizard.currentIndex === 0);
	let isLast = $derived(wizard.currentIndex === wizard.steps.length - 1);
	let total = $derived(wizard.steps.length);
	let current = $derived(wizard.currentIndex + 1);

	// Input state
	let selectedMulti = $state<string[]>([]);
	let saving = $state(false);

	// Address fields
	let addrLine1 = $state('');
	let addrLine2 = $state('');
	let addrCity = $state('');
	let addrState = $state('');
	let addrZip = $state('');

	$effect(() => {
		wizard.currentIndex;
		resetInputs();
	});

	function resetInputs() {
		selectedMulti = [];
		addrLine1 = '';
		addrLine2 = '';
		addrCity = '';
		addrState = '';
		addrZip = '';

		const saved = step ? wizard.answers[step.id] : undefined;
		if (saved && step) {
			if (step.type === 'multi') selectedMulti = [...(saved as string[])];
			if (step.type === 'address' && typeof saved === 'object' && saved !== null) {
				const a = saved as Record<string, string>;
				addrLine1 = a.line1 ?? '';
				addrLine2 = a.line2 ?? '';
				addrCity = a.city ?? '';
				addrState = a.state ?? '';
				addrZip = a.zip ?? '';
			}
		}
	}

	function toggleMulti(value: string) {
		if (selectedMulti.includes(value)) {
			selectedMulti = selectedMulti.filter((v) => v !== value);
		} else {
			selectedMulti = [...selectedMulti, value];
		}
	}

	async function save(answer: unknown) {
		if (!step || saving) return;
		const currentStepId = step.id;
		saving = true;

		try {
			const payload =
				currentStepId === 'address'
					? { step: currentStepId, value: answer }
					: { step: currentStepId, value: answer };

			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Save failed' }));
				toast.error(body.error ?? 'Something went wrong');
				saving = false;
				return;
			}
		} catch {
			toast.error('Network error — please try again');
			saving = false;
			return;
		}

		setupWizard.saveAnswer(currentStepId, answer);

		if (isLast) {
			setupWizard.close();
			await invalidateAll();
		} else {
			setupWizard.goNext();
		}
		saving = false;
	}

	function handleAddressSubmit() {
		if (!addrLine1.trim() || !addrCity.trim() || !addrState.trim() || !addrZip.trim()) return;
		save({
			line1: addrLine1.trim(),
			line2: addrLine2.trim(),
			city: addrCity.trim(),
			state: addrState.trim(),
			zip: addrZip.trim()
		});
	}
</script>

{#if step}
	<div>
		<!-- Header with nav -->
		<div class="mb-4 flex items-center justify-between">
			<p class="text-sm font-medium">{step.question}</p>
			<div class="flex items-center gap-2 text-sm text-muted-foreground">
				{#if !isFirst}
					<button
						onclick={() => setupWizard.goBack()}
						class="transition-colors hover:text-foreground"
						aria-label="Previous question">&lt;</button
					>
				{/if}
				<span>{current} of {total}</span>
				{#if !isLast}
					<button
						onclick={() => setupWizard.goNext()}
						class="transition-colors hover:text-foreground"
						aria-label="Next question">&gt;</button
					>
				{/if}
				<button
					onclick={() => setupWizard.close()}
					class="ml-1 transition-colors hover:text-foreground"
					aria-label="Close setup">&times;</button
				>
			</div>
		</div>

		<!-- Step content -->
		<div class="space-y-1.5">
			{#if step.type === 'address'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleAddressSubmit();
					}}
				>
					<div class="space-y-2">
						<Input bind:value={addrLine1} placeholder="Street address" />
						<Input bind:value={addrLine2} placeholder="Apt, suite, etc. (optional)" />
						<div class="grid grid-cols-[1fr_80px_100px] gap-2">
							<Input bind:value={addrCity} placeholder="City" />
							<Input bind:value={addrState} placeholder="State" />
							<Input bind:value={addrZip} placeholder="ZIP" />
						</div>
					</div>
					<div class="mt-3 flex justify-between">
						<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}
							>Skip</Button
						>
						<Button
							type="submit"
							size="sm"
							disabled={!addrLine1.trim() ||
								!addrCity.trim() ||
								!addrState.trim() ||
								!addrZip.trim() ||
								saving}
						>
							{saving ? 'Saving...' : 'Continue'}
						</Button>
					</div>
				</form>
			{:else if step.type === 'single'}
				{#each step.options ?? [] as option, i (option.value)}
					<button
						onclick={() => save(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-sm font-medium text-muted-foreground"
						>
							{i + 1}
						</span>
						<span class="text-sm">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex justify-end">
					<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}
						>Skip</Button
					>
				</div>
			{:else if step.type === 'multi'}
				{#each step.options ?? [] as option (option.value)}
					<button
						onclick={() => toggleMulti(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent {selectedMulti.includes(
							option.value
						)
							? 'border-primary bg-accent'
							: 'border-border'}"
					>
						<Checkbox checked={selectedMulti.includes(option.value)} />
						<span class="text-sm">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex items-center justify-between">
					<span class="text-sm text-muted-foreground">{selectedMulti.length} selected</span>
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}
							>Skip</Button
						>
						<Button
							size="sm"
							onclick={() => save(selectedMulti)}
							disabled={selectedMulti.length === 0 || saving}
						>
							{saving ? 'Saving...' : 'Continue'}
						</Button>
					</div>
				</div>
			{:else if step.type === 'yesno'}
				{#each [{ label: 'Yes', value: 'yes', idx: 1 }, { label: step.skipLabel ?? 'No, skip this', value: 'skip', idx: 2 }] as opt (opt.value)}
					<button
						onclick={() => save(opt.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-sm font-medium text-muted-foreground"
						>
							{opt.idx}
						</span>
						<span class="text-sm">{opt.label}</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}
```

- [ ] **Step 3: Run type check**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/setup-wizard.ts src/lib/components/setup/SetupQuestionCard.svelte
git commit -m "fix: rewrite SetupQuestionCard with Bits UI, theme tokens, structured address, error toasts, forward nav"
```

---

### Task 6: Update the Insight Page Step Builder

The `handleSetupWithStitch()` function in `insight/+page.svelte` builds steps to feed the wizard store. Update it to: (1) use `type: 'address'` for the address step, (2) pass shipping method UUIDs as option values instead of names, (3) remove the old `text` type references.

**Files:**

- Modify: `src/routes/insight/+page.svelte:507-605`

- [ ] **Step 1: Rewrite `handleSetupWithStitch`**

In `src/routes/insight/+page.svelte`, replace the `handleSetupWithStitch` function (lines 507–605):

```typescript
function handleSetupWithStitch() {
	const ss = data.setupStatus;
	const methods = data.shippingMethods ?? [];
	const steps: SetupStep[] = [];

	if (!ss?.address) {
		steps.push({
			id: 'address',
			question: "What's your business address?",
			type: 'address'
		});
	}
	if (!ss?.shipping) {
		steps.push({
			id: 'ship-from',
			question: 'Is the shipping address the same as the business address?',
			type: 'yesno'
		});
		if (methods.length > 0) {
			steps.push({
				id: 'shipping-default',
				question: 'Select a default shipping method',
				type: 'single',
				options: methods.map((m) => ({
					label: m.delivery_window ? `${m.name} — ${m.delivery_window}` : m.name,
					value: m.id
				}))
			});
		}
	}
	if (!ss?.payments) {
		steps.push({
			id: 'payment-methods',
			question: 'Which payment methods do you accept?',
			type: 'multi',
			options: [
				{ label: 'Credit Card', value: 'credit_card' },
				{ label: 'ACH / Bank Transfer', value: 'ach' },
				{ label: 'Check', value: 'check' },
				{ label: 'Wire Transfer', value: 'wire' },
				{ label: 'Other', value: 'other' }
			]
		});
		steps.push({
			id: 'payment-terms',
			question: 'What are your default payment terms?',
			type: 'single',
			options: [
				{ label: 'Net 15', value: 'net_15' },
				{ label: 'Net 30', value: 'net_30' },
				{ label: 'Net 60', value: 'net_60' },
				{ label: 'Net 90', value: 'net_90' },
				{ label: 'COD', value: 'cod' },
				{ label: 'Prepaid', value: 'prepaid' }
			]
		});
	}
	if (!ss?.orders) {
		steps.push({
			id: 'orders',
			question: 'Want to customize your order settings?',
			type: 'yesno',
			skipLabel: 'Use defaults'
		});
	}
	if (!ss?.taxes) {
		steps.push({
			id: 'taxes',
			question: 'Do you have any tax requirements?',
			type: 'yesno',
			skipLabel: 'No tax requirements'
		});
	}
	if (!ss?.returns) {
		steps.push({
			id: 'returns',
			question: 'Do you want to set up a return policy?',
			type: 'yesno',
			skipLabel: 'Skip for now'
		});
	}

	if (steps.length === 0) return;
	setupWizard.start(steps);
}
```

- [ ] **Step 2: Remove unused `text` type import from SetupStep if needed**

The `SetupStep` type no longer has `placeholder` or `text` type. Verify the import in `insight/+page.svelte` still works — it imports `type SetupStep` from the store, which was updated in Task 5.

- [ ] **Step 3: Run type check and verify**

```bash
bun run check
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/insight/+page.svelte
git commit -m "fix: update insight step builder — structured address, method UUIDs, remove text type"
```

---

### Task 7: Update Spec Documentation

The spec still describes a conversational AI flow. Update it to reflect the actual implementation: a scripted step form in the AI dock, no tokens spent.

**Files:**

- Modify: `docs/superpowers/specs/2026-05-17-stitch-onboarding-design.md`

- [ ] **Step 1: Add a note to the top of the spec**

After the `**Status:** Draft` line, add:

```markdown
**Implementation note:** The wizard is a scripted step-form rendered inside the AI dock — not a conversational AI flow. No AI tokens are consumed. The step form uses the same visual language as the dock (dark containers, numbered option buttons) but all questions and save logic are deterministic. The spec's original "Stitch walks through each section" language describes the UX feel, not the technical implementation.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-17-stitch-onboarding-design.md
git commit -m "docs: clarify spec — wizard is scripted step form, not conversational AI"
```

---

### Task 8: Verify End-to-End

Smoke-test the full flow in a browser to confirm everything works.

**Files:** None (manual verification)

- [ ] **Step 1: Start dev server**

```bash
bun run dev
```

- [ ] **Step 2: Navigate to /insight as a brand org admin with incomplete setup**

Verify:

- The setup checklist renders with correct completion states
- "Use Stitch" button opens the wizard in the AI dock
- Address step shows structured fields (line1, line2, city, state, zip)
- Shipping ship-from shows yes/no options
- Shipping default shows seeded methods with correct labels
- Payment methods shows multi-select checkboxes
- Payment terms shows single-select options
- Gateway steps (orders, taxes, returns) show yes/skip
- Skip button works on every step
- `<` and `>` arrows navigate between steps
- `×` closes the wizard
- After completing all steps, the checklist updates
- Error toast appears if a save fails (test by disconnecting network briefly)

- [ ] **Step 3: Run final checks**

```bash
bun run check && bun run test:run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit any final tweaks if needed**

---

### Task 9: Add Product Setup Steps to the Wizard

The Products system step gives the user two paths: upload a file (linesheet PDF or CSV via the dock's existing `+` attachment button) or add a product manually via a scripted step form. The manual path walks through the minimum fields needed to create one product.

**Files:**

- Modify: `src/lib/stores/setup-wizard.ts` — add `'navigate'` and `'product-manual'` step types
- Modify: `src/lib/components/setup/SetupQuestionCard.svelte` — render the new step types
- Modify: `src/routes/insight/+page.svelte` — add product steps to the step builder
- Modify: `src/lib/schemas/setup-save.ts` — add `product-manual` payload validation
- Modify: `src/routes/api/setup/save/+server.ts` — handle `product-manual` step (insert product + variant)

- [ ] **Step 1: Update SetupStep type for new step types**

In `src/lib/stores/setup-wizard.ts`, add `'navigate'` and `'product-manual'` to the type union:

```typescript
export type SetupStep = {
	id: string;
	question: string;
	type: 'address' | 'single' | 'multi' | 'yesno' | 'navigate' | 'product-manual';
	options?: { label: string; value: string }[];
	skipLabel?: string;
	description?: string;
};
```

- [ ] **Step 2: Add product-manual Zod schema**

In `src/lib/schemas/setup-save.ts`, add:

```typescript
const productManualPayload = z.object({
	step: z.literal('product-manual'),
	value: z.object({
		styleNumber: z.string().trim().min(1, 'Style number is required').max(100),
		name: z.string().trim().min(1, 'Name is required').max(255),
		wholesalePrice: z.coerce.number().min(0, 'Price must be 0 or more').max(99_999_999.99),
		retailPrice: z.coerce.number().min(0).max(99_999_999.99).optional(),
		category: z.string().trim().max(100).default(''),
		sizes: z.array(z.string().trim().min(1)).default([]),
		colors: z.array(z.string().trim().min(1)).default([])
	})
});
```

Add `productManualPayload` to the `setupSaveSchema` discriminated union.

- [ ] **Step 3: Add product-manual handler in save endpoint**

In `src/routes/api/setup/save/+server.ts`, add a case in `handleStructuredStep`:

```typescript
case 'product-manual': {
	const v = data.value;
	// Look up the brand org's self-brand
	const { data: brand } = await supabaseAdmin
		.from('brands')
		.select('id')
		.eq('organization_id', orgId)
		.eq('is_active', true)
		.limit(1)
		.single();

	if (!brand) {
		return json({ error: 'No brand found for this organization' }, { status: 400 });
	}

	const { data: product, error: prodErr } = await supabaseAdmin
		.from('products')
		.insert({
			organization_id: orgId,
			brand_id: brand.id,
			style_number: v.styleNumber,
			name: v.name,
			wholesale_price: v.wholesalePrice,
			retail_price: v.retailPrice ?? null,
			category: v.category || null,
			is_active: true
		})
		.select('id')
		.single();

	if (prodErr) throw prodErr;

	// Create variants from size × color matrix (or a single default variant)
	const sizes = v.sizes.length > 0 ? v.sizes : [null];
	const colors = v.colors.length > 0 ? v.colors : [null];
	const variants = [];
	for (const size of sizes) {
		for (const color of colors) {
			variants.push({
				product_id: product.id,
				size: size,
				color: color,
				is_active: true
			});
		}
	}

	if (variants.length > 0) {
		const { error: varErr } = await supabaseAdmin
			.from('product_variants')
			.insert(variants);
		if (varErr) throw varErr;
	}

	break;
}
```

- [ ] **Step 4: Add navigate and product-manual rendering in SetupQuestionCard**

In `src/lib/components/setup/SetupQuestionCard.svelte`, add cases for the new step types.

The `navigate` type presents a description and two options — one navigates away (e.g. "Upload a file" → user uses the dock's `+` button), the other advances to the manual step form.

The `product-manual` type renders fields: style number, name, wholesale price, retail price (optional), category, sizes (comma-separated text → array), colors (comma-separated text → array).

Add these state variables:

```typescript
// Product manual fields
let prodStyle = $state('');
let prodName = $state('');
let prodWholesale = $state('');
let prodRetail = $state('');
let prodCategory = $state('');
let prodSizes = $state('');
let prodColors = $state('');
```

Add reset logic in `resetInputs()`:

```typescript
prodStyle = '';
prodName = '';
prodWholesale = '';
prodRetail = '';
prodCategory = '';
prodSizes = '';
prodColors = '';
```

Add the template blocks:

```svelte
{:else if step.type === 'navigate'}
	{#if step.description}
		<p class="mb-3 text-sm text-muted-foreground">{step.description}</p>
	{/if}
	{#each step.options ?? [] as option, i (option.value)}
		<button
			onclick={() => {
				if (option.value.startsWith('/')) {
					// Navigation option — close wizard and go to page
					setupWizard.close();
					goto(option.value);
				} else {
					// Advance to next step (manual entry)
					save(option.value);
				}
			}}
			disabled={saving}
			class="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent"
		>
			<span class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-sm font-medium text-muted-foreground">
				{i + 1}
			</span>
			<span class="text-sm">{option.label}</span>
		</button>
	{/each}
	<div class="mt-2 flex justify-end">
		<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}>Skip</Button>
	</div>

{:else if step.type === 'product-manual'}
	<form onsubmit={(e) => { e.preventDefault(); handleProductSubmit(); }}>
		<div class="space-y-2">
			<Input bind:value={prodStyle} placeholder="Style number / SKU" />
			<Input bind:value={prodName} placeholder="Product name" />
			<div class="grid grid-cols-2 gap-2">
				<Input bind:value={prodWholesale} placeholder="Wholesale price" type="number" />
				<Input bind:value={prodRetail} placeholder="Retail price (optional)" type="number" />
			</div>
			<Input bind:value={prodCategory} placeholder="Category (e.g. Tops, Bottoms)" />
			<Input bind:value={prodSizes} placeholder="Sizes — e.g. S, M, L, XL" />
			<Input bind:value={prodColors} placeholder="Colors — e.g. Black, Navy, White" />
		</div>
		<div class="mt-3 flex justify-between">
			<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}>Skip</Button>
			<Button type="submit" size="sm" disabled={!prodStyle.trim() || !prodName.trim() || !prodWholesale.trim() || saving}>
				{saving ? 'Saving...' : 'Add Product'}
			</Button>
		</div>
	</form>
```

Add the submit handler:

```typescript
function handleProductSubmit() {
	if (!prodStyle.trim() || !prodName.trim() || !prodWholesale.trim()) return;
	save({
		styleNumber: prodStyle.trim(),
		name: prodName.trim(),
		wholesalePrice: parseFloat(prodWholesale),
		retailPrice: prodRetail.trim() ? parseFloat(prodRetail) : undefined,
		category: prodCategory.trim(),
		sizes: prodSizes
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		colors: prodColors
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	});
}
```

Add `goto` import at the top:

```typescript
import { goto } from '$app/navigation';
```

- [ ] **Step 5: Add product steps to the insight page step builder**

In `src/routes/insight/+page.svelte`, in `handleSetupWithStitch()`, after the returns step, add:

```typescript
if (!ss?.products) {
	steps.push({
		id: 'products-choose',
		question: 'Add your first product',
		type: 'navigate',
		description:
			'Upload a linesheet (PDF) or CSV using the + button below, or add a product manually.',
		options: [
			{ label: 'Add manually', value: 'manual' },
			{ label: 'Go to Products page', value: '/products' }
		]
	});
	steps.push({
		id: 'product-manual',
		question: 'Add a product',
		type: 'product-manual'
	});
}
```

Note: The `products-choose` step with value `'manual'` advances to the next step (`product-manual`). The `'Go to Products page'` option navigates away where they can use the full import flow.

- [ ] **Step 6: Add schema test for product-manual**

In `src/lib/schemas/setup-save.test.ts`, add:

```typescript
it('validates product-manual with required fields', () => {
	const result = setupSaveSchema.safeParse({
		step: 'product-manual',
		value: {
			styleNumber: 'ST-001',
			name: 'Classic Tee',
			wholesalePrice: 24.5
		}
	});
	expect(result.success).toBe(true);
});

it('rejects product-manual missing name', () => {
	const result = setupSaveSchema.safeParse({
		step: 'product-manual',
		value: {
			styleNumber: 'ST-001',
			name: '',
			wholesalePrice: 24.5
		}
	});
	expect(result.success).toBe(false);
});
```

- [ ] **Step 7: Run checks and commit**

```bash
bun run check && bun run test:run
```

```bash
git add src/lib/stores/setup-wizard.ts src/lib/components/setup/SetupQuestionCard.svelte src/routes/insight/+page.svelte src/lib/schemas/setup-save.ts src/lib/schemas/setup-save.test.ts src/routes/api/setup/save/+server.ts
git commit -m "feat: add product setup steps — manual creation + navigate to import"
```

---

### Task 10: Add Account Setup Steps to the Wizard

Same pattern as products. User can upload a CSV or add an account manually. Manual path walks through business name, contact name, email, phone, city, state.

**Files:**

- Modify: `src/lib/stores/setup-wizard.ts` — add `'account-manual'` step type
- Modify: `src/lib/components/setup/SetupQuestionCard.svelte` — render account form
- Modify: `src/routes/insight/+page.svelte` — add account steps
- Modify: `src/lib/schemas/setup-save.ts` — add `account-manual` payload
- Modify: `src/routes/api/setup/save/+server.ts` — handle account creation

- [ ] **Step 1: Add account-manual Zod schema**

In `src/lib/schemas/setup-save.ts`, add:

```typescript
const accountManualPayload = z.object({
	step: z.literal('account-manual'),
	value: z.object({
		businessName: z.string().trim().min(1, 'Business name is required').max(255),
		contactName: z.string().trim().max(255).default(''),
		contactEmail: z.union([z.literal(''), z.string().trim().email()]).default(''),
		contactPhone: z.string().trim().max(20).default(''),
		city: z.string().trim().max(255).default(''),
		state: z.string().trim().max(64).default('')
	})
});
```

Add to the discriminated union.

- [ ] **Step 2: Add account-manual handler in save endpoint**

```typescript
case 'account-manual': {
	const v = data.value;
	const { error: accErr } = await supabaseAdmin
		.from('accounts')
		.insert({
			organization_id: orgId,
			business_name: v.businessName,
			contact_name: v.contactName || null,
			contact_email: v.contactEmail || null,
			contact_phone: v.contactPhone || null,
			city: v.city || null,
			state: v.state || null,
			is_active: true
		});
	if (accErr) throw accErr;
	break;
}
```

- [ ] **Step 3: Add account-manual rendering in SetupQuestionCard**

Add state variables:

```typescript
let acctBizName = $state('');
let acctContact = $state('');
let acctEmail = $state('');
let acctPhone = $state('');
let acctCity = $state('');
let acctState = $state('');
```

Reset in `resetInputs()`. Add template block:

```svelte
{:else if step.type === 'account-manual'}
	<form onsubmit={(e) => { e.preventDefault(); handleAccountSubmit(); }}>
		<div class="space-y-2">
			<Input bind:value={acctBizName} placeholder="Business name" />
			<Input bind:value={acctContact} placeholder="Contact name (optional)" />
			<div class="grid grid-cols-2 gap-2">
				<Input bind:value={acctEmail} placeholder="Email (optional)" />
				<Input bind:value={acctPhone} placeholder="Phone (optional)" />
			</div>
			<div class="grid grid-cols-2 gap-2">
				<Input bind:value={acctCity} placeholder="City (optional)" />
				<Input bind:value={acctState} placeholder="State (optional)" />
			</div>
		</div>
		<div class="mt-3 flex justify-between">
			<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}>Skip</Button>
			<Button type="submit" size="sm" disabled={!acctBizName.trim() || saving}>
				{saving ? 'Saving...' : 'Add Account'}
			</Button>
		</div>
	</form>
```

Add handler:

```typescript
function handleAccountSubmit() {
	if (!acctBizName.trim()) return;
	save({
		businessName: acctBizName.trim(),
		contactName: acctContact.trim(),
		contactEmail: acctEmail.trim(),
		contactPhone: acctPhone.trim(),
		city: acctCity.trim(),
		state: acctState.trim()
	});
}
```

- [ ] **Step 4: Add account steps to insight step builder**

```typescript
if (!ss?.accounts) {
	steps.push({
		id: 'accounts-choose',
		question: 'Add your first buyer account',
		type: 'navigate',
		description: 'Upload a CSV using the + button below, or add an account manually.',
		options: [
			{ label: 'Add manually', value: 'manual' },
			{ label: 'Go to Accounts page', value: '/accounts' }
		]
	});
	steps.push({
		id: 'account-manual',
		question: 'Add a buyer account',
		type: 'account-manual'
	});
}
```

- [ ] **Step 5: Add schema tests**

```typescript
it('validates account-manual with required fields', () => {
	const result = setupSaveSchema.safeParse({
		step: 'account-manual',
		value: { businessName: 'Nordstrom' }
	});
	expect(result.success).toBe(true);
});

it('rejects account-manual with empty business name', () => {
	const result = setupSaveSchema.safeParse({
		step: 'account-manual',
		value: { businessName: '' }
	});
	expect(result.success).toBe(false);
});
```

- [ ] **Step 6: Run checks and commit**

```bash
bun run check && bun run test:run
```

```bash
git add src/lib/stores/setup-wizard.ts src/lib/components/setup/SetupQuestionCard.svelte src/routes/insight/+page.svelte src/lib/schemas/setup-save.ts src/lib/schemas/setup-save.test.ts src/routes/api/setup/save/+server.ts
git commit -m "feat: add account setup steps — manual creation + navigate to import"
```

---

### Task 11: Add Members/Partners Setup Steps to the Wizard

Members and Partners are two separate paths. The wizard first asks "Add a team member or connect a rep partner?" Then steps through the relevant flow.

**Members path:** email → role (admin/member/sales/guest) → if sales: commission rate → invite sent.

**Partners path:** email → generate invite link → display link for sharing.

**Files:**

- Modify: `src/lib/stores/setup-wizard.ts` — add `'member-invite'` and `'partner-invite'` step types
- Modify: `src/lib/components/setup/SetupQuestionCard.svelte` — render invite forms
- Modify: `src/routes/insight/+page.svelte` — add member/partner steps
- Modify: `src/lib/schemas/setup-save.ts` — add invite payload validations
- Modify: `src/routes/api/setup/save/+server.ts` — handle invite sends

- [ ] **Step 1: Add invite Zod schemas**

In `src/lib/schemas/setup-save.ts`, add:

```typescript
const memberInvitePayload = z.object({
	step: z.literal('member-invite'),
	value: z.object({
		email: z.string().trim().email('Valid email required'),
		role: z.enum(['admin', 'member', 'sales', 'guest']),
		commissionRate: z.coerce.number().min(0).max(100).optional()
	})
});

const partnerInvitePayload = z.object({
	step: z.literal('partner-invite'),
	value: z.object({
		email: z.string().trim().email('Valid email required')
	})
});
```

Add both to the discriminated union.

- [ ] **Step 2: Add invite handlers in save endpoint**

For `member-invite`, call the existing `/api/invite/send` logic (or replicate the core: create invitation row, send email). For `partner-invite`, call the partner invite logic (create `org_connections` pending row + send invite email).

```typescript
case 'member-invite': {
	const v = data.value;
	const token = crypto.randomUUID();
	const { error: invErr } = await supabaseAdmin
		.from('invitations')
		.insert({
			organization_id: orgId,
			email: v.email,
			role: v.role,
			token,
			commission_rate: v.role === 'sales' ? (v.commissionRate ?? 0) : 0,
			invited_by: locals.user!.id
		});
	if (invErr) throw invErr;

	// Send invite email (best-effort, don't fail the step)
	try {
		await sendEmail({
			to: v.email,
			...inviteParams({
				orgName: locals.organization!.name,
				token,
				baseUrl: new URL(request.url).origin
			})
		});
	} catch (emailErr) {
		console.error('[setup/save] invite email failed:', emailErr);
	}
	break;
}

case 'partner-invite': {
	const v = data.value;
	// Check if connection already exists
	const { data: existing } = await supabaseAdmin
		.from('org_connections')
		.select('id')
		.eq('brand_org_id', orgId)
		.eq('rep_email', v.email)
		.maybeSingle();

	if (!existing) {
		const { error: connErr } = await supabaseAdmin
			.from('org_connections')
			.insert({
				brand_org_id: orgId,
				rep_email: v.email,
				status: 'pending',
				invited_by: locals.user!.id
			});
		if (connErr) throw connErr;
	}

	// Send partner invite email (best-effort)
	try {
		await sendEmail({
			to: v.email,
			subject: `${locals.organization!.name} wants to connect on Threadline`,
			text: `You've been invited to connect as a sales rep partner. Sign up or log in at ${new URL(request.url).origin}/connect`
		});
	} catch (emailErr) {
		console.error('[setup/save] partner invite email failed:', emailErr);
	}
	break;
}
```

Note: The `locals` and `request` references above need to be passed into the handler. Refactor `handleStructuredStep` to accept the full request context. The exact column names for `org_connections` and `invitations` must be verified against the actual schema before implementation — do NOT assume.

- [ ] **Step 3: Add member/partner rendering in SetupQuestionCard**

Add state variables:

```typescript
let inviteEmail = $state('');
let inviteRole = $state<'admin' | 'member' | 'sales' | 'guest'>('member');
let inviteCommission = $state('10');
let inviteSent = $state(false);
```

Add template blocks:

```svelte
{:else if step.type === 'member-invite'}
	{#if inviteSent}
		<div class="text-center">
			<p class="text-sm font-medium">Invite sent!</p>
			<p class="mt-1 text-sm text-muted-foreground">Add another or continue.</p>
			<div class="mt-3 flex justify-center gap-2">
				<Button variant="outline" size="sm" onclick={() => { inviteSent = false; inviteEmail = ''; }}>Add another</Button>
				<Button size="sm" onclick={() => { inviteSent = false; save('done'); }}>Continue</Button>
			</div>
		</div>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handleMemberInvite(); }}>
			<div class="space-y-2">
				<Input bind:value={inviteEmail} placeholder="Email address" type="email" />
				<div class="flex gap-2">
					{#each ['admin', 'member', 'sales', 'guest'] as role (role)}
						<button
							type="button"
							onclick={() => { inviteRole = role as typeof inviteRole; }}
							class="rounded-lg border px-3 py-1.5 text-sm transition-colors {inviteRole === role ? 'border-primary bg-accent' : 'border-border'}"
						>
							{role.charAt(0).toUpperCase() + role.slice(1)}
						</button>
					{/each}
				</div>
				{#if inviteRole === 'sales'}
					<Input bind:value={inviteCommission} placeholder="Commission rate (%)" type="number" />
				{/if}
			</div>
			<div class="mt-3 flex justify-between">
				<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}>Skip</Button>
				<Button type="submit" size="sm" disabled={!inviteEmail.trim() || saving}>
					{saving ? 'Sending...' : 'Send Invite'}
				</Button>
			</div>
		</form>
	{/if}

{:else if step.type === 'partner-invite'}
	{#if inviteSent}
		<div class="text-center">
			<p class="text-sm font-medium">Partner invite sent!</p>
			<p class="mt-1 text-sm text-muted-foreground">Add another or continue.</p>
			<div class="mt-3 flex justify-center gap-2">
				<Button variant="outline" size="sm" onclick={() => { inviteSent = false; inviteEmail = ''; }}>Add another</Button>
				<Button size="sm" onclick={() => { inviteSent = false; save('done'); }}>Continue</Button>
			</div>
		</div>
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handlePartnerInvite(); }}>
			<div class="space-y-2">
				<Input bind:value={inviteEmail} placeholder="Rep's email address" type="email" />
			</div>
			<div class="mt-3 flex justify-between">
				<Button variant="outline" size="sm" onclick={() => save('skip')} disabled={saving}>Skip</Button>
				<Button type="submit" size="sm" disabled={!inviteEmail.trim() || saving}>
					{saving ? 'Sending...' : 'Send Invite'}
				</Button>
			</div>
		</form>
	{/if}
```

Add handlers:

```typescript
async function handleMemberInvite() {
	if (!inviteEmail.trim()) return;
	await save({
		email: inviteEmail.trim(),
		role: inviteRole,
		commissionRate: inviteRole === 'sales' ? parseFloat(inviteCommission) : undefined
	});
	inviteSent = true;
}

async function handlePartnerInvite() {
	if (!inviteEmail.trim()) return;
	await save({ email: inviteEmail.trim() });
	inviteSent = true;
}
```

Note: The `save` function for invite steps should NOT advance to the next step automatically — the user may want to add more. The `inviteSent` state shows "Add another" or "Continue". Override the `save` behavior for these steps: don't call `goNext()` after saving — instead set `inviteSent = true`. The "Continue" button calls `save('done')` which advances.

- [ ] **Step 4: Add member/partner steps to insight step builder**

```typescript
if (!ss?.members) {
	steps.push({
		id: 'members-choose',
		question: 'Add your team',
		type: 'navigate',
		description: 'Invite team members or connect with independent sales rep partners.',
		options: [
			{ label: 'Invite a team member', value: 'member' },
			{ label: 'Connect a rep partner', value: 'partner' },
			{ label: 'Go to Members page', value: '/organization/members' }
		]
	});
	steps.push({
		id: 'member-invite',
		question: 'Invite a team member',
		type: 'member-invite'
	});
	steps.push({
		id: 'partner-invite',
		question: 'Connect a rep partner',
		type: 'partner-invite'
	});
}
```

Note: The `members-choose` step with value `'member'` advances to `member-invite`; value `'partner'` should skip to `partner-invite` (2 steps ahead). This requires the `navigate` handler to support jumping to a specific step by ID rather than just advancing by one. Update the navigate handler to look up the target step:

```typescript
// In the navigate option click handler:
if (option.value === 'member') {
	setupWizard.goNext(); // advances to member-invite
} else if (option.value === 'partner') {
	// Skip member-invite, go to partner-invite
	setupWizard.goNext();
	setupWizard.goNext();
}
```

Or add a `goToStep(id: string)` method to the store for cleaner navigation.

- [ ] **Step 5: Add schema tests**

```typescript
it('validates member-invite', () => {
	const result = setupSaveSchema.safeParse({
		step: 'member-invite',
		value: { email: 'rep@example.com', role: 'sales', commissionRate: 12 }
	});
	expect(result.success).toBe(true);
});

it('validates partner-invite', () => {
	const result = setupSaveSchema.safeParse({
		step: 'partner-invite',
		value: { email: 'partner@agency.com' }
	});
	expect(result.success).toBe(true);
});

it('rejects member-invite with invalid role', () => {
	const result = setupSaveSchema.safeParse({
		step: 'member-invite',
		value: { email: 'x@y.com', role: 'superadmin' }
	});
	expect(result.success).toBe(false);
});
```

- [ ] **Step 6: Verify column names for invite and connection tables**

Before implementing, verify the actual column names:

```bash
grep -n 'create table invitations\|create table org_connections' supabase/migrations/*.sql
```

Read those migrations to confirm exact column names. The handler code in Step 2 MUST match the real schema — do NOT assume.

- [ ] **Step 7: Run checks and commit**

```bash
bun run check && bun run test:run
```

```bash
git add src/lib/stores/setup-wizard.ts src/lib/components/setup/SetupQuestionCard.svelte src/routes/insight/+page.svelte src/lib/schemas/setup-save.ts src/lib/schemas/setup-save.test.ts src/routes/api/setup/save/+server.ts
git commit -m "feat: add member/partner invite setup steps"
```

---

### Task 12: Full End-to-End Verification

Test the complete wizard flow — Settings AND System — in a browser.

**Files:** None (manual verification)

- [ ] **Step 1: Start dev server**

```bash
bun run dev
```

- [ ] **Step 2: Test as a brand org admin with nothing set up**

Walk through every step:

1. Address → enter structured address → verify saved to `organizations`
2. Ship-from → "Yes" → verify `shipping_use_business_address` set
3. Shipping default → select a method → verify `default_shipping_method_id` set by UUID
4. Payment methods → select credit_card + ach → verify `accepted_payment_methods` array
5. Payment terms → select net_30 → verify `default_payment_terms`
6. Orders → "Use defaults" → verify `org_setup_status` row with `skipped`
7. Taxes → "No tax requirements" → verify `org_setup_status` row
8. Returns → "Skip for now" → verify `org_setup_status` row
9. Products choose → "Add manually" → advances to product form
10. Product manual → enter style/name/price → verify product created in `products` table
11. Accounts choose → "Add manually" → advances to account form
12. Account manual → enter business name → verify account created in `accounts` table
13. Members choose → "Invite a team member" → advances to member invite
14. Member invite → enter email + role → verify invitation created, "Add another" shows
15. Click "Continue" → wizard closes
16. Checklist on /insight shows all sections complete

- [ ] **Step 3: Test navigation options**

- Products "Go to Products page" → navigates to /products, wizard closes
- Accounts "Go to Accounts page" → navigates to /accounts, wizard closes
- Members "Go to Members page" → navigates to /organization/members, wizard closes
- Members "Connect a rep partner" → skips to partner invite step

- [ ] **Step 4: Test skip on every step**

Walk through again, skip every single step. Verify:

- Settings steps that are skipped leave org fields unchanged
- Gateway steps (orders/taxes/returns) create `org_setup_status` rows with `skipped`
- System steps (products/accounts/members) create `org_setup_status` rows with `skipped`
- Wizard completes without errors

- [ ] **Step 5: Test back/forward navigation**

- Arrow keys work on every step
- Going back restores previously entered values
- Going forward doesn't auto-submit

- [ ] **Step 6: Test error handling**

- Disconnect network → submit → toast error appears
- Submit invalid data → error toast, form stays open

- [ ] **Step 7: Run final checks**

```bash
bun run check && bun run test:run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 8: Final commit if any tweaks needed**

---

## File Map Summary

| File                                                            | Action  | Purpose                                                                              |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `src/lib/components/setup/SetupWizard.svelte`                   | Delete  | Dead code                                                                            |
| `src/lib/schemas/setup-save.ts`                                 | Create  | Zod validation for all setup save payloads                                           |
| `src/lib/schemas/setup-save.test.ts`                            | Create  | Tests for save schema                                                                |
| `src/routes/api/setup/save/+server.ts`                          | Rewrite | Validated saves, structured address, exact shipping, product/account/invite creation |
| `src/lib/server/setup-status.ts`                                | Modify  | Rename skippedSections → resolvedSections                                            |
| `src/lib/server/setup-status.test.ts`                           | Modify  | Update tests for rename + add orders test                                            |
| `src/routes/insight/+page.server.ts`                            | Modify  | Scope products query to org                                                          |
| `src/lib/stores/setup-wizard.ts`                                | Modify  | Add navigate, product-manual, account-manual, member-invite, partner-invite types    |
| `src/lib/components/setup/SetupQuestionCard.svelte`             | Rewrite | Bits UI, theme tokens, all step types, toasts, nav, invite loop                      |
| `src/routes/insight/+page.svelte`                               | Modify  | Full step builder — Settings + System                                                |
| `docs/superpowers/specs/2026-05-17-stitch-onboarding-design.md` | Modify  | Clarify implementation approach                                                      |
