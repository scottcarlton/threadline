import { supabaseAdmin } from '$lib/server/supabase';
import { calculateReturnCredit, type SourceInvoiceAmounts } from '$lib/server/returns/credit';
import { loadReturnPolicy } from '$lib/server/returns/policy';

/**
 * What the issue dialog opens with: the policy's answer for each deduction,
 * plus enough context to say where each number came from.
 *
 * Defaults only. issue_credit_memo() derives the subtotal, the applied invoice
 * and the total itself, so nothing here is trusted at issue time; the brand
 * edits the three deductions and the database does the rest.
 */
export type CreditDefaults = {
	creditSubtotal: number;
	restockingFee: number;
	shippingDeduction: number;
	creditTax: number;
	creditTotal: number;
	/** Whether tax sits inside the line prices. Decides whether it is added. */
	inclusive: boolean;
	/** The issued invoice the tax was prorated from, if any. */
	sourceInvoiceNumber: string | null;
	policy: {
		restockingFeeType: 'percent' | 'flat';
		restockingFeeValue: number;
		buyerPaysShipping: boolean;
	};
};

type InvoiceRow = {
	invoice_number: string | null;
	subtotal: number | string | null;
	tax_amount: number | string | null;
};

/**
 * Called only after the page has established the viewer may act on this return
 * for `ra.organization_id`: canAction on /returns/[id] requires the viewer to be
 * the issuer. Every read below is keyed to that return's own order, brand and
 * org, so it cannot reach another tenant's data.
 */
export async function loadCreditDefaults(ra: {
	organization_id: string;
	brand_id: string;
	order_id: string | null;
	return_lines?: Array<{ qty: number | string | null; unit_price: number | string | null }> | null;
}): Promise<CreditDefaults> {
	const policy = await loadReturnPolicy(ra.organization_id);

	let invoice: InvoiceRow | null = null;
	if (ra.order_id) {
		const { data } = await supabaseAdmin
			.from('invoices')
			.select('invoice_number, subtotal, tax_amount')
			.eq('order_id', ra.order_id)
			.eq('organization_id', ra.organization_id)
			.in('status', ['sent', 'partial', 'paid'])
			.maybeSingle();
		invoice = (data as InvoiceRow | null) ?? null;
	}

	// Same function issue_credit_memo() asks, so the preview and the issued
	// memo cannot disagree on whether tax is inside the prices.
	let inclusive = false;
	if (invoice) {
		const { data } = await supabaseAdmin.rpc('brand_pricing_display', {
			p_brand_id: ra.brand_id
		});
		inclusive = data === 'inclusive';
	}

	const sourceInvoice: SourceInvoiceAmounts | null = invoice
		? {
				subtotal: Number(invoice.subtotal ?? 0),
				taxAmount: invoice.tax_amount == null ? null : Number(invoice.tax_amount),
				pricingDisplay: inclusive ? 'inclusive' : 'exclusive'
			}
		: null;

	const breakdown = calculateReturnCredit({
		lines: (ra.return_lines ?? []).map((l) => ({
			qty: Number(l.qty ?? 0),
			unitPrice: Number(l.unit_price ?? 0)
		})),
		policy,
		sourceInvoice,
		// The return shipment's cost is not recorded anywhere yet, so the
		// deduction starts at zero and the brand enters it when the policy
		// charges the buyer for it.
		returnShippingCost: 0
	});

	return {
		...breakdown,
		inclusive,
		sourceInvoiceNumber: invoice?.invoice_number ?? null,
		policy: {
			restockingFeeType: policy.restockingFeeType,
			restockingFeeValue: policy.restockingFeeValue,
			buyerPaysShipping: policy.buyerPaysShipping
		}
	};
}
