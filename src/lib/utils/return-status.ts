import type {
	ReturnAuthorization,
	ReturnDisposition,
	ReturnLine,
	ReturnStatus
} from '$lib/types/database';

/** A return as the list renders it, with the joins the list needs. */
export type ReturnListRow = ReturnAuthorization & {
	orders: { order_number: string } | null;
	accounts: { business_name: string } | null;
	brands: { name: string } | null;
};

/** One return plus its lines. */
export type ReturnDetail = ReturnListRow & {
	return_lines: ReturnLine[];
};

/**
 * Pure display logic for returns, used by both the server query layer and the
 * pages that render it. Lives in utils rather than server/ precisely because
 * the list page needs it in the browser: `$lib/server/**` is server-only and
 * importing it from a component breaks the build. Same split as
 * `invoice-status.ts`.
 */

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
	requested: 'Requested',
	approved: 'Approved',
	declined: 'Declined',
	received: 'Received',
	closed: 'Credited',
	cancelled: 'Cancelled'
};

/**
 * `closed` is labelled "Credited" rather than "Closed".
 *
 * The column name describes the state machine; the label has to describe what
 * happened to the person reading it. A return reaches `closed` only by having a
 * credit memo issued against it, so "Credited" is both truer and the thing a
 * buyer is actually looking for.
 */

export const RETURN_DISPOSITION_LABELS: Record<ReturnDisposition, string> = {
	restock: 'Restock',
	damaged: 'Damaged',
	destroy: 'Destroy'
};

/** Statuses where the return is still moving. */
const OPEN_STATUSES: ReturnStatus[] = ['requested', 'approved', 'received'];

export function returnIsOpen(status: ReturnStatus): boolean {
	return OPEN_STATUSES.includes(status);
}

/**
 * Whether this row is waiting on the viewer to do something.
 *
 * Only ever true for the issuing brand. Approve, decline, receive and credit
 * are all brand acts (there is no rep or buyer UPDATE policy at all), so a rep
 * or buyer looking at a `requested` return is watching, not queueing. Telling
 * them it "needs action" would be telling them to do something they are not
 * permitted to do.
 */
export function returnNeedsAction(status: ReturnStatus, viewerIsIssuer: boolean): boolean {
	return viewerIsIssuer && returnIsOpen(status);
}

/**
 * Sort rank for the brand's queue: the oldest thing blocking someone else
 * first.
 *
 * `requested` outranks everything because a buyer is waiting on an answer.
 * `approved` is next: the brand has agreed and the goods are in transit.
 * `received` after that: the goods are in, the credit is owed. Everything
 * settled falls to the bottom in one bucket, ordered by date like any log.
 */
export function returnQueueRank(status: ReturnStatus): number {
	switch (status) {
		case 'requested':
			return 0;
		case 'approved':
			return 1;
		case 'received':
			return 2;
		default:
			return 3;
	}
}

/** Units coming back, which is not the same as the number of lines. */
export function returnUnits(lines: Array<{ qty: number | string | null }>): number {
	return lines.reduce((sum, l) => sum + Number(l.qty ?? 0), 0);
}

/** Merchandise value of the lines, before any deduction. */
export function returnLinesValue(
	lines: Array<{ qty: number | string | null; unit_price: number | string | null }>
): number {
	return lines.reduce((sum, l) => sum + Number(l.qty ?? 0) * Number(l.unit_price ?? 0), 0);
}

/**
 * Whether a credit memo has actually been issued.
 *
 * Keyed on `credit_memo_number`, not on `credit_total` and not on
 * `status === 'closed'`. The money columns carry zeroes from the moment the row
 * is created, so a zero total is indistinguishable from an uncredited return;
 * the number is the only thing that appears exactly once, at issue, and is
 * frozen from then on by `reject_issued_credit_memo_edits()`.
 */
export function returnCreditIssued(ra: { credit_memo_number: string | null }): boolean {
	return !!ra.credit_memo_number;
}

export type ReturnMetrics = {
	openCount: number;
	requestedCount: number;
	creditedTotal: number;
};

/**
 * Header counts for the list.
 *
 * `creditedTotal` sums only returns with an issued memo, for the same reason
 * `returnCreditIssued` exists: summing `credit_total` across every row would
 * fold in zeroes from returns nobody has priced yet and read as a real figure.
 */
export function computeReturnMetrics(rows: ReturnListRow[]): ReturnMetrics {
	let openCount = 0;
	let requestedCount = 0;
	let creditedTotal = 0;

	for (const row of rows) {
		if (returnIsOpen(row.status)) openCount += 1;
		if (row.status === 'requested') requestedCount += 1;
		if (returnCreditIssued(row)) creditedTotal += Number(row.credit_total ?? 0);
	}

	return { openCount, requestedCount, creditedTotal };
}
