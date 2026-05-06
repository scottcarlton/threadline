<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import ImagePair from './ImagePair.svelte';
	import { supabase } from '$lib/supabase.js';
	import { invalidateAll } from '$app/navigation';

	type Props = {
		open: boolean;
		productId: string;
		existingSizes: string[];
		onOpenChange?: (open: boolean) => void;
	};

	let { open = $bindable(false), productId, existingSizes, onOpenChange }: Props = $props();

	let colorName = $state('');
	let colorHex = $state('#000000');
	let primaryImage = $state<File | null>(null);
	let hoverImage = $state<File | null>(null);
	let saving = $state(false);

	function reset() {
		colorName = '';
		colorHex = '#000000';
		primaryImage = null;
		hoverImage = null;
		saving = false;
	}

	async function uploadImage(file: File, variantId: string | null, role: 'primary' | 'hover') {
		const body = new FormData();
		body.append('file', file);
		if (variantId) body.append('variant_id', variantId);
		body.append('role', role);
		await fetch(`/api/products/${productId}/images`, { method: 'POST', body });
	}

	async function submit() {
		if (!colorName.trim()) return;
		saving = true;

		const rows: {
			product_id: string;
			color: string;
			color_hex: string | null;
			size: string | null;
		}[] = [];

		if (existingSizes.length > 0) {
			for (const size of existingSizes) {
				rows.push({
					product_id: productId,
					color: colorName.trim(),
					color_hex: colorHex !== '#000000' ? colorHex : null,
					size
				});
			}
		} else {
			rows.push({
				product_id: productId,
				color: colorName.trim(),
				color_hex: colorHex !== '#000000' ? colorHex : null,
				size: null
			});
		}

		const { data: inserted } = await supabase.from('product_variants').insert(rows).select('id');

		const firstVariantId = inserted?.[0]?.id ?? null;

		if (primaryImage) await uploadImage(primaryImage, firstVariantId, 'primary');
		if (hoverImage) await uploadImage(hoverImage, firstVariantId, 'hover');

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
		<Dialog.DialogTitle class="text-lg font-semibold">Add Color</Dialog.DialogTitle>
		<Dialog.DialogDescription class="mt-1 text-sm text-muted-foreground">
			Add a new color or print to this product.{existingSizes.length > 0
				? ` Variants will be created for ${existingSizes.length} existing size${existingSizes.length > 1 ? 's' : ''}.`
				: ''}
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
						bind:value={colorHex}
						class="h-9 w-9 shrink-0 cursor-pointer rounded border-0 p-0"
					/>
					<Input
						bind:value={colorName}
						placeholder="e.g. Navy, Leopard Print, Floral"
						class="flex-1"
					/>
				</div>
			</div>

			<div class="space-y-2">
				<p class="text-sm font-medium">Images</p>
				<ImagePair
					primaryFile={primaryImage}
					hoverFile={hoverImage}
					onPrimaryChange={(f) => (primaryImage = f)}
					onHoverChange={(f) => (hoverImage = f)}
				/>
			</div>
		</div>

		<div class="mt-6 flex justify-end gap-2">
			<Button variant="outline" onclick={() => handleOpenChange(false)}>Cancel</Button>
			<Button onclick={submit} disabled={saving || !colorName.trim()}>
				{saving ? 'Adding...' : 'Add Color'}
			</Button>
		</div>
	</Dialog.DialogContent>
</Dialog.Root>
