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

/**
 * Ask the service worker to keep fresh copies of the offline-capable pages for
 * the signed-in user (SCO-209). Call while signed in and online: on load, when
 * the org changes (the pages carry org data), when a new worker takes over (its
 * page cache starts empty), and on reconnect.
 */
export async function requestOfflinePages(): Promise<void> {
	if (!browser || !('serviceWorker' in navigator) || !navigator.onLine) return;
	try {
		const reg = await navigator.serviceWorker.ready;
		reg.active?.postMessage({ type: 'cache-offline-pages' });
	} catch (err) {
		console.error('Requesting offline pages failed:', err);
	}
}

/**
 * Ask the service worker to fetch product images ahead so the order wizard has
 * pictures offline (SCO-208). Best effort, online only.
 */
export async function warmProductImages(urls: string[]): Promise<void> {
	if (!browser || urls.length === 0 || !('serviceWorker' in navigator) || !navigator.onLine) return;
	try {
		const reg = await navigator.serviceWorker.ready;
		reg.active?.postMessage({ type: 'warm-product-images', urls });
	} catch (err) {
		console.error('Warming product images failed:', err);
	}
}
