<script lang="ts">
	import { Dialog, DialogContent, DialogTitle } from '$lib/components/ui/dialog/index.js';
	import ProductImportFlow from './ProductImportFlow.svelte';
	import type { Season } from './product-import-helpers.js';

	// Modal wrapping <ProductImportFlow> for /products and
	// /brands/[id]/products. Onboarding uses the flow component directly
	// (it's a step in a wizard, not a popup).
	type Props = {
		open: boolean;
		brandId: string;
		seasons: Season[];
		onOpenChange: (open: boolean) => void;
		// Fires after the user confirms a successful import — the parent
		// typically calls invalidateAll() or refetches the product list.
		onImported: () => void;
	};

	let { open = $bindable(), brandId, seasons, onOpenChange, onImported }: Props = $props();

	function handleComplete() {
		onImported();
		onOpenChange(false);
	}
</script>

<Dialog bind:open {onOpenChange}>
	<DialogContent class="max-w-2xl p-6">
		<DialogTitle class="text-lg font-semibold">Import products</DialogTitle>
		<p class="mt-1 text-sm text-muted-foreground">
			Import your products by uploading a PDF or CSV file or paste a CSV
		</p>
		<div class="mt-5">
			<ProductImportFlow
				brand={brandId}
				{seasons}
				commitLabel="Save Items"
				commitPendingLabel="Saving…"
				onComplete={handleComplete}
			/>
		</div>
	</DialogContent>
</Dialog>
