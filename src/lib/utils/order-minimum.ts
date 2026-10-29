/**
 * Brand order minimums (SCO-137).
 *
 * An order under its brand's minimum can be saved as a draft but not
 * submitted, except by the org that owns the brand: the brand can accept an
 * under-minimum order and submit it anyway. Every submit path on the server
 * checks this through `findMinimumViolations`; the wizard and checkout use the
 * same rule to warn before the rep or buyer gets there.
 *
 * Pure, so the client and the server share it.
 */

export type MinimumSettings = {
	order_minimum_enabled: boolean;
	order_minimum_amount: number | null;
	/** The org that owns the brand, which is the org allowed to override. */
	owner_org_id: string;
};

export type MinimumAccount = {
	organization_id: string;
	order_minimum_override: number | string | null;
} | null;

/**
 * The minimum that applies to one order, or null when there is none.
 *
 * An account override replaces the brand's minimum ("Block orders under this
 * amount unless an account override applies"), but only on an account the
 * brand's own org owns. A rep's account lives in the rep's org, and letting it
 * set its own override would let a rep lower a connected brand's minimum.
 * An override of 0 means no minimum for that account.
 */
export function effectiveOrderMinimum(
	settings: MinimumSettings,
	account: MinimumAccount
): number | null {
	if (
		account &&
		account.organization_id === settings.owner_org_id &&
		account.order_minimum_override !== null &&
		account.order_minimum_override !== undefined
	) {
		const override = Number(account.order_minimum_override);
		if (Number.isFinite(override)) return override > 0 ? override : null;
	}
	if (!settings.order_minimum_enabled) return null;
	const amount = settings.order_minimum_amount;
	return amount !== null && amount > 0 ? amount : null;
}

/** How far under the minimum a total is, in dollars, or null when it clears it. */
export function minimumShortfall(total: number, minimum: number | null): number | null {
	if (minimum === null) return null;
	const shortfall = Math.round((minimum - total) * 100) / 100;
	return shortfall > 0 ? shortfall : null;
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Why a submit is blocked. Every blocked path shows this. */
export function minimumBlockedMessage(
	brandName: string,
	minimum: number,
	shortfall: number
): string {
	return `This order is ${money.format(shortfall)} under ${brandName}'s ${money.format(minimum)} minimum. Only ${brandName} can submit it.`;
}

/** Added where the writer can still save a draft instead (the order wizard). */
export function minimumDraftHint(brandName: string): string {
	return `Save it as a draft for ${brandName} to review.`;
}

/** Shown to a buyer at checkout, who has no draft to fall back on. */
export function minimumBuyerMessage(brandName: string, minimum: number, shortfall: number): string {
	return `Add ${money.format(shortfall)} to reach ${brandName}'s ${money.format(minimum)} minimum.`;
}

/** Shown to the brand itself, which may submit anyway. */
export function minimumOverrideNote(minimum: number, shortfall: number): string {
	return `This order is ${money.format(shortfall)} under your ${money.format(minimum)} minimum. You can still submit it.`;
}
