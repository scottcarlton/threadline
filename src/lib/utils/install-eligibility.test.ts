import { describe, it, expect } from 'vitest';
import { shouldShowInstallPrompt } from './install-eligibility.js';

describe('shouldShowInstallPrompt', () => {
	const baseInputs = {
		userId: 'user-1',
		isStandalone: false,
		installAvailable: true,
		isLgUp: true,
		isTabletPortrait: false,
		isIosBrowser: false,
		dismissedUserIds: new Set<string>()
	};

	it('returns true on lg+ when install is available and not dismissed', () => {
		expect(shouldShowInstallPrompt(baseInputs)).toBe(true);
	});

	it('returns true on iPad portrait when install is available', () => {
		expect(shouldShowInstallPrompt({ ...baseInputs, isLgUp: false, isTabletPortrait: true })).toBe(
			true
		);
	});

	it('returns false on phone widths', () => {
		expect(shouldShowInstallPrompt({ ...baseInputs, isLgUp: false, isTabletPortrait: false })).toBe(
			false
		);
	});

	it('returns false when already standalone', () => {
		expect(shouldShowInstallPrompt({ ...baseInputs, isStandalone: true })).toBe(false);
	});

	it('returns false when this user has dismissed', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				dismissedUserIds: new Set(['user-1'])
			})
		).toBe(false);
	});

	it('returns true when a different user has dismissed but not this user', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				dismissedUserIds: new Set(['user-2'])
			})
		).toBe(true);
	});

	it('returns true on any iOS browser even without beforeinstallprompt', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				installAvailable: false,
				isIosBrowser: true
			})
		).toBe(true);
	});

	it('returns false when neither install path is available', () => {
		expect(
			shouldShowInstallPrompt({
				...baseInputs,
				installAvailable: false,
				isIosBrowser: false
			})
		).toBe(false);
	});
});
