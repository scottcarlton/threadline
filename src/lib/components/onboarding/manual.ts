// Manual entry for the onboarding import steps. Each form builds a single row
// in the exact shape its CSV import produces, so a typed row goes through the
// same endpoint, validation, and dedupe as an imported one.

import { accountDraftSchema, type AccountDraft } from '$lib/schemas/account-import';
import { productDraftSchema, type ProductDraft } from '$lib/schemas/product-import';
import { toNumber } from './parse';

export type ManualResult<T> = { ok: true; draft: T } | { ok: false; error: string };

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export interface ManualAccountFields {
	businessName: string;
	contactFirstName: string;
	contactLastName: string;
	contactEmail: string;
	phone: string;
	city: string;
	state: string;
}

export const emptyManualAccount = (): ManualAccountFields => ({
	businessName: '',
	contactFirstName: '',
	contactLastName: '',
	contactEmail: '',
	phone: '',
	city: '',
	state: ''
});

export function manualAccountDraft(f: ManualAccountFields): ManualResult<AccountDraft> {
	if (!f.businessName.trim()) return { ok: false, error: 'Add the business name.' };
	const email = f.contactEmail.trim();
	if (email && !looksLikeEmail(email)) {
		return { ok: false, error: "That doesn't look like an email address." };
	}
	const parsed = accountDraftSchema.safeParse({
		business_name: f.businessName,
		contact_first_name: f.contactFirstName,
		contact_last_name: f.contactLastName,
		contact_email: email,
		phone: f.phone,
		address_line1: null,
		city: f.city,
		state: f.state,
		zip: null
	});
	if (!parsed.success) return { ok: false, error: "That account couldn't be saved." };
	return { ok: true, draft: parsed.data };
}

export interface ManualProductFields {
	styleNumber: string;
	name: string;
	wholesalePrice: string;
	retailPrice: string;
}

export const emptyManualProduct = (): ManualProductFields => ({
	styleNumber: '',
	name: '',
	wholesalePrice: '',
	retailPrice: ''
});

export function manualProductDraft(f: ManualProductFields): ManualResult<ProductDraft> {
	if (!f.styleNumber.trim()) return { ok: false, error: 'Add the style number.' };
	if (!f.name.trim()) return { ok: false, error: 'Add the product name.' };
	const wholesale = toNumber(f.wholesalePrice);
	if (wholesale === null || wholesale < 0) {
		return { ok: false, error: 'Wholesale price needs to be a number, like 48 or 48.50.' };
	}
	const retailRaw = f.retailPrice.trim();
	const retail = toNumber(retailRaw);
	if (retailRaw && (retail === null || retail < 0)) {
		return { ok: false, error: 'Retail price needs to be a number, or leave it blank.' };
	}
	const parsed = productDraftSchema.safeParse({
		style_number: f.styleNumber,
		name: f.name,
		wholesale_price: wholesale,
		retail_price: retail,
		category: null,
		subcategory: null,
		description: null,
		sizes: [],
		colors: [],
		season_id: null,
		product_year: null,
		image_url: null
	});
	if (!parsed.success) return { ok: false, error: "That product couldn't be saved." };
	return { ok: true, draft: parsed.data };
}

export const MEMBER_ROLES = ['member', 'sales', 'admin', 'guest'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export interface ManualMemberFields {
	email: string;
	role: MemberRole;
	commissionRate: string;
}

export const emptyManualMember = (): ManualMemberFields => ({
	email: '',
	role: 'member',
	commissionRate: ''
});

export type MemberInvite = { email: string; role: MemberRole; commissionRate?: number };

export function manualMemberInvite(f: ManualMemberFields): ManualResult<MemberInvite> {
	const email = f.email.trim();
	if (!looksLikeEmail(email))
		return { ok: false, error: "That doesn't look like an email address." };
	const invite: MemberInvite = { email, role: f.role };
	// /api/invite/send ignores commission for every role but sales.
	if (f.role === 'sales' && f.commissionRate.trim()) {
		const rate = toNumber(f.commissionRate.replace('%', ''));
		if (rate === null || rate < 0 || rate > 100) {
			return { ok: false, error: 'Commission needs to be a percentage between 0 and 100.' };
		}
		invite.commissionRate = rate;
	}
	return { ok: true, draft: invite };
}

/**
 * The prompt bar is a single-line input, so the browser flattens pasted rows
 * into one line. Anything with a line break is a table, not an answer, and is
 * read as CSV before the input can mangle it.
 */
export function isTablePaste(text: string): boolean {
	return /\r?\n/.test(text.trim());
}
