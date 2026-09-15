import { describe, it, expect } from 'vitest';
import { brandImportSchema, brandDraftSchema } from './brand-import';

describe('brandDraftSchema', () => {
	it('normalizes blank and missing optional fields to null', () => {
		const parsed = brandDraftSchema.parse({
			name: '  Marlowe Studio  ',
			contact_first_name: '   ',
			contact_email: null
		});
		expect(parsed.name).toBe('Marlowe Studio');
		expect(parsed.contact_first_name).toBeNull();
		expect(parsed.contact_email).toBeNull();
		expect(parsed.website).toBeNull();
	});

	it('defaults a missing commission rate to 0 rather than failing the row', () => {
		expect(brandDraftSchema.parse({ name: 'Halden' }).commission_rate).toBe(0);
		expect(brandDraftSchema.parse({ name: 'Halden', commission_rate: null }).commission_rate).toBe(
			0
		);
	});

	it('keeps a rate inside 0-100 and rejects one outside it', () => {
		expect(brandDraftSchema.parse({ name: 'Halden', commission_rate: 12.5 }).commission_rate).toBe(
			12.5
		);
		expect(brandDraftSchema.safeParse({ name: 'Halden', commission_rate: 101 }).success).toBe(
			false
		);
		expect(brandDraftSchema.safeParse({ name: 'Halden', commission_rate: -1 }).success).toBe(false);
	});

	it('requires a name', () => {
		expect(brandDraftSchema.safeParse({ name: '   ' }).success).toBe(false);
	});
});

describe('brandImportSchema', () => {
	it('rejects an empty batch', () => {
		expect(brandImportSchema.safeParse({ brands: [] }).success).toBe(false);
	});

	it('accepts a batch of valid rows', () => {
		const parsed = brandImportSchema.parse({
			brands: [{ name: 'Halden' }, { name: 'Marlowe Studio', commission_rate: 10 }]
		});
		expect(parsed.brands).toHaveLength(2);
	});
});
