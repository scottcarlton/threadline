import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { creditMemoCsv, type CreditMemoExportRow } from '$lib/server/returns/credit-memo-export';
import { TRANSITION_ROLES } from '$lib/server/returns/apply-transition';

/**
 * Every credit memo the caller's org has issued, as CSV.
 *
 * An own-org list, so it keeps its own-org filter: `organization_id` is the
 * issuing brand, and a rep or buyer who can read a memo through RLS is reading
 * someone else's books, not exporting their own. Read through the caller's
 * client, so a member scoped to some brands exports only those brands' memos.
 * Admin/owner/member, the roles that issue them.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session || !locals.user || !locals.organization) return error(401, 'Unauthorized');
	if (locals.orgType !== 'brand' || !TRANSITION_ROLES.has(locals.membership?.role ?? '')) {
		return error(403, 'Only the brand can export its credit memos.');
	}

	const { data, error: readError } = await locals.supabase
		.from('return_authorizations')
		.select(
			'credit_memo_number, credit_memo_issued_at, ra_number, credit_subtotal, restocking_fee, shipping_deduction, credit_tax, credit_total, accounts(business_name), brands(name), applied:invoices!applied_invoice_id(invoice_number)'
		)
		.eq('organization_id', locals.organization.id)
		.not('credit_memo_number', 'is', null)
		.order('credit_memo_issued_at', { ascending: true });

	if (readError) return error(500, readError.message);

	const csv = creditMemoCsv((data ?? []) as unknown as CreditMemoExportRow[]);
	const today = new Date().toISOString().slice(0, 10);

	// The BOM is what makes Excel read the file as UTF-8, so an account named
	// with an accent arrives intact.
	return new Response('﻿' + csv, {
		status: 200,
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="credit-memos-${today}.csv"`
		}
	});
};
