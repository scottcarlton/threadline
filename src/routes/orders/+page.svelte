<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { downloadCSV } from '$lib/utils/csv.js';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import type { Order, Season } from '$lib/types/database.js';

	let { data } = $props();
	const orders = $derived(data.orders as Order[]);
	const seasons = $derived(data.seasons as Season[]);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const showDates = $derived(data.showDates ?? []);
	const reps = $derived((data.reps as { id: string; name: string }[] | undefined) ?? []);
	const isBrandOrg = $derived(Boolean(data.isBrandOrg));
	const canCreate = $derived(data.membership?.role !== 'guest');
	// Brand-level sales reps shouldn't export org-wide data.
	const canExport = $derived(!(isBrandOrg && data.membership?.role === 'sales'));
	const monthNames = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];
	const metrics = $derived(
		data.metrics as {
			pipelineValue: number;
			pipelineCount: number;
			deliveredRevenue: number;
			avgOrderValue: number;
			needsAttention: { staleDrafts: number; overdueShipments: number; total: number };
			conversion: { submitted: number; converted: number; rate: number };
		}
	);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	const statusTabs = [
		'all',
		'draft',
		'submitted',
		'confirmed',
		'shipped',
		'delivered',
		'cancelled'
	] as const;
	const statusLabels: Record<string, string> = {
		all: 'All',
		draft: 'Draft',
		submitted: 'Submitted',
		confirmed: 'Confirmed',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};
	const activeStatus = $derived($page.url.searchParams.get('status') ?? 'all');
	const activeType = $derived($page.url.searchParams.get('type') ?? 'all');

	let search = $state('');
	const filtered = $derived(
		orders.filter((o) => {
			if (activeType !== 'all' && o.order_type !== activeType) return false;
			return (
				o.order_number.toLowerCase().includes(search.toLowerCase()) ||
				(o.accounts?.business_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
				(o.brands?.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
			);
		})
	);

	// Bulk selection
	let selectedIds = $state<Set<string>>(new Set());
	let bulkUpdating = $state(false);

	const allSelected = $derived(filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id)));

	function toggleAll() {
		if (allSelected) {
			selectedIds = new Set();
		} else {
			selectedIds = new Set(filtered.map((o) => o.id));
		}
	}

	function toggleOne(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	const statusFlow: Record<string, string[]> = {
		draft: ['submitted'],
		submitted: ['confirmed'],
		confirmed: ['shipped'],
		shipped: ['delivered']
	};

	// Notes aren't part of the order lifecycle — exclude them from bulk status ops.
	const bulkNextStatuses = $derived(() => {
		const selected = filtered.filter((o) => selectedIds.has(o.id));
		if (selected.length === 0) return [];
		const sets = selected.map((o) => new Set(statusFlow[o.status] ?? []));
		const common = [...sets[0]].filter((s) => sets.every((set) => set.has(s)));
		return common;
	});

	async function bulkUpdateStatus(newStatus: string) {
		bulkUpdating = true;
		const ids = [...selectedIds];
		const timestampField: Record<string, string> = {
			submitted: 'submitted_at',
			confirmed: 'confirmed_at',
			shipped: 'shipped_at',
			delivered: 'delivered_at'
		};
		const updateData: Record<string, unknown> = {
			status: newStatus,
			updated_at: new Date().toISOString()
		};
		if (timestampField[newStatus]) {
			updateData[timestampField[newStatus]] = new Date().toISOString();
		}
		await supabase.from('orders').update(updateData).in('id', ids);
		selectedIds = new Set();
		bulkUpdating = false;
		invalidateAll();
	}

	const statusBadgeColors: Record<string, string> = {
		draft: 'bg-zinc-100 text-zinc-600',
		submitted: 'bg-amber-50 text-amber-700',
		confirmed: 'bg-blue-50 text-blue-700',
		shipped: 'bg-indigo-50 text-indigo-700',
		delivered: 'bg-emerald-50 text-emerald-700',
		cancelled: 'bg-red-50 text-red-700'
	};

	function seasonLabel(order: Order): string {
		const name = order.seasons?.name;
		if (name && order.order_year) return `${name} ${order.order_year}`;
		if (name) return name;
		if (order.order_year) return String(order.order_year);
		return '—';
	}

	function exportOrders() {
		const rows = filtered.map((o: any) => ({
			order_number: o.order_number,
			account: o.accounts?.business_name ?? '',
			brand: o.brands?.name ?? '',
			season: o.seasons?.name ?? '',
			year: o.order_year ?? '',
			status: o.status,
			created_by: o.profiles?.display_name ?? '',
			source: o.show_dates?.shows?.name ?? o.source_types?.name ?? '',
			ship_window_start: o.season_deliveries?.delivery_month
				? `${o.season_deliveries.delivery_month}/01`
				: '',
			expected_ship_date: o.expected_ship_date ?? '',
			shipped_at: o.shipped_at ?? '',
			total_amount: o.total_amount,
			shipped_amount: o.shipped_amount ?? '',
			created_at: o.created_at
		}));
		downloadCSV(rows, 'orders.csv');
	}

	let showImport = $state(false);

	const orderImportColumns = [
		{ key: 'account', label: 'Account (business name)', required: true },
		{ key: 'style_number', label: 'Style Number', required: true },
		{ key: 'qty', label: 'Quantity', required: true },
		{ key: 'unit_price', label: 'Unit Price' },
		{ key: 'color', label: 'Color' },
		{ key: 'size', label: 'Size' },
		{ key: 'expected_ship_date', label: 'Expected Ship Date (YYYY-MM-DD)' },
		{ key: 'notes', label: 'Notes' }
	];

	async function handleImportOrders(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];

		const { data: selfBrand } = await supabase
			.from('brands')
			.select('id')
			.eq('organization_id', data.organization?.id ?? '')
			.eq('is_self_brand', true)
			.maybeSingle();
		if (!selfBrand) {
			return { success: 0, errors: ['No self-brand found for this organization'] };
		}

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const accountName = row.account?.trim();
			const styleNumber = row.style_number?.trim();
			const qty = parseInt(row.qty);
			if (!accountName || !styleNumber || !qty || qty <= 0) {
				errors.push(`Row ${i + 1}: account, style_number, and positive qty required`);
				continue;
			}

			const { data: account } = await supabase
				.from('accounts')
				.select('id')
				.eq('organization_id', data.organization?.id ?? '')
				.ilike('business_name', accountName)
				.maybeSingle();
			if (!account) {
				errors.push(`Row ${i + 1} (${accountName}): account not found`);
				continue;
			}

			const { data: product } = await supabase
				.from('products')
				.select('id, wholesale_price')
				.eq('brand_id', selfBrand.id)
				.eq('style_number', styleNumber)
				.maybeSingle();
			if (!product) {
				errors.push(`Row ${i + 1} (${styleNumber}): product not found in your catalog`);
				continue;
			}

			const unitPrice = row.unit_price?.trim()
				? parseFloat(row.unit_price)
				: Number(product.wholesale_price);

			const { data: order, error: orderErr } = await supabase
				.from('orders')
				.insert({
					organization_id: data.organization?.id,
					brand_id: selfBrand.id,
					account_id: account.id,
					created_by: data.user?.id,
					status: 'draft',
					order_type: 'direct',
					expected_ship_date: row.expected_ship_date?.trim() || null,
					notes: row.notes?.trim() || null,
					total_amount: qty * unitPrice
				})
				.select('id')
				.single();

			if (orderErr || !order) {
				errors.push(`Row ${i + 1}: ${orderErr?.message ?? 'Failed to create order'}`);
				continue;
			}

			const { error: lineErr } = await supabase.from('order_lines').insert({
				order_id: order.id,
				product_id: product.id,
				style_number: styleNumber,
				qty,
				unit_price: unitPrice,
				color: row.color?.trim() || null,
				size: row.size?.trim() || null
			});
			if (lineErr) {
				errors.push(`Row ${i + 1}: order created but line failed — ${lineErr.message}`);
				continue;
			}
			success++;
		}
		if (success > 0) invalidateAll();
		return { success, errors };
	}

	function setFilter(key: string, value: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (!value || value === 'all') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		goto(`/orders?${params.toString()}`, { replaceState: true });
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl">Orders</h1>
			<p class="mt-1 font-mono text-sm text-muted-foreground">
				{orders.length} order{orders.length !== 1 ? 's' : ''}
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if filtered.length > 0 && canExport}
				<Button variant="outline" size="sm" onclick={exportOrders}>Export CSV</Button>
			{/if}
			{#if isBrandOrg && canCreate}
				<Button variant="outline" size="sm" onclick={() => (showImport = true)}>Import</Button>
			{/if}
			{#if canCreate}
				<Button href="/orders/new">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="-ml-1 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
					>
					New Order
				</Button>
			{/if}
		</div>
	</div>

	<!-- Type filter -->
	<div class="flex flex-wrap items-center gap-2">
		{#each ['all', 'order', 'note'] as t}
			<button
				class="rounded-full border px-3 py-1 text-sm transition {activeType === t
					? 'border-foreground bg-foreground text-background'
					: 'hover:border-foreground'}"
				onclick={() => setFilter('type', t)}
			>
				{t === 'all' ? 'All' : t === 'note' ? 'Notes' : 'Orders'}
			</button>
		{/each}
	</div>

	<!-- Status tabs -->
	<div class="flex gap-1 border-b">
		{#each statusTabs as tab}
			<button
				class="-mb-px px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors {activeStatus ===
				tab
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				style="border-bottom: 1px solid {activeStatus === tab ? 'currentColor' : 'transparent'}"
				onclick={() => setFilter('status', tab)}
			>
				{statusLabels[tab] ?? tab}
			</button>
		{/each}
	</div>

	<!-- Analytics Cards -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Pipeline Value -->
		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Pipeline Value</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.pipelineValue)}</p>
				<p class="mt-0.5 font-mono text-xs text-muted-foreground">
					{metrics.pipelineCount} open order{metrics.pipelineCount !== 1 ? 's' : ''}
				</p>
			</CardContent>
		</Card>

		<!-- Revenue -->
		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Delivered Revenue</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.deliveredRevenue)}</p>
				<p class="mt-0.5 font-mono text-xs text-muted-foreground">
					{fmt.format(metrics.avgOrderValue)} avg order
				</p>
			</CardContent>
		</Card>

		<!-- Needs Attention -->
		<Card class={metrics.needsAttention.total > 0 ? 'border-amber-300' : ''}>
			<CardContent class="pt-4 pb-4">
				<p
					class="font-mono text-sm font-medium {metrics.needsAttention.total > 0
						? 'text-amber-700'
						: 'text-muted-foreground'}"
				>
					Needs Attention
				</p>
				<p
					class="mt-1 text-2xl font-semibold {metrics.needsAttention.total > 0
						? 'text-amber-700'
						: ''}"
				>
					{metrics.needsAttention.total}
				</p>
				<p
					class="mt-0.5 font-mono text-xs {metrics.needsAttention.total > 0
						? 'text-amber-600'
						: 'text-muted-foreground'}"
				>
					{#if metrics.needsAttention.total === 0}
						All orders on track
					{:else}
						{#if metrics.needsAttention.staleDrafts > 0}{metrics.needsAttention.staleDrafts} stale note{metrics
								.needsAttention.staleDrafts !== 1
								? 's'
								: ''}{/if}{#if metrics.needsAttention.staleDrafts > 0 && metrics.needsAttention.overdueShipments > 0},
						{/if}{#if metrics.needsAttention.overdueShipments > 0}{metrics.needsAttention
								.overdueShipments} overdue{/if}
					{/if}
				</p>
			</CardContent>
		</Card>

		<!-- Conversion Rate -->
		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Conversion Rate</p>
				<p class="mt-1 text-2xl font-semibold">{Math.round(metrics.conversion.rate * 100)}%</p>
				<p class="mt-0.5 font-mono text-xs text-muted-foreground">
					{metrics.conversion.converted} of {metrics.conversion.submitted} submitted
				</p>
			</CardContent>
		</Card>
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-3">
		<div class="max-w-xs">
			<Input placeholder="Search orders..." bind:value={search} />
		</div>
		<select
			class="h-10 rounded-md border border-input bg-background px-3 text-[13px]"
			onchange={(e) => setFilter('season', (e.target as HTMLSelectElement).value)}
		>
			<option value="">All Seasons</option>
			{#each seasons as season}
				<option value={season.id}>{season.name}</option>
			{/each}
		</select>
		{#if !isBrandOrg}
			<select
				class="h-10 rounded-md border border-input bg-background px-3 text-[13px]"
				onchange={(e) => setFilter('brand', (e.target as HTMLSelectElement).value)}
			>
				<option value="">All Brands</option>
				{#each brands as brand}
					<option value={brand.id}>{brand.name}</option>
				{/each}
			</select>
		{/if}
		{#if isBrandOrg && reps.length > 0}
			<select
				class="h-10 rounded-md border border-input bg-background px-3 text-[13px]"
				onchange={(e) => setFilter('rep', (e.target as HTMLSelectElement).value)}
			>
				<option value="">All Reps</option>
				{#each reps as r (r.id)}
					<option value={r.id}>{r.name}</option>
				{/each}
			</select>
		{/if}
		{#if showDates.length > 0}
			<select
				class="h-10 rounded-md border border-input bg-background px-3 text-[13px]"
				onchange={(e) => setFilter('show', (e.target as HTMLSelectElement).value)}
			>
				<option value="">All Shows</option>
				{#each showDates as sd}
					{@const shows = sd.shows as { name?: string } | { name?: string }[] | null}
					{@const showName = Array.isArray(shows)
						? (shows[0]?.name ?? 'Show')
						: (shows?.name ?? 'Show')}
					<option value={sd.id}
						>{showName} — {monthNames[(sd.month ?? 1) - 1]}
						{sd.year}{sd.city ? `, ${sd.city}` : ''}</option
					>
				{/each}
			</select>
		{/if}
	</div>

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search}
				<p class="text-lg font-semibold">No orders match your search</p>
				<p class="mt-2 text-sm text-muted-foreground">Try adjusting your filters</p>
			{:else}
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
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Ready for your first order</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Orders will appear here as you start writing business
				</p>
			{/if}
		</div>
	{:else}
		<!-- Responsive table: Account & Brand hidden on mobile, Season hidden below md -->
		<div class="overflow-x-auto rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th class="w-10 px-4 py-2.5">
							<input
								type="checkbox"
								checked={allSelected}
								onchange={toggleAll}
								class="h-4 w-4 rounded border-muted-foreground/30 accent-primary"
							/>
						</th>
						<th
							class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Order</th
						>
						<th
							class="px-4 py-2.5 text-center text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Status</th
						>
						{#if !isBrandOrg}
							<th
								class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
								>Brand</th
							>
						{/if}
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:table-cell"
							>{isBrandOrg ? 'Rep' : 'Source'}</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:table-cell"
							>Created</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Ship Window</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Shipped</th
						>
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Total</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as order}
						{@const repName = (order as any).profiles?.display_name ?? '—'}
						{@const showDate = (order as any).show_dates}
						{@const sourceName = showDate?.shows?.name ?? (order as any).source_types?.name ?? null}
						{@const sourceLocation = showDate
							? [showDate.city, showDate.state].filter(Boolean).join(', ')
							: null}
						{@const delivery = (order as any).season_deliveries}
						{@const monthNames = [
							'Jan',
							'Feb',
							'Mar',
							'Apr',
							'May',
							'Jun',
							'Jul',
							'Aug',
							'Sep',
							'Oct',
							'Nov',
							'Dec'
						]}
						{@const shipWindowStart = delivery?.delivery_month
							? `${monthNames[delivery.delivery_month - 1]} 1`
							: (order as { start_ship_date?: string | null }).start_ship_date
								? `${monthNames[new Date((order as { start_ship_date: string }).start_ship_date + 'T00:00:00').getMonth()]} ${new Date((order as { start_ship_date: string }).start_ship_date + 'T00:00:00').getDate()}`
								: null}
						{@const shipWindowEnd = order.expected_ship_date
							? `${monthNames[new Date(order.expected_ship_date + 'T00:00:00').getMonth()]} ${new Date(order.expected_ship_date + 'T00:00:00').getDate()}`
							: null}
						<tr
							class="transition-colors hover:bg-muted/30 {selectedIds.has(order.id)
								? 'bg-primary/5'
								: ''}"
						>
							<td class="w-10 px-4 py-3">
								<input
									type="checkbox"
									checked={selectedIds.has(order.id)}
									onchange={() => toggleOne(order.id)}
									class="h-4 w-4 rounded border-muted-foreground/30 accent-primary"
								/>
							</td>
							<td class="px-4 py-3">
								{#if isBrandOrg}
									<p class="text-sm text-muted-foreground">
										{order.accounts?.business_name ?? '—'}
									</p>
									<a
										href="/orders/{order.id}"
										class="font-mono text-base font-medium hover:underline">{order.order_number}</a
									>
									<p class="font-mono text-xs text-muted-foreground">{seasonLabel(order)}</p>
								{:else}
									<a
										href="/orders/{order.id}"
										class="font-mono text-base font-medium hover:underline">{order.order_number}</a
									>
									<p class="text-sm text-muted-foreground">
										{order.accounts?.business_name ?? '—'}
									</p>
								{/if}
							</td>
							<td class="px-4 py-3 text-center">
								{#if order.order_type === 'note'}
									<span class="text-sm text-muted-foreground">—</span>
								{:else}
									<span
										class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium {statusBadgeColors[
											order.status
										] ?? 'bg-zinc-100 text-zinc-500'}"
									>
										{statusLabels[order.status] ?? order.status}
									</span>
								{/if}
							</td>
							{#if !isBrandOrg}
								<td class="hidden px-4 py-3 sm:table-cell">
									<span class="text-sm">{order.brands?.name ?? '—'}</span>
									<p class="font-mono text-xs text-muted-foreground">{seasonLabel(order)}</p>
								</td>
							{/if}
							<td class="hidden px-4 py-3 md:table-cell">
								{#if isBrandOrg}
									{@const repOrgName =
										(order as any).source_org?.name ?? (order as any).profiles?.display_name ?? '—'}
									<span class="text-sm {repOrgName === '—' ? 'text-muted-foreground/50' : ''}"
										>{repOrgName}</span
									>
								{:else}
									<span class="text-sm {sourceName ? '' : 'text-muted-foreground/50'}"
										>{sourceName ?? '—'}</span
									>
								{/if}
								{#if showDate && !isBrandOrg}
									<p class="mt-0.5 text-xs text-muted-foreground">
										<span
											class="mr-1 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium"
											>{[
												'Jan',
												'Feb',
												'Mar',
												'Apr',
												'May',
												'Jun',
												'Jul',
												'Aug',
												'Sep',
												'Oct',
												'Nov',
												'Dec'
											][showDate.month - 1]}</span
										><span class="font-mono">{sourceLocation}</span>
									</p>
								{/if}
							</td>
							<td class="hidden px-4 py-3 md:table-cell">
								<span class="text-sm {repName === '—' ? 'text-muted-foreground/50' : ''}"
									>{repName}</span
								>
								<p class="font-mono text-xs text-muted-foreground">
									{new Date(order.created_at).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}
								</p>
							</td>
							<td class="hidden px-4 py-3 lg:table-cell">
								{#if shipWindowStart}
									<span class="text-sm text-muted-foreground">{shipWindowStart}</span>
									<p class="text-sm text-muted-foreground">{shipWindowEnd ?? '—'}</p>
								{:else if shipWindowEnd}
									<span class="text-sm text-muted-foreground">{shipWindowEnd}</span>
								{:else}
									<span class="text-sm text-muted-foreground/50">—</span>
								{/if}
							</td>
							<td class="hidden px-4 py-3 lg:table-cell">
								{#if order.shipped_at}
									<span class="text-sm text-muted-foreground"
										>{new Date(order.shipped_at).toLocaleDateString('en-US', {
											month: 'short',
											day: 'numeric',
											year: 'numeric'
										})}</span
									>
								{:else}
									<span class="text-sm text-muted-foreground/50">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-right font-mono">
								{#if order.shipped_amount != null}
									<span class="text-sm">{fmt.format(Number(order.shipped_amount))}</span>
									<p class="text-sm text-muted-foreground">
										{fmt.format(Number(order.total_amount))}
									</p>
								{:else}
									<span class="text-sm">{fmt.format(Number(order.total_amount))}</span>
									<p class="text-sm text-muted-foreground/50">—</p>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Bulk action bar -->
	{#if selectedIds.size > 0}
		{@const nextStatuses = bulkNextStatuses()}
		<div
			class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border bg-background px-4 py-3 shadow-lg"
		>
			<span class="text-sm font-medium">{selectedIds.size} selected</span>
			<div class="h-5 w-px bg-border"></div>
			{#if nextStatuses.length > 0}
				{#each nextStatuses as status}
					<Button size="sm" onclick={() => bulkUpdateStatus(status)} disabled={bulkUpdating}>
						{status === 'submitted'
							? 'Submit'
							: status === 'confirmed'
								? 'Confirm'
								: status === 'shipped'
									? 'Mark Shipped'
									: 'Mark Delivered'}
					</Button>
				{/each}
			{:else}
				<span class="text-sm text-muted-foreground">No common action available</span>
			{/if}
			<button
				type="button"
				aria-label="Clear selection"
				class="ml-1 text-muted-foreground hover:text-foreground"
				onclick={() => (selectedIds = new Set())}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	{/if}
</div>

{#if isBrandOrg}
	<BulkImportModal
		open={showImport}
		ontoggle={() => (showImport = false)}
		entityType="Orders"
		columns={orderImportColumns}
		onimport={handleImportOrders}
	/>
{/if}
