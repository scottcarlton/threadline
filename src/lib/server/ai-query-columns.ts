/**
 * Which columns the query_data tool may filter on, and which never leave.
 *
 * Two problems in the same function.
 *
 * ## Filters (F-7)
 *
 * `queryData` applied every key of the model-supplied `filters` object directly
 * as a column predicate. Org scoping still held, so this was never cross-tenant,
 * but a caller could filter on columns deliberately stripped from the output and
 * binary-search a value they were never shown. A filter is a read, so the set of
 * filterable columns should not be wider than the set of visible ones.
 *
 * ## Output
 *
 * The select is `*` minus two fields, so every column of every table reached the
 * model. On `brands` that includes the org's tax id, their Stripe account id,
 * and the last four of their deposit account. None of that helps answer a
 * question about wholesale orders, and all of it was being sent to a third party
 * on every brand query.
 *
 * Both lists are explicit rather than derived. A new column should have to be
 * named before it is exposed, not exposed until someone notices.
 */

/** Columns stripped from every row, on every entity, before the model sees it. */
export const GLOBAL_OMIT = ['organization_id', 'updated_at'] as const;

/**
 * Per-entity columns that must never reach the model: financial credentials and
 * tax identifiers. Filtering on them is refused for the same reason.
 */
export const SENSITIVE_COLUMNS: Record<string, string[]> = {
	brands: [
		'taxes_us_ein',
		'taxes_vat_registration',
		'taxes_gst_registration',
		'payments_stripe_account_id',
		'payments_deposit_account_name',
		'payments_deposit_account_last4'
	]
};

/**
 * Columns worth filtering on, per entity.
 *
 * Curated from the real schema rather than "every column": these are the ones a
 * question about the business actually turns into a predicate. Anything absent
 * is refused with the list, so the model can correct itself in one turn.
 */
export const FILTERABLE_COLUMNS: Record<string, string[]> = {
	brands: ['id', 'name', 'is_active', 'contact_email', 'contact_phone', 'website', 'archived_at'],
	accounts: [
		'id',
		'business_name',
		'city',
		'state',
		'zip',
		'country',
		'is_active',
		'territory_id',
		'retailer_org_id',
		'contact_email',
		'contact_first_name',
		'contact_last_name',
		'phone',
		'payment_terms',
		'shipping_method',
		'archived_at'
	],
	orders: [
		'id',
		'order_number',
		'status',
		'account_id',
		'brand_id',
		'season_id',
		'order_year',
		'show_id',
		'show_date_id',
		'order_type',
		'channel',
		'po_number',
		'created_by',
		'rep_user_id',
		'connection_id',
		'start_ship_date',
		'expected_ship_date',
		'tracking_number',
		'carrier',
		'created_at'
	],
	order_lines: [
		'id',
		'order_id',
		'style_number',
		'description',
		'color',
		'size',
		'product_id',
		'variant_id'
	],
	products: [
		'id',
		'brand_id',
		'style_number',
		'name',
		'category',
		'subcategory',
		'season_id',
		'is_active',
		'product_year',
		'is_featured',
		'archived_at'
	],
	shows: ['id', 'name', 'is_active'],
	show_dates: [
		'id',
		'show_id',
		'year',
		'month',
		'venue',
		'city',
		'state',
		'start_date',
		'end_date'
	],
	seasons: ['id', 'name', 'is_active', 'sort_order'],
	territories: ['id', 'name', 'brand_id'],
	appointments: [
		'id',
		'account_id',
		'show_date_id',
		'appointment_type',
		'location_type',
		'scheduled_date',
		'status',
		'created_by'
	],
	contacts: ['id', 'email', 'name', 'status', 'linked_account_id', 'discovered_by']
};

export type FilterCheck = { ok: true } | { ok: false; error: string };

/**
 * Reject any filter key not on the entity's allowlist.
 *
 * The error names what is allowed, since a model that is told only "no" will
 * usually try a near-miss next.
 */
export function checkFilterColumns(entity: string, filters: Record<string, unknown>): FilterCheck {
	const allowed = FILTERABLE_COLUMNS[entity];
	if (!allowed) return { ok: false, error: `Unknown entity: ${entity}` };

	const rejected = Object.keys(filters).filter((key) => !allowed.includes(key));
	if (rejected.length === 0) return { ok: true };

	return {
		ok: false,
		error: `Cannot filter ${entity} by ${rejected.join(', ')}. Filterable columns are: ${allowed.join(', ')}.`
	};
}

/** Full omit list for an entity's rows. */
export function omitForEntity(entity: string): string[] {
	return [...GLOBAL_OMIT, ...(SENSITIVE_COLUMNS[entity] ?? [])];
}
