import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateCreditMemoPdf } from '$lib/server/credit-memo-pdf';
import { loadCreditMemoDocument } from '$lib/server/returns/credit-memo-document';

/**
 * Download an issued credit memo.
 *
 * Read through the caller's own client, so RLS decides: the issuing brand,
 * the rep on the order, and the buyer's account may read it, as they may read
 * the return. Anyone else, and any return without a memo, gets 404. Guest is
 * excluded, matching the invoice and order PDFs.
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.session || !locals.user) return error(401, 'Unauthorized');
	if (locals.membership?.role === 'guest') {
		return error(403, 'Insufficient permissions to download a credit memo.');
	}

	const doc = await loadCreditMemoDocument(locals.supabase, params.id);
	if (!doc) return error(404, 'Credit memo not found');

	const pdfBytes = await generateCreditMemoPdf(doc.memo, doc.lines);

	return new Response(pdfBytes as Uint8Array & BlobPart, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="credit-memo-${doc.memo.credit_memo_number}.pdf"`
		}
	});
};
