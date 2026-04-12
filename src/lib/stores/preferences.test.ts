import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { preferences } from './preferences.js';

describe('preferences store', () => {
	beforeEach(() => {
		// Reset to defaults
		preferences.set({
			appearance: 'auto',
			animations: 'auto',
			chatFont: 'default',
			autoHideDock: false,
			voiceId: 'EXAVITQu4vr4xnSDxMaL'
		});
	});

	it('has correct defaults', () => {
		const prefs = get(preferences);

		expect(prefs.appearance).toBe('auto');
		expect(prefs.animations).toBe('auto');
		expect(prefs.chatFont).toBe('default');
		expect(prefs.autoHideDock).toBe(false);
	});

	it('setAppearance updates only appearance', () => {
		preferences.setAppearance('dark');
		const prefs = get(preferences);

		expect(prefs.appearance).toBe('dark');
		expect(prefs.animations).toBe('auto');
		expect(prefs.chatFont).toBe('default');
	});

	it('setAnimations updates only animations', () => {
		preferences.setAnimations('disabled');
		expect(get(preferences).animations).toBe('disabled');
	});

	it('setChatFont updates only chatFont', () => {
		preferences.setChatFont('sans');
		expect(get(preferences).chatFont).toBe('sans');
	});

	it('setAutoHideDock updates only autoHideDock', () => {
		preferences.setAutoHideDock(true);
		expect(get(preferences).autoHideDock).toBe(true);
	});

	it('multiple setters compose correctly', () => {
		preferences.setAppearance('dark');
		preferences.setChatFont('system');
		preferences.setAutoHideDock(true);

		const prefs = get(preferences);
		expect(prefs.appearance).toBe('dark');
		expect(prefs.chatFont).toBe('system');
		expect(prefs.autoHideDock).toBe(true);
		expect(prefs.animations).toBe('auto'); // unchanged
	});

	it('set replaces all preferences at once', () => {
		preferences.set({
			appearance: 'light',
			animations: 'enabled',
			chatFont: 'system',
			autoHideDock: true,
			voiceId: 'EXAVITQu4vr4xnSDxMaL'
		});

		const prefs = get(preferences);
		expect(prefs.appearance).toBe('light');
		expect(prefs.animations).toBe('enabled');
		expect(prefs.chatFont).toBe('system');
		expect(prefs.autoHideDock).toBe(true);
	});

	it('update merges partial changes', () => {
		preferences.update((p) => ({ ...p, appearance: 'dark' }));

		const prefs = get(preferences);
		expect(prefs.appearance).toBe('dark');
		expect(prefs.animations).toBe('auto'); // unchanged
	});
});
