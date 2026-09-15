import { describe, expect, it } from 'vitest';
import {
	createReturnSchema,
	RETURN_REASON_CODES,
	RETURN_REASON_LABELS
} from './return-authorization';

const ID = '00000000-0000-4000-8000-000000000001';

const line = (over: Record<string, unknown> = {}) => ({
	orderLineId: null,
	variantId: null,
	styleNumber: 'ST-1',
	description: '',
	color: '',
	size: '',
	qty: 1,
	unitPrice: 10,
	reasonCode: null,
	...over
});

const base = (over: Record<string, unknown> = {}) => ({
	mode: 'order',
	orderId: ID,
	brandId: null,
	accountId: null,
	reason: '',
	reasonCode: null,
	lines: [line()],
	...over
});

/** Collects issue paths as dotted strings so assertions read clearly. */
function paths(input: unknown): string[] {
	const result = createReturnSchema.safeParse(input);
	if (result.success) return [];
	return result.error.issues.map((i) => i.path.join('.'));
}

describe('createReturnSchema', () => {
	it('accepts an order-derived return', () => {
		expect(createReturnSchema.safeParse(base()).success).toBe(true);
	});

	it('accepts a free-entry return with a brand and account', () => {
		expect(
			createReturnSchema.safeParse(
				base({ mode: 'free', orderId: null, brandId: ID, accountId: ID })
			).success
		).toBe(true);
	});

	describe('order mode', () => {
		it('requires an order', () => {
			expect(paths(base({ orderId: null }))).toContain('orderId');
		});

		it('does not require a brand or account, since both come from the order', () => {
			// The server derives the denormalized keys rather than trusting the
			// client, so the form has no reason to carry them here.
			const errs = paths(base({ brandId: null, accountId: null }));
			expect(errs).not.toContain('brandId');
			expect(errs).not.toContain('accountId');
		});

		it('does not require a style number, since the order line describes the goods', () => {
			const errs = paths(base({ lines: [line({ styleNumber: '', description: '' })] }));
			expect(errs).toEqual([]);
		});
	});

	describe('free mode', () => {
		const free = (over: Record<string, unknown> = {}) =>
			base({ mode: 'free', orderId: null, brandId: ID, accountId: ID, ...over });

		it('requires a brand', () => {
			expect(paths(free({ brandId: null }))).toContain('brandId');
		});

		it('requires an account, because a credit has to go to someone', () => {
			expect(paths(free({ accountId: null }))).toContain('accountId');
		});

		it('does not require an order', () => {
			expect(paths(free())).not.toContain('orderId');
		});

		it('requires a style number or a description on every line', () => {
			expect(paths(free({ lines: [line({ styleNumber: '', description: '' })] }))).toContain(
				'lines.0.styleNumber'
			);
		});

		it('accepts a line with only a description', () => {
			expect(
				paths(free({ lines: [line({ styleNumber: '', description: 'Blue wool coat' })] }))
			).toEqual([]);
		});

		it('flags every offending line, not just the first', () => {
			const errs = paths(
				free({
					lines: [
						line({ styleNumber: '', description: '' }),
						line(),
						line({ styleNumber: '', description: '' })
					]
				})
			);
			expect(errs).toContain('lines.0.styleNumber');
			expect(errs).toContain('lines.2.styleNumber');
		});
	});

	describe('lines', () => {
		it('requires at least one', () => {
			expect(paths(base({ lines: [] }))).toContain('lines');
		});

		it('rejects a quantity below one', () => {
			expect(paths(base({ lines: [line({ qty: 0 })] }))).toContain('lines.0.qty');
		});

		it('rejects a fractional quantity', () => {
			expect(paths(base({ lines: [line({ qty: 1.5 })] }))).toContain('lines.0.qty');
		});

		it('rejects a negative price', () => {
			expect(paths(base({ lines: [line({ unitPrice: -1 })] }))).toContain('lines.0.unitPrice');
		});

		it('accepts a zero price, which is how samples and gratis goods come back', () => {
			expect(paths(base({ lines: [line({ unitPrice: 0 })] }))).toEqual([]);
		});
	});

	describe('reason codes', () => {
		it('accepts every published code', () => {
			for (const code of RETURN_REASON_CODES) {
				expect(paths(base({ reasonCode: code }))).toEqual([]);
			}
		});

		it('rejects an unknown code', () => {
			expect(paths(base({ reasonCode: 'made_up' }))).toContain('reasonCode');
		});

		it('has a label for every code', () => {
			// A missing label renders an empty option in the picker.
			for (const code of RETURN_REASON_CODES) {
				expect(RETURN_REASON_LABELS[code]).toBeTruthy();
			}
		});
	});

	it('trims and defaults the free-text reason', () => {
		const parsed = createReturnSchema.parse(base({ reason: '  Arrived damaged  ' }));
		expect(parsed.reason).toBe('Arrived damaged');
	});
});
