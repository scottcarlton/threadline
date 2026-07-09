import type { SupabaseClient } from '@supabase/supabase-js';
import type { Retailer } from '$lib/types/database.js';

type CreateRetailerInput = {
	userId: string;
	businessName: string;
	displayName?: string;
};

type CreateRetailerResult = {
	retailer?: Retailer;
	error?: string;
	status?: number;
};

/**
 * Creates a retailer and enrolls the founding user as its `buyer_admin`.
 *
 * Idempotency: a user reaching this path twice (re-submit, refresh, bouncing
 * back to onboarding) must not spawn a second retailer. We first look for any
 * existing `retailer_users` membership for this user and, if found, return that
 * retailer without inserting anything — mirroring the founding-admin guard in
 * `api/onboarding/create-org`.
 *
 * `client` MUST be `supabaseAdmin`. Neither `retailers` nor `retailer_users` has
 * an INSERT RLS policy: rows are created only via the service-role client,
 * because @supabase/ssr v0.10.0 drops the JWT on writes. The caller is
 * responsible for the app-layer auth check before invoking this.
 */
export async function createRetailer(
	client: SupabaseClient,
	{ userId, businessName, displayName }: CreateRetailerInput
): Promise<CreateRetailerResult> {
	const trimmedName = businessName?.trim() ?? '';
	if (!trimmedName) {
		return { error: 'Business name is required', status: 400 };
	}

	// Idempotency: if this user already belongs to a retailer, return it untouched.
	const { data: existing } = await client
		.from('retailer_users')
		.select('retailers(*)')
		.eq('profile_id', userId)
		.limit(1)
		.maybeSingle();

	const existingRetailer = (existing as { retailers?: Retailer } | null)?.retailers;
	if (existingRetailer) {
		return { retailer: existingRetailer };
	}

	if (displayName) {
		await client.from('profiles').update({ display_name: displayName }).eq('id', userId);
	}

	const { data: retailer, error: retailerError } = await client
		.from('retailers')
		.insert({ business_name: trimmedName })
		.select()
		.single();

	if (retailerError) {
		return { error: retailerError.message, status: 500 };
	}

	const createdRetailer = retailer as Retailer;

	// First user of a retailer is its admin (mirrors api/buyer-invite/send).
	const { error: memberError } = await client.from('retailer_users').insert({
		retailer_id: createdRetailer.id,
		profile_id: userId,
		role: 'buyer_admin'
	});

	if (memberError) {
		return { error: memberError.message, status: 500 };
	}

	return { retailer: createdRetailer };
}
