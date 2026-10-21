import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncAccountPayloadSchema } from '$lib/schemas/account';
import { createAccount } from '$lib/server/accounts/create-account.js';
import { emitIntegrationEvent } from '$lib/server/integrations/events.js';

/**
 * The only write path for new accounts (SCO-207). `/accounts/new` enqueues to
 * the offline outbox, online or not, and the outbox posts here. A replayed id
 * returns the stored account and runs no side effects. Authorization is the
 * same as an online create at sync time: RLS on accounts and locations, as the
 * signed-in user.
 */
export const POST: RequestHandler = async ({ request, locals, fetch, url }) => {
	if (!locals.user) return json({ message: 'Sign in to sync.' }, { status: 401 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ message: 'Invalid request body.' }, { status: 400 });
	}

	const parsed = syncAccountPayloadSchema.safeParse(body);
	if (!parsed.success) {
		const issue = parsed.error.issues[0];
		return json({ message: issue?.message ?? 'Account details are invalid.' }, { status: 400 });
	}

	const outcome = await createAccount({
		supabase: locals.supabase,
		audit: locals.audit,
		payload: parsed.data,
		origin: url.origin,
		fetch,
		emit: emitIntegrationEvent
	});

	if (!outcome.ok) return json({ message: outcome.message }, { status: outcome.status });
	return json({
		accountId: outcome.accountId,
		inserted: outcome.inserted,
		inviteFailed: outcome.inviteFailed
	});
};
