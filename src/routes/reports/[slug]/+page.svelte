<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { downloadCSV } from '$lib/utils/csv.js';

	let { data } = $props();
	const report = $derived(data.report as string);
	const title = $derived(data.title as string);
	const year = $derived(data.year as number);
	const rows = $derived(data.rows as any[]);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	function changeYear(y: number) {
		goto(`/reports/${report}?year=${y}`, { replaceState: true });
	}

	function exportReport() {
		if (!rows.length) return;
		downloadCSV(rows, `${report}-${year}.csv`);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/reports"
				><LongArrow direction="left" /> Reports</Button
			>
			<h1 class="text-3xl">{title}</h1>
		</div>
		<div class="flex items-center gap-2">
			{#if report !== 'pipeline'}
				<select
					class="h-9 rounded-lg border border-input bg-background px-3 text-sm"
					value={year}
					onchange={(e) => changeYear(parseInt((e.target as HTMLSelectElement).value))}
				>
					{#each [2024, 2025, 2026, 2027] as y}
						<option value={y}>{y}</option>
					{/each}
				</select>
			{/if}
			{#if rows.length > 0}
				<Button variant="outline" size="sm" onclick={exportReport}>Export CSV</Button>
			{/if}
		</div>
	</div>

	{#if rows.length === 0}
		<div class="rounded-none p-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="0.4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">No data yet</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Data will appear here once orders come in{report !== 'pipeline' ? ` for ${year}` : ''}
			</p>
		</div>
	{:else if report === 'sales-by-brand' || report === 'sales-by-account' || report === 'sales-by-rep'}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="px-4 py-2.5 text-left text-sm font-medium"
							>{report === 'sales-by-brand'
								? 'Brand'
								: report === 'sales-by-account'
									? 'Account'
									: 'Rep'}</th
						>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Avg Order</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 text-sm font-medium">{row.name}</td>
							<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
							<td class="px-4 py-3 text-right font-mono text-sm text-muted-foreground"
								>{fmt.format(row.orders > 0 ? row.revenue / row.orders : 0)}</td
							>
							<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="bg-muted/40">
						<td class="px-4 py-2.5 text-sm font-medium">Total</td>
						<td class="px-4 py-2.5 text-right text-sm font-medium"
							>{rows.reduce((s, r) => s + r.orders, 0)}</td
						>
						<td class="px-4 py-2.5"></td>
						<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
							>{fmt.format(rows.reduce((s, r) => s + r.revenue, 0))}</td
						>
					</tr>
				</tfoot>
			</table>
		</div>
	{:else if report === 'sales-by-territory'}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="px-4 py-2.5 text-left text-sm font-medium">Territory</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Accounts</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 text-sm font-medium">{row.name}</td>
							<td class="px-4 py-3 text-right text-sm">{row.accountCount}</td>
							<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
							<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if report === 'commission'}
		<div class="overflow-x-auto rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="px-4 py-2.5 text-left text-sm font-medium">Brand</th>
						<th class="px-4 py-2.5 text-left text-sm font-medium">Account</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Amount</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Brand %</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Brand Comm.</th>
						<th class="px-4 py-2.5 text-left text-sm font-medium">Rep</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Rep %</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Rep Comm.</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 text-sm">{row.brand}</td>
							<td class="px-4 py-3 text-sm">{row.account}</td>
							<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.orderAmount)}</td>
							<td class="px-4 py-3 text-right text-sm text-muted-foreground">{row.brandRate}%</td>
							<td class="px-4 py-3 text-right font-mono text-sm"
								>{fmt.format(row.brandCommission)}</td
							>
							<td class="px-4 py-3 text-sm">{row.rep}</td>
							<td class="px-4 py-3 text-right text-sm text-muted-foreground">{row.repRate}%</td>
							<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.repCommission)}</td
							>
						</tr>
					{/each}
				</tbody>
				<tfoot>
					<tr class="bg-muted/40">
						<td colspan="2" class="px-4 py-2.5 text-sm font-medium">Total</td>
						<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
							>{fmt.format(rows.reduce((s, r) => s + r.orderAmount, 0))}</td
						>
						<td class="px-4 py-2.5"></td>
						<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
							>{fmt.format(rows.reduce((s, r) => s + r.brandCommission, 0))}</td
						>
						<td class="px-4 py-2.5"></td>
						<td class="px-4 py-2.5"></td>
						<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
							>{fmt.format(rows.reduce((s, r) => s + r.repCommission, 0))}</td
						>
					</tr>
				</tfoot>
			</table>
		</div>
	{:else if report === 'pipeline'}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="px-4 py-2.5 text-left text-sm font-medium">Status</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Total Amount</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 text-sm font-medium capitalize">{row.status}</td>
							<td class="px-4 py-3 text-right text-sm">{row.count}</td>
							<td class="px-4 py-3 text-right font-mono text-sm"
								>{fmt.format(Number(row.total_amount))}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if report === 'season-comparison'}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="px-4 py-2.5 text-left text-sm font-medium">Season</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Avg Order</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 text-sm font-medium">{row.name}</td>
							<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
							<td class="px-4 py-3 text-right font-mono text-sm text-muted-foreground"
								>{fmt.format(row.orders > 0 ? row.revenue / row.orders : 0)}</td
							>
							<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else if report === 'show-performance'}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="px-4 py-2.5 text-left text-sm font-medium">Show</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Appts</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Visits</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">New Accts</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
						<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each rows as row}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3">
								<span class="text-sm font-medium">{row.show}</span>
								<p class="text-xs text-muted-foreground">{row.location || '—'}</p>
							</td>
							<td class="px-4 py-3 text-right text-sm">{row.appointments}</td>
							<td class="px-4 py-3 text-right text-sm">{row.visits}</td>
							<td class="px-4 py-3 text-right text-sm">{row.newAccounts}</td>
							<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
							<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
