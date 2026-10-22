import { describe, it, expect } from 'vitest';
import {
	writeToolSchemas,
	parseWriteToolInput,
	checkToolInput,
	isWriteToolName,
	toolInputJsonSchema
} from './stitch-tools';

describe('parseWriteToolInput', () => {
	it('accepts a valid call and returns typed data', () => {
		const r = parseWriteToolInput('update_order_line', { line_id: 'l1', qty: 3 });
		expect(r).toEqual({ success: true, data: { line_id: 'l1', qty: 3 } });
	});

	it('strips fields the schema does not declare, so handlers only see the allow-list', () => {
		const r = parseWriteToolInput('update_brand', {
			brand_id: 'b1',
			name: 'Acme',
			commission_rate: 0.5,
			organization_id: 'other-org'
		});
		expect(r).toEqual({ success: true, data: { brand_id: 'b1', name: 'Acme' } });
	});

	it('reads null as absent, at the top level and inside order lines', () => {
		const r = parseWriteToolInput('create_order', {
			account_name: 'Nordstrom',
			brand_name: null,
			start_ship_date: '2026-11-01',
			complete_ship_date: '2026-11-30',
			lines: [{ style_number: 'A1', qty: 2, unit_price: null }],
			notes: null
		});
		expect(r).toEqual({
			success: true,
			data: {
				account_name: 'Nordstrom',
				start_ship_date: '2026-11-01',
				complete_ship_date: '2026-11-30',
				lines: [{ style_number: 'A1', qty: 2 }]
			}
		});
	});

	it('rejects a wrong type with an error that names the tool and the field path', () => {
		const r = parseWriteToolInput('create_order', {
			account_name: 'Nordstrom',
			start_ship_date: '2026-11-01',
			complete_ship_date: '2026-11-30',
			lines: [{ qty: '2' }]
		});
		expect(r.success).toBe(false);
		if (r.success) return;
		expect(r.error).toMatch(/^Invalid input for create_order\./);
		expect(r.error).toContain('lines.0.qty');
	});

	it('rejects a missing required field', () => {
		const r = parseWriteToolInput('remove_order_line', { line_id: 'l1' });
		expect(r.success).toBe(false);
		if (r.success) return;
		expect(r.error).toContain('reason');
	});

	it('rejects a value outside an enum', () => {
		expect(
			parseWriteToolInput('update_order_status', { order_id: 'o1', status: 'paid' }).success
		).toBe(false);
		expect(parseWriteToolInput('skip_setup_section', { section: 'billing' }).success).toBe(false);
	});

	it('requires at least one product id for update_products', () => {
		expect(parseWriteToolInput('update_products', { product_ids: [], updates: {} }).success).toBe(
			false
		);
	});

	it('rejects input that is not an object', () => {
		expect(parseWriteToolInput('create_brand', 'Acme').success).toBe(false);
	});
});

describe('checkToolInput', () => {
	it('passes tools without a schema through untouched', () => {
		const input = { entity: 'orders', filters: { status: 'draft' } };
		expect(checkToolInput('query_data', input)).toEqual({ success: true, data: input });
	});

	it('checks write tools', () => {
		expect(checkToolInput('create_season', {}).success).toBe(false);
		expect(checkToolInput('create_season', { name: 'Fall' })).toEqual({
			success: true,
			data: { name: 'Fall' }
		});
	});

	it('treats an inherited property name as an unknown tool', () => {
		expect(isWriteToolName('toString')).toBe(false);
		expect(isWriteToolName('create_brand')).toBe(true);
	});
});

describe('toolInputJsonSchema', () => {
	it('gives every write tool an object schema with no $schema key', () => {
		for (const [name, schema] of Object.entries(writeToolSchemas)) {
			const json = toolInputJsonSchema(schema);
			expect(json.type, name).toBe('object');
			expect(json, name).not.toHaveProperty('$schema');
		}
	});

	it('carries required fields, enums, and descriptions through to the model', () => {
		const json = toolInputJsonSchema(writeToolSchemas.update_order_status) as unknown as {
			required: string[];
			properties: Record<string, { enum?: string[]; description?: string }>;
		};
		expect(json.required).toEqual(['order_id', 'status']);
		expect(json.properties.status.enum).toContain('cancelled');
		expect(json.properties.order_id.description).toBe('Order ID (required)');
	});
});
