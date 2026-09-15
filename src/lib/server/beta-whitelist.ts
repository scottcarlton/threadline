import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase.js';

export function isBetaWhitelistEnabled(): boolean {
	return env.BETA_WHITELIST_ENABLED === 'true';
}

// Warm-instance cache for positive whitelist results. The gate runs on every
// authenticated request (see hooks.server.ts), and the allow-list rarely
// changes, so caching a pass for a short window removes a per-request query on
// reused (Fluid Compute) instances. Only positives are cached: a newly added
// email takes effect immediately, and a removed email loses access within the
// TTL. The whitelist is a beta gate, not a permission boundary, so this short
// staleness window is acceptable — actual authz (role, brand scope) is never
// cached.
const WHITELIST_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;
const allowedUntil = new Map<string, number>();

export async function isEmailWhitelisted(email: string): Promise<boolean> {
	if (!isBetaWhitelistEnabled()) return true;

	const key = email.toLowerCase();
	const cachedUntil = allowedUntil.get(key);
	if (cachedUntil !== undefined) {
		if (cachedUntil > Date.now()) return true;
		allowedUntil.delete(key); // expired
	}

	const { data } = await supabaseAdmin
		.from('beta_whitelist')
		.select('id')
		.ilike('email', email)
		.limit(1)
		.maybeSingle();

	const allowed = !!data;
	if (allowed) {
		if (allowedUntil.size >= MAX_CACHE_ENTRIES) allowedUntil.clear();
		allowedUntil.set(key, Date.now() + WHITELIST_CACHE_TTL_MS);
	}
	return allowed;
}
