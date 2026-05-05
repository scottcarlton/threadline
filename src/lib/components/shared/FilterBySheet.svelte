<script lang="ts">
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
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

	function toggle(value: string, checked: boolean) {
		if (checked) {
			localSelected = [...localSelected, value];
		} else {
			localSelected = localSelected.filter((v) => v !== value);
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

		<div class="space-y-3">
			{#each options as option (option.value)}
				<label class="flex items-center gap-3">
					<Checkbox
						checked={localSelected.includes(option.value)}
						onCheckedChange={(v) => toggle(option.value, v === true)}
					/>
					<span class="text-sm">{option.label}</span>
				</label>
			{/each}
		</div>

		<Button class="mt-6 w-full" onclick={handleApply}>Apply</Button>
	</div>
</OverlayPanel>
