import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface BeforeInstallPromptEvent extends Event {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectStandalone(): boolean {
	if (!browser) return false;
	if (typeof matchMedia !== 'function') return false;
	if (matchMedia('(display-mode: standalone)').matches) return true;
	// iOS Safari pre-PWA standalone flag
	if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true;
	return false;
}

function createOnlineStore(): Writable<boolean> {
	// SSR initial value is `true` (optimistically online). On hydration, the client
	// re-reads navigator.onLine. An offline user sees a brief flash before the
	// OfflineBanner appears — acceptable for MVP since first-load offline is rare.
	const store = writable<boolean>(browser ? navigator.onLine : true);
	if (browser) {
		const setOnline = () => store.set(true);
		const setOffline = () => store.set(false);
		window.addEventListener('online', setOnline);
		window.addEventListener('offline', setOffline);
	}
	return store;
}

function createInstallPromptStore(): Writable<BeforeInstallPromptEvent | null> {
	const store = writable<BeforeInstallPromptEvent | null>(null);
	if (browser) {
		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			store.set(e as BeforeInstallPromptEvent);
		});
		window.addEventListener('appinstalled', () => {
			store.set(null);
		});
	}
	return store;
}

export const isOnline = createOnlineStore();
export const installPromptEvent = createInstallPromptStore();
export const isStandalone = writable<boolean>(detectStandalone());

export async function registerServiceWorker(): Promise<void> {
	if (!browser) return;
	if (!('serviceWorker' in navigator)) return;
	try {
		await navigator.serviceWorker.register('/service-worker.js', {
			type: 'module'
		});
	} catch (err) {
		console.error('Service worker registration failed:', err);
	}
}
