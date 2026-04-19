import { supabaseAdmin } from '$lib/server/supabase.js';
import type { ResolvedOrder, ResolvedLine } from './resolve.js';
import { THRESHOLDS } from './resolve.js';

// ── Types ────────────────────────────────────────────────────

export type Outcome = {
	status: 'submitted' | 'needs_review';
	reasons: Array<{ lineIndex: number | null; reason: string }>;
};

// ── Decision engine ──────────────────────────────────────────

/**
 * Decide whether a resolved order can be auto-submitted or needs review.
 *
 * Auto-submit requires ALL of:
 * - Account resolved with confidence ≥ ACCOUNT_MIN and unambiguous
 * - Brand resolved
 * - Every line's product confidence ≥ PRODUCT_MIN and unambiguous
 * - Every (size, qty) resolves to a product_variant
 * - Every qty in [1, 999]
 */
export function decideOutcome(resolved: ResolvedOrder & { kind: 'resolved' }): Outcome {
	const reasons: Outcome['reasons'] = [];

	// Account checks
	if (!resolved.accountId) {
		reasons.push({ lineIndex: null, reason: 'Account could not be identified' });
	} else if (resolved.accountConfidence < THRESHOLDS.ACCOUNT_MIN) {
		reasons.push({
			lineIndex: null,
			reason: `Account match confidence too low (${resolved.accountConfidence.toFixed(3)})`
		});
	}

	// Brand check
	if (!resolved.brandId) {
		reasons.push({ lineIndex: null, reason: 'Brand could not be identified' });
	}

	// Line-level checks
	for (const line of resolved.lines) {
		for (const issue of line.issues) {
			reasons.push({ lineIndex: line.lineIndex, reason: issue.detail });
		}

		for (const v of line.variants) {
			if (!v.variantId) {
				reasons.push({
					lineIndex: line.lineIndex,
					reason: `No variant found for size "${v.size}"`
				});
			}
			if (v.qty < 1 || v.qty > 999) {
				reasons.push({
					lineIndex: line.lineIndex,
					reason: `Quantity ${v.qty} out of range [1, 999]`
				});
			}
		}
	}

	return {
		status: reasons.length === 0 ? 'submitted' : 'needs_review',
		reasons
	};
}

// ── Execution ────────────────────────────────────────────────

/**
 * Execute the outcome: create the order and update the intake record.
 */
export async function executeOutcome(
	intakeId: string,
	resolved: ResolvedOrder & { kind: 'resolved' },
	outcome: Outcome
): Promise<void> {
	const orderStatus = outcome.status === 'submitted' ? 'submitted' : 'draft';

	if (!resolved.accountId || !resolved.brandId) {
		// Can't create an order without account and brand — mark for review
		await supabaseAdmin
			.from('email_intakes')
			.update({
				status: 'needs_review',
				needs_review_reasons: outcome.reasons
			})
			.eq('id', intakeId);

		// Save line resolutions for diagnostics
		await saveLineResolutions(intakeId, resolved.lines);
		return;
	}

	// Create the order
	const { data: order, error: orderError } = await supabaseAdmin
		.from('orders')
		.insert({
			organization_id: resolved.organizationId,
			account_id: resolved.accountId,
			brand_id: resolved.brandId,
			status: orderStatus,
			created_by: resolved.userId,
			notes: resolved.notes,
			start_ship_date: resolved.startShipDate,
			expected_ship_date: resolved.expectedShipDate
		})
		.select('id, order_number')
		.single();

	if (orderError || !order) {
		throw new Error(`Failed to create order: ${orderError?.message ?? 'unknown error'}`);
	}

	// Create order lines
	const orderLines = resolved.lines.flatMap((line) =>
		line.variants
			.filter((v) => v.variantId || outcome.status === 'needs_review')
			.map((v) => ({
				order_id: order.id,
				product_id: line.matchedProductId,
				description: line.matchedProductName ?? line.rawText,
				color: null as string | null, // color is on the product variant
				size: v.size,
				qty: v.qty,
				unit_price: v.unitPrice
			}))
	);

	if (orderLines.length > 0) {
		const { error: linesError } = await supabaseAdmin.from('order_lines').insert(orderLines);

		if (linesError) {
			throw new Error(`Failed to create order lines: ${linesError.message}`);
		}
	}

	// Update intake record
	await supabaseAdmin
		.from('email_intakes')
		.update({
			status: outcome.status,
			order_id: order.id,
			needs_review_reasons: outcome.reasons.length > 0 ? outcome.reasons : null
		})
		.eq('id', intakeId);

	// Save line resolutions for audit
	await saveLineResolutions(intakeId, resolved.lines);

	// TODO (Phase 4): Send confirmation or review email
}

async function saveLineResolutions(intakeId: string, lines: ResolvedLine[]): Promise<void> {
	const rows = lines.map((line) => ({
		intake_id: intakeId,
		line_index: line.lineIndex,
		raw_text: line.rawText,
		matched_product_id: line.matchedProductId,
		confidence: line.confidence,
		issues: line.issues.length > 0 ? line.issues : null
	}));

	if (rows.length > 0) {
		await supabaseAdmin.from('email_intake_line_resolutions').insert(rows);
	}
}
