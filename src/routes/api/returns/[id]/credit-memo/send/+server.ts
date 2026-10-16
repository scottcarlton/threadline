import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCreditMemoPdf } from '$lib/server/credit-memo-pdf';
import { loadCreditMemoDocument } from '$lib/server/returns/credit-memo-document';
import { loadIssuingOrgReturn } from '$lib/server/returns/authorize-return';
import { TRANSITION_ROLES } from '$lib/server/returns/apply-transition';
import { allowedRecipients } from '$lib/server/account-recipients';
import { deliverDocument } from '$lib/server/document-email';

/**
 * Email an issued credit memo to the buyer.
 *
 * Issuing org only, the same set that may issue it. Sending is separate from
 * issuing, unlike invoices, because a memo is issued at the moment the brand
 * settles the deductions and may be sent then or later; a send can also be
 * repeated, since the document cannot change.
 *
 * Recipients are the account's own contacts and nothing else, the rule
 * allowedRecipients() explains.
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}
	if (!TRANSITION_ROLES.has(locals.membership?.role ?? '')) {
		return json({ error: 'Only the brand can send a credit memo.' }, { status: 403 });
	}

	// The ownership check: issuing org only, by id, before anything is read
	// with elevated rights below.
	const ra = await loadIssuingOrgReturn(params.id, locals.organization.id);
	if (!ra) return json({ error: 'Credit memo not found' }, { status: 404 });

	const doc = await loadCreditMemoDocument(locals.supabase, ra.id);
	if (!doc) {
		return json({ error: 'Issue the credit memo before sending it.' }, { status: 409 });
	}

	const body = (await request.json().catch(() => ({}))) as { to?: string; message?: string };
	const allowed = await allowedRecipients(doc.accountId);
	const requested = body.to?.trim().toLowerCase();
	if (requested && !allowed.includes(requested)) {
		return json({ error: 'That address is not a contact on this account.' }, { status: 400 });
	}
	const recipient = requested ?? allowed[0];
	if (!recipient) {
		return json(
			{ error: 'This account has no contact email to send the credit memo to.' },
			{ status: 400 }
		);
	}

	const number = doc.memo.credit_memo_number;
	let attachment;
	try {
		const pdfBytes = await generateCreditMemoPdf(doc.memo, doc.lines);
		attachment = {
			filename: `credit-memo-${number}.pdf`,
			mimeType: 'application/pdf',
			content: Buffer.from(pdfBytes)
		};
	} catch (err) {
		return json(
			{
				delivered: false,
				error: `Credit memo ${number} could not be rendered: ${
					err instanceof Error ? err.message : 'unknown error'
				}`
			},
			{ status: 500 }
		);
	}

	const brandName = doc.memo.brandName ?? 'Credit memo';
	const credits = doc.memo.appliedInvoiceNumber
		? ` against invoice ${doc.memo.appliedInvoiceNumber}`
		: '';
	const emailBody =
		body.message?.trim() ||
		[
			`Hi ${doc.memo.billTo.name ?? 'there'},`,
			'',
			`Attached is credit memo ${number}${credits}${
				doc.memo.ra_number ? ` for return ${doc.memo.ra_number}` : ''
			}.`,
			'',
			`Credit: $${Number(doc.memo.credit_total).toFixed(2)}`,
			''
		].join('\n');

	const delivery = await deliverDocument({
		userId: locals.user.id,
		organizationId: locals.organization.id,
		recipient,
		subject: `${brandName} Credit memo ${number}`,
		body: emailBody,
		attachment,
		relatedType: 'credit_memo',
		relatedId: doc.returnId,
		template: 'credit-memo-send',
		fromLocalPart: 'invoices'
	});

	if (!delivery.delivered) {
		const how =
			delivery.channel === 'gmail' ? 'Gmail could not send it' : 'the email could not be sent';
		return json(
			{ delivered: false, error: `Credit memo ${number} was not sent: ${how}: ${delivery.reason}` },
			{ status: 502 }
		);
	}

	return json({ delivered: true, credit_memo_number: number, to: recipient });
};
