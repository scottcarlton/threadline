<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';

	type Props = {
		sizeMode: 'letter' | 'numeric';
		sizes: string[];
		onSizeModeChange: (mode: 'letter' | 'numeric') => void;
		onSizesChange: (sizes: string[]) => void;
	};

	let { sizeMode, sizes, onSizeModeChange, onSizesChange }: Props = $props();

	const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	const NUMERIC_SIZES = ['0', '2', '4', '6', '8', '10', '12', '14'];

	const presets = $derived(sizeMode === 'letter' ? LETTER_SIZES : NUMERIC_SIZES);

	let customInput = $state('');

	function toggleSize(size: string) {
		if (sizes.includes(size)) {
			onSizesChange(sizes.filter((s) => s !== size));
		} else {
			onSizesChange([...sizes, size]);
		}
	}

	function addCustom() {
		const trimmed = customInput.trim();
		if (trimmed && !sizes.includes(trimmed)) {
			onSizesChange([...sizes, trimmed]);
		}
		customInput = '';
	}

	function handleCustomKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addCustom();
		}
	}

	const customSizes = $derived(
		sizes.filter((s) => !LETTER_SIZES.includes(s) && !NUMERIC_SIZES.includes(s))
	);
</script>

<div>
	<div class="mb-3 inline-flex border border-border">
		<button
			type="button"
			class="px-3.5 py-1.5 text-sm {sizeMode === 'letter'
				? 'bg-foreground text-background'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => onSizeModeChange('letter')}
		>
			Letter
		</button>
		<button
			type="button"
			class="px-3.5 py-1.5 text-sm {sizeMode === 'numeric'
				? 'bg-foreground text-background'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => onSizeModeChange('numeric')}
		>
			Numeric
		</button>
	</div>

	<div class="mb-3 flex flex-wrap gap-1.5">
		{#each presets as size (size)}
			<button
				type="button"
				class="min-w-[44px] border px-3 py-1.5 text-center text-sm font-medium transition-colors {sizes.includes(
					size
				)
					? 'border-foreground bg-foreground text-background'
					: 'border-border bg-card hover:border-foreground/40'}"
				onclick={() => toggleSize(size)}
			>
				{size}
			</button>
		{/each}

		{#each customSizes as size (size)}
			<button
				type="button"
				class="min-w-[44px] border px-3 py-1.5 text-center text-sm font-medium transition-colors {sizes.includes(
					size
				)
					? 'border-foreground bg-foreground text-background'
					: 'border-border bg-card hover:border-foreground/40'}"
				onclick={() => toggleSize(size)}
			>
				{size}
			</button>
		{/each}

		<div class="inline-flex items-center gap-1">
			<Input
				class="w-20 text-center text-sm"
				placeholder="Custom"
				bind:value={customInput}
				onkeydown={handleCustomKeydown}
			/>
		</div>
	</div>
</div>
