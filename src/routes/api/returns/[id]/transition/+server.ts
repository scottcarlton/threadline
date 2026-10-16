import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyReturnTransition } from '$lib/server/returns/apply-transition';
import type { DispositionInput, ReturnTransition } from '$lib/server/returns/transitions';

const TRANSITIONS = new Set<ReturnTransition>(['approve', 'decline', 'receive', 'cancel']);

/**
 * Approve, decline, receive, or cancel a return. The rules, including who may,
 * live in applyReturnTransition, which /returns/[id] also calls.
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json().catch(() => ({}))) as {
		transition?: string;
		declineReason?: string;
		dispositions?: DispositionInput[];
	};

	const transition = body.transition as ReturnTransition;
	if (!transition || !TRANSITIONS.has(transition)) {
		return json({ error: 'Unknown transition.' }, { status: 400 });
	}

	const result = await applyReturnTransition(
		{
			supabase: locals.supabase,
			userId: locals.user.id,
			orgId: locals.organization.id,
			role: locals.membership?.role
		},
		params.id,
		{ transition, declineReason: body.declineReason, dispositions: body.dispositions }
	);

	if (!result.ok) {
		return json({ error: result.error, code: result.code }, { status: result.httpStatus });
	}
	return json({ ok: true, status: result.status });
};
