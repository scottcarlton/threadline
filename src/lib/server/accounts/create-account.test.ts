import { describe, expect, it } from 'vitest';
import { createAccountSchema } from '$lib/schemas/account';
import { buildCreateAccountArgs } from './create-account';

const ACCOUNT_ID = '0a000000-0000-4000-8000-000000000001';
const PRIMARY_ID = '0a000000-0000-4000-8000-000000000002';
const ANNEX_ID = '0a000000-0000-4000-8000-000000000003';

const input = (over: Record<string, unknown> = {}) =>
	createAccountSchema.parse({
		business: {
			name: 'Shop',
			address: { line1: '1 Main', city: 'Austin', state: 'TX' },
			additionalLocations: []
		},
		contact: { firstName: 'Ada', lastName: 'Lovelace' },
		...over
	});

let counter = 0;
const seq = () => `generated-${++counter}`;

describe('buildCreateAccountArgs', () => {
	it('keeps the client ids so a retry replays the same account', () => {
		const args = buildCreateAccountArgs(
			input({
				id: ACCOUNT_ID,
				primaryLocationId: PRIMARY_ID,
				business: {
					name: 'Shop',
					address: {},
					additionalLocations: [{ id: ANNEX_ID, label: 'Annex', address: {}, contact: {} }]
				}
			}),
			'org-1',
			null,
			seq
		);
		expect(args.p_account_id).toBe(ACCOUNT_ID);
		expect(args.p_locations.map((l) => l.id)).toEqual([PRIMARY_ID, ANNEX_ID]);
	});

	it('generates ids when the client sent none', () => {
		counter = 0;
		const args = buildCreateAccountArgs(input(), 'org-1', null, seq);
		expect(args.p_account_id).toBe('generated-1');
		expect(args.p_locations[0].id).toBe('generated-2');
	});

	it('mirrors the account address and contact onto the primary location', () => {
		const args = buildCreateAccountArgs(input(), 'org-1', 'net30', seq);
		expect(args.p_org_id).toBe('org-1');
		expect(args.p_account).toMatchObject({
			business_name: 'Shop',
			address_line1: '1 Main',
			city: 'Austin',
			address_line2: null,
			payment_preference: 'net30'
		});
		expect(args.p_locations[0]).toMatchObject({
			label: 'Primary',
			is_default: true,
			sort_order: 0,
			address_line1: '1 Main',
			contact_first_name: 'Ada'
		});
	});

	it('orders additional locations after the primary', () => {
		const args = buildCreateAccountArgs(
			input({
				business: {
					name: 'Shop',
					address: {},
					additionalLocations: [
						{ label: 'A', address: {}, contact: {} },
						{ label: 'B', address: {}, contact: {} }
					]
				}
			}),
			'org-1',
			null,
			seq
		);
		expect(args.p_locations.map((l) => [l.label, l.sort_order, l.is_default])).toEqual([
			['Primary', 0, true],
			['A', 1, false],
			['B', 2, false]
		]);
	});

	it('rejects a client id that is not a uuid', () => {
		expect(createAccountSchema.safeParse({ ...input(), id: 'acct-1' }).success).toBe(false);
	});
});
