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
		Array.from({ length: yearRange.to - yearRange.from + 1 }, (_, i) => String(yearRange.from + i))
	);

	function parts(v: string): { mm: string; dd: string; yyyy: string } {
		return {
			yyyy: /^\d{4}-/.test(v) ? v.slice(0, 4) : '',
			mm: /^\d{4}-\d{2}-/.test(v) ? v.slice(5, 7) : '',
			dd: /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(8, 10) : ''
		};
	}

	// Local MM/DD/YYYY state. Derived-from-value would wipe partial picks
	// because we roundtrip through an empty parent value until all three
	// fields are filled. `lastSyncedValue` lets us distinguish our own
	// emits from a genuine external prop change.
	let mm = $state('');
	let dd = $state('');
	let yyyy = $state('');
	let lastSyncedValue = $state<string | null>(null);

	$effect(() => {
		if (value === lastSyncedValue) return;
		const p = parts(value);
		mm = p.mm;
		dd = p.dd;
		yyyy = p.yyyy;
		lastSyncedValue = value;
	});

	function emit() {
		if (mm && dd && yyyy) {
			const next = `${yyyy}-${mm}-${dd}`;
			lastSyncedValue = next;
			onchange(next);
		}
		// Deliberately no emit('') for partials — if we cleared the parent
		// here, the $effect above would wipe the user's in-progress pick on
		// the next render.
	}
</script>

<div class="flex gap-2">
	<select
		{id}
		class="h-9 cursor-pointer rounded-md border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
		value={mm}
		onchange={(e) => {
			mm = (e.target as HTMLSelectElement).value;
			emit();
		}}
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
		onchange={(e) => {
			dd = (e.target as HTMLSelectElement).value;
			emit();
		}}
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
		onchange={(e) => {
			yyyy = (e.target as HTMLSelectElement).value;
			emit();
		}}
		aria-label="Year"
	>
		<option value="" disabled>YYYY</option>
		{#each years as y (y)}
			<option value={y}>{y}</option>
		{/each}
	</select>
</div>
