import type { SupabaseClient } from '@supabase/supabase-js';
import type { Organization } from '$lib/types/database.js';

type CreateRetailerInput = {
	userId: string;
	businessName: string;
	displayName?: string;
};

type CreateRetailerResult = {
	organization?: Organization;
	error?: string;
	status?: number;
};

/**
 * Creates a retailer organization (`org_type='retailer'`) and enrolls the
 * founding user as its `admin` member. Mirrors `api/onboarding/create-org`'s
 * org+member structure, minus the brand-only seeding (self-brand trigger,
 * seasons, shipping methods) — a retailer org has none of those.
 *
 * Idempotency: a user reaching this path twice (re-submit, refresh, bouncing
 * back to onboarding) must not spawn a second retailer org. We first look for
 * any existing retailer-org membership for this user and, if found, return that
 * org without inserting anything — mirroring the founding-admin guard in
 * `create-org`.
 *
 * `client` MUST be `supabaseAdmin` — @supabase/ssr v0.10.0 drops the JWT on
 * writes, so org/member inserts go through the service-role client with an
 * app-layer auth check performed by the caller.
 */
export async function createRetailer(
	client: SupabaseClient,
	{ userId, businessName, displayName }: CreateRetailerInput
): Promise<CreateRetailerResult> {
	const trimmedName = businessName?.trim() ?? '';
	if (!trimmedName) {
		return { error: 'Business name is required', status: 400 };
	}

	// Idempotency: if this user already founded a retailer org, return it untouched.
	const { data: existing } = await client
		.from('organization_members')
		.select('organizations(*)')
		.eq('profile_id', userId)
		.eq('role', 'admin')
		.limit(1)
		.maybeSingle();

	const existingOrg = (existing as { organizations?: Organization | null } | null)?.organizations;
	if (existingOrg && existingOrg.org_type === 'retailer') {
		return { organization: existingOrg };
	}

	if (displayName) {
		await client.from('profiles').update({ display_name: displayName }).eq('id', userId);
	}

	// Retailers are orgs now, so they get a slug like every other org. Reject on
	// collision (don't suffix-mint) — the form can ask for a different name.
	const slug = trimmedName
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.substring(0, 50);

	const { data: slugTaken } = await client
		.from('organizations')
		.select('id')
		.eq('slug', slug)
		.maybeSingle();

	if (slugTaken) {
		return { error: 'That organization name is taken. Please pick another.', status: 409 };
	}

	const { data: org, error: orgError } = await client
		.from('organizations')
		.insert({ name: trimmedName, slug, org_type: 'retailer' })
		.select()
		.single();

	if (orgError) {
		return { error: orgError.message, status: 500 };
	}

	const createdOrg = org as Organization;

	// First user of a retailer org is its admin (mirrors create-org).
	const { error: memberError } = await client.from('organization_members').insert({
		organization_id: createdOrg.id,
		profile_id: userId,
		role: 'admin',
		accepted_at: new Date().toISOString()
	});

	if (memberError) {
		return { error: memberError.message, status: 500 };
	}

	return { organization: createdOrg };
}
