import { error, fail } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types';
import { getReturn, viewerIsIssuer } from '$lib/server/queries/returns.js';
import {
	applyReturnTransition,
	TRANSITION_ROLES,
	type TransitionInput
} from '$lib/server/returns/apply-transition.js';
import { restockSkipReason, type RestockSkipReason } from '$lib/server/returns/transitions.js';
import { loadCreditDefaults } from '$lib/server/returns/credit-memo.js';
import { loadIssuingOrgReturn } from '$lib/server/returns/authorize-return.js';
import {
	declineReturnSchema,
	issueCreditMemoSchema,
	receiveReturnSchema
} from '$lib/schemas/return-transition.js';

/**
 * One return.
 *
 * `getReturn` reads through `locals.supabase`, so a return the caller cannot
 * see comes back null and this answers 404 — the same answer a bad id gets,
 * which is what keeps a return's existence from leaking across tenants. There
 * is no partial render: the page either has the whole record or does not exist.
 */
export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('data:returns');

	const ra = await getReturn(locals.supabase, params.id);
	if (!ra) throw error(404, 'Return not found');

	const scope = await locals.getQueryScope();
	const isIssuer = viewerIsIssuer(scope, ra);

	// The page only offers what applyReturnTransition would accept. It is not
	// the gate, just the reason a rep never sees a button that would 403.
	const canAction = isIssuer && TRANSITION_ROLES.has(locals.membership?.role ?? '');

	const creditDefaults =
		canAction && ra.status === 'received' ? await loadCreditDefaults(ra) : null;

	return {
		returnAuthorization: ra,
		creditDefaults,
		issueForm: await superValidate(
			creditDefaults
				? {
						restockingFee: creditDefaults.restockingFee,
						shippingDeduction: creditDefaults.shippingDeduction,
						creditTax: creditDefaults.creditTax
					}
				: { restockingFee: 0, shippingDeduction: 0, creditTax: 0 },
			zod4(issueCreditMemoSchema),
			{ errors: false }
		),
		isIssuer,
		canAction,
		restockSkips: canAction && ra.status === 'approved' ? await loadRestockSkips(locals, ra) : {},
		declineForm: await superValidate(zod4(declineReturnSchema)),
		receiveForm: await superValidate(zod4(receiveReturnSchema))
	};
};

type VariantStock = { stock_qty: number | null; shopify_variant_id: string | null };

/**
 * For each line, why Restock would leave stock untouched, keyed by line id.
 * Lines that would restock are absent. receive_return() skips untracked and
 * Shopify-mirrored variants on purpose; the dialog says so before anything
 * moves. Read as the user, since these are the brand's own variants.
 */
async function loadRestockSkips(
	locals: App.Locals,
	ra: { return_lines?: Array<{ id: string; variant_id: string | null }> | null }
): Promise<Record<string, RestockSkipReason>> {
	const lines = ra.return_lines ?? [];
	const ids = [...new Set(lines.map((l) => l.variant_id).filter((id): id is string => !!id))];

	const variants = new Map<string, VariantStock>();
	if (ids.length > 0) {
		const { data } = await locals.supabase
			.from('product_variants')
			.select('id, stock_qty, shopify_variant_id')
			.in('id', ids);
		for (const r of (data ?? []) as Array<VariantStock & { id: string }>) variants.set(r.id, r);
	}

	const skips: Record<string, RestockSkipReason> = {};
	for (const line of lines) {
		const reason = restockSkipReason({
			variant_id: line.variant_id,
			variant: line.variant_id ? (variants.get(line.variant_id) ?? null) : null
		});
		if (reason) skips[line.id] = reason;
	}
	return skips;
}

async function transition(locals: App.Locals, returnId: string, input: TransitionInput) {
	if (!locals.user || !locals.organization) {
		return { ok: false as const, httpStatus: 403 as const, error: 'Sign in again to continue.' };
	}
	return applyReturnTransition(
		{
			supabase: locals.supabase,
			userId: locals.user.id,
			orgId: locals.organization.id,
			role: locals.membership?.role
		},
		returnId,
		input
	);
}

export const actions: Actions = {
	approve: async ({ locals, params }) => {
		const result = await transition(locals, params.id, { transition: 'approve' });
		if (!result.ok) return fail(result.httpStatus, { message: result.error });
		return { action: 'approve' as const };
	},

	cancel: async ({ locals, params }) => {
		const result = await transition(locals, params.id, { transition: 'cancel' });
		if (!result.ok) return fail(result.httpStatus, { message: result.error });
		return { action: 'cancel' as const };
	},

	decline: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(declineReturnSchema));
		if (!form.valid) return fail(400, { form });

		const result = await transition(locals, params.id, {
			transition: 'decline',
			declineReason: form.data.reason
		});
		if (!result.ok) return fail(result.httpStatus, { form, message: result.error });

		return message(form, { type: 'success' as const });
	},

	receive: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(receiveReturnSchema));
		if (!form.valid) return fail(400, { form });

		const result = await transition(locals, params.id, {
			transition: 'receive',
			dispositions: form.data.dispositions
		});
		if (!result.ok) return fail(result.httpStatus, { form, message: result.error });

		return message(form, { type: 'success' as const });
	},

	issueCreditMemo: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(issueCreditMemoSchema));
		if (!form.valid) return fail(400, { form });

		if (!locals.organization || !TRANSITION_ROLES.has(locals.membership?.role ?? '')) {
			return fail(403, { form, message: 'Only the brand can issue a credit memo.' });
		}

		// Issuing org only. issue_credit_memo() re-checks the role itself; this
		// is what turns another org's return into a 404 rather than an error
		// message about it.
		const ra = await loadIssuingOrgReturn(params.id, locals.organization.id);
		if (!ra) return fail(404, { form, message: 'Return not found.' });

		// As the signed-in user: the function authorizes through get_user_role().
		const { data, error: issueError } = await locals.supabase.rpc('issue_credit_memo', {
			p_return_id: ra.id,
			p_restocking_fee: form.data.restockingFee,
			p_shipping_deduction: form.data.shippingDeduction,
			p_credit_tax: form.data.creditTax
		});
		if (issueError) return fail(400, { form, message: issueError.message });

		const issued = data as { credit_memo_number: string | null } | null;
		return message(form, {
			type: 'success' as const,
			creditMemoNumber: issued?.credit_memo_number ?? null
		});
	}
};
