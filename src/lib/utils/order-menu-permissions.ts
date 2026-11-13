/**
 * Which items the order detail "More actions" menu offers.
 *
 * Each item mirrors the rule the server applies to the same action, so the
 * menu never offers something guaranteed to fail (SCO-173):
 *
 * - Clone: `/api/orders/[id]/clone` loads the order own-org only
 *   (`loadOwnOrgOrder`) and requires a writing role. A buyer or a federated
 *   viewer gets 404, a guest 403.
 * - Download PDF: `/api/orders/[id]/pdf` loads own-org or federated
 *   (`loadOrderForOrg`) and requires `ORDER_PDF_ROLES`.
 * - Cancel: a client-side update, so RLS decides. Own-org needs a writing role
 *   (`Admin/owner/member/sales can update orders`); federated needs admin or
 *   owner (`Brand admin updates federated order status`). The buyer policy's
 *   WITH CHECK only allows `draft` or `submitted`, so a buyer can never cancel.
 *
 * Return is resolved server-side (`resolveReturnEntry`) and is not decided here.
 */
import { FEDERATED_ORDER_STATUS_ROLES, ORDER_WRITE_ROLES } from './order-convert-permissions';

/** Roles that may generate an order PDF. */
export const ORDER_PDF_ROLES = new Set(['admin', 'owner', 'member', 'sales']);

const CLOSED_STATUSES = new Set(['shipped', 'delivered', 'cancelled']);

export interface OrderMenuViewer {
	isBuyer: boolean;
	isFederatedView: boolean;
	/** The viewer's role in their active org; empty when there is none. */
	role: string;
}

export interface OrderMenuItems {
	clone: boolean;
	downloadPdf: boolean;
	cancel: boolean;
}

export function orderMenuItems(viewer: OrderMenuViewer, status: string): OrderMenuItems {
	const { isBuyer, isFederatedView, role } = viewer;
	if (isBuyer) return { clone: false, downloadPdf: false, cancel: false };

	const cancelRoles = isFederatedView ? FEDERATED_ORDER_STATUS_ROLES : ORDER_WRITE_ROLES;
	return {
		clone: !isFederatedView && ORDER_WRITE_ROLES.has(role),
		downloadPdf: ORDER_PDF_ROLES.has(role),
		cancel: !CLOSED_STATUSES.has(status) && cancelRoles.has(role)
	};
}
