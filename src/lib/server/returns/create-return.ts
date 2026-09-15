/**
 * Deciding what a new return authorization row looks like (SCO-184).
 *
 * Pure. The caller does the database work and hands the results in.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * The one thing to understand before changing anything here
 * ───────────────────────────────────────────────────────────────────────────
 *
 * `return_authorizations.organization_id` is the **issuing brand org**, which on
 * a federated order is NOT `orders.organization_id` — that is always the rep
 * org. The issuing org is whoever owns `orders.brand_id`, resolved through
 * `brands.organization_id`. Getting this backwards does not fail loudly: it
 * writes a row whose RLS predicates point at the wrong tenant, so the brand
 * that has to action the return cannot see it and the rep who cannot action it
 * can.
 *
 * Same shape as `invoices`, and for the same reason: the rep sold the order,
 * the brand takes the goods back and issues the credit.
 */

export type ReturnCreateStatus = 'requested' | 'approved';

/**
 * Who the created row belongs to, and what state it starts in.
 *
 * Maps one-to-one onto the columns the INSERT sets.
 */
export interface ReturnOwnership {
	organizationId: string;
	brandId: string;
	orderOrgId: string | null;
	accountId: string | null;
	status: ReturnCreateStatus;
}

/**
 * The brand approves, so a brand creating a return approves it in the same act.
 * Anyone else is opening a request.
 *
 * Membership of the issuing org is the test, not `orgType`. A rep org can own a
 * "manual brand" locally, in which case its own members are the issuing org for
 * that brand's returns and there is no second party to ask.
 *
 * This decides the value the INSERT asks for; whether it is *allowed* is
 * enforced independently by the three INSERT policies in 20260915000010, which
 * pin the status each initiator may create at. Both layers say the same thing
 * on purpose.
 */
export function initialReturnStatus(
	actorOrgId: string | null,
	issuingOrgId: string
): ReturnCreateStatus {
	return actorOrgId !== null && actorOrgId === issuingOrgId ? 'approved' : 'requested';
}

/**
 * `order_org_id` for a free-entry return, which has no order to copy it from.
 *
 * It carries the requesting org when that org is not the issuer, which is the
 * only thing keeping a rep able to see a request they raised. When the issuer
 * raises it there is no rep involved and the column stays NULL.
 *
 * Returning the issuing org here instead would be worse than useless: the rep
 * SELECT arm is `order_org_id IN get_user_org_ids() AND order_org_id <>
 * organization_id`, so an equal value matches nothing while still implying a
 * relationship that is not there.
 */
export function freeEntryOrderOrgId(
	actorOrgId: string | null,
	issuingOrgId: string
): string | null {
	if (actorOrgId === null || actorOrgId === issuingOrgId) return null;
	return actorOrgId;
}

export interface SourceOrderForReturn {
	id: string;
	organization_id: string;
	brand_id: string;
	account_id: string | null;
	status: string;
	delivered_at: string | null;
}

/**
 * Ownership for a return derived from an order.
 *
 * Every key comes from the order or from the brand's owning org. Nothing is
 * taken from the client, which is what closes the forgery hole the RLS INSERT
 * policies deliberately left to this layer: a buyer can otherwise post keys
 * naming a brand org they have no relationship with and drop a fabricated
 * request into that org's queue.
 */
export function ownershipFromOrder(
	order: SourceOrderForReturn,
	brandOrgId: string,
	actorOrgId: string | null
): ReturnOwnership {
	return {
		organizationId: brandOrgId,
		brandId: order.brand_id,
		orderOrgId: order.organization_id,
		accountId: order.account_id,
		status: initialReturnStatus(actorOrgId, brandOrgId)
	};
}

/** Ownership for a free-entry return, where the client names the brand and account. */
export function ownershipFromFreeEntry(
	brandId: string,
	brandOrgId: string,
	accountId: string,
	actorOrgId: string | null
): ReturnOwnership {
	return {
		organizationId: brandOrgId,
		brandId,
		orderOrgId: freeEntryOrderOrgId(actorOrgId, brandOrgId),
		accountId,
		status: initialReturnStatus(actorOrgId, brandOrgId)
	};
}

export type OrderReturnRefusal =
	| 'not_delivered'
	| 'returns_disabled'
	| 'window_expired'
	| 'no_account';

/**
 * Whether this order can be returned against at all, before quantities are
 * considered.
 *
 * `isIssuer` is the escape hatch, and it is deliberate: a brand is never blocked
 * by its own return window. Brands waive their policy routinely, and a product
 * that cannot express the waiver just moves the return into email. The window
 * is enforced against the people the policy is addressed to.
 */
export function refuseOrderReturn(params: {
	order: SourceOrderForReturn;
	isIssuer: boolean;
	windowOk: boolean;
	windowReason: 'returns_disabled' | 'not_delivered' | 'window_expired' | null;
}): OrderReturnRefusal | null {
	const { order, isIssuer, windowOk, windowReason } = params;

	// Delivered only. The window is measured from delivery, so a shipped order
	// has no start to count from, and refusing goods in transit is a
	// cancellation rather than a return.
	if (order.status !== 'delivered') return 'not_delivered';

	// A return with no account cannot be credited to anyone. Freeform orders
	// carry no account and cannot leave draft, so this is belt and braces.
	if (!order.account_id) return 'no_account';

	if (isIssuer) return null;

	return windowOk ? null : (windowReason ?? 'window_expired');
}

export const RETURN_REFUSAL_MESSAGES: Record<OrderReturnRefusal, string> = {
	not_delivered: 'Returns open once the order is delivered.',
	returns_disabled: 'This brand is not accepting returns.',
	window_expired: 'The return window for this order has closed.',
	no_account: 'This order has no account to credit.'
};
