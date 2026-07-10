import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountUser } from '$lib/types/database.js';

/**
 * A row from `account_users` with the account (and its org id) embedded — the
 * synthetic shape `resolveRetailerBuyerContext` emits for retailer members (who
 * have no real `account_users` row). Mirrors the invited-buyer shape that
 * `loadUserContext` resolves inline in `auth.ts`.
 */
export type BuyerAccountRow = AccountUser & {
	account_id: string;
	accounts?: { organization_id?: string } | null;
};

/**
 * Buyer context for a RETAILER-ORG member (SP3). Unlike an invited buyer, a
 * retailer member has NO `account_users` row — their shopping scope resolves
 * through `accounts.retailer_org_id`: the brands' private account rows that a
 * brand has linked to this retailer org. This mirrors, in the app layer, what
 * the extended `get_buyer_account_ids()` does in RLS.
 *
 * A retailer sees a brand only when a linked account ALSO has an
 * `account_brand_access` grant — linking alone grants nothing (the brand stays
 * in control). A retailer may have MANY linked accounts (one per brand-org that
 * added them); `buyerAccounts` carries one synthetic row per linked account.
 *
 * `organization` is NOT resolved here — a retailer member's org is their own
 * retailer org, already on `locals.organization` from the membership branch.
 * Runs on `admin` because the retailer org id is server-derived (from the
 * caller's membership) and the hook already holds the admin client.
 */
export async function resolveRetailerBuyerContext(
	admin: SupabaseClient,
	retailerOrgId: string,
	_userId: string
): Promise<{ buyerAccounts: BuyerAccountRow[]; buyerBrandIds: string[] }> {
	const { data: accountData } = await admin
		.from('accounts')
		.select('id, business_name, organization_id')
		.eq('retailer_org_id', retailerOrgId);

	const linked =
		(accountData as Array<{ id: string; business_name: string; organization_id: string }> | null) ??
		[];

	if (linked.length === 0) {
		return { buyerAccounts: [], buyerBrandIds: [] };
	}

	const accountIds = linked.map((a) => a.id);
	const { data: brandAccess } = await admin
		.from('account_brand_access')
		.select('brand_id')
		.in('account_id', accountIds);
	const buyerBrandIds = ((brandAccess as Array<{ brand_id: string }> | null) ?? []).map(
		(b) => b.brand_id
	);

	// Synthetic BuyerAccountRow per linked account. A retailer has no
	// `account_users` row, so the `account_users`-specific fields are not
	// meaningful; only the fields downstream consumers read (`account_id`,
	// `accounts.business_name`, `accounts.organization_id`) are populated.
	const buyerAccounts: BuyerAccountRow[] = linked.map((a) => ({
		id: `retailer:${a.id}`,
		account_id: a.id,
		profile_id: _userId,
		role: 'retailer',
		invited_by: null,
		accepted_at: null,
		created_at: '',
		accounts: {
			organization_id: a.organization_id,
			business_name: a.business_name
		} as BuyerAccountRow['accounts']
	}));

	return { buyerAccounts, buyerBrandIds };
}
