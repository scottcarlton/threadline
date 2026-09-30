import type { PageServerLoad } from './$types';
import {
	computeReturnMetrics,
	listReturns,
	sortReturnsForViewer
} from '$lib/server/queries/returns.js';

/**
 * The returns list.
 *
 * Visibility is RLS's job: `listReturns` reads through `locals.supabase`, so a
 * brand sees its brands' returns, a rep sees returns on its orders, and a buyer
 * sees its accounts' — all three arms from 20260915000010, with no predicate
 * restated here. The header of queries/returns.ts says why this route does not
 * follow the supabaseAdmin convention the other list routes use.
 *
 * Unlike /invoices there is no orgType redirect. Invoices only ever belong to a
 * brand, but a rep requests returns and a buyer requests returns, so all three
 * have a real list here.
 */
export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:returns');

	const status = url.searchParams.get('status');
	const scope = await locals.getQueryScope();

	const rows = await listReturns(locals.supabase, { status });

	// The tiles describe the whole book, so they come from an unfiltered read,
	// the same as /invoices: "3 open" must not change because someone picked
	// the Credited filter. Skipped when no filter is active, since the rows
	// already are the whole book.
	const book = status ? await listReturns(locals.supabase, {}) : rows;

	return {
		returns: sortReturnsForViewer(rows, scope),
		totalCount: book.length,
		// Which party is reading, for column choices only. A buyer owns the
		// account, so an account column tells them nothing; a brand or rep is
		// looking at someone else's account and needs it on every row.
		viewerKind: scope?.kind ?? null,
		metrics: computeReturnMetrics(book)
	};
};
