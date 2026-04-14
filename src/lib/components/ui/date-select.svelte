<script lang="ts">
	type Props = {
		value: string;
		onchange: (value: string) => void;
		id?: string;
		yearRange?: { from: number; to: number };
	};
	let {
		value,
		onchange,
		id,
		yearRange = { from: new Date().getFullYear() - 1, to: new Date().getFullYear() + 3 }
	}: Props = $props();

	const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
	const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
	// $derived so changes to the yearRange prop propagate; a top-level const
	// would freeze at the initial prop value (state_referenced_locally).
	const years = $derived(
		Array.from({ length: yearRange.to - yearRange.from + 1 }, (_, i) =>
			String(yearRange.from + i)
		)
	);

	const yyyy = $derived(/^\d{4}-/.test(value) ? value.slice(0, 4) : '');
	const mm = $derived(/^\d{4}-\d{2}-/.test(value) ? value.slice(5, 7) : '');
	const dd = $derived(/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(8, 10) : '');

	function emit(newMm: string, newDd: string, newYyyy: string) {
		if (!newMm || !newDd || !newYyyy) {
			onchange('');
			return;
		}
		onchange(`${newYyyy}-${newMm}-${newDd}`);
	}
</script>

<div class="flex gap-2">
	<select
		{id}
		class="h-9 cursor-pointer rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
		value={mm}
		onchange={(e) => emit((e.target as HTMLSelectElement).value, dd, yyyy)}
		aria-label="Month"
	>
		<option value="" disabled>MM</option>
		{#each months as m (m)}
			<option value={m}>{m}</option>
		{/each}
	</select>
	<select
		class="h-9 cursor-pointer rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
		value={dd}
		onchange={(e) => emit(mm, (e.target as HTMLSelectElement).value, yyyy)}
		aria-label="Day"
	>
		<option value="" disabled>DD</option>
		{#each days as d (d)}
			<option value={d}>{d}</option>
		{/each}
	</select>
	<select
		class="h-9 cursor-pointer rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
		value={yyyy}
		onchange={(e) => emit(mm, dd, (e.target as HTMLSelectElement).value)}
		aria-label="Year"
	>
		<option value="" disabled>YYYY</option>
		{#each years as y (y)}
			<option value={y}>{y}</option>
		{/each}
	</select>
</div>
