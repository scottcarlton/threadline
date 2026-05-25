import { writable } from 'svelte/store';

export const selectedProductIds = writable<string[]>([]);
