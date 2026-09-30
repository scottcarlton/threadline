import type { SupabaseClient } from '@supabase/supabase-js';
import type { QueryScope } from './scope';
import type { ReturnDetail, ReturnListRow } from '$lib/utils/return-status';
import { returnQueueRank } from '$lib/utils/return-status';

// The pure half lives in $lib/utils because the pages need it in the browser,
// and $lib/server/** is server-only. Re-exported here so server callers have a
// single import for the returns data layer, matching queries/invoices.ts.
export {
	computeReturnMetrics,
	RETURN_DISPOSITION_LABELS,
	RETURN_STATUS_LABELS,
	returnCreditIssued,
	returnIsOpen,
	returnLinesValue,
	returnNeedsAction,
	returnQueueRank,
	returnUnits
} from '$lib/utils/return-status';
export type { ReturnDetail, ReturnListRow, ReturnMetrics } from '$lib/utils/return-status';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * Why this reads through `locals.supabase` and not `supabaseAdmin`
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Every other module in this folder takes `supabaseAdmin` and restates the
 * visibility rule from `QueryScope`. That works for `invoices`, which is a
 * single own-org predicate. It does not work here, and the difference is not
 * stylistic.
 *
 * `return_authorizations` has three SELECT arms (20260915000010), and the brand
 * one is `brand_id IN get_user_brand_ids(organization_id)`. That helper respects
 * `member_brand_access`: an admin or owner sees every brand, a member or guest
 * sees only the brands they are scoped to. `QueryScope.boaBrandIds` does not
 * reproduce it — it is every active brand in the org, with no per-member filter
 * (see `resolveQueryScope`). Restating the arm from scope would therefore show a
 * member scoped to brand A the returns of brand B, which is precisely the
 * failure `member_brand_access` exists to prevent.
 *
 * Reading through RLS keeps one definition of who sees what, already pinned by
 * `tests/rls/returns.test.ts`. `scope` is still taken, but only to decide
 * presentation: whether the viewer is the issuing brand, and therefore whether
 * a row is a queue item or a log entry.
 */

const LIST_SELECT = '*, orders(order_number), accounts(business_name), brands(name)';

export type ReturnFilters = { status?: string | null };

/** Statuses the filter accepts. Anything else is ignored rather than trusted. */
const FILTERABLE = ['requested', 'approved', 'declined', 'received', 'closed', 'cancelled'];

/**
 * Returns visible to the caller, newest first.
 *
 * `open` is accepted as a filter even though no row stores it, resolved here
 * into the three moving states rather than making every caller know which they
 * are. Same shape as `status = 'overdue'` on the invoice list.
 */
export async function listReturns(
	supabase: SupabaseClient,
	filters: ReturnFilters
): Promise<ReturnListRow[]> {
	let query = supabase
		.from('return_authorizations')
		.select(LIST_SELECT)
		.order('created_at', { ascending: false });

	if (filters.status === 'open') {
		query = query.in('status', ['requested', 'approved', 'received']);
	} else if (filters.status && FILTERABLE.includes(filters.status)) {
		query = query.eq('status', filters.status);
	}

	const { data } = await query;
	return (data ?? []) as unknown as ReturnListRow[];
}

/**
 * One return with its lines.
 *
 * No org predicate here on purpose: RLS decides, so a return the caller cannot
 * see comes back null and the route answers 404. That is the same answer a bad
 * id gets, which is what keeps a return's existence from leaking across tenants.
 */
export async function getReturn(
	supabase: SupabaseClient,
	returnId: string
): Promise<ReturnDetail | null> {
	const { data } = await supabase
		.from('return_authorizations')
		.select(`${LIST_SELECT}, return_lines(*)`)
		.eq('id', returnId)
		.maybeSingle();

	if (!data) return null;

	const ra = data as unknown as ReturnDetail;
	ra.return_lines = [...(ra.return_lines ?? [])].sort(
		(a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
	);
	return ra;
}

/**
 * Whether the viewer is the org that issues this return, and so the one who
 * acts on it.
 *
 * Per-row rather than per-user: a brand org user can also be the rep on someone
 * else's order, and the same list can hold both.
 */
export function viewerIsIssuer(
	scope: QueryScope | null,
	row: { organization_id: string }
): boolean {
	if (!scope || scope.kind !== 'internal') return false;
	return scope.ownOrgIds.includes(row.organization_id);
}

/**
 * Queue order for the issuing brand, plain reverse chronology for everyone else.
 *
 * A rep or buyer has nothing to action, so reordering their list by urgency
 * would be sorting by someone else's workload. They get a log.
 */
export function sortReturnsForViewer(
	rows: ReturnListRow[],
	scope: QueryScope | null
): ReturnListRow[] {
	const sorted = [...rows];
	sorted.sort((a, b) => {
		if (viewerIsIssuer(scope, a) && viewerIsIssuer(scope, b)) {
			const rank = returnQueueRank(a.status) - returnQueueRank(b.status);
			if (rank !== 0) return rank;
		}
		// Newest first within a rank. Stated rather than left to sort stability:
		// the query does return created_at descending today, but a comparator
		// that silently depends on its input order breaks the moment that changes.
		return (b.created_at ?? '').localeCompare(a.created_at ?? '');
	});
	return sorted;
}
