import type { SupabaseClient } from '@supabase/supabase-js';
import type { CreditMemoData } from '$lib/server/credit-memo-pdf';
import type { TableLine } from '$lib/server/pdf-layout';

/**
 * Whether the memo's tax sat inside the prices when it was issued.
 *
 * Read from the frozen numbers, never from the brand's current pricing
 * setting: the setting can change after issue, and the document has to keep
 * describing what was issued. Under exclusive pricing the tax was added, so
 * subtotal − deductions + tax is the total; under inclusive it was not.
 *
 * A total floored at zero cannot tell the two apart. Either reading is then
 * true of the document, since no tax reached the credit, so that case reports
 * exclusive.
 */
export function taxWasIncluded(memo: {
	credit_subtotal: number | string;
	restocking_fee: number | string;
	shipping_deduction: number | string;
	credit_tax: number | string;
	credit_total: number | string;
}): boolean {
	const tax = Number(memo.credit_tax);
	if (!(tax > 0)) return false;
	const net =
		Number(memo.credit_subtotal) - Number(memo.restocking_fee) - Number(memo.shipping_deduction);
	const total = Number(memo.credit_total);
	if (Math.abs(net + tax - total) < 0.005) return false;
	return Math.abs(net - total) < 0.005;
}

type Row = CreditMemoData & {
	id: string;
	organization_id: string;
	account_id: string | null;
	credit_memo_number: string | null;
	brands: { name: string } | null;
	accounts: {
		business_name: string | null;
		address_line1: string | null;
		address_line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
	} | null;
	applied: {
		invoice_number: string | null;
		bill_to_name: string | null;
		bill_to_line1: string | null;
		bill_to_line2: string | null;
		bill_to_city: string | null;
		bill_to_state: string | null;
		bill_to_zip: string | null;
	} | null;
	return_lines: TableLine[] & Array<{ sort_order: number | null }>;
};

export type CreditMemoDocument = {
	returnId: string;
	organizationId: string;
	accountId: string | null;
	memo: CreditMemoData;
	lines: TableLine[];
};

/**
 * An issued credit memo, read through the caller's own client.
 *
 * Deliberately not the service-role client. Whoever may read the return under RLS (the
 * issuing brand, the rep on the order, the buyer's account) may read its memo,
 * and RLS already states exactly that. A return the caller cannot see, and a
 * return with no memo yet, both come back null, so the endpoint answers 404 for
 * either and a memo's existence does not leak across tenants.
 *
 * Bill-to comes from the credited invoice's frozen snapshot when there is one,
 * so the memo addresses the same party, at the same address, as the document
 * it reduces. A free-entry return has no invoice and falls back to the account.
 */
export async function loadCreditMemoDocument(
	supabase: SupabaseClient,
	returnId: string
): Promise<CreditMemoDocument | null> {
	const { data, error } = await supabase
		.from('return_authorizations')
		.select(
			'id, organization_id, account_id, ra_number, credit_memo_number, credit_memo_issued_at, credit_subtotal, restocking_fee, shipping_deduction, credit_tax, credit_total, brands(name), accounts(business_name, address_line1, address_line2, city, state, zip), applied:invoices!applied_invoice_id(invoice_number, bill_to_name, bill_to_line1, bill_to_line2, bill_to_city, bill_to_state, bill_to_zip), return_lines(*)'
		)
		.eq('id', returnId)
		.maybeSingle();

	if (error || !data) return null;
	const row = data as unknown as Row;
	if (!row.credit_memo_number) return null;

	const inv = row.applied;
	const acct = row.accounts;
	const billTo = inv
		? {
				name: inv.bill_to_name,
				line1: inv.bill_to_line1,
				line2: inv.bill_to_line2,
				city: inv.bill_to_city,
				state: inv.bill_to_state,
				zip: inv.bill_to_zip
			}
		: {
				name: acct?.business_name ?? null,
				line1: acct?.address_line1 ?? null,
				line2: acct?.address_line2 ?? null,
				city: acct?.city ?? null,
				state: acct?.state ?? null,
				zip: acct?.zip ?? null
			};

	const lines = [...(row.return_lines ?? [])].sort(
		(a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
	);

	return {
		returnId: row.id,
		organizationId: row.organization_id,
		accountId: row.account_id,
		lines,
		memo: {
			credit_memo_number: row.credit_memo_number,
			credit_memo_issued_at: row.credit_memo_issued_at,
			ra_number: row.ra_number,
			credit_subtotal: row.credit_subtotal,
			restocking_fee: row.restocking_fee,
			shipping_deduction: row.shipping_deduction,
			credit_tax: row.credit_tax,
			credit_total: row.credit_total,
			brandName: row.brands?.name ?? null,
			appliedInvoiceNumber: inv?.invoice_number ?? null,
			taxInclusive: taxWasIncluded(row),
			billTo
		}
	};
}
