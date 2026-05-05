<script lang="ts">
	import type { Snippet } from 'svelte';
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type Props = {
		open: boolean;
		onclose: () => void;
		onApply: () => void;
		onClear: () => void;
		activeCount?: number;
		title?: string;
		children: Snippet;
	};

	let {
		open,
		onclose,
		onApply,
		onClear,
		activeCount = 0,
		title = 'Filters',
		children
	}: Props = $props();

	function handleApply() {
		onApply();
		onclose();
	}

	function handleClear() {
		onClear();
	}
</script>

<OverlayPanel
	{open}
	side="bottom"
	ariaLabel={title}
	{onclose}
	maxHeight="100dvh"
	showDragHandle={false}
>
	<div class="flex max-h-[100dvh] flex-col">
		<!-- Header -->
		<div class="flex shrink-0 items-center justify-between px-5 py-4">
			<h2 class="text-lg font-semibold">{title}</h2>
			<button
				onclick={onclose}
				class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				aria-label="Close filters"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Scrollable content -->
		<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
			{@render children()}
		</div>

		<!-- Sticky footer — visible when filters are active -->
		{#if activeCount > 0}
			<div class="flex shrink-0 items-center gap-3 px-5 py-4">
				<Button variant="outline" class="flex-1" onclick={handleClear}>
					Clear ({activeCount})
				</Button>
				<Button class="flex-1" onclick={handleApply}>Apply</Button>
			</div>
		{/if}
	</div>
</OverlayPanel>
