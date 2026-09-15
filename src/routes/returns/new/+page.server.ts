import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { logSupabaseError } from '$lib/server/log-supabase-error.js';
import { createReturnSchema } from '$lib/schemas/return-authorization.js';
import { loadReturnPolicy } from '$lib/server/returns/policy.js';
import { checkReturnEligibility, validateReturnQuantities } from '$lib/server/returns/credit.js';
import {
	ownershipFromFreeEntry,
	ownershipFromOrder,
	refuseOrderReturn,
	RETURN_REFUSAL_MESSAGES,
	type SourceOrderForReturn
} from '$lib/server/returns/create-return.js';

/**
 * Creating a return authorization (SCO-184).
 *
 * ───────────────────────────────────────────────────────────────────────────
 * Which client reads what, and why
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Reads of `orders`, `order_lines`, `brands` and `accounts` go through
 * `locals.supabase`, so RLS decides visibility for all three actors at once:
 * a brand via `get_user_brand_ids`, a rep via `federated_order_links`, a buyer
 * via `get_buyer_account_ids`. Reimplementing those three paths against
 * `supabaseAdmin` is how `/api/orders/[id]/pdf` shipped an IDOR (SCO-165), so
 * this route does not do it. An order the caller cannot see simply is not
 * found, and the refusal is identical to a bad id.
 *
 * `supabaseAdmin` is used in exactly two places, both deliberate and both
 * narrow:
 *
 *   1. `loadReturnPolicy()`, because the window lives on the brand org's
 *      `organizations` row, which no buyer or rep can read. See that module.
 *
 *   2. The prior-returns sum below. A buyer can only see returns for their own
 *      account, so an RLS-scoped sum would miss a return the brand logged and
 *      hand the buyer back quantity that is already gone. The query is keyed to
 *      an order the caller has already been authorized against and returns
 *      nothing but quantities.
 */

const ORDER_SELECT = 'id, organization_id, brand_id, account_id, status, delivered_at';

/** Orders offered in the picker. Delivered only; see refuseOrderReturn(). */
const PICKER_SELECT =
	'id, order_number, total_amount, delivered_at, brand_id, account_id, brands(name), accounts(business_name)';

type PickerRow = {
	id: string;
	order_number: string | null;
	total_amount: number | string | null;
	delivered_at: string | null;
	brand_id: string;
	account_id: string | null;
	brands: { name?: string } | { name?: string }[] | null;
	accounts: { business_name?: string } | { business_name?: string }[] | null;
};

/** Supabase infers a joined select as an object or an array depending on shape. */
function joined<T>(value: T | T[] | null): T | null {
	if (!value) return null;
	return Array.isArray(value) ? (value[0] ?? null) : value;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const form = await superValidate(zod4(createReturnSchema));

	// Deep link from order detail: /returns/new?order=<id>. The action
	// re-derives and re-authorizes everything, so this is a convenience only.
	const preselectedOrderId = url.searchParams.get('order');
	if (preselectedOrderId) {
		form.data.mode = 'order';
		form.data.orderId = preselectedOrderId;
	}

	const { supabase } = locals;

	const ordersResult = await supabase
		.from('orders')
		.select(PICKER_SELECT)
		.eq('status', 'delivered')
		.order('delivered_at', { ascending: false })
		.limit(200);
	logSupabaseError('returns/new delivered orders', ordersResult.error);

	const orders = ((ordersResult.data ?? []) as unknown as PickerRow[]).map((o) => ({
		id: o.id,
		orderNumber: o.order_number,
		total: Number(o.total_amount ?? 0),
		deliveredAt: o.delivered_at,
		brandId: o.brand_id,
		brandName: joined(o.brands)?.name ?? null,
		accountName: joined(o.accounts)?.business_name ?? null
	}));

	// Free-entry pickers. RLS scopes both: a rep sees connected brands, a buyer
	// sees the brands their accounts can buy from.
	const [brandsResult, accountsResult] = await Promise.all([
		supabase.from('brands').select('id, name, organization_id').order('name'),
		supabase.from('accounts').select('id, business_name').order('business_name')
	]);
	logSupabaseError('returns/new brands', brandsResult.error);
	logSupabaseError('returns/new accounts', accountsResult.error);

	return {
		form,
		orders,
		brands: (brandsResult.data ?? []) as Array<{
			id: string;
			name: string;
			organization_id: string;
		}>,
		accounts: (accountsResult.data ?? []) as Array<{ id: string; business_name: string }>
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod4(createReturnSchema));
		if (!form.valid) return fail(400, { form });

		const { supabase } = locals;
		const actorOrgId = locals.organization?.id ?? null;
		const { mode, orderId, brandId, accountId, reason, reasonCode, lines } = form.data;

		// ── Resolve the issuing brand org ────────────────────────────────────
		// Everything downstream keys off this. It is the org that owns the
		// brand, which on a federated order is not the order's own org.
		let sourceOrder: SourceOrderForReturn | null = null;
		let resolvedBrandId: string;

		if (mode === 'order') {
			const orderResult = await supabase
				.from('orders')
				.select(ORDER_SELECT)
				.eq('id', orderId!)
				.maybeSingle();

			if (orderResult.error) {
				logSupabaseError('returns/new order lookup', orderResult.error);
				return fail(500, { form, message: 'Could not load that order.' });
			}
			if (!orderResult.data) {
				// Not found and not authorized are the same answer on purpose, so
				// order existence does not leak across tenants.
				return fail(404, { form, message: 'Order not found.' });
			}

			sourceOrder = orderResult.data as unknown as SourceOrderForReturn;
			resolvedBrandId = sourceOrder.brand_id;
		} else {
			resolvedBrandId = brandId!;
		}

		const brandResult = await supabase
			.from('brands')
			.select('id, organization_id')
			.eq('id', resolvedBrandId)
			.maybeSingle();

		if (brandResult.error) {
			logSupabaseError('returns/new brand lookup', brandResult.error);
			return fail(500, { form, message: 'Could not load that brand.' });
		}
		if (!brandResult.data) return fail(404, { form, message: 'Brand not found.' });

		const issuingOrgId = (brandResult.data as { organization_id: string }).organization_id;
		const isIssuer = actorOrgId !== null && actorOrgId === issuingOrgId;

		// ── Eligibility, and the quantity cap ────────────────────────────────
		if (mode === 'order' && sourceOrder) {
			const policy = await loadReturnPolicy(issuingOrgId);
			const eligibility = checkReturnEligibility({
				policy,
				deliveredAt: sourceOrder.delivered_at,
				now: new Date()
			});

			const refusal = refuseOrderReturn({
				order: sourceOrder,
				isIssuer,
				windowOk: eligibility.eligible,
				windowReason: eligibility.eligible ? null : eligibility.reason
			});
			if (refusal) return fail(400, { form, message: RETURN_REFUSAL_MESSAGES[refusal] });

			const linesResult = await supabase
				.from('order_lines')
				.select('id, qty')
				.eq('order_id', sourceOrder.id);
			if (linesResult.error) {
				logSupabaseError('returns/new order lines', linesResult.error);
				return fail(500, { form, message: 'Could not load the order items.' });
			}

			// Admin, and only for this one already-authorized order. See header.
			const priorResult = await supabaseAdmin
				.from('return_lines')
				.select('order_line_id, qty, return_authorizations!inner(order_id, status)')
				.eq('return_authorizations.order_id', sourceOrder.id)
				.not('order_line_id', 'is', null);
			if (priorResult.error) {
				logSupabaseError('returns/new prior returns', priorResult.error);
				return fail(500, { form, message: 'Could not check what has already been returned.' });
			}

			const priorRows = (priorResult.data ?? []) as unknown as Array<{
				order_line_id: string;
				qty: number;
				return_authorizations: { status: string } | { status: string }[] | null;
			}>;

			// A declined or cancelled return released its goods back; counting it
			// would permanently shrink what the buyer may return.
			const prior = priorRows
				.filter((r) => {
					const status = joined(r.return_authorizations)?.status;
					return status !== 'declined' && status !== 'cancelled';
				})
				.map((r) => ({ orderLineId: r.order_line_id, qty: Number(r.qty) }));

			const orderLines = ((linesResult.data ?? []) as Array<{ id: string; qty: number }>).map(
				(l) => ({ orderLineId: l.id, orderedQty: Number(l.qty) })
			);

			const requested = lines
				.filter((l) => l.orderLineId)
				.map((l) => ({ orderLineId: l.orderLineId!, qty: l.qty }));

			const violations = validateReturnQuantities(requested, orderLines, prior);
			if (violations.length > 0) {
				// Server-side, not just in the picker: a client can post any
				// order_line_id, including one from a different order, which
				// validateReturnQuantities scores as zero available.
				for (const v of violations) {
					const idx = lines.findIndex((l) => l.orderLineId === v.orderLineId);
					if (idx >= 0) {
						form.errors.lines = form.errors.lines ?? {};
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						(form.errors.lines as any)[idx] = {
							qty: [
								v.available === 0
									? 'This item has already been returned in full.'
									: `Only ${v.available} left to return.`
							]
						};
					}
				}
				return fail(400, { form });
			}
		}

		// ── Write ────────────────────────────────────────────────────────────
		const ownership =
			mode === 'order' && sourceOrder
				? ownershipFromOrder(sourceOrder, issuingOrgId, actorOrgId)
				: ownershipFromFreeEntry(resolvedBrandId, issuingOrgId, accountId!, actorOrgId);

		const insertResult = await supabase
			.from('return_authorizations')
			.insert({
				organization_id: ownership.organizationId,
				order_id: mode === 'order' ? sourceOrder!.id : null,
				brand_id: ownership.brandId,
				order_org_id: ownership.orderOrgId,
				account_id: ownership.accountId,
				status: ownership.status,
				reason: reason || null,
				reason_code: reasonCode,
				requested_by: locals.user?.id ?? null,
				created_by: locals.user?.id ?? null
			})
			.select('id')
			.single();

		if (insertResult.error || !insertResult.data) {
			logSupabaseError('returns/new insert', insertResult.error);
			return fail(500, { form, message: 'Could not create the return.' });
		}

		const returnId = (insertResult.data as { id: string }).id;

		// line_total is GENERATED ALWAYS. Sending it, even as null, is rejected.
		const lineRows = lines.map((l, i) => ({
			return_id: returnId,
			order_line_id: l.orderLineId,
			variant_id: l.variantId,
			style_number: l.styleNumber || null,
			description: l.description || null,
			color: l.color || null,
			size: l.size || null,
			qty: l.qty,
			unit_price: l.unitPrice,
			reason_code: l.reasonCode,
			sort_order: i
		}));

		const linesInsert = await supabase.from('return_lines').insert(lineRows);
		if (linesInsert.error) {
			logSupabaseError('returns/new line insert', linesInsert.error);
			// Compensating delete, and it has to be the admin client. The DELETE
			// policy on return_authorizations is `status = 'requested'` only, so a
			// brand-created return — which starts at `approved` — cannot be removed
			// through RLS, and the rollback would silently leave the very orphan it
			// exists to prevent. Narrow by construction: one row, created moments
			// ago in this request, whose id came from the insert above.
			await supabaseAdmin.from('return_authorizations').delete().eq('id', returnId);
			return fail(500, { form, message: 'Could not save the items on this return.' });
		}

		return message(form, { type: 'success' as const, returnId, status: ownership.status });
	}
};
