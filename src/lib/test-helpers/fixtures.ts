/**
 * Test data factories for common database entities.
 * Use spread overrides to customize per-test.
 */

export function makeOrder(overrides: Record<string, unknown> = {}) {
	return {
		account_id: 'acct-1',
		total_amount: 1000,
		status: 'confirmed',
		created_at: '2026-01-15T00:00:00Z',
		order_year: 2026,
		organization_id: 'org-1',
		...overrides
	};
}

export function makeAccount(overrides: Record<string, unknown> = {}) {
	return {
		id: 'acct-1',
		created_at: '2024-06-01T00:00:00Z',
		is_active: true,
		archived_at: null,
		business_name: 'Test Store',
		organization_id: 'org-1',
		...overrides
	};
}

export function makeOverdueOrder(overrides: Record<string, unknown> = {}) {
	return {
		id: 'order-1',
		order_number: 'ORD-001',
		total_amount: 5000,
		expected_ship_date: '2026-03-01',
		status: 'confirmed',
		account_id: 'acct-1',
		brand_id: 'brand-1',
		accounts: { business_name: 'Test Store' },
		brands: { name: 'Test Brand' },
		organization_id: 'org-1',
		...overrides
	};
}

export function makeDelivery(overrides: Record<string, unknown> = {}) {
	return {
		id: 'del-1',
		label: 'Spring Delivery',
		delivery_month: 6,
		delivery_day: 15,
		seasons: { name: 'SS26' },
		organization_id: 'org-1',
		...overrides
	};
}
