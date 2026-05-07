<script lang="ts">
	import { getAttributesByCategory } from '$lib/data/product-attributes';

	type Props = {
		selected: string[];
		onchange: (selected: string[]) => void;
		disabled?: boolean;
	};

	let { selected, onchange, disabled = false }: Props = $props();

	const grouped = getAttributesByCategory();

	function toggle(value: string) {
		if (disabled) return;
		if (selected.includes(value)) {
			onchange(selected.filter((v) => v !== value));
		} else {
			onchange([...selected, value]);
		}
	}
</script>

<div class="flex flex-col gap-4">
	{#each Object.entries(grouped) as [category, attrs] (category)}
		<div>
			<p class="mb-2 text-sm font-medium text-muted-foreground">{category}</p>
			<div class="flex flex-wrap gap-1.5">
				{#each attrs as attr (attr.value)}
					<button
						type="button"
						class="border px-3 py-1.5 text-sm transition-colors {selected.includes(attr.value)
							? 'border-foreground bg-foreground text-background'
							: 'border-border bg-card text-foreground hover:border-foreground/50'}"
						{disabled}
						onclick={() => toggle(attr.value)}
					>
						{attr.label}
					</button>
				{/each}
			</div>
		</div>
	{/each}
</div>
