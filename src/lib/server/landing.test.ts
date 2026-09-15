import { describe, it, expect } from 'vitest';
import { landingPathForOrgType } from './landing.js';

describe('landingPathForOrgType', () => {
	it('routes a retailer org to the buyer portal', () => {
		expect(landingPathForOrgType('retailer')).toBe('/dashboard');
	});

	it('routes a rep org to /insight', () => {
		expect(landingPathForOrgType('rep')).toBe('/insight');
	});

	it('routes a brand org to /insight', () => {
		expect(landingPathForOrgType('brand')).toBe('/insight');
	});
});
