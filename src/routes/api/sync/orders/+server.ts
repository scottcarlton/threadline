import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitOrderPayload } from '$lib/server/orders/submit-order.js';

/**
 * Offline outbox target for new orders (SCO-208). Runs the same validation,
 * authorization and transactional write as the wizard's online submit, as of
 * sync time: being captured earlier grants nothing. A replayed submission
 * returns the stored orders and fires no emails, notifications or events.
 *
 * The order is checked against the org it was saved in. If the rep has since
 * switched org, the item fails with a clear reason rather than landing in the
 * wrong org; switching back and retrying sends it.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) return json({ message: 'Sign in to sync.' }, { status: 401 });

	let body: { organization_id?: unknown; payload?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	if (!locals.organization || body.organization_id !== locals.organization.id) {
		return json(
			{ message: 'Saved in another organization. Switch to it, then retry.' },
			{ status: 409 }
		);
	}

	const outcome = await submitOrderPayload(body.payload, locals, url.origin);
	if (!outcome.ok) return json({ message: outcome.message }, { status: outcome.status });
	return json({ orders: outcome.orders });
};
