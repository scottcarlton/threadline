import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import type { OrderPrereqs } from '$lib/server/orders/load-order-prereqs';
import type { CatalogProduct } from '$lib/components/shared/catalog-picker-types';
import { orderSnapshot } from '$lib/offline';

/**
 * The order wizard runs from the device snapshot (SCO-208), online or off:
 * reference data and the full catalog come from IndexedDB, refreshed in the
 * background while online, and submit goes through the offline outbox. No
 * server load, so client-side navigation here needs no connection, and with
 * ssr off the page holds no data until the browser reads the snapshot.
 */
export const ssr = false;

const EMPTY: OrderPrereqs = {
	accounts: [],
	locations: [],
	brands: [],
	seasons: [],
	deliveries: [],
	reps: [],
	sourceTypes: [],
	showDates: [],
	brandTerms: [],
	currentUser: null,
	isBuyer: false,
	isBrandOrg: false,
	selfBrandId: null,
	acceptedPaymentMethods: [],
	defaultPaymentMethod: null,
	defaultPaymentTerms: null,
	defaultShippingMethod: null,
	brandSettings: {}
};

export const load: PageLoad = async ({ parent }) => {
	const { user, organization } = await parent();
	const snapshot =
		browser && user?.id && organization?.id
			? await orderSnapshot.ensure(user.id, organization.id)
			: null;
	return {
		...(snapshot?.prereqs ?? EMPTY),
		catalog: (snapshot?.products ?? []) as CatalogProduct[],
		/** Null when this device has never downloaded the catalog. */
		snapshotFetchedAt: snapshot?.fetchedAt ?? null
	};
};
