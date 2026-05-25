<script lang="ts">
	import { SelectField } from '$lib/components/ui/select/index.js';

	type Props = {
		categories: string[];
		value: string;
		onValueChange: (category: string) => void;
		class?: string;
	};

	let { categories, value, onValueChange, class: className }: Props = $props();

	const items = $derived([
		{ value: '', label: 'All Categories' },
		...categories.map((c) => ({ value: c, label: c }))
	]);
</script>

<SelectField class={className} {items} {value} placeholder="All Categories" {onValueChange} />
