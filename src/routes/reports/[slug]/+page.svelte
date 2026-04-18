<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { downloadCSV } from '$lib/utils/csv.js';

	let { data } = $props();
	const report = $derived(data.report as string);
	const year = $derived(data.year as number);
	const variant = $derived((data as { variant?: string }).variant);
	const hasCustomEmptyState = $derived(
		report === 'product-performance' ||
			(variant === 'brand' &&
				(report === 'sales-by-rep' ||
					report === 'territory-coverage' ||
					report === 'account-penetration' ||
					report === 'season-sell-through'))
	);
	type ReportRow = {
		name: string;
		orders: number;
		revenue: number;
		status: string;
		show: string;
		orderAmount: number;
		brandCommission: number;
		repCommission: number;
		repUserId?: string;
		repName?: string;
		agencyOrgId?: string;
		agencyName?: string;
		source?: 'in_house' | 'agency';
		avgOrderValue?: number;
		lastOrderDate?: string | null;
		styleNumber?: string;
		productName?: string;
		unitsOrdered?: number;
		velocityScore?: number;
		trend?: 'up' | 'down' | 'flat';
		accounts?: number;
		territoryId?: string | null;
		territoryName?: string;
		accountId?: string;
		businessName?: string;
		currentOrders?: number;
		currentRevenue?: number;
		priorRevenue?: number;
		hasAccess?: boolean;
		seasonId?: string;
		seasonName?: string;
		productsInSeason?: number;
		productsOrdered?: number;
		sellThroughPct?: number;
		totalUnits?: number;
		totalRevenue?: number;
		isActive?: boolean;
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

	function changeYear(y: string) {
		goto(resolve(`/reports/${report}?year=${y}`), { replaceState: true });
	}

	function changeDaysBack(days: string) {
		goto(resolve(`/reports/${report}?days=${days}`), { replaceState: true });
	}

	function exportReport() {
		if (!rows.length) return;
		downloadCSV(rows, `${report}-${year}.csv`);
	}

	const yearItems = [
		{ value: '2024', label: '2024' },
		{ value: '2025', label: '2025' },
		{ value: '2026', label: '2026' },
		{ value: '2027', label: '2027' }
	];

	const daysItems = [
		{ value: '14', label: '14 days' },
		{ value: '30', label: '30 days' },
		{ value: '90', label: '90 days' },
		{ value: '180', label: '180 days' }
	];

	let selectedYear = $derived(String(year));
	let selectedDays = $derived(String(data.daysBack ?? 90));
</script>

<div class="space-y-6">
	<!-- Toolbar -->
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="sm" href="/reports"><LongArrow direction="left" /> Reports</Button
		>
		<div class="flex items-center gap-2">
			{#if report === 'product-performance'}
				<SelectField items={daysItems} bind:value={selectedDays} onValueChange={changeDaysBack} />
			{:else if report !== 'pipeline'}
				<SelectField items={yearItems} bind:value={selectedYear} onValueChange={changeYear} />
			{/if}
			{#if rows.length > 0}
				<Button variant="outline" size="sm" onclick={exportReport}>Export CSV</Button>
			{/if}
		</div>
	</div>

	{#if rows.length === 0 && !hasCustomEmptyState}
		<div class="flex flex-col items-center justify-center py-16">
			<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-7 w-7 text-muted-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
					/>
				</svg>
			</div>
			<h3 class="mt-4 text-base font-semibold">No data yet</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Data will appear here once orders come in{report !== 'pipeline' ? ` for ${year}` : ''}
			</p>
		</div>
	{:else if report === 'sales-by-brand' || report === 'sales-by-account' || (report === 'sales-by-rep' && variant !== 'brand')}
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
								<p class="text-sm text-muted-foreground">{row.location || '—'}</p>
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
	{:else if report === 'sales-by-rep' && variant === 'brand'}
		{#if rows.length === 0}
			<div class="flex flex-col items-center justify-center py-16">
				<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-7 w-7 text-muted-foreground"
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
				<h3 class="mt-4 text-base font-semibold">No rep sales yet</h3>
				<p class="mt-1 text-sm text-muted-foreground">
					Sales from in-house reps and connected rep agencies will appear here.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2.5 text-left text-sm font-medium">Rep</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Agency</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Avg Order Value</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Last Order</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each rows as row (row.repUserId)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 text-sm font-medium">{row.repName}</td>
								<td class="px-4 py-3 text-sm">
									<div class="flex items-center gap-2">
										<span>{row.agencyName}</span>
										{#if row.source === 'in_house'}
											<span
												class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
												>In-house</span
											>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
								<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
								<td class="px-4 py-3 text-right font-mono text-sm text-muted-foreground"
									>{fmt.format(row.avgOrderValue ?? 0)}</td
								>
								<td class="px-4 py-3 text-sm"
									>{row.lastOrderDate ? formatDate(row.lastOrderDate) : '—'}</td
								>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-muted/40">
							<td colspan="2" class="px-4 py-2.5 text-sm font-medium">Total</td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + r.orders, 0)}</td
							>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + r.revenue, 0))}</td
							>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5"></td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	{:else if report === 'product-performance'}
		{#if rows.length === 0}
			<div class="flex flex-col items-center justify-center py-16">
				<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-7 w-7 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h7" />
					</svg>
				</div>
				<h3 class="mt-4 text-base font-semibold">No products moving in this window</h3>
				<p class="mt-1 text-sm text-muted-foreground">
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
	{:else if report === 'territory-coverage' && variant === 'brand'}
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
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				</div>
				<p class="text-sm font-medium">No territory activity yet</p>
				<p class="text-sm text-muted-foreground">
					Orders placed by in-house reps or connected agencies will show up grouped by territory.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2.5 text-left text-sm font-medium">Agency</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Territory</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Accounts</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each rows as row, i (`${row.agencyOrgId}-${row.territoryId ?? 'none'}-${i}`)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 text-sm">
									<div class="flex items-center gap-2">
										<span class="font-medium">{row.agencyName}</span>
										{#if row.source === 'in_house'}
											<span
												class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
												>In-house</span
											>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-sm">{row.territoryName}</td>
								<td class="px-4 py-3 text-right text-sm">{row.accounts}</td>
								<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
								<td class="px-4 py-3 text-right font-mono text-sm">{fmt.format(row.revenue)}</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-muted/40">
							<td colspan="2" class="px-4 py-2.5 text-sm font-medium">Total</td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.accounts ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + r.orders, 0)}</td
							>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + r.revenue, 0))}</td
							>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	{:else if report === 'account-penetration' && variant === 'brand'}
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
							d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
						/>
					</svg>
				</div>
				<p class="text-sm font-medium">No accounts yet</p>
				<p class="text-sm text-muted-foreground">
					Accounts approved to carry your brand will show up here along with their order activity.
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2.5 text-left text-sm font-medium">Account</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Agency</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Prior Year</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Trend</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Last Order</th>
							<th class="px-4 py-2.5 text-left text-sm font-medium">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each rows as row (row.accountId)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 text-sm font-medium">{row.businessName}</td>
								<td class="px-4 py-3 text-sm">
									<div class="flex items-center gap-2">
										<span>{row.agencyName}</span>
										{#if row.source === 'in_house'}
											<span
												class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
												>In-house</span
											>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-right text-sm">{row.currentOrders ?? 0}</td>
								<td class="px-4 py-3 text-right font-mono text-sm"
									>{fmt.format(row.currentRevenue ?? 0)}</td
								>
								<td class="px-4 py-3 text-right font-mono text-sm text-muted-foreground"
									>{fmt.format(row.priorRevenue ?? 0)}</td
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
								<td class="px-4 py-3 text-sm"
									>{row.lastOrderDate ? formatDate(row.lastOrderDate) : '—'}</td
								>
								<td class="px-4 py-3 text-sm">
									{#if row.status === 'dormant'}
										<span
											class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
											>Dormant</span
										>
									{:else}
										<span
											class="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-sm text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
											>Active</span
										>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-muted/40">
							<td colspan="2" class="px-4 py-2.5 text-sm font-medium">Total</td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.currentOrders ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + (r.currentRevenue ?? 0), 0))}</td
							>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + (r.priorRevenue ?? 0), 0))}</td
							>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5"></td>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	{:else if report === 'season-sell-through' && variant === 'brand'}
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
							d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
						/>
					</svg>
				</div>
				<p class="text-sm font-medium">No seasons yet</p>
				<p class="text-sm text-muted-foreground">
					Create a season and assign products to see sell-through here.
				</p>
			</div>
		{:else}
			<div class="overflow-hidden rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2.5 text-left text-sm font-medium">Season</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Catalog</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Sold</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Sell-through</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Units</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Orders</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Accounts</th>
							<th class="px-4 py-2.5 text-right text-sm font-medium">Revenue</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each rows as row (row.seasonId)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3 text-sm font-medium">
									<div class="flex items-center gap-2">
										<span>{row.seasonName}</span>
										{#if row.isActive === false}
											<span
												class="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
												>Inactive</span
											>
										{/if}
									</div>
								</td>
								<td class="px-4 py-3 text-right text-sm text-muted-foreground"
									>{row.productsInSeason ?? 0}</td
								>
								<td class="px-4 py-3 text-right text-sm">{row.productsOrdered ?? 0}</td>
								<td class="px-4 py-3 text-right font-mono text-sm font-medium"
									>{row.sellThroughPct ?? 0}%</td
								>
								<td class="px-4 py-3 text-right text-sm">{row.totalUnits ?? 0}</td>
								<td class="px-4 py-3 text-right text-sm">{row.orders}</td>
								<td class="px-4 py-3 text-right text-sm">{row.accounts ?? 0}</td>
								<td class="px-4 py-3 text-right font-mono text-sm"
									>{fmt.format(row.totalRevenue ?? 0)}</td
								>
							</tr>
						{/each}
					</tbody>
					<tfoot>
						<tr class="bg-muted/40">
							<td class="px-4 py-2.5 text-sm font-medium">Total</td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.productsInSeason ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.productsOrdered ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + (r.totalUnits ?? 0), 0)}</td
							>
							<td class="px-4 py-2.5 text-right text-sm font-medium"
								>{rows.reduce((s, r) => s + r.orders, 0)}</td
							>
							<td class="px-4 py-2.5"></td>
							<td class="px-4 py-2.5 text-right font-mono text-sm font-bold"
								>{fmt.format(rows.reduce((s, r) => s + (r.totalRevenue ?? 0), 0))}</td
							>
						</tr>
					</tfoot>
				</table>
			</div>
		{/if}
	{/if}
</div>
