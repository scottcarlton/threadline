import type { SupabaseClient } from '@supabase/supabase-js';
import type { Organization } from '$lib/types/database.js';

type CreateRetailerInput = {
	userId: string;
	businessName: string;
	displayName?: string;
};

type CreateRetailerResult = {
	organization?: Organization;
	/**
	 * True only when this call inserted the org. The idempotent path returns an
	 * existing org just as successfully, and the caller must be able to tell the
	 * two apart so a refresh does not record a second organization.created.
	 */
	created?: boolean;
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

	// Idempotency: if this user already founded a retailer org, return it
	// untouched. Filter by org_type='retailer' SERVER-SIDE via an inner join —
	// a bare `.limit(1)` with a post-filter could return a rep/brand membership
	// for a user who admins both, fail the check, and mint a duplicate retailer.
	const { data: existing } = await client
		.from('organization_members')
		.select('organizations!inner(*)')
		.eq('profile_id', userId)
		.eq('organizations.org_type', 'retailer')
		.limit(1)
		.maybeSingle();

	const existingOrg = (existing as { organizations?: Organization | null } | null)?.organizations;
	if (existingOrg) {
		return { organization: existingOrg, created: false };
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

	// A retailer's wizard ends at creation (no further SP1 steps), so completion
	// is atomic with creation — set onboarding_completed_at in the INSERT rather
	// than relying on an unchecked client-side follow-up write.
	const { data: org, error: orgError } = await client
		.from('organizations')
		.insert({
			name: trimmedName,
			slug,
			org_type: 'retailer',
			onboarding_completed_at: new Date().toISOString()
		})
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
		// Roll back the just-created org: an ownerless org would hold the slug
		// forever and 409 every future retry for everyone.
		await client.from('organizations').delete().eq('id', createdOrg.id);
		return { error: memberError.message, status: 500 };
	}

	// Only mutate the profile once org + membership are committed — a display_name
	// write before the slug/insert guards would persist even on a 409/500.
	if (displayName) {
		await client.from('profiles').update({ display_name: displayName }).eq('id', userId);
	}

	return { organization: createdOrg, created: true };
}
