import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, clientFor, resetClientCache } from './clients.js';
import { FIXTURE_EMAIL_DOMAIN, FIXTURE_PASSWORD, fixtureEmail } from './env.js';
import { RLS_IDS, RLS_ORG_IDS } from './ids.js';

export type RlsPersona =
	| 'brandAAdmin'
	| 'brandASales'
	| 'brandAMember'
	| 'brandAGuest'
	| 'brandBAdmin'
	| 'repAAdmin'
	| 'repASales'
	| 'repBAdmin'
	| 'buyer';

export const PERSONA_EMAILS: Record<RlsPersona, string> = {
	brandAAdmin: fixtureEmail('brand-a-admin'),
	brandASales: fixtureEmail('brand-a-sales'),
	brandAMember: fixtureEmail('brand-a-member'),
	brandAGuest: fixtureEmail('brand-a-guest'),
	brandBAdmin: fixtureEmail('brand-b-admin'),
	repAAdmin: fixtureEmail('rep-a-admin'),
	repASales: fixtureEmail('rep-a-sales'),
	repBAdmin: fixtureEmail('rep-b-admin'),
	buyer: fixtureEmail('buyer')
};

const PERSONA_BY_EMAIL = new Map<string, RlsPersona>(
	(Object.keys(PERSONA_EMAILS) as RlsPersona[]).map((p) => [PERSONA_EMAILS[p], p])
);

/** profile_id per persona. Populated by seedRlsFixture and loadPersonaIds. */
export const PERSONA_IDS: Partial<Record<RlsPersona, string>> = {};

/** organization_members.id per persona. Needed for member_brand_access. */
export const MEMBER_ROW_IDS: Partial<Record<RlsPersona, string>> = {};

export async function personaClient(persona: RlsPersona): Promise<SupabaseClient> {
	return clientFor(PERSONA_EMAILS[persona]);
}

function must<T>(label: string, result: { data: T | null; error: { message: string } | null }): T {
	if (result.error || result.data == null) {
		throw new Error(`RLS fixture: ${label} failed: ${result.error?.message ?? 'no data'}`);
	}
	return result.data;
}

function check(label: string, error: { message: string } | null): void {
	if (error) throw new Error(`RLS fixture: ${label} failed: ${error.message}`);
}

/**
 * Pages through every auth user via the admin API and calls `visit` on
 * each one. Shared by loadPersonaIds (which reads users) and
 * teardownRlsFixture (which deletes them by email domain).
 */
async function forEachAuthUser(
	admin: SupabaseClient,
	label: string,
	visit: (user: { id: string; email?: string }) => Promise<void> | void
): Promise<void> {
	let page = 1;
	for (;;) {
		const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
		if (error) throw new Error(`${label}: listUsers failed: ${error.message}`);
		const users = data?.users ?? [];
		if (users.length === 0) break;
		for (const user of users) {
			await visit(user);
		}
		if (users.length < 200) break;
		page += 1;
	}
}

async function seedUsers(admin: SupabaseClient): Promise<void> {
	for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
		const email = PERSONA_EMAILS[persona];
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password: FIXTURE_PASSWORD,
			email_confirm: true,
			user_metadata: { display_name: persona }
		});
		if (error || !data.user) {
			throw new Error(`RLS fixture: createUser ${email} failed: ${error?.message}`);
		}
		PERSONA_IDS[persona] = data.user.id;
	}
}

async function seedOrgs(admin: SupabaseClient): Promise<void> {
	check(
		'organizations insert',
		(
			await admin.from('organizations').insert([
				{
					id: RLS_IDS.orgBrandA,
					name: 'RLS Brand A',
					slug: 'rls-brand-a',
					org_type: 'brand',
					// order_number is globally unique across the whole table, but the
					// counter that feeds it resets to 1 per org. Distinct prefixes
					// keep fresh orgs from generating colliding order numbers.
					order_number_prefix: 'RLSA-'
				},
				{
					id: RLS_IDS.orgBrandB,
					name: 'RLS Brand B',
					slug: 'rls-brand-b',
					org_type: 'brand',
					order_number_prefix: 'RLSB-'
				},
				{
					id: RLS_IDS.orgRepA,
					name: 'RLS Rep A',
					slug: 'rls-rep-a',
					org_type: 'rep',
					order_number_prefix: 'RLSRA-'
				},
				{
					id: RLS_IDS.orgRepB,
					name: 'RLS Rep B',
					slug: 'rls-rep-b',
					org_type: 'rep',
					order_number_prefix: 'RLSRB-'
				}
			])
		).error
	);
}

async function seedMemberships(admin: SupabaseClient): Promise<void> {
	// Managers first: trg_validate_org_member_manager needs the manager row
	// to already exist and to belong to the same org.
	const managers: Array<{ persona: RlsPersona; org: string; role: string }> = [
		{ persona: 'brandAAdmin', org: RLS_IDS.orgBrandA, role: 'admin' },
		{ persona: 'brandBAdmin', org: RLS_IDS.orgBrandB, role: 'admin' },
		{ persona: 'repAAdmin', org: RLS_IDS.orgRepA, role: 'admin' },
		{ persona: 'repBAdmin', org: RLS_IDS.orgRepB, role: 'admin' }
	];
	for (const m of managers) {
		const row = must<{ id: string }>(
			`membership ${m.persona}`,
			await admin
				.from('organization_members')
				.insert({
					organization_id: m.org,
					profile_id: PERSONA_IDS[m.persona]!,
					role: m.role,
					manages_others: true,
					accepted_at: new Date().toISOString()
				})
				.select('id')
				.single()
		);
		MEMBER_ROW_IDS[m.persona] = row.id;
	}

	const reports: Array<{
		persona: RlsPersona;
		org: string;
		role: string;
		manager: RlsPersona | null;
	}> = [
		{ persona: 'brandASales', org: RLS_IDS.orgBrandA, role: 'sales', manager: null },
		{ persona: 'brandAMember', org: RLS_IDS.orgBrandA, role: 'member', manager: null },
		{ persona: 'brandAGuest', org: RLS_IDS.orgBrandA, role: 'guest', manager: null },
		{ persona: 'repASales', org: RLS_IDS.orgRepA, role: 'sales', manager: 'repAAdmin' }
	];
	for (const r of reports) {
		const row = must<{ id: string }>(
			`membership ${r.persona}`,
			await admin
				.from('organization_members')
				.insert({
					organization_id: r.org,
					profile_id: PERSONA_IDS[r.persona]!,
					role: r.role,
					manager_id: r.manager ? MEMBER_ROW_IDS[r.manager]! : null,
					accepted_at: new Date().toISOString()
				})
				.select('id')
				.single()
		);
		MEMBER_ROW_IDS[r.persona] = row.id;
	}
}

async function seedBrandsAndProducts(admin: SupabaseClient): Promise<void> {
	check(
		'brands insert',
		(
			await admin.from('brands').insert([
				{
					id: RLS_IDS.brandA1,
					organization_id: RLS_IDS.orgBrandA,
					name: 'RLS Brand A One',
					is_active: true
				},
				{
					id: RLS_IDS.brandA2,
					organization_id: RLS_IDS.orgBrandA,
					name: 'RLS Brand A Two',
					is_active: true
				},
				{
					id: RLS_IDS.brandB1,
					organization_id: RLS_IDS.orgBrandB,
					name: 'RLS Brand B One',
					is_active: true
				},
				{
					id: RLS_IDS.brandRepAOwn,
					organization_id: RLS_IDS.orgRepA,
					name: 'RLS Rep A In-House',
					is_active: true
				}
			])
		).error
	);

	// brand-a-member is scoped to A1 only. With no member_brand_access rows
	// at all the helper grants every brand, so this single row is what makes
	// A2 invisible to that persona.
	check(
		'member_brand_access insert',
		(
			await admin.from('member_brand_access').insert({
				member_id: MEMBER_ROW_IDS.brandAMember!,
				brand_id: RLS_IDS.brandA1,
				granted_by: PERSONA_IDS.brandAAdmin!
			})
		).error
	);

	check(
		'products insert',
		(
			await admin.from('products').insert([
				{
					id: RLS_IDS.productA1,
					organization_id: RLS_IDS.orgBrandA,
					brand_id: RLS_IDS.brandA1,
					name: 'RLS Product A1',
					style_number: 'RLS-A1',
					is_active: true
				},
				{
					id: RLS_IDS.productB1,
					organization_id: RLS_IDS.orgBrandB,
					brand_id: RLS_IDS.brandB1,
					name: 'RLS Product B1',
					style_number: 'RLS-B1',
					is_active: true
				}
			])
		).error
	);

	check(
		'product_variants insert',
		(
			await admin.from('product_variants').insert({
				id: RLS_IDS.variantA1,
				product_id: RLS_IDS.productA1,
				color: 'Black',
				size: 'M'
			})
		).error
	);
}

async function seedAccounts(admin: SupabaseClient): Promise<void> {
	check(
		'accounts insert',
		(
			await admin.from('accounts').insert([
				{
					id: RLS_IDS.accountBrandA,
					organization_id: RLS_IDS.orgBrandA,
					business_name: 'RLS Account Brand A'
				},
				{
					id: RLS_IDS.accountRepA,
					organization_id: RLS_IDS.orgRepA,
					business_name: 'RLS Account Rep A'
				},
				{
					id: RLS_IDS.accountBrandB,
					organization_id: RLS_IDS.orgBrandB,
					business_name: 'RLS Account Brand B'
				}
			])
		).error
	);

	check(
		'account_brand_access insert',
		(
			await admin.from('account_brand_access').insert({
				account_id: RLS_IDS.accountBrandA,
				brand_id: RLS_IDS.brandA1,
				organization_id: RLS_IDS.orgBrandA
			})
		).error
	);

	check(
		'account_users insert',
		(
			await admin.from('account_users').insert({
				account_id: RLS_IDS.accountBrandA,
				profile_id: PERSONA_IDS.buyer!,
				role: 'buyer_admin',
				accepted_at: new Date().toISOString()
			})
		).error
	);
}

async function seedConnections(admin: SupabaseClient): Promise<void> {
	check(
		'org_connections insert',
		(
			await admin.from('org_connections').insert([
				{
					id: RLS_IDS.connActive,
					rep_org_id: RLS_IDS.orgRepA,
					brand_org_id: RLS_IDS.orgBrandA,
					status: 'active',
					commission_rate: 12,
					connected_at: new Date().toISOString(),
					requested_by: PERSONA_IDS.repAAdmin!,
					approved_by: PERSONA_IDS.brandAAdmin!
				},
				{
					id: RLS_IDS.connPending,
					rep_org_id: RLS_IDS.orgRepB,
					brand_org_id: RLS_IDS.orgBrandA,
					status: 'pending',
					requested_by: PERSONA_IDS.repBAdmin!
				}
			])
		).error
	);
}

async function seedOrders(admin: SupabaseClient): Promise<void> {
	// The first order fires federate_new_order and creates the federated_*
	// links that Phase 5 asserts on. Do not seed those links by hand.
	check(
		'orders insert',
		(
			await admin.from('orders').insert([
				{
					id: RLS_IDS.orderRepAOnBrandA,
					organization_id: RLS_IDS.orgRepA,
					brand_id: RLS_IDS.brandA1,
					account_id: RLS_IDS.accountRepA,
					created_by: PERSONA_IDS.repAAdmin!,
					status: 'submitted'
				},
				{
					id: RLS_IDS.orderBrandAInternal,
					organization_id: RLS_IDS.orgBrandA,
					brand_id: RLS_IDS.brandA2,
					account_id: RLS_IDS.accountBrandA,
					created_by: PERSONA_IDS.brandAAdmin!,
					status: 'draft'
				},
				{
					id: RLS_IDS.orderRepBOnBrandB,
					organization_id: RLS_IDS.orgRepB,
					brand_id: RLS_IDS.brandB1,
					freeform_name: 'RLS Rep B Freeform Buyer',
					created_by: PERSONA_IDS.repBAdmin!,
					status: 'draft'
				}
			])
		).error
	);

	// line_total is a generated column. Never send it.
	check(
		'order_lines insert',
		(
			await admin.from('order_lines').insert({
				id: RLS_IDS.orderLineRepAOnBrandA,
				order_id: RLS_IDS.orderRepAOnBrandA,
				product_id: RLS_IDS.productA1,
				variant_id: RLS_IDS.variantA1,
				style_number: 'RLS-A1',
				color: 'Black',
				size: 'M',
				qty: 3,
				unit_price: 100
			})
		).error
	);
}

export async function seedRlsFixture(): Promise<void> {
	const admin = adminClient();
	await seedUsers(admin);
	await seedOrgs(admin);
	await seedMemberships(admin);
	await seedBrandsAndProducts(admin);
	await seedAccounts(admin);
	await seedConnections(admin);
	await seedOrders(admin);
}

/**
 * Repopulates PERSONA_IDS and MEMBER_ROW_IDS from the database. Vitest runs
 * globalSetup in a separate module context from the test workers, so module
 * state written during seeding does not reach the specs. Every spec file
 * calls this in beforeAll.
 */
export async function loadPersonaIds(): Promise<void> {
	const admin = adminClient();

	await forEachAuthUser(admin, 'RLS fixture', (user) => {
		const persona = user.email ? PERSONA_BY_EMAIL.get(user.email) : undefined;
		if (persona) PERSONA_IDS[persona] = user.id;
	});

	const missing = (Object.keys(PERSONA_EMAILS) as RlsPersona[]).filter((p) => !PERSONA_IDS[p]);
	if (missing.length > 0) {
		throw new Error(`RLS fixture: personas not seeded: ${missing.join(', ')}`);
	}

	const { data: members, error: memberErr } = await admin
		.from('organization_members')
		.select('id, profile_id')
		.in('organization_id', RLS_ORG_IDS);
	if (memberErr) {
		throw new Error(`RLS fixture: member lookup failed: ${memberErr.message}`);
	}
	const personaByProfile = new Map<string, RlsPersona>();
	for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
		const id = PERSONA_IDS[persona];
		if (id) personaByProfile.set(id, persona);
	}
	for (const row of (members ?? []) as Array<{ id: string; profile_id: string }>) {
		const persona = personaByProfile.get(row.profile_id);
		if (persona) MEMBER_ROW_IDS[persona] = row.id;
	}
}

export async function teardownRlsFixture(): Promise<void> {
	const admin = adminClient();
	resetClientCache();

	const orgList = RLS_ORG_IDS.join(',');

	// order_lines_audit (AFTER DELETE on order_lines) inserts into
	// order_audits referencing order_id. If order_lines cascade-deletes as
	// part of deleting orders (itself cascading from organizations), that
	// insert races the parent order's own deletion within the same cascade
	// and fails FK order_audits_order_id_fkey. Deleting order_lines here,
	// while the parent orders still exist, lets the trigger's insert see a
	// live order row.
	await admin
		.from('order_lines')
		.delete()
		.in('order_id', [
			RLS_IDS.orderRepAOnBrandA,
			RLS_IDS.orderBrandAInternal,
			RLS_IDS.orderRepBOnBrandB
		]);

	// These FKs to organizations are NO ACTION, so they must go before the
	// orgs. Everything else cascades from organizations.
	await admin
		.from('federated_order_links')
		.delete()
		.or(`source_org_id.in.(${orgList}),target_org_id.in.(${orgList})`);
	await admin
		.from('federated_account_links')
		.delete()
		.or(`source_org_id.in.(${orgList}),target_org_id.in.(${orgList})`);
	await admin.from('order_comments').delete().in('source_org_id', RLS_ORG_IDS);
	await admin.from('email_intakes').delete().in('organization_id', RLS_ORG_IDS);

	await admin.from('organizations').delete().in('id', RLS_ORG_IDS);

	// Auth users are found by email domain, not by id: GoTrue assigns ids.
	await forEachAuthUser(admin, 'RLS teardown', async (user) => {
		if (user.email?.endsWith(`@${FIXTURE_EMAIL_DOMAIN}`)) {
			await admin.auth.admin.deleteUser(user.id);
		}
	});

	for (const persona of Object.keys(PERSONA_EMAILS) as RlsPersona[]) {
		delete PERSONA_IDS[persona];
		delete MEMBER_ROW_IDS[persona];
	}
}
