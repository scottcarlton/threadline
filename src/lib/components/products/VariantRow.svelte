<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ImagePair from './ImagePair.svelte';
	import InventoryMatrix from './InventoryMatrix.svelte';

	export type VariantData = {
		id: string;
		colorName: string;
		colorHex: string;
		isPrimary: boolean;
		images: {
			primary: File | null;
			hover: File | null;
		};
		inventory: Record<string, number | null>;
		stockThreshold: number | null;
	};

	type Props = {
		variant: VariantData;
		expanded: boolean;
		sizes: string[];
		styleNumber: string;
		ats: boolean;
		onToggle: () => void;
		onChange: (variant: VariantData) => void;
		onSetPrimary: () => void;
		onRemove: () => void;
	};

	let {
		variant,
		expanded,
		sizes,
		styleNumber,
		ats,
		onToggle,
		onChange,
		onSetPrimary,
		onRemove
	}: Props = $props();

	function colorSlug(name: string): string {
		return name
			.trim()
			.toUpperCase()
			.replace(/[^A-Z0-9]/g, '')
			.slice(0, 6);
	}

	const imageCount = $derived((variant.images.primary ? 1 : 0) + (variant.images.hover ? 1 : 0));
	const metaText = $derived(
		variant.colorName ? `${imageCount} / 2 images · ${sizes.length} sizes` : 'Incomplete'
	);
	const isIncomplete = $derived(!variant.colorName);

	let colorInput: HTMLInputElement | undefined = $state();

	$effect(() => {
		if (expanded && colorInput) {
			colorInput.focus();
		}
	});
</script>

<div class="border transition-colors {expanded ? 'border-foreground' : 'border-border'} bg-card">
	<!-- Collapsed header -->
	<button type="button" class="flex w-full items-center gap-3 px-3.5 py-2.5" onclick={onToggle}>
		<span
			class="h-5.5 w-5.5 shrink-0 rounded-full border border-border/60"
			style:background={variant.colorHex || '#d4d4d8'}
		></span>
		<span class="flex-1 text-left text-sm font-medium">
			{variant.colorName || 'New color'}
		</span>
		<span
			class="font-mono text-sm {isIncomplete
				? 'text-amber-600 dark:text-amber-400'
				: 'text-muted-foreground'}"
		>
			{metaText}
		</span>
		<span class="text-sm text-muted-foreground transition-transform {expanded ? 'rotate-90' : ''}">
			›
		</span>
	</button>

	<!-- Expanded body -->
	{#if expanded}
		<div class="border-t border-border px-3.5 pt-3.5 pb-4">
			<div class="grid grid-cols-2 gap-3">
				<div>
					<label class="mb-1.5 block text-sm font-medium">Color name</label>
					<input
						bind:this={colorInput}
						type="text"
						class="w-full border border-border bg-background px-2.5 py-2 text-sm"
						placeholder="e.g. Camel"
						value={variant.colorName}
						oninput={(e) =>
							onChange({ ...variant, colorName: (e.target as HTMLInputElement).value })}
					/>
				</div>
				<div>
					<label class="mb-1.5 block text-sm font-medium">
						Hex <span class="text-sm font-normal text-muted-foreground">(optional)</span>
					</label>
					<div class="flex border border-border bg-card">
						<input
							type="color"
							class="h-9 w-9 shrink-0 cursor-pointer border-r border-border"
							value={variant.colorHex || '#d4d4d8'}
							oninput={(e) =>
								onChange({
									...variant,
									colorHex: (e.target as HTMLInputElement).value
								})}
						/>
						<input
							type="text"
							class="min-w-0 flex-1 bg-transparent px-2.5 py-2 font-mono text-sm uppercase"
							placeholder="#000000"
							value={variant.colorHex || ''}
							oninput={(e) =>
								onChange({
									...variant,
									colorHex: (e.target as HTMLInputElement).value
								})}
						/>
					</div>
				</div>
			</div>

			<div class="mt-4">
				<label class="mb-1.5 block text-sm font-medium">
					Images <span class="text-sm font-normal text-muted-foreground">(optional)</span>
				</label>
				<ImagePair
					primaryFile={variant.images.primary}
					hoverFile={variant.images.hover}
					onPrimaryChange={(f) =>
						onChange({ ...variant, images: { ...variant.images, primary: f } })}
					onHoverChange={(f) => onChange({ ...variant, images: { ...variant.images, hover: f } })}
				/>
			</div>

			{#if ats}
				<div class="mt-4">
					<label class="mb-1.5 block text-sm font-medium">Inventory</label>
					<InventoryMatrix
						{sizes}
						skuPrefix={styleNumber}
						colorSlug={colorSlug(variant.colorName)}
						inventory={variant.inventory}
						stockThreshold={variant.stockThreshold}
						onInventoryChange={(inv) => onChange({ ...variant, inventory: inv })}
						onThresholdChange={(t) => onChange({ ...variant, stockThreshold: t })}
					/>
				</div>
			{/if}

			<div class="mt-3 flex items-center justify-between">
				<label class="flex items-center gap-2">
					<Checkbox checked={variant.isPrimary} onCheckedChange={() => onSetPrimary()} />
					<span class="text-sm">Use as primary color · shown on the catalog grid</span>
				</label>
				<Button
					variant="ghost"
					size="sm"
					class="text-destructive hover:text-destructive"
					onclick={onRemove}
				>
					Remove color
				</Button>
			</div>
		</div>
	{/if}
</div>
