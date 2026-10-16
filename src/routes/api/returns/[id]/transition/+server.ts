import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { loadIssuingOrgReturn } from '$lib/server/returns/authorize-return';
import {
	decideTransition,
	validateDispositions,
	type ReturnTransition,
	type DispositionInput
} from '$lib/server/returns/transitions';

/**
 * Approve, decline, receive, or cancel a return.
 *
 * All four are brand-only: a rep or buyer asks, the brand holding the goods
 * decides. Same boundary `reject_non_brand_fulfillment_status()` draws on
 * orders, and the reason the `Brand can update returns` RLS policy has no
 * federation arm.
 *
 * Sales and guest are excluded, matching that policy's role set. Issuing a
 * credit against stock is not a sales action.
 */
const TRANSITION_ROLES = new Set(['admin', 'owner', 'member']);

const TRANSITIONS = new Set<ReturnTransition>(['approve', 'decline', 'receive', 'cancel']);

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!TRANSITION_ROLES.has(locals.membership?.role ?? '')) {
		return json({ error: 'Insufficient permissions to action a return.' }, { status: 403 });
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

	// Issuing org only. supabaseAdmin bypasses RLS below, so this is the
	// ownership check that keeps it from becoming a cross-tenant write.
	const ra = await loadIssuingOrgReturn(params.id, locals.organization.id);
	if (!ra) {
		return json({ error: 'Return not found' }, { status: 404 });
	}

	const decision = decideTransition(ra.status, transition, {
		declineReason: body.declineReason
	});
	if (!decision.ok) {
		return json({ error: decision.message, code: decision.code }, { status: 400 });
	}

	// Receipt moves physical stock, so dispositions, restock and the status
	// change happen inside one transaction rather than as three writes from
	// here. See 20260930000001_receive_return.sql.
	if (transition === 'receive') {
		const { data: lines } = await supabaseAdmin
			.from('return_lines')
			.select('id')
			.eq('return_id', ra.id);

		const check = validateDispositions(
			(lines ?? []).map((l) => (l as { id: string }).id),
			body.dispositions ?? []
		);
		if (!check.ok) {
			return json({ error: check.message }, { status: 400 });
		}

		// Called as the signed-in user, not service-role: receive_return()
		// authorizes via get_user_role(), which needs an identity to resolve.
		const { data: received, error: receiveError } = await locals.supabase.rpc('receive_return', {
			p_return_id: ra.id,
			p_dispositions: body.dispositions ?? []
		});

		if (receiveError) {
			return json({ error: receiveError.message }, { status: 400 });
		}

		return json({ ok: true, status: 'received', return: received });
	}

	const patch: Record<string, unknown> = { status: decision.to };

	if (transition === 'approve') {
		// ra_number and approved_at are set by
		// assign_ra_number_on_approval() (20260915000021), which covers both
		// this path and a brand creating an already-approved return. Writing
		// either here would be a second source for the same value.
		patch.approved_by = locals.user.id;
	} else if (transition === 'decline') {
		patch.decline_reason = body.declineReason?.trim() ?? null;
	}

	const { data: updated, error: updateError } = await supabaseAdmin
		.from('return_authorizations')
		.update(patch)
		.eq('id', ra.id)
		.select('id, status, ra_number, decline_reason')
		.single();

	if (updateError) {
		return json({ error: updateError.message }, { status: 400 });
	}

	return json({ ok: true, status: decision.to, return: updated });
};
