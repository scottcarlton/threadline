import type { SupabaseClient } from '@supabase/supabase-js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';

export type RepSetupState = {
	hasBrands: boolean;
	hasProducts: boolean;
	hasAccounts: boolean;
	hasOrders: boolean;
};

/**
 * Whether a rep org has what rep Insights needs before it shows the
 * dashboard (SCO-224).
 *
 * A rep connected to a brand on Threadline sells from that brand's catalog
 * into that brand's accounts, and both live in the brand org. So brands,
 * products and accounts count across the rep org plus its actively
 * connected brand orgs (the MBISR to BOA direction), and an active brand
 * connection counts as having a brand. Orders stay the rep org's own.
 *
 * Reads go through the request client. RLS already lets a rep read its
 * connections and its connected brands' products and accounts, so this
 * widens nothing the rep couldn't already see.
 */
export async function loadRepSetupState(
	supabase: SupabaseClient,
	orgId: string
): Promise<RepSetupState> {
	const { data: connections, error: connError } = await supabase
		.from('org_connections')
		.select('brand_org_id')
		.eq('rep_org_id', orgId)
		.eq('status', 'active');
	logSupabaseError('insights setup connections', connError);
	const connectedBrandOrgIds = [
		...new Set(
			((connections ?? []) as Array<{ brand_org_id: string | null }>)
				.map((c) => c.brand_org_id)
				.filter((id): id is string => !!id)
		)
	];
	const scope = [orgId, ...connectedBrandOrgIds];

	const [brands, products, accounts, orders] = await Promise.all([
		supabase
			.from('brands')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', orgId)
			.eq('is_active', true),
		supabase
			.from('products')
			.select('id', { count: 'exact', head: true })
			.in('organization_id', scope)
			.eq('is_active', true),
		supabase
			.from('accounts')
			.select('id', { count: 'exact', head: true })
			.in('organization_id', scope)
			.eq('is_active', true),
		supabase
			.from('orders')
			.select('id', { count: 'exact', head: true })
			.eq('organization_id', orgId)
	]);
	for (const [label, r] of [
		['brands', brands],
		['products', products],
		['accounts', accounts],
		['orders', orders]
	] as const) {
		logSupabaseError(`insights setup ${label}`, r.error);
	}

	return {
		hasBrands: (brands.count ?? 0) > 0 || connectedBrandOrgIds.length > 0,
		hasProducts: (products.count ?? 0) > 0,
		hasAccounts: (accounts.count ?? 0) > 0,
		hasOrders: (orders.count ?? 0) > 0
	};
}
