/**
 * This file tests trigger behavior (generate_order_number()), not row-level
 * security. It lives under tests/rls because tests/rls is the project's
 * only live-database test harness, and this bug can only be caught against
 * a real Postgres instance running the real trigger.
 *
 * Regression coverage: order_number was rendered as
 * LPAD(seq::TEXT, GREATEST(pad, 1), '0'). LPAD truncates when the target
 * width is shorter than the input, so with the default pad width of 0,
 * GREATEST(0, 1) resolved to a width of 1 and every sequence value past
 * single digits got truncated down to its first digit. Sequence 10
 * rendered as '1', colliding with sequence 1 on the global
 * orders_order_number_key unique constraint, and order creation broke
 * permanently for that organization from the 10th order onward. The fix
 * floors the pad width at LENGTH(seq::TEXT) so LPAD can only extend the
 * render, never truncate it.
 *
 * Uses the service-role client throughout: RLS is irrelevant to this
 * trigger. `created_by` on each throwaway order borrows a profile id from
 * the shared RLS fixture (loaded via loadPersonaIds); the organizations,
 * brands, and orders created here are otherwise entirely independent of
 * that fixture and are cleaned up unconditionally in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Order Numbering Test';

interface ThrowawayOrg {
	orgId: string;
	brandId: string;
}

const createdOrgIds: string[] = [];

beforeAll(loadPersonaIds);

afterAll(async () => {
	const admin = adminClient();

	if (createdOrgIds.length > 0) {
		const { error } = await admin.from('organizations').delete().in('id', createdOrgIds);
		if (error) {
			throw new Error(`order-numbering cleanup: organizations delete failed: ${error.message}`);
		}
	}

	// Verify nothing leaked, by name prefix rather than by the id list, so
	// a bug in id tracking above would still be caught.
	const { data: leaked, error: leakError } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if (leakError) {
		throw new Error(`order-numbering cleanup verification failed: ${leakError.message}`);
	}
	if ((leaked ?? []).length > 0) {
		throw new Error(
			`order-numbering cleanup left ${(leaked ?? []).length} organization(s) behind: ${JSON.stringify(leaked)}`
		);
	}
});

/**
 * Creates a throwaway `brand`-type organization. Inserting an organization
 * with org_type = 'brand' fires auto_create_self_brand, which creates a
 * matching row in `brands` with is_self_brand = true; that self brand is
 * what generate_order_number() resolves back to this organization through,
 * since org_type is not 'rep'.
 */
async function createThrowawayOrg(
	label: string,
	overrides: Partial<{
		order_number_pad_width: number;
		order_number_prefix: string;
		next_order_number: number;
	}> = {}
): Promise<ThrowawayOrg> {
	const admin = adminClient();
	const slug = `rls-order-numbering-${label}-${crypto.randomUUID().slice(0, 8)}`;

	const { data: org, error: orgError } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (${label})`,
			slug,
			org_type: 'brand',
			...overrides
		})
		.select('id')
		.single();
	if (orgError || !org) {
		throw new Error(`order-numbering fixture: organization insert failed: ${orgError?.message}`);
	}
	createdOrgIds.push(org.id as string);

	const { data: brand, error: brandError } = await admin
		.from('brands')
		.select('id')
		.eq('organization_id', org.id)
		.eq('is_self_brand', true)
		.single();
	if (brandError || !brand) {
		throw new Error(`order-numbering fixture: self brand lookup failed: ${brandError?.message}`);
	}

	return { orgId: org.id as string, brandId: brand.id as string };
}

/**
 * Inserts one order against the throwaway org's self brand and returns the
 * order_number the trigger generated. Uses freeform_name rather than
 * account_id, satisfying orders_account_or_freeform without needing an
 * account fixture, and leaves status at its 'draft' default, satisfying
 * orders_freeform_only_draft.
 */
async function insertOrder(org: ThrowawayOrg, label: string): Promise<string> {
	const admin = adminClient();
	const { data, error } = await admin
		.from('orders')
		.insert({
			organization_id: org.orgId,
			brand_id: org.brandId,
			freeform_name: `Order numbering test buyer (${label})`,
			created_by: PERSONA_IDS.repAAdmin!
		})
		.select('order_number')
		.single();
	if (error || !data) {
		throw new Error(`order-numbering fixture: order insert failed: ${error?.message}`);
	}
	return data.order_number as string;
}

describe('generate_order_number regression: sequence past 9', () => {
	it('walks the counter past 9 and renders distinct, correct numbers for 10 and 11', async () => {
		const org = await createThrowawayOrg('regression');

		// Genuinely walk the sequence rather than asserting on a synthetic
		// value. With the old GREATEST(_pad, 1) expression, order 10 would
		// render as '1' and collide with order 1 on orders_order_number_key,
		// throwing 23505 right here.
		for (let seq = 1; seq <= 11; seq++) {
			const orderNumber = await insertOrder(org, `seq-${seq}`);
			if (seq === 10) expect(orderNumber).toBe('10');
			if (seq === 11) expect(orderNumber).toBe('11');
		}
	});
});

describe('generate_order_number: padding and prefix still work', () => {
	it('pads to the configured width at sequence 10', async () => {
		const org = await createThrowawayOrg('padding', { order_number_pad_width: 5 });

		let orderNumber: string;
		for (let seq = 1; seq <= 10; seq++) {
			orderNumber = await insertOrder(org, `seq-${seq}`);
		}
		expect(orderNumber!).toBe('00010');
	});

	it('applies the configured prefix', async () => {
		const org = await createThrowawayOrg('prefix', { order_number_prefix: 'RLS-' });

		const orderNumber = await insertOrder(org, 'seq-1');
		expect(orderNumber).toBe('RLS-1');
	});

	it('never truncates when the sequence exceeds the pad width', async () => {
		const org = await createThrowawayOrg('overflow', { order_number_pad_width: 3 });

		// Jump the counter straight to 999 rather than inserting a thousand
		// rows. This still exercises the real trigger and its real
		// GREATEST(_pad, LENGTH(_seq::TEXT)) expression against a genuine
		// _seq value read back from the database; walking the counter one
		// insert at a time is already covered by the regression test above.
		const admin = adminClient();
		const { error } = await admin
			.from('organizations')
			.update({ next_order_number: 1000 })
			.eq('id', org.orgId);
		if (error) {
			throw new Error(`order-numbering fixture: counter jump failed: ${error.message}`);
		}

		const orderNumber = await insertOrder(org, 'seq-1000');
		expect(orderNumber).toBe('1000');
	});
});
