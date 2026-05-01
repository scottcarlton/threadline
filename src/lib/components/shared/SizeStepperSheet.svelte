<script lang="ts">
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import ColorSwatch from './ColorSwatch.svelte';

	type Props = {
		open: boolean;
		onClose: () => void;
		styleNumber?: string | null;
		name?: string;
		brand?: string | null;
		season?: string | null;
		color?: string | null;
		imageUrl?: string | null;
		unitPrice?: number;
		sizes?: string[];
		qtys?: Record<string, number>;
		onChange: (size: string, qty: number) => void;
		onColorPickerOpen?: () => void;
	};

	const props: Props = $props();

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Snapshot static metadata + a reference to the live qtys map when `open`
	// transitions to true. During the close animation the parent may null its
	// item state, but we want the sheet to keep rendering its previous content
	// until the slide-out completes.
	type View = {
		styleNumber: string | null;
		name: string;
		brand: string | null;
		season: string | null;
		color: string | null;
		imageUrl: string | null;
		unitPrice: number;
		sizes: string[];
		qtys: Record<string, number>;
	};

	let view = $state<View | null>(null);

	$effect(() => {
		if (props.open && props.name) {
			view = {
				styleNumber: props.styleNumber ?? null,
				name: props.name,
				brand: props.brand ?? null,
				season: props.season ?? null,
				color: props.color ?? null,
				imageUrl: props.imageUrl ?? null,
				unitPrice: props.unitPrice ?? 0,
				sizes: props.sizes ?? [],
				qtys: props.qtys ?? {}
			};
		}
	});

	const totalUnits = $derived(
		view ? view.sizes.reduce((s, sz) => s + (view!.qtys[sz] ?? 0), 0) : 0
	);
	const totalAmount = $derived(view ? totalUnits * view.unitPrice : 0);

	function setQty(size: string, n: number) {
		props.onChange(size, Math.max(0, Number.isNaN(n) ? 0 : n));
	}

	function inc(size: string) {
		if (!view) return;
		setQty(size, (view.qtys[size] ?? 0) + 1);
	}

	function dec(size: string) {
		if (!view) return;
		setQty(size, (view.qtys[size] ?? 0) - 1);
	}
</script>

<OverlayPanel
	open={props.open}
	onclose={props.onClose}
	side="bottom"
	ariaLabel="Edit sizes for {view?.name ?? ''}"
>
	{#if view}
		{@const v = view}
		<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div class="flex shrink-0 items-start gap-3 px-4 pt-2 pb-4">
				{#if v.imageUrl}
					<img src={v.imageUrl} alt="" class="h-16 w-16 shrink-0 rounded-md border object-cover" />
				{:else}
					<div
						class="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground/50"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							class="h-6 w-6"
						>
							<rect x="3" y="3" width="18" height="18" rx="2" />
							<circle cx="8.5" cy="8.5" r="1.5" />
							<path d="M21 15l-5-5L5 21" />
						</svg>
					</div>
				{/if}
				<div class="min-w-0 flex-1">
					{#if v.styleNumber}
						<div class="font-mono text-sm text-muted-foreground/70">{v.styleNumber}</div>
					{/if}
					<div class="mt-0.5 truncate text-sm font-semibold">{v.name}</div>
					{#if v.brand || v.season}
						<div class="mt-0.5 truncate text-sm text-muted-foreground">
							{v.brand ?? ''}{v.brand && v.season ? ' · ' : ''}{v.season ?? ''}
						</div>
					{/if}
				</div>
				{#if props.onColorPickerOpen}
					<button
						type="button"
						class="shrink-0 self-start pt-1 transition active:scale-95"
						aria-label="Choose color"
						onclick={props.onColorPickerOpen}
					>
						<ColorSwatch color={v.color} size={20} />
					</button>
				{:else}
					<div class="shrink-0 self-start pt-1">
						<ColorSwatch color={v.color} size={20} />
					</div>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto px-4 pb-4">
				<div class="mx-auto flex w-full max-w-[300px] flex-col gap-3">
					{#each v.sizes as size (size)}
						{@const qty = v.qtys[size] ?? 0}
						<div class="flex items-center gap-4">
							<div class="w-8 shrink-0 text-sm font-medium">{size}</div>
							<div
								class="flex h-11 flex-1 items-center overflow-hidden rounded-lg border border-input bg-background focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground/20"
							>
								<button
									type="button"
									aria-label="Decrease {size}"
									disabled={qty === 0}
									onclick={() => dec(size)}
									class="flex h-full shrink-0 items-center justify-center px-6 text-base text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
								>
									−
								</button>
								<input
									type="text"
									inputmode="numeric"
									pattern="[0-9]*"
									aria-label="{size} quantity"
									value={qty}
									oninput={(e) => {
										const raw = (e.currentTarget as HTMLInputElement).value.replace(/[^0-9]/g, '');
										setQty(size, raw === '' ? 0 : parseInt(raw, 10));
									}}
									onkeydown={(e) => {
										if (e.key === 'ArrowUp') {
											e.preventDefault();
											inc(size);
										} else if (e.key === 'ArrowDown') {
											e.preventDefault();
											dec(size);
										} else if (e.key === 'Enter') {
											e.preventDefault();
											(e.currentTarget as HTMLInputElement).blur();
										}
									}}
									class="h-full w-full min-w-0 bg-transparent text-center font-mono text-base outline-none"
								/>
								<button
									type="button"
									aria-label="Increase {size}"
									onclick={() => inc(size)}
									class="flex h-full shrink-0 items-center justify-center px-6 text-base text-muted-foreground transition-colors hover:text-foreground"
								>
									+
								</button>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<div
				class="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
			>
				<div class="mb-3 flex items-center justify-between">
					<span class="text-sm text-muted-foreground">
						{totalUnits}
						{totalUnits === 1 ? 'unit' : 'units'} · {fmt.format(v.unitPrice)}/ea
					</span>
					<span class="font-mono text-base font-medium">{fmt.format(totalAmount)}</span>
				</div>
				<button
					type="button"
					onclick={props.onClose}
					class="flex h-12 w-full items-center justify-center bg-foreground text-sm font-medium text-background transition-colors hover:bg-foreground/90"
				>
					Done
				</button>
			</div>
		</div>
	{/if}
</OverlayPanel>
