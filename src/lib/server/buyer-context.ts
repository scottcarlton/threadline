import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountUser, Organization } from '$lib/types/database.js';

/**
 * A row from `account_users` with the account (and its org id) embedded. This is
 * the shape hooks.server.ts historically used inline; it lives here now so the
 * hook and any other caller share one definition.
 */
export type BuyerAccountRow = AccountUser & {
	account_id: string;
	accounts?: { organization_id?: string } | null;
};

export type BuyerContext = {
	isBuyer: boolean;
	buyerAccounts: BuyerAccountRow[];
	buyerBrandIds: string[];
	organization: Organization | null;
};

/**
 * Resolves whether a user is a buyer (invited into a brand's account via
 * `account_users`) and, if so, their buyer context.
 *
 * Retailer-org members are ALSO buyers, but they are resolved in
 * hooks.server.ts's membership branch (they have an `organization_members` row),
 * not here — this helper handles only the legacy invited-buyer case, which has
 * no membership.
 *
 * IMPORTANT — `buyerAccounts` can be `[]` for a VALID buyer: an invited buyer
 * whose account hasn't been granted brand access yet has zero usable account
 * rows. Callers MUST NOT assume `buyerAccounts[0]` exists. When there are no
 * account rows, `buyerBrandIds`/`organization` stay empty and no account-scoped
 * round-trip is issued (`.in(…, [])` / `.eq('id', undefined)` would be
 * malformed). `admin` bypasses RLS for those two lookups exactly as the previous
 * inline hook code did.
 */
export async function resolveBuyerContext(
	client: SupabaseClient,
	admin: SupabaseClient,
	userId: string
): Promise<BuyerContext> {
	const { data: accountData } = await client
		.from('account_users')
		.select('*, accounts(*, organizations(*))')
		.eq('profile_id', userId);

	const buyerAccounts = (accountData as BuyerAccountRow[] | null) ?? [];

	if (buyerAccounts.length === 0) {
		return {
			isBuyer: false,
			buyerAccounts: [],
			buyerBrandIds: [],
			organization: null
		};
	}

	const accountIds = buyerAccounts.map((a) => a.account_id);
	const { data: brandAccess } = await admin
		.from('account_brand_access')
		.select('brand_id')
		.in('account_id', accountIds);
	const buyerBrandIds = ((brandAccess as Array<{ brand_id: string }> | null) ?? []).map(
		(b) => b.brand_id
	);

	let organization: Organization | null = null;
	const orgId = buyerAccounts[0]?.accounts?.organization_id;
	if (orgId) {
		const { data: org } = await admin.from('organizations').select('*').eq('id', orgId).single();
		organization = (org as Organization | null) ?? null;
	}

	return {
		isBuyer: true,
		buyerAccounts,
		buyerBrandIds,
		organization
	};
}

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
