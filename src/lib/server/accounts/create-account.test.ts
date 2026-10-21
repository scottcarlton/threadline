import { describe, expect, it, vi } from 'vitest';
import { createAccountSchema, syncAccountPayloadSchema } from '$lib/schemas/account';
import {
	buildCreateAccountArgs,
	createAccount,
	resolvePaymentPreference,
	type CreateAccountArgs
} from './create-account';

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

describe('resolvePaymentPreference', () => {
	it('keeps an accepted pick, else falls back to an accepted org default', () => {
		expect(resolvePaymentPreference('check', ['check', 'ach'], 'ach')).toBe('check');
		expect(resolvePaymentPreference('wire', ['check', 'ach'], 'ach')).toBe('ach');
		expect(resolvePaymentPreference('', ['check'], 'ach')).toBeNull();
		expect(resolvePaymentPreference(undefined, [], null)).toBeNull();
	});
});

describe('createAccount', () => {
	const ORG = '0a000000-0000-4000-8000-000000000001';

	function payload(email = 'buyer@example.com') {
		return syncAccountPayloadSchema.parse({
			organization_id: ORG,
			account: {
				...input({ contact: { firstName: 'Ada', lastName: 'Lovelace', email } }),
				id: ACCOUNT_ID,
				primaryLocationId: PRIMARY_ID
			}
		});
	}

	function deps(opts: {
		org?: unknown;
		rpc?: { data: unknown; error: { code: string } | null };
		inviteStatus?: number;
	}) {
		const single = vi.fn(
			async () => opts.rpc ?? { data: { account_id: ACCOUNT_ID, inserted: true }, error: null }
		);
		const supabase = {
			from: () => ({
				select: () => ({
					eq: () => ({
						maybeSingle: async () => ({
							data:
								opts.org === undefined
									? {
											id: ORG,
											accepted_payment_methods: ['check'],
											default_payment_method: 'check'
										}
									: opts.org
						})
					})
				})
			}),
			rpc: vi.fn(() => ({ single }))
		};
		const audit = { record: vi.fn() };
		const emit = vi.fn();
		const fetch = vi.fn(async () => new Response('{}', { status: opts.inviteStatus ?? 200 }));
		return { supabase, audit, emit, fetch };
	}

	async function run(d: ReturnType<typeof deps>, p = payload()) {
		return createAccount({
			supabase: d.supabase as never,
			audit: d.audit as never,
			payload: p,
			origin: 'https://app.test',
			fetch: d.fetch as never,
			emit: d.emit as never
		});
	}

	it('creates the account in the captured org and runs every side effect once', async () => {
		const d = deps({});
		const res = await run(d);
		expect(res).toEqual({ ok: true, accountId: ACCOUNT_ID, inserted: true, inviteFailed: false });
		const [fn, args] = d.supabase.rpc.mock.calls[0] as unknown as [string, CreateAccountArgs];
		expect(fn).toBe('create_account_with_locations');
		expect(args.p_org_id).toBe(ORG);
		expect(args.p_account_id).toBe(ACCOUNT_ID);
		expect(args.p_account.payment_preference).toBe('check');
		expect(d.audit.record).toHaveBeenCalledTimes(1);
		expect(d.emit).toHaveBeenCalledTimes(1);
		expect(d.fetch).toHaveBeenCalledTimes(1);
	});

	it('runs no side effects on a replay', async () => {
		const d = deps({ rpc: { data: { account_id: ACCOUNT_ID, inserted: false }, error: null } });
		const res = await run(d);
		expect(res).toMatchObject({ ok: true, inserted: false });
		expect(d.audit.record).not.toHaveBeenCalled();
		expect(d.emit).not.toHaveBeenCalled();
		expect(d.fetch).not.toHaveBeenCalled();
	});

	it('skips the invite when there is no contact email', async () => {
		const d = deps({});
		await run(d, payload(''));
		expect(d.fetch).not.toHaveBeenCalled();
	});

	it('reports a failed invite without failing the create', async () => {
		const d = deps({ inviteStatus: 500 });
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await run(d)).toMatchObject({ ok: true, inviteFailed: true });
		spy.mockRestore();
	});

	it('refuses an org the user cannot see', async () => {
		const d = deps({ org: null });
		expect(await run(d)).toMatchObject({ ok: false, status: 403 });
		expect(d.supabase.rpc).not.toHaveBeenCalled();
	});

	it('maps an RLS denial to 403 and an id collision to 409', async () => {
		expect(await run(deps({ rpc: { data: null, error: { code: '42501' } } }))).toMatchObject({
			ok: false,
			status: 403
		});
		expect(await run(deps({ rpc: { data: null, error: { code: '23505' } } }))).toMatchObject({
			ok: false,
			status: 409
		});
	});
});

describe('syncAccountPayloadSchema', () => {
	it('requires the client ids, since they are the idempotency key', () => {
		const account = input();
		expect(
			syncAccountPayloadSchema.safeParse({
				organization_id: '0a000000-0000-4000-8000-000000000001',
				account
			}).success
		).toBe(false);
	});
});
