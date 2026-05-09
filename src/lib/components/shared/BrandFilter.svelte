<script lang="ts">
	import { SelectField } from '$lib/components/ui/select/index.js';

	type Props = {
		brands: { id: string; name: string }[];
		value: string;
		onValueChange: (id: string) => void;
		class?: string;
		/** Underlying value passed for each option. Defaults to id. Set to "name"
		 * for callers (e.g. /orders) that filter by brand name. */
		valueKey?: 'id' | 'name';
	};

	let { brands, value, onValueChange, class: className, valueKey = 'id' }: Props = $props();

	const items = $derived([
		{ value: '', label: 'All Brands' },
		...brands.map((b) => ({ value: valueKey === 'name' ? b.name : b.id, label: b.name }))
	]);
</script>

<SelectField class={className} {items} {value} placeholder="All Brands" {onValueChange} />
