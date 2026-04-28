import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Appearance = 'light' | 'auto' | 'dark';
export type Animations = 'enabled' | 'auto' | 'disabled';
export type ChatFont = 'default' | 'sans' | 'system';

export interface Preferences {
	appearance: Appearance;
	animations: Animations;
	chatFont: ChatFont;
	autoHideDock: boolean;
	voiceId: string;
	sidebarOpen?: boolean;
}

const STORAGE_KEY = 'threadline-preferences';

const defaults: Preferences = {
	appearance: 'auto',
	animations: 'auto',
	chatFont: 'default',
	autoHideDock: false,
	voiceId: 'EXAVITQu4vr4xnSDxMaL',
	sidebarOpen: undefined
};

function loadFromStorage(): Preferences {
	if (!browser) return defaults;
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return { ...defaults, ...JSON.parse(raw) };
	} catch {
		// ignore
	}
	return defaults;
}

function createPreferences() {
	const store = writable<Preferences>(loadFromStorage());

	store.subscribe((value) => {
		if (browser) {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		}
	});

	return {
		subscribe: store.subscribe,
		set: store.set,
		update: store.update,
		setAppearance(v: Appearance) {
			store.update((p) => ({ ...p, appearance: v }));
		},
		setAnimations(v: Animations) {
			store.update((p) => ({ ...p, animations: v }));
		},
		setChatFont(v: ChatFont) {
			store.update((p) => ({ ...p, chatFont: v }));
		},
		setAutoHideDock(v: boolean) {
			store.update((p) => ({ ...p, autoHideDock: v }));
		},
		setVoiceId(v: string) {
			store.update((p) => ({ ...p, voiceId: v }));
		},
		setSidebarOpen(v: boolean) {
			store.update((p) => ({ ...p, sidebarOpen: v }));
		}
	};
}

export const preferences = createPreferences();
