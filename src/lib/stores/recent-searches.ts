const STORAGE_PREFIX = 'threadline:recent-search:';
const MAX_ITEMS = 10;

export type SearchContext = 'accounts' | 'products' | 'catalog';

function storageKey(context: SearchContext): string {
	return `${STORAGE_PREFIX}${context}`;
}

function readFromStorage(context: SearchContext): string[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = localStorage.getItem(storageKey(context));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((v): v is string => typeof v === 'string');
	} catch {
		return [];
	}
}

function writeToStorage(context: SearchContext, items: string[]): void {
	if (typeof window === 'undefined') return;
	try {
		localStorage.setItem(storageKey(context), JSON.stringify(items));
	} catch {
		// quota exceeded — silently drop
	}
}

export function getRecent(context: SearchContext): string[] {
	return readFromStorage(context);
}

export function addRecent(context: SearchContext, term: string): string[] {
	const trimmed = term.trim();
	if (!trimmed) return getRecent(context);

	const items = readFromStorage(context).filter((t) => t !== trimmed);
	items.unshift(trimmed);
	const capped = items.slice(0, MAX_ITEMS);
	writeToStorage(context, capped);
	return capped;
}

export function removeRecent(context: SearchContext, term: string): string[] {
	const items = readFromStorage(context).filter((t) => t !== term);
	writeToStorage(context, items);
	return items;
}

export function clearRecent(context: SearchContext): void {
	writeToStorage(context, []);
}
