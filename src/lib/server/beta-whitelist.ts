import { env } from '$env/dynamic/private';
import { supabaseAdmin } from './supabase.js';

export function isBetaWhitelistEnabled(): boolean {
	return env.BETA_WHITELIST_ENABLED === 'true';
}

export async function isEmailWhitelisted(email: string): Promise<boolean> {
	if (!isBetaWhitelistEnabled()) return true;

	const { data } = await supabaseAdmin
		.from('beta_whitelist')
		.select('id')
		.ilike('email', email)
		.limit(1)
		.single();

	return !!data;
}
