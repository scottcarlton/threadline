export interface InstallEligibilityInputs {
	userId: string;
	isStandalone: boolean;
	installAvailable: boolean;
	isLgUp: boolean;
	isTabletPortrait: boolean;
	/**
	 * True for any iOS browser (Safari, Chrome iOS, Firefox iOS, Edge iOS).
	 * Apple WebKit blocks `beforeinstallprompt` across the board, so all iOS
	 * browsers fall back to the same Add-to-Home-Screen instructions modal.
	 * Only Safari produces a real standalone PWA — the others create a
	 * bookmark — but the install path looks the same to the user.
	 */
	isIosBrowser: boolean;
	dismissedUserIds: Set<string>;
}

export function shouldShowInstallPrompt(inputs: InstallEligibilityInputs): boolean {
	if (inputs.isStandalone) return false;
	if (inputs.dismissedUserIds.has(inputs.userId)) return false;
	if (!inputs.isLgUp && !inputs.isTabletPortrait) return false; // phones excluded
	if (!inputs.installAvailable && !inputs.isIosBrowser) return false;
	return true;
}

const STORAGE_KEY = 'threadline-install-dismissed-user-ids';

export function loadDismissedUserIds(): Set<string> {
	if (typeof localStorage === 'undefined') return new Set();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return new Set();
		const arr = JSON.parse(raw);
		return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : []);
	} catch {
		return new Set();
	}
}

export function persistDismissedUserId(userId: string): void {
	if (typeof localStorage === 'undefined') return;
	const set = loadDismissedUserIds();
	set.add(userId);
	localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

/**
 * True for any iOS browser (Safari, Chrome iOS, Firefox iOS, Edge iOS).
 * All iOS browsers share Apple's WebKit which blocks `beforeinstallprompt`
 * but supports Add-to-Home-Screen via the Share menu.
 */
export function detectIosBrowser(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	return (
		/iPad|iPhone|iPod/.test(ua) ||
		(ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document)
	);
}

/**
 * @deprecated kept for backwards-compat; prefer detectIosBrowser since
 * iOS Chrome/Firefox/Edge all need the same install path as iOS Safari.
 */
export function detectIosSafari(): boolean {
	return detectIosBrowser();
}
