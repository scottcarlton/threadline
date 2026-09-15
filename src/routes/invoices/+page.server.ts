import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listInvoices, computeInvoiceMetrics } from '$lib/server/queries/invoices.js';

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('data:invoices');

	// Invoices are issued by the brand that owns the goods. A rep org never has
	// any: its own orders are invoiced by the connected brand, and a manual
	// brand cannot reach `preparing` at all (20260909000001), so it never
	// produces one. An empty list would read as "you have none yet" rather than
	// "this is not your screen". Mirrors /organization/partners.
	if (!locals.organization) throw redirect(303, '/insight');
	if (locals.orgType !== 'brand') throw redirect(303, '/insight');

	const scope = await locals.getQueryScope();
	const today = new Date().toISOString().slice(0, 10);

	if (!scope) {
		return {
			invoices: [],
			today,
			metrics: computeInvoiceMetrics([], today)
		};
	}

	const status = url.searchParams.get('status');
	const invoices = await listInvoices(scope, { status }, today);

	return {
		invoices,
		today,
		// Metrics describe the whole book, so they are computed from an
		// unfiltered read rather than from the filtered list: "$12k outstanding"
		// must not change because someone clicked the Paid tab.
		metrics: computeInvoiceMetrics(status ? await listInvoices(scope, {}, today) : invoices, today)
	};
};
