import { supabaseAdmin } from '$lib/server/supabase.js';
import { loadManagerScope } from '$lib/server/scoping.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Query = any;

export type OrderScope = {
	/** Narrows a query with a `brand_id` column to the viewer's brand access. */
	scopeByBrand: (query: Query) => Query;
	/**
	 * Narrows an orders query for a sales member: their own orders, their
	 * managed reports' orders, and orders on accounts they cover by territory
	 * (including untagged accounts, so orgs that haven't tagged don't strand
	 * sales). Everyone else passes through.
	 */
	scopeByRep: (query: Query) => Query;
};

/**
 * Which of an org's orders the signed-in viewer may count. Shared by Reports
 * and the Insights sales trend so the two can never disagree on a number.
 *
 * Extracted verbatim from loadReport (SCO-148). `orgId` is the viewer's
 * current org, derived on the server; the admin read below is keyed on it.
 */
export async function loadOrderScope(locals: App.Locals, orgId: string): Promise<OrderScope> {
	const brandScope = locals.brandScope as string[] | null;
	const isSales = locals.membership?.role === 'sales';

	const userId = locals.user?.id;
	const salesScope =
		isSales && userId
			? await loadManagerScope(supabaseAdmin, userId, locals.membership?.id ?? null)
			: null;

	// Precompute the set of org accounts this sales user covers via territory
	// (plus untagged accounts, so orgs that haven't tagged don't strand sales).
	let salesAccountIds: string[] | null = null;
	if (salesScope?.hasTerritoryScope) {
		const territoryIds = salesScope.visibleTerritoryIds.join(',');
		const { data: rows } = await supabaseAdmin
			.from('accounts')
			.select('id')
			.eq('organization_id', orgId)
			.or(`territory_id.in.(${territoryIds}),territory_id.is.null`);
		salesAccountIds = (rows ?? []).map((a: { id: string }) => a.id);
	}

	function scopeByBrand(query: Query) {
		return brandScope && brandScope.length > 0 ? query.in('brand_id', brandScope) : query;
	}

	function scopeByRep(query: Query) {
		if (!salesScope) return query;
		if (salesAccountIds && salesAccountIds.length > 0) {
			const createdByClause = salesScope.createdByScope.join(',');
			return query.or(
				`created_by.in.(${createdByClause}),account_id.in.(${salesAccountIds.join(',')})`
			);
		}
		return query.in('created_by', salesScope.createdByScope);
	}

	return { scopeByBrand, scopeByRep };
}
