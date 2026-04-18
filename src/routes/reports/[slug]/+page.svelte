<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { downloadCSV } from '$lib/utils/csv.js';

	let { data } = $props();
	const report = $derived(data.report as string);
	const title = $derived(data.title as string);
	const year = $derived(data.year as number);
	type ReportRow = {
		name: string;
		orders: number;
		revenue: number;
		status: string;
		show: string;
		orderAmount: number;
		brandCommission: number;
		repCommission: number;
		repOrgId?: string;
		repOrgName?: string;
		avgOrderValue?: number;
		lastOrderDate?: string | null;
		styleNumber?: string;
		productName?: string;
		unitsOrdered?: number;
		velocityScore?: number;
		trend?: 'up' | 'down' | 'flat';
		accounts?: number;
		[k: string]: unknown;
	};
	const rows = $derived(data.rows as ReportRow[]);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function changeYear(y: number) {
		goto(resolve(`/reports/${report}?year=${y}`), { replaceState: true });
	}

	function changeDaysBack(days: number) {
		goto(resolve(`/reports/${report}?days=${days}`), { replaceState: true });
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
			{#if report === 'product-performance'}
				<select
					class="h-9 rounded-lg border border-input bg-background px-3 text-sm"
					value={data.daysBack ?? 90}
					onchange={(e) => changeDaysBack(parseInt((e.target as HTMLSelectElement).value))}
				>
					{#each [14, 30, 90, 180] as d (d)}
						<option value={d}>{d} days</option>
					{/each}
				</select>
			{:else if report !== 'pipeline'}
				<select
					class="h-9 rounded-lg border border-input bg-background px-3 text-sm"
					value={year}
					onchange={(e) => changeYear(parseInt((e.target as HTMLSelectElement).value))}
				>
					{#each [2024, 2025, 2026, 2027] as y (y)}
						<option value={y}>{y}</option>
					{/each}
				</select>
			{/if}
			{#if rows.length > 0}
				<Button variant="outline" size="sm" onclick={exportReport}>Export CSV</Button>
			{/if}
		</div>
	</div>

	{#if rows.length === 0 && report !== 'sales-by-rep-agency' && report !== 'product-performance'}
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
					{#each rows as row (row.name)}
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
					{#each rows as row (row.name)}
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
					{#each rows as row, i (i)}
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
					{#each rows as row (row.status)}
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
					{#each rows as row (row.name)}
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
					{#each rows as row (row.show)}
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
	{:else if report === 'sales-by-rep-agency'}
		{#if rows.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
						/>
					</svg>
				</div>
				<p class="text-sm font-medium">No connected rep agencies yet</p>
				<p class="text-sm text-muted-foreground">
					Invite reps to carry your brand and their sales will appear here.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2.5 text-left text-sm font-medium">Rep Agency</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Avg Order Value</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Last Order</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each rows as row (row.repOrgId)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 text-sm font-medium">{row.repOrgName}</td>
								<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
								<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
								<td class="px-4 py-3 text-right font-mono text-sm text-muted-foreground"
									>{fmt.format(row.avgOrderValue ?? 0)}</td
								>
								<td class="px-4 py-3 text-sm"
									>{row.lastOrderDate ? formatDate(row.lastOrderDate) : '—'}</td
								>
								<td class="px-4 py-3 text-sm capitalize">{row.status}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-muted/40">
							<td class="px-4 py-2.5 text-sm font-medium">Total</td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + r.orders, 0)}</td
							>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + r.revenue, 0))}</td
							>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5"></td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	{:else if report === 'product-performance'}
		{#if rows.length === 0}
			<div class="flex flex-col items-center gap-3 py-16 text-center">
				<div
					class="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" />
					</svg>
				</div>
				<p class="text-sm font-medium">No products moving in this window</p>
				<p class="text-sm text-muted-foreground">
					Try a longer time window or wait for more orders.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2.5 text-left text-sm font-medium">Style #</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Product</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Units</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium"># Accounts</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Velocity</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Trend</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each rows as row (row.styleNumber)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 text-sm font-medium">{row.styleNumber}</td>
								<td class="px-4 py-3 text-sm">{row.productName}</td>
								<td class="px-4 py-3 text-right text-sm">{row.unitsOrdered}</td>
								<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
								<td class="px-4 py-3 text-right text-sm">{row.accounts}</td>
								<td class="px-4 py-3 text-right font-mono text-sm text-muted-foreground"
									>{row.velocityScore?.toFixed(1) ?? '0.0'}</td
								>
								<td class="px-4 py-3 text-sm">
									{#if row.trend === 'up'}
										<span class="inline-flex items-center gap-1 text-emerald-600">
											<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"
												><path d="M5 15l5-5 5 5H5z" /></svg
											>
											up
										</span>
									{:else if row.trend === 'down'}
										<span class="inline-flex items-center gap-1 text-destructive">
											<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"
												><path d="M5 5l5 5 5-5H5z" /></svg
											>
											down
										</span>
									{:else}
										<span class="inline-flex items-center gap-1 text-muted-foreground">
											<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"
												><path d="M4 10h12v2H4z" /></svg
											>
											flat
										</span>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-muted/40">
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5 text-sm font-medium">Total</td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.unitsOrdered ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + r.revenue, 0))}</td
							>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.accounts ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5"></td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	{/if}
</div>
