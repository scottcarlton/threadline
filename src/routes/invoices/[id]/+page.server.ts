import { error, fail, redirect } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod4 } from 'sveltekit-superforms/adapters';
import type { PageServerLoad, Actions } from './$types';
import { getInvoiceForOrg } from '$lib/server/queries/invoices.js';
import { loadIssuingOrgInvoice, type InvoiceRow } from '$lib/server/invoices/authorize-invoice.js';
import {
	invoiceJustSettled,
	invoicePaidNotification,
	repCommissionNotification
} from '$lib/server/invoices/paid-notification.js';
import { createNotification, notifyOrgMembers } from '$lib/server/notifications.js';
import { supabaseAdmin } from '$lib/server/supabase.js';
import { recordPaymentSchema, voidInvoiceSchema } from '$lib/schemas/invoice-payment.js';
import { acceptedMethodsOnly } from '$lib/payment-methods.js';

/**
 * Tell the rep who owns the relationship that the invoice behind their
 * commission has been paid.
 *
 * `rep_user_id` is the rep of record, kept separate from `created_by` so an
 * admin submitting on someone's behalf does not take the attribution
 * (20260421000004). It is nullable on pre-existing orders, hence the fallback.
 *
 * Written against the rep's own org, which is how it reaches them:
 * `notifications` is read with `user_id = auth.uid()` and no org filter, so
 * cross-org delivery needs no new mechanism.
 */
async function notifyRepOfRecord(
	orderId: string,
	repOrgId: string,
	invoiceNumber: string | null
): Promise<void> {
	const { data: order } = await supabaseAdmin
		.from('orders')
		.select('id, order_number, rep_user_id, created_by')
		.eq('id', orderId)
		.maybeSingle();

	const repUserId = (order?.rep_user_id ?? order?.created_by) as string | undefined;
	if (!order || !repUserId) return;

	await createNotification({
		organizationId: repOrgId,
		userId: repUserId,
		...repCommissionNotification({
			orderId: order.id as string,
			orderNumber: (order.order_number as string | null) ?? null,
			invoiceNumber
		})
	});
}

/** Recording money and withdrawing a document are both accounting acts. */
const MONEY_ROLES = new Set(['admin', 'owner']);

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('data:invoices');

	if (!locals.organization) throw redirect(303, '/insight');
	if (locals.orgType !== 'brand') throw redirect(303, '/insight');

	const scope = await locals.getQueryScope();
	if (!scope) throw error(404, 'Invoice not found');

	// Scoped to the issuing org inside the query. 404 rather than 403 so an
	// invoice in another org is indistinguishable from one that does not exist.
	const invoice = await getInvoiceForOrg(params.id, scope);
	if (!invoice) throw error(404, 'Invoice not found');

	const role = locals.membership?.role ?? '';

	return {
		invoice,
		today: new Date().toISOString().slice(0, 10),
		canSend: ['admin', 'owner', 'member'].includes(role),
		canRecordMoney: MONEY_ROLES.has(role),
		// The org's accepted methods, not the full canonical list: offering a
		// method the brand does not take invites a payment record that does not
		// match how the money actually arrived.
		paymentMethods: acceptedMethodsOnly(
			(locals.organization.accepted_payment_methods ?? []) as string[]
		),
		paymentForm: await superValidate(zod4(recordPaymentSchema)),
		voidForm: await superValidate(zod4(voidInvoiceSchema))
	};
};

export const actions: Actions = {
	recordPayment: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(recordPaymentSchema));
		if (!form.valid) return fail(400, { form });

		if (!locals.organization || !MONEY_ROLES.has(locals.membership?.role ?? '')) {
			return fail(403, { form, message: 'Only an admin or owner can record a payment.' });
		}

		// Issuing org only, and never via the federation arm: a rep may read a
		// sent invoice but must not record money against it.
		const invoice = await loadIssuingOrgInvoice(params.id, locals.organization.id);
		if (!invoice) return fail(404, { form, message: 'Invoice not found.' });

		if (invoice.status === 'draft') {
			return fail(400, {
				form,
				message: 'This invoice has not been issued yet, so there is nothing to pay.'
			});
		}
		if (invoice.status === 'void') {
			return fail(400, { form, message: 'This invoice has been voided.' });
		}

		const accepted = (locals.organization.accepted_payment_methods ?? []) as string[];
		if (form.data.method && !accepted.includes(form.data.method)) {
			return fail(400, { form, message: 'That payment method is not one your org accepts.' });
		}

		const { error: insertError } = await supabaseAdmin.from('invoice_payments').insert({
			invoice_id: invoice.id,
			organization_id: locals.organization.id,
			amount: form.data.amount,
			paid_on: form.data.paidOn,
			method: form.data.method ?? null,
			reference: form.data.reference ?? null,
			note: form.data.note ?? null,
			recorded_by: locals.user?.id ?? null
		});

		if (insertError) {
			return fail(500, { form, message: insertError.message });
		}

		// amount_paid and status are updated by recalc_invoice_amount_paid(),
		// so nothing is written to `invoices` here. Read back what the trigger
		// settled on rather than predicting it: the rule for when an invoice
		// counts as paid lives in the database, and duplicating it here is how
		// the two drift.
		const settled = await loadIssuingOrgInvoice<
			InvoiceRow & {
				invoice_number: string | null;
				total: number | string | null;
				order_id: string;
			}
		>(
			params.id,
			locals.organization.id,
			'id, organization_id, order_org_id, account_id, status, invoice_number, total, order_id'
		);

		if (settled && invoiceJustSettled(invoice.status, settled.status)) {
			// Colleagues in the issuing org, not the person who just typed it in.
			//
			// Not awaited, for the same reason the order-status notifications are
			// not: a notification failing must not fail the payment that was
			// already written.
			notifyOrgMembers(locals.organization.id, locals.user?.id ?? '', {
				actorUserId: locals.user?.id ?? null,
				...invoicePaidNotification(settled)
			});

			// The rep is paid on goods sold, so this is the moment their commission
			// on the order stops being a projection. Only for a genuinely federated
			// order: when the order org and the issuing org match, the brand sold it
			// itself and there is no rep to tell.
			if (settled.order_org_id !== locals.organization.id) {
				notifyRepOfRecord(settled.order_id, settled.order_org_id, settled.invoice_number);
			}
		}

		return message(form, { type: 'success', action: 'payment' as const });
	},

	voidInvoice: async ({ request, locals, params }) => {
		const form = await superValidate(request, zod4(voidInvoiceSchema));
		if (!form.valid) return fail(400, { form });

		if (!locals.organization || !MONEY_ROLES.has(locals.membership?.role ?? '')) {
			return fail(403, { form, message: 'Only an admin or owner can void an invoice.' });
		}

		const invoice = await loadIssuingOrgInvoice(params.id, locals.organization.id);
		if (!invoice) return fail(404, { form, message: 'Invoice not found.' });

		// void_invoice() re-checks the role itself, so this is defence in depth
		// rather than the only gate. It runs as the caller so get_user_role()
		// resolves to the person clicking the button.
		const { error: voidError } = await locals.supabase.rpc('void_invoice', {
			p_invoice_id: invoice.id,
			p_reason: form.data.reason ?? null
		});

		if (voidError) {
			return fail(400, { form, message: voidError.message });
		}

		return message(form, { type: 'success', action: 'void' as const });
	}
};
