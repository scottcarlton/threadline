<script lang="ts">
	/**
	 * A report table drawn from column definitions rather than per-report
	 * markup, for the public share page (SCO-151). Same classes as the tables
	 * on /reports/[slug], so a shared report reads like the original.
	 */
	import type { ReportTable } from '$lib/utils/report-columns.js';

	let { table, rows }: { table: ReportTable; rows: Record<string, unknown>[] } = $props();

	const align = (a: 'left' | 'right') => (a === 'right' ? 'text-right' : 'text-left');
</script>

<div class="overflow-x-auto rounded-none border">
	<table class="w-full">
		<thead>
			<tr class="border-b bg-muted/40">
				{#each table.columns as col (col.label)}
					<th class="px-4 py-2.5 text-sm font-medium {align(col.align)}">{col.label}</th>
				{/each}
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each rows as row, i (i)}
				<tr>
					{#each table.columns as col, c (col.label)}
						<td
							class="px-4 py-3 text-sm {align(col.align)} {c === 0
								? 'font-medium'
								: ''} {col.align === 'right' ? 'font-mono' : ''}">{col.value(row)}</td
						>
					{/each}
				</tr>
			{/each}
		</tbody>
		{#if table.hasTotals}
			<tfoot>
				<tr class="bg-muted/40">
					{#each table.columns as col (col.label)}
						<td class="px-4 py-2.5 text-sm font-medium {align(col.align)}"
							>{col.total?.(rows) ?? ''}</td
						>
					{/each}
				</tr>
			</tfoot>
		{/if}
	</table>
</div>
