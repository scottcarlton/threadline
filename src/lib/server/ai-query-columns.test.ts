import { describe, it, expect } from 'vitest';
import {
	checkFilterColumns,
	omitForEntity,
	FILTERABLE_COLUMNS,
	SENSITIVE_COLUMNS,
	GLOBAL_OMIT
} from './ai-query-columns.js';

describe('checkFilterColumns', () => {
	it('allows the filters a normal question produces', () => {
		expect(checkFilterColumns('orders', { status: 'draft', order_year: 2026 })).toEqual({
			ok: true
		});
		expect(checkFilterColumns('accounts', { business_name: 'Bloom' })).toEqual({ ok: true });
	});

	it('allows an empty filter object', () => {
		expect(checkFilterColumns('orders', {})).toEqual({ ok: true });
	});

	// F-7: filtering on a column that is stripped from the output turned it into
	// an oracle you could binary-search.
	it('refuses a column that is never returned', () => {
		const result = checkFilterColumns('orders', { organization_id: 'org-2' });
		expect(result.ok).toBe(false);
	});

	it('refuses financial columns even though they exist on the table', () => {
		for (const column of SENSITIVE_COLUMNS.brands) {
			expect(checkFilterColumns('brands', { [column]: 'x' }).ok).toBe(false);
		}
	});

	it('names the offending keys and the allowed ones, so the model can retry', () => {
		const result = checkFilterColumns('orders', { total_amount: 100, status: 'draft' });
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('total_amount');
		expect(result.error).toContain('status');
		expect(result.error).not.toContain('undefined');
	});

	it('refuses an unknown entity', () => {
		expect(checkFilterColumns('invoices', {}).ok).toBe(false);
	});

	it('covers every entity the query tool exposes', () => {
		const exposed = [
			'brands',
			'accounts',
			'orders',
			'shows',
			'seasons',
			'territories',
			'appointments',
			'order_lines',
			'products',
			'contacts',
			'show_dates'
		];
		for (const entity of exposed) {
			expect(FILTERABLE_COLUMNS[entity], `${entity} has no allowlist`).toBeDefined();
			expect(FILTERABLE_COLUMNS[entity].length).toBeGreaterThan(0);
		}
	});

	it('never lists a sensitive column as filterable', () => {
		for (const [entity, columns] of Object.entries(SENSITIVE_COLUMNS)) {
			for (const column of columns) {
				expect(FILTERABLE_COLUMNS[entity] ?? []).not.toContain(column);
			}
		}
	});

	it('never lists a globally omitted column as filterable', () => {
		for (const columns of Object.values(FILTERABLE_COLUMNS)) {
			for (const omitted of GLOBAL_OMIT) {
				expect(columns).not.toContain(omitted);
			}
		}
	});
});

describe('omitForEntity', () => {
	it('always strips the global fields', () => {
		expect(omitForEntity('seasons')).toEqual(expect.arrayContaining([...GLOBAL_OMIT]));
	});

	// These were reaching the model on every brand query.
	it('strips the tax id and payment credentials from brands', () => {
		const omitted = omitForEntity('brands');
		expect(omitted).toContain('taxes_us_ein');
		expect(omitted).toContain('payments_stripe_account_id');
		expect(omitted).toContain('payments_deposit_account_last4');
	});

	it('is just the global list for an entity with nothing sensitive', () => {
		expect(omitForEntity('shows')).toEqual([...GLOBAL_OMIT]);
	});
});
