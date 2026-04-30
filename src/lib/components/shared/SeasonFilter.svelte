<script lang="ts">
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { dedupeSeasonsByName, type SeasonLike } from '$lib/utils/seasons.js';

	type Props = {
		seasons: SeasonLike[];
		value: string;
		onValueChange: (name: string) => void;
		class?: string;
	};

	let { seasons, value, onValueChange, class: className }: Props = $props();

	const items = $derived([
		{ value: '', label: 'All Seasons' },
		...dedupeSeasonsByName(seasons).map((s) => ({ value: s.name, label: s.name }))
	]);
</script>

<SelectField class={className} {items} {value} placeholder="All Seasons" {onValueChange} />
