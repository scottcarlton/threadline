import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { allowedRecipients } from '$lib/server/account-recipients';
import { deliverDocument } from '$lib/server/document-email';
import { generateInvoicePdf, type InvoiceData } from '$lib/server/invoice-pdf';
import { loadIssuingOrgInvoice, type InvoiceRow } from '$lib/server/invoices/authorize-invoice';
import { dueDateFromTerms } from '$lib/payment-methods';

type InvoiceForSend = InvoiceRow &
	InvoiceData & { order_id: string; brand_id: string; account_id: string | null };

// Issuing a bill is not a sales action. This is deliberately narrower than the
// PDF endpoint's role set and matches the UPDATE policy on `invoices`.
const SEND_ROLES = new Set(['admin', 'owner', 'member']);

export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!SEND_ROLES.has(locals.membership?.role ?? '')) {
		return json({ error: 'Insufficient permissions to send an invoice.' }, { status: 403 });
	}

	const body = (await request.json().catch(() => ({}))) as { to?: string; message?: string };

	// Issuing org only. A rep can read a sent invoice but must never issue one,
	// so this does not follow the federation arm even for a caller who could
	// legitimately read the row.
	const invoice = await loadIssuingOrgInvoice<InvoiceForSend>(
		params.id,
		locals.organization.id,
		'*, orders(order_number), brands(name)'
	);

	if (!invoice) {
		return json({ error: 'Invoice not found' }, { status: 404 });
	}

	if (invoice.status !== 'draft') {
		return json(
			{ error: `This invoice has already been issued (${invoice.status}).` },
			{ status: 409 }
		);
	}

	const allowed = await allowedRecipients(invoice.account_id);
	const requested = body.to?.trim().toLowerCase();

	if (requested && !allowed.includes(requested)) {
		return json({ error: 'That address is not a contact on this account.' }, { status: 400 });
	}

	const recipient = requested ?? allowed[0];
	if (!recipient) {
		return json(
			{ error: 'This account has no contact email to send the invoice to.' },
			{ status: 400 }
		);
	}

	// The terms-to-days mapping lives in payment-methods.ts and is passed into
	// the RPC rather than re-derived in SQL, so there is only one copy of it.
	// `other` terms yield null, and the invoice is issued without a due date
	// rather than with an invented one.
	const issueDate = new Date().toISOString().slice(0, 10);
	const dueDate = dueDateFromTerms(invoice.payment_terms, issueDate);

	// Numbering, dates, and the frozen money all happen in this one call, so
	// there is no window where the invoice is half-issued.
	// Called as the signed-in user, not service-role: send_invoice() authorizes
	// the caller via get_user_role(), which resolves to whoever is holding this
	// session. Under supabaseAdmin there is no auth.uid() and the check would
	// have nothing to identify.
	const { data: issued, error: sendError } = await locals.supabase.rpc('send_invoice', {
		p_invoice_id: invoice.id,
		p_due_date: dueDate,
		p_issue_date: issueDate
	});

	if (sendError || !issued) {
		return json({ error: sendError?.message ?? 'Could not issue the invoice.' }, { status: 500 });
	}

	const finalized = issued as unknown as InvoiceForSend;
	const invoiceNumber = finalized.invoice_number ?? '';

	// ── Past this point the invoice IS issued. ──────────────────────────────
	//
	// The PDF has to carry the number, so numbering precedes rendering, which
	// means a delivery failure below leaves a numbered, sent invoice nobody
	// received. That is the correct failure mode and it does NOT roll back:
	// un-assigning the number to tidy up would punch a gap in the issued
	// sequence, which is the one thing invoice numbering cannot tolerate.
	// Delivery failure is reported separately so the UI can offer Resend.

	const { data: linesData } = await supabaseAdmin
		.from('invoice_lines')
		.select('*')
		.eq('invoice_id', invoice.id)
		.order('sort_order');

	const brandName = invoice.brands?.name ?? 'Invoice';
	const orderNumber = invoice.orders?.order_number ?? '';

	let attachment: { filename: string; mimeType: string; content: Buffer };
	try {
		const pdfBytes = await generateInvoicePdf(
			{ ...finalized, brands: invoice.brands, orders: invoice.orders },
			linesData ?? []
		);
		attachment = {
			filename: `invoice-${invoiceNumber}.pdf`,
			mimeType: 'application/pdf',
			content: Buffer.from(pdfBytes)
		};
	} catch (err) {
		return json(
			{
				sent: true,
				delivered: false,
				invoice_number: invoiceNumber,
				error: `Invoice ${invoiceNumber} was issued, but the PDF could not be rendered: ${
					err instanceof Error ? err.message : 'unknown error'
				}`
			},
			{ status: 200 }
		);
	}

	const subject = `${brandName} Invoice ${invoiceNumber}`;
	const dueLine = finalized.due_date ? `\nPayment is due ${finalized.due_date}.` : '';
	const emailBody =
		body.message?.trim() ||
		[
			`Hi ${invoice.bill_to_name ?? 'there'},`,
			'',
			`Please find attached invoice ${invoiceNumber}${orderNumber ? ` for order #${orderNumber}` : ''}.`,
			'',
			`Total: $${Number(finalized.total).toFixed(2)}${dueLine}`,
			'',
			'Thank you for your business.',
			''
		].join('\n');

	const delivery = await deliverDocument({
		userId: locals.user.id,
		organizationId: locals.organization.id,
		recipient,
		subject,
		body: emailBody,
		attachment,
		relatedType: 'invoice',
		relatedId: invoice.id,
		template: 'invoice-send',
		fromLocalPart: 'invoices'
	});

	if (!delivery.delivered) {
		const how =
			delivery.channel === 'gmail' ? 'Gmail could not send it' : 'the email could not be sent';
		return json(
			{
				sent: true,
				delivered: false,
				invoice_number: invoiceNumber,
				error: `Invoice ${invoiceNumber} was issued, but ${how}: ${delivery.reason}`
			},
			{ status: 200 }
		);
	}

	return json({
		sent: true,
		delivered: true,
		invoice_number: invoiceNumber,
		...(delivery.messageId ? { messageId: delivery.messageId } : {})
	});
};
