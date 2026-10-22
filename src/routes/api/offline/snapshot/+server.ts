import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadOrderPrereqs } from '$lib/server/orders/load-order-prereqs.js';
import { loadCatalog } from '$lib/server/products/catalog.js';

/**
 * Everything the order wizard needs with no connection (SCO-208): the same
 * reference data `/orders/new` loads (loadOrderPrereqs, so the scope is
 * identical by construction) plus the entire visible catalog. The device keeps
 * it in IndexedDB and refreshes it while online.
 *
 * Reps only: buyer ordering (/shop) is out of scope for offline mode, and a
 * buyer's device has no reason to hold a catalog copy.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ message: 'Sign in first.' }, { status: 401 });
	if (locals.isBuyer || !locals.organization) {
		return json({ message: 'Offline ordering is for reps.' }, { status: 403 });
	}

	const prereqs = await loadOrderPrereqs(locals);
	let products;
	try {
		products = await loadCatalog(
			locals.supabase,
			prereqs.brands.map((b) => b.id)
		);
	} catch (err) {
		console.error('[offline/snapshot] catalog load failed', {
			org_id: locals.organization.id,
			error: err
		});
		return json({ message: 'Could not load the catalog.' }, { status: 500 });
	}

	return json(
		{
			orgId: locals.organization.id,
			fetchedAt: Date.now(),
			prereqs,
			products
		},
		// Customer data: never let a shared cache or the browser's HTTP cache keep it.
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
