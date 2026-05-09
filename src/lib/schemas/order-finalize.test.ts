import { describe, expect, it } from 'vitest';
import { finalizeSchema } from './order-finalize';

// Zod v4's UUID format validator requires RFC-4122 version/variant bits, so
// these fixtures are real v4 UUIDs rather than counter-generated strings.
const brandA = 'a1a1a1a1-1111-4111-8111-000000000001';
const brandB = 'b2b2b2b2-2222-4222-8222-000000000002';
const seasonA = 'ca11caaa-aaaa-4aaa-8aaa-00000000000a';
const accountId = 'ac000000-0000-4000-8000-000000000020';
const repId = '7e700000-0000-4000-8000-000000000030';
const termsA = 'c000000a-0000-4000-8000-00000000000a';
const termsB = 'c000000b-0000-4000-8000-00000000000b';

const baseOrder = (over: Partial<Record<string, unknown>> = {}) => ({
	brand_id: brandA,
	season_id: seasonA,
	ship_to_location_id: null,
	bill_to_location_id: null,
	payment_preference: null,
	payment_terms: null,
	shipping_method: null,
	po_number: undefined,
	internal_note: undefined,
	...over
});

const baseInput = (over: Partial<Record<string, unknown>> = {}) => ({
	submit_mode: 'order' as const,
	account_id: accountId,
	freeform_name: undefined,
	contact_location_id: null,
	rep_user_id: repId,
	source_type_id: null,
	show_date_id: null,
	orders: [baseOrder()],
	brand_agreements: [{ brand_id: brandA, terms_id: null, agreed: false }],
	...over
});

describe('finalizeSchema — shape', () => {
	it('accepts a minimal valid order submission', () => {
		const result = finalizeSchema.safeParse(baseInput());
		expect(result.success).toBe(true);
	});

	it('rejects empty orders array', () => {
		const result = finalizeSchema.safeParse(baseInput({ orders: [] }));
		expect(result.success).toBe(false);
	});

	it('rejects invalid payment_preference code', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				orders: [baseOrder({ payment_preference: 'net_30' })] // term in method slot
			})
		);
		expect(result.success).toBe(false);
	});

	it('accepts a valid payment_preference (method)', () => {
		const result = finalizeSchema.safeParse(
			baseInput({ orders: [baseOrder({ payment_preference: 'credit_card' })] })
		);
		expect(result.success).toBe(true);
	});

	it('accepts a valid payment_terms and shipping_method', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				orders: [
					baseOrder({
						payment_terms: 'net_60',
						shipping_method: 'air'
					})
				]
			})
		);
		expect(result.success).toBe(true);
	});

	it('rejects PO longer than 64 chars', () => {
		const long = 'x'.repeat(65);
		const result = finalizeSchema.safeParse(
			baseInput({ orders: [baseOrder({ po_number: long })] })
		);
		expect(result.success).toBe(false);
	});

	it('transforms empty-string text fields to undefined', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				orders: [baseOrder({ po_number: '   ', internal_note: '' })]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.orders[0].po_number).toBeUndefined();
			expect(result.data.orders[0].internal_note).toBeUndefined();
		}
	});
});

describe('finalizeSchema — terms gating', () => {
	it('requires agreement when submitting with a brand that has terms', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				brand_agreements: [{ brand_id: brandA, terms_id: termsA, agreed: false }]
			})
		);
		expect(result.success).toBe(false);
	});

	it('allows submit when the single brand with terms is agreed', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				brand_agreements: [{ brand_id: brandA, terms_id: termsA, agreed: true }]
			})
		);
		expect(result.success).toBe(true);
	});

	it('requires every brand with terms to be agreed on multi-brand submit', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				orders: [baseOrder(), baseOrder({ brand_id: brandB, season_id: null })],
				brand_agreements: [
					{ brand_id: brandA, terms_id: termsA, agreed: true },
					{ brand_id: brandB, terms_id: termsB, agreed: false }
				]
			})
		);
		expect(result.success).toBe(false);
	});

	it('does not gate brands with no terms on file (terms_id null)', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				orders: [baseOrder(), baseOrder({ brand_id: brandB, season_id: null })],
				brand_agreements: [
					{ brand_id: brandA, terms_id: null, agreed: false },
					{ brand_id: brandB, terms_id: null, agreed: false }
				]
			})
		);
		expect(result.success).toBe(true);
	});

	it('ignores agreement state entirely when submit_mode is note', () => {
		const result = finalizeSchema.safeParse(
			baseInput({
				submit_mode: 'note',
				brand_agreements: [{ brand_id: brandA, terms_id: termsA, agreed: false }]
			})
		);
		expect(result.success).toBe(true);
	});
});

describe('finalizeSchema — freeform', () => {
	it('allows saving a freeform (no account) submission as a note', () => {
		const result = finalizeSchema.safeParse(
			baseInput({ submit_mode: 'note', account_id: null, freeform_name: 'Lead: Blue Moon' })
		);
		expect(result.success).toBe(true);
	});

	it('rejects submitting a freeform (no account) as an order', () => {
		const result = finalizeSchema.safeParse(
			baseInput({ submit_mode: 'order', account_id: null, freeform_name: 'Lead: Blue Moon' })
		);
		expect(result.success).toBe(false);
	});
});

const showDateId = '50000000-0000-4000-8000-000000000050';
const sourceTypeId = '60000000-0000-4000-8000-000000000060';

describe('finalizeSchema — source selection', () => {
	it('accepts a show_date_id as the sole source', () => {
		const result = finalizeSchema.safeParse(
			baseInput({ source_type_id: null, show_date_id: showDateId })
		);
		expect(result.success).toBe(true);
	});

	it('rejects setting both source_type_id and show_date_id', () => {
		const result = finalizeSchema.safeParse(
			baseInput({ source_type_id: sourceTypeId, show_date_id: showDateId })
		);
		expect(result.success).toBe(false);
	});
});
