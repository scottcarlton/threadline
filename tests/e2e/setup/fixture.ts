import {
	E2E_EMAIL_DOMAIN,
	E2E_ORG_NAME_PREFIX,
	SERVICE_ROLE_KEY,
	SUPABASE_URL,
	fixtureEmail
} from './env.js';

/**
 * Seeding talks to GoTrue and PostgREST over plain fetch rather than through
 * @supabase/supabase-js. Playwright loads its config, globalSetup and specs
 * through its own TypeScript loader, which cannot resolve that package's
 * module graph (it fails inside auth-js with "Unexpected module status 3").
 * The two REST calls we need are short, so the SDK buys nothing here. The RLS
 * suite, which runs under vitest, still uses the SDK.
 */

const AUTH = `${SUPABASE_URL}/auth/v1`;
const REST = `${SUPABASE_URL}/rest/v1`;

const headers = {
	apikey: SERVICE_ROLE_KEY,
	Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
	'Content-Type': 'application/json'
};

async function call(url: string, init: RequestInit, label: string): Promise<unknown> {
	const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`e2e fixture: ${label} failed (${res.status}): ${body}`);
	}
	const text = await res.text();
	return text ? JSON.parse(text) : null;
}

/**
 * One auth user per org type, plus two more reps. They cannot share a user:
 * a walk that finishes onboarding leaves a completed org, and +page.server.ts
 * redirects a completed org straight back out of /onboarding.
 */
export type E2EPersona = 'brand' | 'rep' | 'retailer' | 'repDeadEnd' | 'repRoadmap';

export const PERSONA_EMAILS: Record<E2EPersona, string> = {
	brand: fixtureEmail('preflight-brand'),
	rep: fixtureEmail('preflight-rep'),
	retailer: fixtureEmail('preflight-retailer'),
	repDeadEnd: fixtureEmail('preflight-rep-dead-ends'),
	repRoadmap: fixtureEmail('preflight-rep-roadmap')
};

/**
 * The organization name each spec types at the "what should we call your
 * organization?" question. create-org rejects a taken slug rather than
 * suffix-minting one, so these have to be unique and have to be cleaned up.
 */
export const PERSONA_ORG_NAMES: Record<E2EPersona, string> = {
	brand: `${E2E_ORG_NAME_PREFIX} Brand`,
	rep: `${E2E_ORG_NAME_PREFIX} Rep`,
	retailer: `${E2E_ORG_NAME_PREFIX} Retailer`,
	repDeadEnd: `${E2E_ORG_NAME_PREFIX} Rep Dead Ends`,
	repRoadmap: `${E2E_ORG_NAME_PREFIX} Rep Roadmap`
};

/** Name typed at the first question. */
export const PERSONA_DISPLAY_NAMES: Record<E2EPersona, string> = {
	brand: 'Preflight Brand Tester',
	rep: 'Preflight Rep Tester',
	retailer: 'Preflight Retailer Tester',
	repDeadEnd: 'Preflight Rep Dead End Tester',
	repRoadmap: 'Preflight Rep Roadmap Tester'
};

type AuthUser = { id: string; email?: string };

/**
 * Pages through every auth user and calls `visit` on each. GoTrue assigns the
 * ids, so fixture users are found by their email domain rather than by a
 * fixed id.
 */
async function forEachAuthUser(visit: (user: AuthUser) => Promise<void>): Promise<void> {
	let page = 1;
	for (;;) {
		const body = (await call(
			`${AUTH}/admin/users?page=${page}&per_page=200`,
			{ method: 'GET' },
			'listUsers'
		)) as { users?: AuthUser[] };
		const users = body?.users ?? [];
		if (users.length === 0) break;
		for (const user of users) await visit(user);
		if (users.length < 200) break;
		page += 1;
	}
}

/**
 * The state /onboarding expects on a first visit, and the whole point of the
 * seed: an email-confirmed auth user with a profile row, NO organization and
 * NO membership, and `profiles.onboarding_draft` null.
 *
 * Preflight runs before the organization exists. The org row is created part
 * way through General Information by api/onboarding/create-org (or
 * create-retailer for a retailer). Until then the only persisted answers live
 * in profiles.onboarding_draft, and +page.svelte's resumeGeneralSub() reads it
 * to decide which General Information question to open on. A leftover draft
 * would start the run at question 2 or 3, so it has to be cleared.
 *
 * The profiles row itself is inserted by the signup trigger on auth.users;
 * this only asserts it landed and normalizes the two columns the page reads.
 */
export async function seedE2EFixture(): Promise<void> {
	for (const persona of Object.keys(PERSONA_EMAILS) as E2EPersona[]) {
		const email = PERSONA_EMAILS[persona];
		const user = (await call(
			`${AUTH}/admin/users`,
			{ method: 'POST', body: JSON.stringify({ email, email_confirm: true }) },
			`createUser ${email}`
		)) as AuthUser;

		const rows = (await call(
			`${REST}/profiles?id=eq.${user.id}&select=id`,
			{
				method: 'PATCH',
				headers: { Prefer: 'return=representation' },
				body: JSON.stringify({ onboarding_draft: null, display_name: email })
			},
			`profile reset ${email}`
		)) as { id: string }[];

		if (!rows?.length) {
			throw new Error(
				`e2e fixture: no profiles row for ${email}. The signup trigger on ` +
					'auth.users did not fire, so /onboarding has no profile to read.'
			);
		}
	}
}

/**
 * Removes exactly what the suite creates and nothing else: organizations whose
 * name starts with the fixture prefix, then every auth user on the fixture
 * email domain. Idempotent, so it doubles as the pre-run reset after a crashed
 * run (a leftover org would otherwise 409 on its slug).
 *
 * Organizations go first: everything the flow writes hangs off
 * organization_id and cascades from that row.
 */
export async function teardownE2EFixture(): Promise<void> {
	await call(
		`${REST}/organizations?name=like.${encodeURIComponent(`${E2E_ORG_NAME_PREFIX}%`)}`,
		{ method: 'DELETE' },
		'organizations delete'
	);

	await forEachAuthUser(async (user) => {
		if (user.email?.endsWith(`@${E2E_EMAIL_DOMAIN}`)) {
			await call(`${AUTH}/admin/users/${user.id}`, { method: 'DELETE' }, 'deleteUser');
		}
	});
}
