/**
 * The return authorization state machine.
 *
 *                   ┌─ declined
 *   requested ──────┤
 *      │            └─ approved ──── received ──── closed
 *      └─ cancelled                     │
 *                                       └─ cancelled
 *
 * `closed` is reached by issuing a credit memo (SCO-187) and is deliberately
 * absent from the map below: this module must not let anything close a return
 * without going through that path.
 *
 * Pure. No database, no clock. The endpoints enforce ownership and role; this
 * decides only whether a move is legal at all, so both can be tested for what
 * they actually do.
 */

export type ReturnStatus =
	| 'requested'
	| 'approved'
	| 'declined'
	| 'received'
	| 'closed'
	| 'cancelled';

/** The four moves this module owns. `closed` belongs to the credit memo. */
export type ReturnTransition = 'approve' | 'decline' | 'receive' | 'cancel';

const TRANSITIONS: Record<ReturnTransition, { from: ReturnStatus[]; to: ReturnStatus }> = {
	approve: { from: ['requested'], to: 'approved' },
	decline: { from: ['requested'], to: 'declined' },
	receive: { from: ['approved'], to: 'received' },
	// Cancellable right up until the goods are in hand. Once received the stock
	// has already moved, so withdrawing is a new physical event rather than a
	// change of mind, and there is no path back.
	cancel: { from: ['requested', 'approved'], to: 'cancelled' }
};

export type TransitionRefusal =
	| { ok: false; code: 'illegal_transition'; message: string }
	| { ok: false; code: 'decline_reason_required'; message: string };

export type TransitionDecision = { ok: true; to: ReturnStatus } | TransitionRefusal;

/**
 * Whether `transition` may be applied to a return currently at `from`.
 *
 * A decline carries a reason because the requester has to learn why. Declining
 * silently is how a buyer ends up phoning their rep to ask what happened, which
 * is the failure this is here to prevent rather than a validation nicety.
 */
export function decideTransition(
	from: string,
	transition: ReturnTransition,
	options: { declineReason?: string | null } = {}
): TransitionDecision {
	const rule = TRANSITIONS[transition];

	if (!rule.from.includes(from as ReturnStatus)) {
		return {
			ok: false,
			code: 'illegal_transition',
			message: `A ${from} return cannot be ${pastTense(transition)}.`
		};
	}

	if (transition === 'decline' && !options.declineReason?.trim()) {
		return {
			ok: false,
			code: 'decline_reason_required',
			message: 'Give a reason for declining, so the requester knows what happened.'
		};
	}

	return { ok: true, to: rule.to };
}

function pastTense(transition: ReturnTransition): string {
	return transition === 'cancel' ? 'cancelled' : `${transition}d`;
}

/**
 * Whether a line's goods should go back into sellable stock.
 *
 * Three reasons to skip, and only the first two are obvious:
 *
 *   1. No resolved variant. A free-entry line that never matched the catalogue
 *      has nothing to increment.
 *
 *   2. `stock_qty IS NULL`. Per 20260422000001 that means "no signal yet" and
 *      the UI renders no pill. Writing a number invents inventory tracking for
 *      an org that never opted into it, and the first thing they would see is a
 *      stock count that appeared from nowhere and counts only returns.
 *
 *   3. The variant is mirrored from Shopify. That same migration states it
 *      outright: "Presence means this variant is mirrored from Shopify.
 *      Threadline UI must not allow direct edits to stock_qty when set."
 *      Shopify is the system of record, our write would be silently reverted on
 *      the next sync, and in between the two disagree. The restock has to
 *      happen in Shopify.
 *
 * Skipping is not the same as failing. The disposition is still recorded, so
 * the physical decision is on file either way.
 */
export function shouldRestock(line: {
	disposition: string | null;
	variant_id: string | null;
	variant?: { stock_qty: number | null; shopify_variant_id: string | null } | null;
}): boolean {
	if (line.disposition !== 'restock') return false;
	if (!line.variant_id || !line.variant) return false;
	if (line.variant.stock_qty === null) return false;
	if (line.variant.shopify_variant_id) return false;
	return true;
}

export type DispositionInput = { lineId: string; disposition: string };

export const DISPOSITIONS = ['restock', 'damaged', 'destroy'] as const;

/**
 * Validates the dispositions submitted with a receipt.
 *
 * Every line needs one. Receiving goods without saying what happened to them
 * leaves the return half-recorded, and the person who can answer is the one
 * holding the box right now.
 */
export function validateDispositions(
	lineIds: string[],
	submitted: DispositionInput[]
): { ok: true } | { ok: false; message: string } {
	const byId = new Map(submitted.map((d) => [d.lineId, d.disposition]));

	const missing = lineIds.filter((id) => !byId.has(id));
	if (missing.length > 0) {
		return {
			ok: false,
			message: `Set a disposition for every line before receiving (${missing.length} left).`
		};
	}

	const unknown = submitted.filter(
		(d) => !(DISPOSITIONS as readonly string[]).includes(d.disposition)
	);
	if (unknown.length > 0) {
		return { ok: false, message: `Unknown disposition "${unknown[0].disposition}".` };
	}

	const stray = submitted.filter((d) => !lineIds.includes(d.lineId));
	if (stray.length > 0) {
		return { ok: false, message: 'A disposition was submitted for a line not on this return.' };
	}

	return { ok: true };
}
