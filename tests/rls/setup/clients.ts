import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ANON_KEY, FIXTURE_PASSWORD, SERVICE_ROLE_KEY, SUPABASE_URL } from './env.js';

const AUTH_OPTS = { auth: { autoRefreshToken: false, persistSession: false } };

/** Service role. Bypasses RLS. Seeding, ground truth, and teardown only. */
export function adminClient(): SupabaseClient {
	return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, AUTH_OPTS);
}

/** Anon key, no session. Represents a logged-out visitor. */
export function anonClient(): SupabaseClient {
	return createClient(SUPABASE_URL, ANON_KEY, AUTH_OPTS);
}

const cache = new Map<string, SupabaseClient>();

/**
 * Anon-key client carrying a real session for `email`. This is the only
 * client shape that exercises RLS the way the app does.
 */
export async function clientFor(email: string): Promise<SupabaseClient> {
	const cached = cache.get(email);
	if (cached) return cached;
	const client = anonClient();
	const { error } = await client.auth.signInWithPassword({
		email,
		password: FIXTURE_PASSWORD
	});
	if (error) {
		throw new Error(`RLS tests: sign-in failed for ${email}: ${error.message}`);
	}
	cache.set(email, client);
	return client;
}

export function resetClientCache(): void {
	cache.clear();
}
