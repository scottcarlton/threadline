import type { SupabaseClient } from '@supabase/supabase-js';
import type { Store } from '$lib/types/database.js';

type CreateStoreInput = {
	userId: string;
	businessName: string;
	displayName?: string;
};

type CreateStoreResult = {
	store?: Store;
	error?: string;
	status?: number;
};

/**
 * Creates a store (retailer) and enrolls the founding user as its `buyer_admin`.
 *
 * Idempotency: a user reaching this path twice (re-submit, refresh, bouncing
 * back to onboarding) must not spawn a second store. We first look for any
 * existing `store_users` membership for this user and, if found, return that
 * store without inserting anything — mirroring the founding-admin guard in
 * `api/onboarding/create-org`.
 *
 * `client` MUST be `supabaseAdmin`. Neither `stores` nor `store_users` has an
 * INSERT RLS policy: rows are created only via the service-role client, because
 * @supabase/ssr v0.10.0 drops the JWT on writes. The caller is responsible for
 * the app-layer auth check before invoking this.
 */
export async function createStore(
	client: SupabaseClient,
	{ userId, businessName, displayName }: CreateStoreInput
): Promise<CreateStoreResult> {
	const trimmedName = businessName?.trim() ?? '';
	if (!trimmedName) {
		return { error: 'Business name is required', status: 400 };
	}

	// Idempotency: if this user already belongs to a store, return it untouched.
	const { data: existing } = await client
		.from('store_users')
		.select('stores(*)')
		.eq('profile_id', userId)
		.limit(1)
		.maybeSingle();

	const existingStore = (existing as { stores?: Store } | null)?.stores;
	if (existingStore) {
		return { store: existingStore };
	}

	if (displayName) {
		await client.from('profiles').update({ display_name: displayName }).eq('id', userId);
	}

	const { data: store, error: storeError } = await client
		.from('stores')
		.insert({ business_name: trimmedName })
		.select()
		.single();

	if (storeError) {
		return { error: storeError.message, status: 500 };
	}

	const createdStore = store as Store;

	// First user of a store is its admin (mirrors api/buyer-invite/send).
	const { error: memberError } = await client.from('store_users').insert({
		store_id: createdStore.id,
		profile_id: userId,
		role: 'buyer_admin'
	});

	if (memberError) {
		return { error: memberError.message, status: 500 };
	}

	return { store: createdStore };
}
