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
		imageUrl?: string | null;
		colors?: string[];
		selected?: string | null;
		disabledColors?: string[];
		onSelect: (color: string) => void;
	};

	const props: Props = $props();

	type View = {
		styleNumber: string | null;
		name: string;
		brand: string | null;
		season: string | null;
		imageUrl: string | null;
		colors: string[];
		selected: string | null;
		disabledColors: string[];
	};

	let view = $state<View | null>(null);

	$effect(() => {
		if (props.open && props.name) {
			view = {
				styleNumber: props.styleNumber ?? null,
				name: props.name,
				brand: props.brand ?? null,
				season: props.season ?? null,
				imageUrl: props.imageUrl ?? null,
				colors: props.colors ?? [],
				selected: props.selected ?? null,
				disabledColors: props.disabledColors ?? []
			};
		}
	});

	function pick(color: string) {
		props.onSelect(color);
		props.onClose();
	}
</script>

<OverlayPanel
	open={props.open}
	onclose={props.onClose}
	side="bottom"
	ariaLabel="Choose color for {view?.name ?? ''}"
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
			</div>

			<div class="flex-1 overflow-y-auto px-4 pb-6">
				{#if v.colors.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">No colors available.</p>
				{:else}
					<div class="flex flex-wrap items-center justify-center gap-5 py-4">
						{#each v.colors as color (color)}
							{@const isSelected = v.selected === color}
							{@const isDisabled = v.disabledColors.includes(color) && !isSelected}
							<button
								type="button"
								aria-label={color}
								aria-pressed={isSelected}
								disabled={isDisabled}
								onclick={() => pick(color)}
								class="group flex flex-col items-center gap-1.5 transition active:scale-95 disabled:pointer-events-none disabled:opacity-30"
							>
								<span
									class="flex h-12 w-12 items-center justify-center rounded-full ring-offset-2 transition {isSelected
										? 'ring-2 ring-foreground ring-offset-background'
										: 'ring-0'}"
								>
									<ColorSwatch {color} size={44} />
								</span>
								<span
									class="max-w-[80px] truncate text-sm {isSelected
										? 'font-medium text-foreground'
										: 'text-muted-foreground'}"
								>
									{color}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div
				class="shrink-0 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
			>
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
