import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve a search string to matching account IDs and brand IDs.
 * Used to enable server-side search across order_number, account name, and brand name.
 */
export async function resolveOrderSearch(
	supabase: SupabaseClient,
	search: string,
	orgIds: string[]
): Promise<{ accountIds: string[]; brandIds: string[] }> {
	const pattern = `%${search}%`;
	const [accountsRes, brandsRes] = await Promise.all([
		supabase
			.from('accounts')
			.select('id')
			.in('organization_id', orgIds)
			.ilike('business_name', pattern)
			.limit(200),
		supabase
			.from('brands')
			.select('id')
			.in('organization_id', orgIds)
			.ilike('name', pattern)
			.limit(200)
	]);
	return {
		accountIds: (accountsRes.data ?? []).map((a) => a.id),
		brandIds: (brandsRes.data ?? []).map((b) => b.id)
	};
}

/**
 * Apply search filter to a Supabase orders query.
 * Searches across order_number (direct), account business_name, and brand name.
 */
export function applyOrderSearch(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	query: any,
	search: string,
	matchingAccountIds: string[],
	matchingBrandIds: string[]
) {
	const orParts: string[] = [`order_number.ilike.%${search}%`];
	if (matchingAccountIds.length > 0) {
		orParts.push(`account_id.in.(${matchingAccountIds.join(',')})`);
	}
	if (matchingBrandIds.length > 0) {
		orParts.push(`brand_id.in.(${matchingBrandIds.join(',')})`);
	}
	return query.or(orParts.join(','));
}
