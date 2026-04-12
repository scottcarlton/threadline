import { writable } from 'svelte/store';

export type EntityContext = {
	type: 'order' | 'account' | 'brand' | null;
	id: string | null;
	summary: string | null;
};

export const entityContext = writable<EntityContext>({ type: null, id: null, summary: null });
