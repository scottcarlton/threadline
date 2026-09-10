/**
 * This file tests trigger behavior (generate_expense_number()), not row-
 * level security. It lives under tests/rls because tests/rls is the
 * project's only live-database test harness, and these bugs can only be
 * caught against a real Postgres instance running the real trigger.
 *
 * Regression coverage, two bugs:
 *
 * Bug 1 -- the sequence was derived from COUNT(*) + 1 over brand_expenses
 * for the org. brand_expenses has an admin/owner DELETE policy, so
 * deleting any expense that is not the most recently created one drops
 * the count while the highest expense_number already issued does not
 * change. The next insert then recomputes a sequence value that is
 * still in use and collides with a live row on the unique constraint.
 * This is reachable by ordinary use: create three expenses, delete the
 * middle one, create a fourth.
 *
 * Bug 2 -- the discriminator embedded in expense_number was
 * UPPER(LEFT(org_slug, 3)), but the uniqueness constraint on
 * expense_number was global rather than scoped to organization_id. Two
 * organizations whose slugs share their first three characters collide
 * once their counters reach the same sequence value.
 *
 * The fix replaces the COUNT(*) generator with a per-organization stored
 * counter (organizations.next_expense_number, incremented via
 * UPDATE ... RETURNING, mirroring generate_order_number()) and rescopes
 * the unique constraint to (organization_id, expense_number).
 *
 * Uses the service-role client throughout: RLS is irrelevant to this
 * trigger. `submitted_by` on each throwaway expense borrows a profile id
 * from the shared RLS fixture (loaded via loadPersonaIds); the
 * organizations, brands, and expenses created here are otherwise
 * entirely independent of that fixture and are cleaned up
 * unconditionally in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminClient } from './setup/clients.js';
import { loadPersonaIds, PERSONA_IDS } from './setup/fixture.js';

const NAME_PREFIX = 'RLS Expense Numbering Test';

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
			throw new Error(`expense-numbering cleanup: organizations delete failed: ${error.message}`);
		}
	}

	// Verify nothing leaked, by name prefix rather than by the id list, so
	// a bug in id tracking above would still be caught.
	const { data: leaked, error: leakError } = await admin
		.from('organizations')
		.select('id')
		.like('name', `${NAME_PREFIX}%`);
	if (leakError) {
		throw new Error(`expense-numbering cleanup verification failed: ${leakError.message}`);
	}
	if ((leaked ?? []).length > 0) {
		throw new Error(
			`expense-numbering cleanup left ${(leaked ?? []).length} organization(s) behind: ${JSON.stringify(leaked)}`
		);
	}
});

/**
 * Creates a throwaway `brand`-type organization with a given slug.
 * Inserting an organization with org_type = 'brand' fires
 * auto_create_self_brand, which creates a matching row in `brands` with
 * is_self_brand = true; that self brand is what expenses are attached to
 * below, and generate_expense_number() reads the slug straight off
 * `organizations` via NEW.organization_id, independent of the brand.
 */
async function createThrowawayOrg(label: string, slug: string): Promise<ThrowawayOrg> {
	const admin = adminClient();

	const { data: org, error: orgError } = await admin
		.from('organizations')
		.insert({
			name: `${NAME_PREFIX} (${label})`,
			slug,
			org_type: 'brand'
		})
		.select('id')
		.single();
	if (orgError || !org) {
		throw new Error(`expense-numbering fixture: organization insert failed: ${orgError?.message}`);
	}
	createdOrgIds.push(org.id as string);

	const { data: brand, error: brandError } = await admin
		.from('brands')
		.select('id')
		.eq('organization_id', org.id)
		.eq('is_self_brand', true)
		.single();
	if (brandError || !brand) {
		throw new Error(`expense-numbering fixture: self brand lookup failed: ${brandError?.message}`);
	}

	return { orgId: org.id as string, brandId: brand.id as string };
}

/** Inserts one expense and returns its id and generated expense_number. */
async function insertExpense(
	org: ThrowawayOrg,
	label: string
): Promise<{ id: string; expenseNumber: string }> {
	const admin = adminClient();
	const { data, error } = await admin
		.from('brand_expenses')
		.insert({
			organization_id: org.orgId,
			brand_id: org.brandId,
			description: `Expense numbering test (${label})`,
			amount: 12.34,
			submitted_by: PERSONA_IDS.repAAdmin!
		})
		.select('id, expense_number')
		.single();
	if (error || !data) {
		throw new Error(`expense-numbering fixture: expense insert failed: ${error?.message}`);
	}
	return { id: data.id as string, expenseNumber: data.expense_number as string };
}

describe('generate_expense_number regression: deletion does not cause number reuse', () => {
	it('does not reuse a live expense_number after deleting a non-last expense', async () => {
		const slug = `expnum-del-${crypto.randomUUID().slice(0, 8)}`;
		const org = await createThrowawayOrg('deletion', slug);

		const first = await insertExpense(org, 'first');
		const second = await insertExpense(org, 'second');
		const third = await insertExpense(org, 'third');

		const issuedNumbers = [first.expenseNumber, second.expenseNumber, third.expenseNumber];
		// Sanity: the happy path itself must produce distinct numbers before
		// the deletion is even introduced.
		expect(new Set(issuedNumbers).size).toBe(3);

		// Delete the middle expense -- not the most recently created one.
		// Under the old COUNT(*) + 1 generator this drops the row count back
		// to 2, so the next insert recomputes sequence 3 again and collides
		// with `third`, which is still live. This is the exact reproduction
		// from the bug report.
		const admin = adminClient();
		const { error: deleteError } = await admin.from('brand_expenses').delete().eq('id', second.id);
		if (deleteError) {
			throw new Error(`expense-numbering test: delete failed: ${deleteError.message}`);
		}

		const fourth = await insertExpense(org, 'fourth');

		// Bug 1's regression: the insert above must succeed at all (a
		// duplicate-key 23505 would have thrown out of insertExpense already),
		// and its number must be fresh, not a reused, still-live one.
		expect(issuedNumbers).not.toContain(fourth.expenseNumber);
	});
});

describe('generate_expense_number regression: two orgs with colliding slug prefixes', () => {
	it('lets two organizations whose slugs share their first three characters create expenses independently', async () => {
		const suffix = crypto.randomUUID().slice(0, 8);
		// Both slugs share the first three characters ("exp"), which is
		// exactly what UPPER(LEFT(org_slug, 3)) collapses both orgs into
		// under the old global UNIQUE(expense_number) constraint.
		const orgOne = await createThrowawayOrg('collide-1', `expqqq-one-${suffix}`);
		const orgTwo = await createThrowawayOrg('collide-2', `expzzz-two-${suffix}`);

		const oneFirst = await insertExpense(orgOne, 'one-first');
		const twoFirst = await insertExpense(orgTwo, 'two-first');

		// Both orgs' first expense lands on sequence 1 with the same "EXP"
		// discriminator, so the rendered numbers are identical strings.
		// Under the old global constraint the second insert above would have
		// thrown 23505 before this assertion ever ran.
		expect(oneFirst.expenseNumber).toBe(twoFirst.expenseNumber);

		// Walk a second round to confirm the two orgs' counters are
		// independent, not just that the first insert on each happened to
		// succeed.
		const oneSecond = await insertExpense(orgOne, 'one-second');
		const twoSecond = await insertExpense(orgTwo, 'two-second');
		expect(oneSecond.expenseNumber).toBe(twoSecond.expenseNumber);
		expect(oneSecond.expenseNumber).not.toBe(oneFirst.expenseNumber);
	});
});

describe('generate_expense_number: normal path format is unchanged', () => {
	it('renders EXP-<3-letter slug prefix>-<5-digit sequence>', async () => {
		const slug = `expfmt-${crypto.randomUUID().slice(0, 8)}`;
		const org = await createThrowawayOrg('format', slug);

		const expense = await insertExpense(org, 'format-check');
		expect(expense.expenseNumber).toBe('EXP-EXP-00001');
	});
});

describe('generate_expense_number: counter backfill on a database with pre-existing expenses', () => {
	it('continues past existing rows rather than restarting at 1 and colliding', async () => {
		// This models a seeded local/dev database, not a production cutover:
		// the product is not live, so there is no historical numbering that
		// must be reconstructed exactly. What matters is that an org which
		// already holds expense rows does not have its counter reset to 1
		// underneath it, which would collide with those rows immediately.
		const slug = `expbkf-${crypto.randomUUID().slice(0, 8)}`;
		const org = await createThrowawayOrg('backfill', slug);
		const admin = adminClient();

		// Seed rows the normal way (through the trigger, which already
		// issues sequential numbers), simulating an org that had expenses
		// before the counter-based migration ran.
		const seeded: string[] = [];
		for (let i = 1; i <= 3; i++) {
			const { expenseNumber } = await insertExpense(org, `seed-${i}`);
			seeded.push(expenseNumber);
		}

		// Simulate the counter being uninitialised for this org (as it would
		// be for every pre-existing org right before the migration's
		// backfill statement runs), then apply the same logic the migration
		// applies: one past the count of existing rows for the org.
		const { error: resetError } = await admin
			.from('organizations')
			.update({ next_expense_number: 1 })
			.eq('id', org.orgId);
		if (resetError) {
			throw new Error(
				`expense-numbering backfill fixture: counter reset failed: ${resetError.message}`
			);
		}

		const { count, error: countError } = await admin
			.from('brand_expenses')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', org.orgId);
		if (countError || count === null) {
			throw new Error(`expense-numbering backfill fixture: count failed: ${countError?.message}`);
		}

		const { error: backfillError } = await admin
			.from('organizations')
			.update({ next_expense_number: count + 1 })
			.eq('id', org.orgId);
		if (backfillError) {
			throw new Error(
				`expense-numbering backfill fixture: backfill update failed: ${backfillError.message}`
			);
		}

		const next = await insertExpense(org, 'post-backfill');
		expect(seeded).not.toContain(next.expenseNumber);
		expect(next.expenseNumber).toBe('EXP-EXP-00004');
	});
});
