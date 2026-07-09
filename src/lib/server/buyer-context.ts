import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountUser, Organization, Store } from '$lib/types/database.js';

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
	store: Store | null;
};

/**
 * Resolves whether a user is a buyer and, if so, their buyer context.
 *
 * A "buyer" is anyone who either was invited into a brand's account
 * (`account_users`) OR self-signed-up as a retailer store (`store_users`). Both
 * populate the buyer portal.
 *
 * IMPORTANT — self-signup broke two invariants that older code assumed:
 * - `buyerAccounts` can be `[]` for a VALID buyer (a store user has no account
 *   rows). Callers MUST NOT assume `buyerAccounts[0]` exists.
 * - `organization` can be `null` for a VALID buyer (a store user belongs to no
 *   brand org). Callers MUST NOT assume an org is present.
 *
 * `buyerBrandIds` and `organization` are only resolved when there ARE account
 * rows — otherwise the account-scoped lookups would be malformed (`.in(…, [])`,
 * `.eq('id', undefined)`) and waste a round-trip. `admin` bypasses RLS for those
 * two lookups exactly as the previous inline hook code did.
 */
export async function resolveBuyerContext(
	client: SupabaseClient,
	admin: SupabaseClient,
	userId: string
): Promise<BuyerContext> {
	const [{ data: accountData }, { data: storeData }] = await Promise.all([
		client
			.from('account_users')
			.select('*, accounts(*, organizations(*))')
			.eq('profile_id', userId),
		client.from('store_users').select('*, stores(*)').eq('profile_id', userId)
	]);

	const buyerAccounts = (accountData as BuyerAccountRow[] | null) ?? [];
	const storeRows = (storeData as Array<{ stores?: Store | null }> | null) ?? [];

	if (buyerAccounts.length === 0 && storeRows.length === 0) {
		return {
			isBuyer: false,
			buyerAccounts: [],
			buyerBrandIds: [],
			organization: null,
			store: null
		};
	}

	let buyerBrandIds: string[] = [];
	let organization: Organization | null = null;

	if (buyerAccounts.length > 0) {
		const accountIds = buyerAccounts.map((a) => a.account_id);
		const { data: brandAccess } = await admin
			.from('account_brand_access')
			.select('brand_id')
			.in('account_id', accountIds);
		buyerBrandIds = ((brandAccess as Array<{ brand_id: string }> | null) ?? []).map(
			(b) => b.brand_id
		);

		const orgId = buyerAccounts[0]?.accounts?.organization_id;
		if (orgId) {
			const { data: org } = await admin.from('organizations').select('*').eq('id', orgId).single();
			organization = (org as Organization | null) ?? null;
		}
	}

	// `store_users.store_id -> stores.id` is a to-one FK embed: PostgREST returns
	// it as an object, not an array. Cast directly (no Array.isArray dance).
	const store = (storeRows[0]?.stores as Store | null | undefined) ?? null;

	return {
		isBuyer: true,
		buyerAccounts,
		buyerBrandIds,
		organization,
		store
	};
}
