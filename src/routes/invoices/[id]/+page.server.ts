import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getInvoiceForOrg } from '$lib/server/queries/invoices.js';
import { resolveQueryScope } from '$lib/server/queries/scope.js';

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('data:invoices');

	if (!locals.organization) throw redirect(303, '/insight');
	if (locals.orgType !== 'brand') throw redirect(303, '/insight');

	// The root layout assigns locals.queryScope, but layout and page server
	// loads run in parallel, so it is not reliably set by the time this runs.
	// Resolving it here when absent is what the layout does anyway, and it is
	// idempotent.
	const scope = locals.queryScope ?? (locals.queryScope = await resolveQueryScope(locals));
	if (!scope) throw error(404, 'Invoice not found');

	// Scoped to the issuing org inside the query. 404 rather than 403 so an
	// invoice in another org is indistinguishable from one that does not exist.
	const invoice = await getInvoiceForOrg(params.id, scope);
	if (!invoice) throw error(404, 'Invoice not found');

	return {
		invoice,
		today: new Date().toISOString().slice(0, 10),
		canSend: ['admin', 'owner', 'member'].includes(locals.membership?.role ?? '')
	};
};
