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
