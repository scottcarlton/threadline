<script lang="ts">
	import { Dialog, DialogContent, DialogTitle } from '$lib/components/ui/dialog/index.js';
	import OrderImportFlow from './OrderImportFlow.svelte';
	import type { OrderImportResult } from '$lib/schemas/order-import.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onImported: (result: OrderImportResult) => void;
	};

	let { open = $bindable(), onOpenChange, onImported }: Props = $props();

	function handleComplete(result: OrderImportResult) {
		onImported(result);
		onOpenChange(false);
	}
</script>

<Dialog bind:open {onOpenChange}>
	<DialogContent class="max-w-2xl p-6">
		<DialogTitle class="text-lg font-semibold">Import orders</DialogTitle>
		<p class="mt-1 text-sm text-muted-foreground">
			Import your orders by uploading a CSV file or paste a CSV. One row per order line.
		</p>
		<div class="mt-5">
			<OrderImportFlow onComplete={handleComplete} />
		</div>
	</DialogContent>
</Dialog>
