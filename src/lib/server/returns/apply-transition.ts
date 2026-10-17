import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { loadIssuingOrgReturn } from '$lib/server/returns/authorize-return';
import {
	decideTransition,
	validateDispositions,
	type DispositionInput,
	type ReturnStatus,
	type ReturnTransition
} from '$lib/server/returns/transitions';

/**
 * Approve, decline, receive, or cancel a return.
 *
 * One implementation behind two callers: the JSON endpoint at
 * /api/returns/[id]/transition and the form actions on /returns/[id]. Both used
 * to be possible only through the endpoint, which left the page with no way to
 * move a return at all.
 *
 * All four are brand-only: a rep or buyer asks, the brand holding the goods
 * decides. Same boundary `reject_non_brand_fulfillment_status()` draws on
 * orders, and the reason the `Brand can update returns` RLS policy has no
 * federation arm. Sales and guest are excluded, matching that policy's role
 * set. Issuing a credit against stock is not a sales action.
 */
export const TRANSITION_ROLES = new Set(['admin', 'owner', 'member']);

export type TransitionActor = {
	/** The signed-in user's client. receive_return() authorizes through it. */
	supabase: SupabaseClient;
	userId: string;
	orgId: string;
	role: string | null | undefined;
};

export type TransitionInput = {
	transition: ReturnTransition;
	declineReason?: string | null;
	dispositions?: DispositionInput[];
};

export type TransitionResult =
	| { ok: true; status: ReturnStatus }
	| { ok: false; httpStatus: 400 | 403 | 404; error: string; code?: string };

export async function applyReturnTransition(
	actor: TransitionActor,
	returnId: string,
	input: TransitionInput
): Promise<TransitionResult> {
	if (!TRANSITION_ROLES.has(actor.role ?? '')) {
		return { ok: false, httpStatus: 403, error: 'Only the brand can action a return.' };
	}

	// Issuing org only. supabaseAdmin bypasses RLS below, so this is the
	// ownership check that keeps it from becoming a cross-tenant write.
	const ra = await loadIssuingOrgReturn(returnId, actor.orgId);
	if (!ra) return { ok: false, httpStatus: 404, error: 'Return not found' };

	const decision = decideTransition(ra.status, input.transition, {
		declineReason: input.declineReason
	});
	if (!decision.ok) {
		return { ok: false, httpStatus: 400, error: decision.message, code: decision.code };
	}

	// Receipt moves physical stock, so dispositions, restock and the status
	// change happen inside one transaction rather than as three writes from
	// here. See 20260930000001_receive_return.sql.
	if (input.transition === 'receive') {
		const { data: lines } = await supabaseAdmin
			.from('return_lines')
			.select('id')
			.eq('return_id', ra.id);

		const dispositions = input.dispositions ?? [];
		const check = validateDispositions(
			(lines ?? []).map((l) => (l as { id: string }).id),
			dispositions
		);
		if (!check.ok) return { ok: false, httpStatus: 400, error: check.message };

		// Called as the signed-in user, not service-role: receive_return()
		// authorizes via get_user_role(), which needs an identity to resolve.
		const { error: receiveError } = await actor.supabase.rpc('receive_return', {
			p_return_id: ra.id,
			p_dispositions: dispositions
		});
		if (receiveError) return { ok: false, httpStatus: 400, error: receiveError.message };

		return { ok: true, status: 'received' };
	}

	const patch: Record<string, unknown> = { status: decision.to };

	if (input.transition === 'approve') {
		// ra_number and approved_at are set by
		// assign_ra_number_on_approval() (20260915000021), which covers both
		// this path and a brand creating an already-approved return. Writing
		// either here would be a second source for the same value.
		patch.approved_by = actor.userId;
	} else if (input.transition === 'decline') {
		patch.decline_reason = input.declineReason?.trim() ?? null;
	}

	const { error: updateError } = await supabaseAdmin
		.from('return_authorizations')
		.update(patch)
		.eq('id', ra.id);
	if (updateError) return { ok: false, httpStatus: 400, error: updateError.message };

	return { ok: true, status: decision.to };
}
