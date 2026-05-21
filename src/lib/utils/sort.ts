const VALID_SORT_FIELDS = new Set(['business_name', 'created_at', 'state']);

export type SortField = 'business_name' | 'created_at' | 'state';

export interface SortOption {
	field: SortField;
	ascending: boolean;
}

const DEFAULT_SORT: SortOption = { field: 'created_at', ascending: false };

export function parseSort(raw: string | null): SortOption {
	if (!raw) return DEFAULT_SORT;
	const ascending = !raw.startsWith('-');
	const field = (ascending ? raw : raw.slice(1)) as SortField;
	if (!VALID_SORT_FIELDS.has(field)) return DEFAULT_SORT;
	return { field, ascending };
}

export function serializeSort(sort: SortOption): string {
	if (sort.field === DEFAULT_SORT.field && sort.ascending === DEFAULT_SORT.ascending) return '';
	return sort.ascending ? sort.field : `-${sort.field}`;
}

export function toggleSort(current: SortOption, field: SortField): SortOption {
	if (current.field === field) {
		return { field, ascending: !current.ascending };
	}
	return { field, ascending: field === 'created_at' ? false : true };
}
