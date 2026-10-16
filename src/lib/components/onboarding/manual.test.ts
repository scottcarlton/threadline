import { describe, expect, it } from 'vitest';
import {
	emptyManualAccount,
	emptyManualMember,
	emptyManualProduct,
	isTablePaste,
	manualAccountDraft,
	manualMemberInvite,
	manualProductDraft
} from './manual';

describe('manualAccountDraft', () => {
	it('requires a business name', () => {
		const r = manualAccountDraft({ ...emptyManualAccount(), businessName: '   ' });
		expect(r.ok).toBe(false);
	});

	it('builds an import-shaped row, blanks as null', () => {
		const r = manualAccountDraft({
			...emptyManualAccount(),
			businessName: '  Mercer Supply ',
			contactEmail: 'buyer@mercer.com',
			city: 'Austin'
		});
		expect(r).toEqual({
			ok: true,
			draft: {
				business_name: 'Mercer Supply',
				contact_first_name: null,
				contact_last_name: null,
				contact_email: 'buyer@mercer.com',
				phone: null,
				address_line1: null,
				city: 'Austin',
				state: null,
				zip: null
			}
		});
	});

	it('rejects a malformed email', () => {
		const r = manualAccountDraft({
			...emptyManualAccount(),
			businessName: 'Mercer',
			contactEmail: 'mercer'
		});
		expect(r.ok).toBe(false);
	});
});

describe('manualProductDraft', () => {
	const base = { ...emptyManualProduct(), styleNumber: 'SS26-01', name: 'Linen Shirt' };

	it('requires style number, name, and a numeric wholesale price', () => {
		expect(manualProductDraft({ ...base, styleNumber: '' }).ok).toBe(false);
		expect(manualProductDraft({ ...base, name: '' }).ok).toBe(false);
		expect(manualProductDraft({ ...base, wholesalePrice: '' }).ok).toBe(false);
		expect(manualProductDraft({ ...base, wholesalePrice: 'abc' }).ok).toBe(false);
	});

	it('accepts $ and commas, and leaves retail null when blank', () => {
		const r = manualProductDraft({ ...base, wholesalePrice: '$1,048.50' });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.draft.wholesale_price).toBe(1048.5);
			expect(r.draft.retail_price).toBeNull();
			expect(r.draft.sizes).toEqual([]);
		}
	});

	it('allows a zero wholesale price', () => {
		expect(manualProductDraft({ ...base, wholesalePrice: '0' }).ok).toBe(true);
	});

	it('rejects a non-numeric retail price instead of dropping it', () => {
		expect(manualProductDraft({ ...base, wholesalePrice: '48', retailPrice: 'tbd' }).ok).toBe(
			false
		);
	});
});

describe('manualMemberInvite', () => {
	it('rejects a malformed email', () => {
		expect(manualMemberInvite({ ...emptyManualMember(), email: 'nope' }).ok).toBe(false);
	});

	it('only carries commission for sales', () => {
		const member = manualMemberInvite({
			email: 'a@b.co',
			role: 'member',
			commissionRate: '10'
		});
		expect(member).toEqual({ ok: true, draft: { email: 'a@b.co', role: 'member' } });

		const sales = manualMemberInvite({ email: 'a@b.co', role: 'sales', commissionRate: '12.5%' });
		expect(sales).toEqual({
			ok: true,
			draft: { email: 'a@b.co', role: 'sales', commissionRate: 12.5 }
		});
	});

	it('rejects an out-of-range commission', () => {
		expect(manualMemberInvite({ email: 'a@b.co', role: 'sales', commissionRate: '140' }).ok).toBe(
			false
		);
	});
});

describe('isTablePaste', () => {
	it('treats multi-line text as a table', () => {
		expect(isTablePaste('name,email\nAda,ada@x.co')).toBe(true);
		expect(isTablePaste('name,email\r\nAda,ada@x.co')).toBe(true);
	});

	it('leaves single values, including trailing newlines, to the prompt bar', () => {
		expect(isTablePaste('ada@x.co')).toBe(false);
		expect(isTablePaste('Mercer Supply\n')).toBe(false);
	});
});
