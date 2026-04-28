<script lang="ts">
	import { Dialog, DialogContent, DialogTitle } from '$lib/components/ui/dialog/index.js';
	import AccountImportFlow from './AccountImportFlow.svelte';
	import type { AccountImportResult } from '$lib/schemas/account-import.js';

	type Props = {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		// Fires after a successful import POST. The parent typically calls
		// invalidateAll() and toasts the count.
		onImported: (result: AccountImportResult) => void;
	};

	let { open = $bindable(), onOpenChange, onImported }: Props = $props();

	function handleComplete(result: AccountImportResult) {
		onImported(result);
		onOpenChange(false);
	}
</script>

<Dialog bind:open {onOpenChange}>
	<DialogContent class="max-w-2xl p-6">
		<DialogTitle class="text-lg font-semibold">Import accounts</DialogTitle>
		<p class="mt-1 text-sm text-muted-foreground">
			Import your accounts by uploading a CSV file or paste a CSV
		</p>
		<div class="mt-5">
			<AccountImportFlow onComplete={handleComplete} />
		</div>
	</DialogContent>
</Dialog>
