import { describe, expect, it } from 'vitest';
import { sortReturnsForViewer, viewerIsIssuer } from './returns';
import type { QueryScope } from './scope';
import type { ReturnListRow } from '$lib/utils/return-status';
import type { ReturnStatus } from '$lib/types/database';

const BRAND_ORG = 'org-brand';
const REP_ORG = 'org-rep';

const internal = (ownOrgIds: string[]): QueryScope => ({
	kind: 'internal',
	userId: 'u1',
	orgType: 'brand',
	ownOrgIds,
	boaBrandIds: [],
	isSales: false,
	managerScope: null
});

const buyer: QueryScope = {
	kind: 'buyer',
	userId: 'u2',
	buyerAccountIds: ['acct-1'],
	buyerBrandIds: []
};

const row = (status: ReturnStatus, createdAt: string, orgId = BRAND_ORG): ReturnListRow =>
	({
		id: `${status}-${createdAt}`,
		status,
		created_at: createdAt,
		organization_id: orgId
	}) as ReturnListRow;

describe('viewerIsIssuer', () => {
	it('is true when the row belongs to one of the viewer orgs', () => {
		expect(viewerIsIssuer(internal([BRAND_ORG]), { organization_id: BRAND_ORG })).toBe(true);
	});

	it('is false for a rep looking at a brand-issued return', () => {
		expect(viewerIsIssuer(internal([REP_ORG]), { organization_id: BRAND_ORG })).toBe(false);
	});

	it('is false for a buyer, who issues nothing', () => {
		expect(viewerIsIssuer(buyer, { organization_id: BRAND_ORG })).toBe(false);
	});

	it('is false with no scope at all', () => {
		expect(viewerIsIssuer(null, { organization_id: BRAND_ORG })).toBe(false);
	});

	it('is decided per row, since one list can hold both', () => {
		// A brand org is also the rep on someone else's order.
		const scope = internal([BRAND_ORG]);
		expect(viewerIsIssuer(scope, { organization_id: BRAND_ORG })).toBe(true);
		expect(viewerIsIssuer(scope, { organization_id: REP_ORG })).toBe(false);
	});
});

describe('sortReturnsForViewer', () => {
	it('puts the brand queue in urgency order', () => {
		const rows = [
			row('closed', '2026-09-20'),
			row('received', '2026-09-19'),
			row('requested', '2026-09-18'),
			row('approved', '2026-09-17')
		];
		const sorted = sortReturnsForViewer(rows, internal([BRAND_ORG]));
		expect(sorted.map((r) => r.status)).toEqual(['requested', 'approved', 'received', 'closed']);
	});

	it('breaks ties by newest first', () => {
		const rows = [
			row('requested', '2026-09-01'),
			row('requested', '2026-09-20'),
			row('requested', '2026-09-10')
		];
		const sorted = sortReturnsForViewer(rows, internal([BRAND_ORG]));
		expect(sorted.map((r) => r.created_at)).toEqual(['2026-09-20', '2026-09-10', '2026-09-01']);
	});

	it('gives a rep a plain log, not somebody else workload order', () => {
		// The rep cannot approve, receive or credit anything, so ranking their
		// list by urgency would sort it by work they are not permitted to do.
		const rows = [
			row('closed', '2026-09-20'),
			row('requested', '2026-09-18'),
			row('approved', '2026-09-19')
		];
		const sorted = sortReturnsForViewer(rows, internal([REP_ORG]));
		expect(sorted.map((r) => r.created_at)).toEqual(['2026-09-20', '2026-09-19', '2026-09-18']);
	});

	it('gives a buyer a plain log too', () => {
		const rows = [row('requested', '2026-09-01'), row('closed', '2026-09-20')];
		const sorted = sortReturnsForViewer(rows, buyer);
		expect(sorted.map((r) => r.status)).toEqual(['closed', 'requested']);
	});

	it('does not mutate the array it was given', () => {
		const rows = [row('closed', '2026-09-20'), row('requested', '2026-09-18')];
		const before = rows.map((r) => r.id);
		sortReturnsForViewer(rows, internal([BRAND_ORG]));
		expect(rows.map((r) => r.id)).toEqual(before);
	});

	it('handles an empty list', () => {
		expect(sortReturnsForViewer([], internal([BRAND_ORG]))).toEqual([]);
	});

	it('ranks only rows the viewer issues, leaving mixed rows by date', () => {
		// A brand org that is also a rep: its own pending request outranks its
		// own settled one, but a return it merely watches is not pulled up.
		const rows = [row('closed', '2026-09-20'), row('requested', '2026-09-01', REP_ORG)];
		const sorted = sortReturnsForViewer(rows, internal([BRAND_ORG]));
		expect(sorted.map((r) => r.created_at)).toEqual(['2026-09-20', '2026-09-01']);
	});
});
