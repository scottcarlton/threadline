<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { supabase } from '$lib/supabase.js';
	import { invalidateAll } from '$app/navigation';

	type Props = {
		open: boolean;
		productId: string;
		onOpenChange?: (open: boolean) => void;
	};

	let { open = $bindable(false), productId, onOpenChange }: Props = $props();

	let newColor = $state('');
	let newColorHex = $state('#000000');
	const commonSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
	const numberedSizes = ['0', '2', '4', '6', '8', '10', '12', '14'];
	let selectedSizes = $state<Set<string>>(new Set());
	let sizeMode = $state<'letter' | 'number'>('letter');
	let customSize = $state('');
	let saving = $state(false);

	function toggleSize(size: string) {
		const next = new Set(selectedSizes);
		if (next.has(size)) next.delete(size);
		else next.add(size);
		selectedSizes = next;
	}

	function addCustomSize() {
		if (customSize.trim() && !selectedSizes.has(customSize.trim())) {
			selectedSizes = new Set([...selectedSizes, customSize.trim()]);
			customSize = '';
		}
	}

	function reset() {
		newColor = '';
		newColorHex = '#000000';
		selectedSizes = new Set();
		customSize = '';
		saving = false;
	}

	async function submit() {
		if (!newColor.trim() && selectedSizes.size === 0) return;
		saving = true;

		const sizes = Array.from(selectedSizes);
		const rows: { product_id: string; color: string | null; size: string | null }[] = [];

		if (newColor.trim() && sizes.length > 0) {
			for (const size of sizes) {
				rows.push({ product_id: productId, color: newColor.trim(), size });
			}
		} else if (newColor.trim()) {
			rows.push({ product_id: productId, color: newColor.trim(), size: null });
		} else if (sizes.length > 0) {
			for (const size of sizes) {
				rows.push({ product_id: productId, color: null, size });
			}
		}

		if (rows.length > 0) {
			await supabase.from('product_variants').insert(rows);
		}

		reset();
		open = false;
		onOpenChange?.(false);
		invalidateAll();
	}

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) reset();
		open = isOpen;
		onOpenChange?.(isOpen);
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.DialogContent class="max-w-lg p-6">
		<Dialog.DialogTitle class="text-lg font-semibold">Add Variant</Dialog.DialogTitle>
		<Dialog.DialogDescription class="mt-1 text-sm text-muted-foreground">
			Add a new color and size run to this product.
		</Dialog.DialogDescription>

		<div class="mt-6 space-y-5">
			<div class="space-y-2">
				<p class="text-sm font-medium">Color or Print</p>
				<p class="text-sm text-muted-foreground">
					Solid colors, prints, or patterns (e.g. Navy, Leopard, Floral Stripe)
				</p>
				<div class="flex items-center gap-3">
					<input
						type="color"
						bind:value={newColorHex}
						class="h-9 w-9 shrink-0 cursor-pointer rounded border-0 p-0"
					/>
					<Input
						bind:value={newColor}
						placeholder="e.g. Navy, Leopard Print, Floral"
						class="flex-1"
					/>
				</div>
			</div>

			<div class="space-y-2">
				<p class="text-sm font-medium">Sizes</p>
				<div class="mb-2 flex w-fit gap-1 rounded-lg bg-muted p-1">
					<button
						class="rounded-md px-3 py-1 text-sm font-medium transition-colors {sizeMode === 'letter'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground'}"
						onclick={() => (sizeMode = 'letter')}
					>
						Letter
					</button>
					<button
						class="rounded-md px-3 py-1 text-sm font-medium transition-colors {sizeMode === 'number'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground'}"
						onclick={() => (sizeMode = 'number')}
					>
						Numeric
					</button>
				</div>
				<div class="flex flex-wrap gap-2">
					{#each sizeMode === 'letter' ? commonSizes : numberedSizes as size (size)}
						<button
							class="flex h-9 w-11 items-center justify-center rounded-lg border-2 text-sm font-medium transition-all {selectedSizes.has(
								size
							)
								? 'border-primary bg-primary/10 text-primary'
								: 'border-muted text-muted-foreground hover:border-foreground/20'}"
							onclick={() => toggleSize(size)}
						>
							{size}
						</button>
					{/each}
					<div class="flex items-center gap-1">
						<input
							type="text"
							bind:value={customSize}
							placeholder="Custom"
							class="h-9 w-20 rounded-lg border-2 border-dashed border-muted bg-background px-2 text-center text-sm focus:border-primary focus:outline-none"
							onkeydown={(e) => {
								if (e.key === 'Enter') addCustomSize();
							}}
						/>
						{#if customSize.trim()}
							<button class="text-sm text-primary" onclick={addCustomSize}>Add</button>
						{/if}
					</div>
				</div>
			</div>

			{#if newColor.trim() && selectedSizes.size > 0}
				<p class="text-sm text-muted-foreground">
					This will create <span class="font-medium text-foreground">{selectedSizes.size}</span>
					variant{selectedSizes.size > 1 ? 's' : ''} for {newColor.trim()}
				</p>
			{/if}
		</div>

		<div class="mt-6 flex justify-end gap-2">
			<Button variant="outline" onclick={() => handleOpenChange(false)}>Cancel</Button>
			<Button onclick={submit} disabled={saving || (!newColor.trim() && selectedSizes.size === 0)}>
				{saving ? 'Adding...' : 'Add Variants'}
			</Button>
		</div>
	</Dialog.DialogContent>
</Dialog.Root>
