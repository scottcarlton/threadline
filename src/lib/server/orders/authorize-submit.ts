import type { SupabaseClient } from '@supabase/supabase-js';
import type { SubmitPayload } from '../../schemas/order-submit';
import type { OrderScope } from './order-scope.js';
import { isEligibleRep } from './rep-eligibility.js';

/**
 * Submit-time authorization for the shared order action.
 *
 * submitOrder writes through `supabaseAdmin`, so RLS never sees the insert.
 * Every ID in the payload is therefore checked here against the same scope the
 * pickers were built from (`resolveOrderScope`): if the picker could not have
 * offered it, the submit path refuses it. Product rows come back so the caller
 * prices lines from the database rather than from the client.
 */

export type ProductRef = {
	brand_id: string;
	wholesale_price: number;
	style_number: string | null;
	name: string | null;
	archived_at: string | null;
};

export type SubmitRefs = {
	brands: Map<string, { organization_id: string; is_active: boolean }>;
	accounts: Map<
		string,
		{ organization_id: string; is_active: boolean; archived_at: string | null }
	>;
	locations: Map<string, { account_id: string }>;
	products: Map<string, ProductRef>;
	seasons: Map<string, { organization_id: string }>;
	deliveries: Map<string, { season_id: string }>;
	showDates: Map<string, { organization_id: string }>;
	sourceTypes: Map<string, { organization_id: string }>;
	terms: Map<string, { brand_id: string; is_current: boolean }>;
	/** org memberships of the requested rep, limited to rep-visible orgs */
	repMemberships: Array<{ profile_id: string; role: string; organization_id: string }>;
};

export type SubmitContext = {
	userId: string;
	orgId: string;
	/**
	 * What to do with an agreement on terms the brand has since replaced.
	 * 'deny' (default): 409, the rep is right there to re-read them.
	 * 'collect': let it through and report the brand, for an order captured
	 * offline earlier; the caller saves it as a draft (SCO-209).
	 */
	staleTerms?: 'deny' | 'collect';
};

export type AuthorizeResult =
	| { ok: true; products: Map<string, ProductRef>; staleTermsBrandIds: string[] }
	| { ok: false; status: 400 | 403 | 409; message: string };

export type ReferencedIds = {
	brandIds: string[];
	accountId: string | null;
	locationIds: string[];
	productIds: string[];
	seasonIds: string[];
	deliveryIds: string[];
	showDateId: string | null;
	sourceTypeId: string | null;
	termsIds: string[];
	repUserId: string | null;
};

const uniq = (xs: Array<string | null | undefined>) =>
	Array.from(new Set(xs.filter((x): x is string => Boolean(x))));

export function collectReferencedIds(p: SubmitPayload): ReferencedIds {
	const f = p.finalize ?? null;
	return {
		brandIds: uniq([
			...p.lines.map((l) => l.brand_id),
			...p.groups.map((g) => g.brand_id),
			...(f?.orders.map((o) => o.brand_id) ?? []),
			...(f?.brand_agreements.map((b) => b.brand_id) ?? [])
		]),
		accountId: p.account_id,
		locationIds: uniq([
			...p.groups.map((g) => g.location_id),
			f?.contact_location_id,
			...(f?.orders.flatMap((o) => [o.ship_to_location_id, o.bill_to_location_id]) ?? [])
		]),
		productIds: uniq(p.lines.map((l) => l.product_id)),
		seasonIds: uniq([
			...p.lines.map((l) => l.season_id),
			...p.groups.map((g) => g.season_id),
			...(f?.orders.map((o) => o.season_id) ?? [])
		]),
		deliveryIds: uniq(
			p.groups.map((g) => (g.delivery?.kind === 'delivery' ? g.delivery.delivery_id : null))
		),
		showDateId: f?.show_date_id ?? null,
		sourceTypeId: f?.source_type_id ?? null,
		termsIds: uniq(f?.brand_agreements.map((b) => b.terms_id) ?? []),
		repUserId: f?.rep_user_id ?? null
	};
}

const deny = (status: 400 | 403 | 409, message: string): AuthorizeResult => ({
	ok: false,
	status,
	message
});

/** Pure rule check over already-fetched rows. Unit tested directly. */
export function checkSubmitReferences(
	p: SubmitPayload,
	refs: SubmitRefs,
	scope: OrderScope,
	ctx: SubmitContext
): AuthorizeResult {
	const ids = collectReferencedIds(p);
	const f = p.finalize ?? null;
	const visible = new Set(scope.visibleOrgIds);
	const own = new Set(scope.ownOrgIds);

	if (scope.isBuyer && p.freeformDetails) {
		return deny(403, 'Buyers cannot create new accounts from an order.');
	}
	if (f && f.account_id !== p.account_id) {
		return deny(400, 'The order account does not match the finalize details.');
	}

	if (ids.accountId) {
		const a = refs.accounts.get(ids.accountId);
		const allowed = scope.isBuyer
			? (scope.buyerAccountIds ?? []).includes(ids.accountId)
			: Boolean(a && visible.has(a.organization_id) && a.is_active && !a.archived_at);
		if (!a || !allowed) return deny(403, 'That account is not available to you.');
	}

	for (const brandId of ids.brandIds) {
		const b = refs.brands.get(brandId);
		const allowed = scope.isBuyer
			? (scope.buyerBrandIds ?? []).includes(brandId)
			: Boolean(b && visible.has(b.organization_id));
		if (!b || !b.is_active || !allowed)
			return deny(403, 'One of these brands is not available to you.');
	}

	for (const line of p.lines) {
		const prod = refs.products.get(line.product_id);
		if (!prod || prod.brand_id !== line.brand_id) {
			return deny(403, 'One of these products is not available to you.');
		}
		if (prod.archived_at) {
			return deny(
				409,
				`${prod.name ?? 'A product'} is no longer available. Remove it and try again.`
			);
		}
	}

	// A season belongs to the brand's org. Lines can be moved between seasons
	// in the wizard, so the product's own season is not required to match.
	const seasonBrandPairs = [
		...p.lines.map((l) => [l.season_id, l.brand_id] as const),
		...p.groups.map((g) => [g.season_id, g.brand_id] as const),
		...(f?.orders.map((o) => [o.season_id, o.brand_id] as const) ?? [])
	];
	for (const [seasonId, brandId] of seasonBrandPairs) {
		if (!seasonId) continue;
		const s = refs.seasons.get(seasonId);
		const b = refs.brands.get(brandId);
		if (!s || !b || s.organization_id !== b.organization_id) {
			return deny(403, 'One of these seasons is not available for its brand.');
		}
	}

	for (const g of p.groups) {
		if (g.delivery?.kind !== 'delivery') continue;
		const d = refs.deliveries.get(g.delivery.delivery_id);
		if (!d || d.season_id !== g.season_id) {
			return deny(400, 'That delivery window does not belong to the season.');
		}
	}

	if (ids.locationIds.length > 0) {
		if (!ids.accountId) return deny(400, 'An order without an account cannot have a location.');
		for (const locId of ids.locationIds) {
			const loc = refs.locations.get(locId);
			if (!loc || loc.account_id !== ids.accountId) {
				return deny(403, 'That location does not belong to the account.');
			}
		}
	}

	if (ids.repUserId && ids.repUserId !== ctx.userId) {
		const eligible =
			!scope.isBuyer && refs.repMemberships.some((m) => isEligibleRep(m, scope, ctx.orgId));
		if (!eligible) return deny(403, 'That sales rep cannot be assigned to this order.');
	}

	for (const [id, map, label] of [
		[ids.showDateId, refs.showDates, 'show'],
		[ids.sourceTypeId, refs.sourceTypes, 'source']
	] as const) {
		if (!id) continue;
		const row = map.get(id);
		if (scope.isBuyer || !row || !own.has(row.organization_id)) {
			return deny(403, `That ${label} is not available to you.`);
		}
	}

	const staleTermsBrandIds: string[] = [];
	for (const ba of f?.brand_agreements ?? []) {
		if (!ba.terms_id) continue;
		const t = refs.terms.get(ba.terms_id);
		if (!t || t.brand_id !== ba.brand_id) {
			return deny(400, 'Those terms do not belong to the brand.');
		}
		if (!t.is_current) {
			if (ctx.staleTerms !== 'collect') {
				return deny(409, 'The brand updated its terms. Review the new terms and submit again.');
			}
			staleTermsBrandIds.push(ba.brand_id);
		}
	}

	return { ok: true, products: refs.products, staleTermsBrandIds };
}

/** Fetch every row the rule check needs, in parallel, through the admin client. */
export async function fetchSubmitReferences(
	db: SupabaseClient,
	ids: ReferencedIds,
	scope: OrderScope
): Promise<SubmitRefs> {
	const byId = <T extends { id: string }>(rows: T[] | null) =>
		new Map((rows ?? []).map(({ id, ...rest }) => [id, rest] as const));
	const none = Promise.resolve({ data: [] as never[] });
	const inIds = (table: string, cols: string, list: string[]) =>
		list.length ? db.from(table).select(cols).in('id', list) : none;

	const [
		brands,
		accounts,
		locations,
		products,
		seasons,
		deliveries,
		showDates,
		sourceTypes,
		terms,
		reps
	] = await Promise.all([
		inIds('brands', 'id, organization_id, is_active', ids.brandIds),
		inIds(
			'accounts',
			'id, organization_id, is_active, archived_at',
			ids.accountId ? [ids.accountId] : []
		),
		inIds('account_locations', 'id, account_id', ids.locationIds),
		inIds(
			'products',
			'id, brand_id, wholesale_price, style_number, name, archived_at',
			ids.productIds
		),
		inIds('seasons', 'id, organization_id', ids.seasonIds),
		inIds('season_deliveries', 'id, season_id', ids.deliveryIds),
		inIds('show_dates', 'id, organization_id', ids.showDateId ? [ids.showDateId] : []),
		inIds('source_types', 'id, organization_id', ids.sourceTypeId ? [ids.sourceTypeId] : []),
		inIds('brand_terms', 'id, brand_id, is_current', ids.termsIds),
		ids.repUserId
			? db
					.from('organization_members')
					.select('profile_id, role, organization_id')
					.eq('profile_id', ids.repUserId)
					.in('organization_id', scope.repVisibleOrgIds)
			: none
	]);

	for (const r of [
		brands,
		accounts,
		locations,
		products,
		seasons,
		deliveries,
		showDates,
		sourceTypes,
		terms,
		reps
	]) {
		if ('error' in r && r.error) throw r.error;
	}

	return {
		brands: byId(brands.data as Array<{ id: string; organization_id: string; is_active: boolean }>),
		accounts: byId(
			accounts.data as Array<{
				id: string;
				organization_id: string;
				is_active: boolean;
				archived_at: string | null;
			}>
		),
		locations: byId(locations.data as Array<{ id: string; account_id: string }>),
		products: byId(products.data as Array<{ id: string } & ProductRef>),
		seasons: byId(seasons.data as Array<{ id: string; organization_id: string }>),
		deliveries: byId(deliveries.data as Array<{ id: string; season_id: string }>),
		showDates: byId(showDates.data as Array<{ id: string; organization_id: string }>),
		sourceTypes: byId(sourceTypes.data as Array<{ id: string; organization_id: string }>),
		terms: byId(terms.data as Array<{ id: string; brand_id: string; is_current: boolean }>),
		repMemberships: (reps.data ?? []) as Array<{
			profile_id: string;
			role: string;
			organization_id: string;
		}>
	};
}

export async function authorizeSubmitPayload(
	db: SupabaseClient,
	payload: SubmitPayload,
	scope: OrderScope,
	ctx: SubmitContext
): Promise<AuthorizeResult> {
	const refs = await fetchSubmitReferences(db, collectReferencedIds(payload), scope);
	return checkSubmitReferences(payload, refs, scope, ctx);
}
