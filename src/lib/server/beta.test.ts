import { afterEach, describe, expect, it } from 'vitest';
import { env } from '$env/dynamic/private';
import { isBetaActive, isCheckoutOpen } from './beta.js';

const original = env.BETA_ENABLED;
afterEach(() => {
	env.BETA_ENABLED = original;
});

describe('isBetaActive', () => {
	it('is on when the variable is unset', () => {
		delete env.BETA_ENABLED;
		expect(isBetaActive()).toBe(true);
		expect(isCheckoutOpen()).toBe(false);
	});

	it('stays on for anything other than exactly "false"', () => {
		for (const value of ['true', '', 'FALSE', '0', 'no']) {
			env.BETA_ENABLED = value;
			expect(isBetaActive()).toBe(true);
		}
	});

	it('turns off, opening checkout, only for "false"', () => {
		env.BETA_ENABLED = 'false';
		expect(isBetaActive()).toBe(false);
		expect(isCheckoutOpen()).toBe(true);
	});
});
