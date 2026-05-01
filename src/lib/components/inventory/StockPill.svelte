<script lang="ts">
	import type { StockStatus } from '$lib/inventory/status';

	type Props = {
		status: StockStatus | null;
		qty: number | null;
		/** When true, suppress the numeric qty (e.g., buyer shop) and show only the status word. */
		hideQty?: boolean;
	};

	let { status, qty, hideQty = false }: Props = $props();
</script>

{#if status !== null}
	{#if status === 'in'}
		<span
			class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400"
		>
			<span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
			{hideQty || qty === null ? 'In stock' : `${qty} in stock`}
		</span>
	{:else if status === 'low'}
		<span
			class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"
		>
			<span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
			{hideQty || qty === null ? 'Low stock' : `${qty} left`}
		</span>
	{:else}
		<span
			class="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
		>
			<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground/50"></span>
			Out of stock
		</span>
	{/if}
{/if}
