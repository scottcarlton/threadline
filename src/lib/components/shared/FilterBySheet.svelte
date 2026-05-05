<script lang="ts">
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	type FilterOption = {
		value: string;
		label: string;
	};

	type Props = {
		open: boolean;
		onclose: () => void;
		title: string;
		options: FilterOption[];
		selected: string[];
		onApply: (selected: string[]) => void;
	};

	let { open, onclose, title, options, selected, onApply }: Props = $props();

	let localSelected = $state<string[]>([]);

	$effect(() => {
		if (open) {
			localSelected = [...selected];
		}
	});

	function toggle(value: string) {
		if (localSelected.includes(value)) {
			localSelected = localSelected.filter((v) => v !== value);
		} else {
			localSelected = [...localSelected, value];
		}
	}

	function handleApply() {
		onApply(localSelected);
		onclose();
	}
</script>

<OverlayPanel {open} side="bottom" ariaLabel={title} {onclose} maxHeight="60dvh">
	<div class="flex flex-col px-5 pb-5">
		<h3 class="mb-4 text-lg font-semibold">{title}</h3>

		<div class="space-y-1">
			{#each options as option (option.value)}
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-base transition-colors {localSelected.includes(
						option.value
					)
						? 'bg-muted font-medium'
						: 'hover:bg-muted/50'}"
					onclick={() => toggle(option.value)}
				>
					{option.label}
					{#if localSelected.includes(option.value)}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 text-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
					{/if}
				</button>
			{/each}
		</div>

		<Button class="mt-6 w-full" onclick={handleApply}>Apply</Button>
	</div>
</OverlayPanel>
