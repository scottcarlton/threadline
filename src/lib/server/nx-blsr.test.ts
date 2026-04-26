import { describe, it, expect } from 'vitest';
import { getNxBlsrBrandOrgIds, isNxBlsr } from './nx-blsr';

type Membership = Parameters<typeof getNxBlsrBrandOrgIds>[0] extends (infer T)[] | null | undefined
	? T
	: never;

const m = (
	organization_id: string,
	role: 'owner' | 'admin' | 'sales' | 'member' | 'guest',
	org_type: 'brand' | 'rep'
): Membership =>
	({
		organization_id,
		role,
		organizations: { id: organization_id, org_type }
	}) as unknown as Membership;

describe('getNxBlsrBrandOrgIds', () => {
	it('returns empty for null/undefined input', () => {
		expect(getNxBlsrBrandOrgIds(null)).toEqual([]);
		expect(getNxBlsrBrandOrgIds(undefined)).toEqual([]);
	});

	it('returns empty when there are no brand-org sales memberships', () => {
		expect(getNxBlsrBrandOrgIds([m('rep-1', 'admin', 'rep')])).toEqual([]);
	});

	it('returns the single brand-org id when only one brand-sales membership', () => {
		expect(getNxBlsrBrandOrgIds([m('brand-1', 'sales', 'brand')])).toEqual(['brand-1']);
	});

	it('returns both ids when user is sales in two brand orgs', () => {
		expect(
			getNxBlsrBrandOrgIds([m('brand-1', 'sales', 'brand'), m('brand-2', 'sales', 'brand')])
		).toEqual(['brand-1', 'brand-2']);
	});

	it('ignores brand-org memberships with non-sales roles', () => {
		expect(
			getNxBlsrBrandOrgIds([m('brand-1', 'sales', 'brand'), m('brand-2', 'admin', 'brand')])
		).toEqual(['brand-1']);
	});

	it('ignores rep-org sales memberships (only brand-org sales counts)', () => {
		expect(
			getNxBlsrBrandOrgIds([m('rep-1', 'sales', 'rep'), m('brand-1', 'sales', 'brand')])
		).toEqual(['brand-1']);
	});
});

describe('isNxBlsr', () => {
	it('is false for empty', () => {
		expect(isNxBlsr([])).toBe(false);
	});

	it('is false for a single brand-org id (single-brand BLSR is not Nx)', () => {
		expect(isNxBlsr(['brand-1'])).toBe(false);
	});

	it('is true for two or more brand-org ids', () => {
		expect(isNxBlsr(['brand-1', 'brand-2'])).toBe(true);
		expect(isNxBlsr(['brand-1', 'brand-2', 'brand-3'])).toBe(true);
	});
});
