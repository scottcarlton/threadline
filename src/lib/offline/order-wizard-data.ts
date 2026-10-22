import type { CatalogProduct } from '$lib/components/shared/catalog-picker-types';
import type { OutboxItem } from './types';

/**
 * Local stand-ins for the order wizard's network reads (SCO-208), so the same
 * wizard runs from the device snapshot online or off.
 */

export type CatalogFilter = {
	q?: string;
	brandIds?: string[];
	seasonIds?: string[];
	minPrice?: number;
	maxPrice?: number;
	atsOnly?: boolean;
	limit?: number;
};

/**
 * Same rules as GET /api/products: text matches style number, name or category
 * (case-insensitive substring), then brand, season, price and ATS filters,
 * ordered by style number, capped at `limit` (200 by default, like the picker).
 */
export function filterCatalog(products: CatalogProduct[], f: CatalogFilter): CatalogProduct[] {
	const q = f.q?.trim().toLowerCase() ?? '';
	const brands = f.brandIds?.length ? new Set(f.brandIds) : null;
	const seasons = f.seasonIds?.length ? new Set(f.seasonIds) : null;
	return products
		.filter((p) => {
			if (brands && !brands.has(p.brand_id)) return false;
			if (seasons && (!p.season_id || !seasons.has(p.season_id))) return false;
			const price = Number(p.wholesale_price);
			if (f.minPrice !== undefined && price < f.minPrice) return false;
			if (f.maxPrice !== undefined && price > f.maxPrice) return false;
			if (f.atsOnly && !p.ats) return false;
			if (q) {
				const hay = `${p.style_number} ${p.name} ${p.category ?? ''}`.toLowerCase();
				if (!hay.includes(q)) return false;
			}
			return true;
		})
		.sort((a, b) => a.style_number.localeCompare(b.style_number))
		.slice(0, f.limit ?? 200);
}

/** Like /api/accounts/search: business name contains the query, A to Z, capped. */
export function searchAccounts<A extends { business_name: string }>(
	accounts: A[],
	query: string,
	limit = 30
): A[] {
	const q = query.trim().toLowerCase();
	return accounts
		.filter((a) => !q || a.business_name.toLowerCase().includes(q))
		.sort((a, b) => a.business_name.localeCompare(b.business_name))
		.slice(0, limit);
}

export type WizardAccount = {
	id: string;
	business_name: string;
	contact_email: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	payment_preference: string | null;
};

export type WizardLocation = {
	id: string;
	account_id: string;
	label: string;
	contact_first_name: string | null;
	contact_last_name: string | null;
	contact_email: string | null;
	phone: string | null;
	address_line1: string | null;
	address_line2: string | null;
	city: string | null;
	state: string | null;
	zip: string | null;
	is_default: boolean;
};

type QueuedAccount = {
	organization_id: string;
	account: {
		id: string;
		primaryLocationId: string;
		business: {
			name: string;
			phone?: string;
			address: { line1?: string; line2?: string; city?: string; state?: string; zip?: string };
			additionalLocations: Array<{
				id?: string;
				label: string;
				phone?: string;
				address: { line1?: string; line2?: string; city?: string; state?: string; zip?: string };
				contact?: { firstName?: string; lastName?: string; email?: string };
			}>;
		};
		contact: { firstName: string; lastName: string; email?: string };
		paymentPreference?: string;
	};
};

const nn = (v: string | undefined) => (v ? v : null);

/**
 * Accounts saved on this device but not yet in the snapshot, with their
 * locations, so an order can be written for a store created minutes ago with
 * no signal. Failed ones are left out: an order cannot depend on an account the
 * server refused. Ids are the account's own client ids, which is what the
 * server stores, so the order references the right rows once both sync.
 */
export function queuedAccounts(
	items: OutboxItem[],
	orgId: string
): { accounts: WizardAccount[]; locations: WizardLocation[]; pendingIds: Set<string> } {
	const accounts: WizardAccount[] = [];
	const locations: WizardLocation[] = [];
	const pendingIds = new Set<string>();
	for (const item of items) {
		if (item.kind !== 'account.create' || item.status === 'failed') continue;
		const payload = item.payload as QueuedAccount;
		if (payload?.organization_id !== orgId || !payload.account?.id) continue;
		const { account } = payload;
		const { business, contact } = account;
		if (item.status !== 'synced') pendingIds.add(account.id);
		accounts.push({
			id: account.id,
			business_name: business.name,
			contact_email: nn(contact.email),
			address_line1: nn(business.address.line1),
			address_line2: nn(business.address.line2),
			city: nn(business.address.city),
			state: nn(business.address.state),
			zip: nn(business.address.zip),
			payment_preference: nn(account.paymentPreference)
		});
		locations.push({
			id: account.primaryLocationId,
			account_id: account.id,
			label: 'Primary',
			contact_first_name: contact.firstName,
			contact_last_name: contact.lastName,
			contact_email: nn(contact.email),
			phone: nn(business.phone),
			address_line1: nn(business.address.line1),
			address_line2: nn(business.address.line2),
			city: nn(business.address.city),
			state: nn(business.address.state),
			zip: nn(business.address.zip),
			is_default: true
		});
		for (const loc of business.additionalLocations ?? []) {
			if (!loc.id) continue;
			locations.push({
				id: loc.id,
				account_id: account.id,
				label: loc.label,
				contact_first_name: nn(loc.contact?.firstName),
				contact_last_name: nn(loc.contact?.lastName),
				contact_email: nn(loc.contact?.email),
				phone: nn(loc.phone),
				address_line1: nn(loc.address.line1),
				address_line2: nn(loc.address.line2),
				city: nn(loc.address.city),
				state: nn(loc.address.state),
				zip: nn(loc.address.zip),
				is_default: false
			});
		}
	}
	return { accounts, locations, pendingIds };
}

/** Snapshot rows first; a queued copy only fills in what the snapshot lacks. */
export function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
	const seen = new Set(base.map((r) => r.id));
	return [...base, ...extra.filter((r) => !seen.has(r.id))];
}

/** Short local reference for an order before the server assigns a number. */
export const localReference = (submissionId: string) =>
	submissionId.replace(/-/g, '').slice(0, 6).toUpperCase();
