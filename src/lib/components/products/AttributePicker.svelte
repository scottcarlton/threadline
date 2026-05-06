<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import {
		PRODUCT_ATTRIBUTES,
		getAttributesByCategory,
		getAttributeLabel
	} from '$lib/data/product-attributes';

	type Props = {
		selected: string[];
		onchange: (selected: string[]) => void;
		disabled?: boolean;
	};

	let { selected, onchange, disabled = false }: Props = $props();

	const grouped = getAttributesByCategory();

	let customInput = $state('');

	function toggle(value: string) {
		if (disabled) return;
		if (selected.includes(value)) {
			onchange(selected.filter((v) => v !== value));
		} else {
			onchange([...selected, value]);
		}
	}

	function addCustom() {
		const trimmed = customInput.trim();
		if (!trimmed || disabled) return;
		const slug = trimmed
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_|_$/g, '');
		if (!slug || selected.includes(slug)) {
			customInput = '';
			return;
		}
		onchange([...selected, slug]);
		customInput = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addCustom();
		}
	}

	const knownValues = new Set(PRODUCT_ATTRIBUTES.map((a) => a.value));
	const customSelected = $derived(selected.filter((v) => !knownValues.has(v)));
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

	{#if customSelected.length > 0}
		<div>
			<p class="mb-2 text-sm font-medium text-muted-foreground">Custom</p>
			<div class="flex flex-wrap gap-1.5">
				{#each customSelected as value (value)}
					<button
						type="button"
						class="border border-foreground bg-foreground px-3 py-1.5 text-sm text-background transition-colors"
						{disabled}
						onclick={() => toggle(value)}
					>
						{getAttributeLabel(value)} ×
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="flex gap-2">
		<Input
			placeholder="Add custom attribute…"
			class="max-w-[240px]"
			bind:value={customInput}
			{disabled}
			onkeydown={handleKeydown}
		/>
		<button
			type="button"
			class="border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
			{disabled}
			onclick={addCustom}
		>
			Add
		</button>
	</div>
</div>
