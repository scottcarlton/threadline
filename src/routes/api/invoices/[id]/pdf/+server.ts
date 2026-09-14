import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseAdmin } from '$lib/server/supabase';
import { generateInvoicePdf, type InvoiceData } from '$lib/server/invoice-pdf';
import { loadInvoiceForOrg, type InvoiceRow } from '$lib/server/invoices/authorize-invoice';

type InvoiceForPdf = InvoiceRow & InvoiceData;

// Reading an invoice is broader than issuing one: the rep that sold the order
// and the buyer being billed both have a legitimate claim on the document.
// Guest is excluded, matching the order PDF.
const PDF_ROLES = new Set(['admin', 'owner', 'member', 'sales']);

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user || !locals.organization) {
		return error(401, 'Unauthorized');
	}

	if (!PDF_ROLES.has(locals.membership?.role ?? '')) {
		return error(403, 'Insufficient permissions to generate an invoice PDF.');
	}

	// supabaseAdmin bypasses RLS, so the three-reader rule has to be reproduced
	// here. Without it any authenticated user could pull any invoice by id.
	const invoice = await loadInvoiceForOrg<InvoiceForPdf>(
		params.id,
		locals.organization.id,
		'*, orders(order_number), brands(name)'
	);

	if (!invoice) {
		return error(404, 'Invoice not found');
	}

	const { data: linesData } = await supabaseAdmin
		.from('invoice_lines')
		.select('*')
		.eq('invoice_id', invoice.id)
		.order('sort_order');

	const pdfBytes = await generateInvoicePdf(invoice, linesData ?? []);

	// A draft has no number, so it is named by its order.
	const filename = invoice.invoice_number
		? `invoice-${invoice.invoice_number}.pdf`
		: `invoice-draft-${invoice.orders?.order_number ?? invoice.id}.pdf`;

	return new Response(pdfBytes as Uint8Array & BlobPart, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
