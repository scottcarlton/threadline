import { readable, type Readable } from 'svelte/store';

function fromMediaQuery(query: string): Readable<boolean> {
	return readable(false, (set) => {
		if (typeof matchMedia !== 'function') {
			return;
		}
		const mql = matchMedia(query);
		set(mql.matches);
		const handler = (e: MediaQueryListEvent) => set(e.matches);
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
	});
}

export const isLgUp = fromMediaQuery('(min-width: 1024px)');
export const isTabletPortrait = fromMediaQuery('(min-width: 768px) and (max-width: 1023px)');
