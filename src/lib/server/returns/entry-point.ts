import type { SupabaseClient } from '@supabase/supabase-js';
import { loadReturnPolicy } from './policy.js';
import { checkReturnEligibility } from './credit.js';
import {
	initialReturnStatus,
	mayCreateReturn,
	refuseOrderReturn,
	type SourceOrderForReturn
} from './create-return.js';

/**
 * Whether to offer a return on an order detail page, and what to call it.
 *
 * `null` means render nothing. That is the honest answer for a brand that has
 * returns switched off and for a buyer past the window: an action that appears
 * and then refuses on submit is worse than no action, because the user has
 * already decided to use it by the time it fails.
 *
 * The label differs by actor because the act differs. A brand is recording
 * something it has already agreed to, so "Log return". Anyone else is asking,
 * so "Request return". Same rule that decides the row's initial status.
 */
export interface ReturnEntryPoint {
	label: 'Log return' | 'Request return';
	href: string;
}

export async function resolveReturnEntry(params: {
	order: SourceOrderForReturn;
	supabase: SupabaseClient;
	actorOrgId: string | null;
	isBuyer: boolean;
	/** The caller's member role in `actorOrgId`; empty when there is none. */
	role: string;
}): Promise<ReturnEntryPoint | null> {
	const { order, supabase, actorOrgId, isBuyer, role } = params;

	// Cheapest gate first: nothing else matters until the goods have landed,
	// and this is true for every actor including the brand.
	if (order.status !== 'delivered') return null;

	// Same gate as the create action, so a guest is never offered an action
	// the server refuses (SCO-213).
	if (!mayCreateReturn({ isBuyer, role })) return null;

	const { data: brand } = await supabase
		.from('brands')
		.select('organization_id')
		.eq('id', order.brand_id)
		.maybeSingle();
	if (!brand) return null;

	const issuingOrgId = (brand as { organization_id: string }).organization_id;
	const isIssuer = actorOrgId !== null && actorOrgId === issuingOrgId;

	const policy = await loadReturnPolicy(issuingOrgId);
	const eligibility = checkReturnEligibility({
		policy,
		deliveredAt: order.delivered_at,
		now: new Date()
	});

	const refusal = refuseOrderReturn({
		order,
		isIssuer,
		windowOk: eligibility.eligible,
		windowReason: eligibility.eligible ? null : eligibility.reason
	});
	if (refusal) return null;

	return {
		// Keyed on the status the row would start at, not on isIssuer: a sales
		// member of the brand opens a request for an approver (SCO-213).
		label:
			initialReturnStatus(actorOrgId, issuingOrgId, role) === 'approved'
				? 'Log return'
				: 'Request return',
		href: `/returns/new?order=${order.id}`
	};
}
