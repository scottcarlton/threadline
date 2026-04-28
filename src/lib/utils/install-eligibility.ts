export interface InstallEligibilityInputs {
	userId: string;
	isStandalone: boolean;
	installAvailable: boolean;
	isLgUp: boolean;
	isTabletPortrait: boolean;
	isIosSafari: boolean;
	dismissedUserIds: Set<string>;
}

export function shouldShowInstallPrompt(inputs: InstallEligibilityInputs): boolean {
	if (inputs.isStandalone) return false;
	if (inputs.dismissedUserIds.has(inputs.userId)) return false;
	if (!inputs.isLgUp && !inputs.isTabletPortrait) return false; // phones excluded
	if (!inputs.installAvailable && !inputs.isIosSafari) return false;
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

export function detectIosSafari(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	const isIos =
		/iPad|iPhone|iPod/.test(ua) ||
		(ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document);
	const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
	return isIos && isSafari;
}
