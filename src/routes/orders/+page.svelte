<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip/index.js';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { downloadCSV } from '$lib/utils/csv.js';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import type { Order, Season } from '$lib/types/database.js';
	import {
		computePreset,
		matchPreset,
		DATE_PRESET_LABELS,
		type DatePresetId
	} from '$lib/utils/date-presets.js';

	type OrderRow = Order & {
		profiles?: { display_name?: string | null } | null;
		show_dates?: {
			city?: string | null;
			state?: string | null;
			month?: number | null;
			year?: number | null;
			shows?: { name?: string } | null;
		} | null;
		source_types?: { name?: string } | null;
		season_deliveries?: { delivery_month?: number | null } | null;
		source_org?: { name?: string | null } | null;
	};

	import { debounce } from '$lib/utils/debounce.js';

	const PAGE_SIZE = 50;

	let { data } = $props();

	// Mutable orders list — initial page from server, appended via infinite scroll
	let orderList = $state<OrderRow[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	// Sync from server data when filters/search change (SvelteKit re-runs load)
	$effect(() => {
		orderList = data.orders as OrderRow[];
		hasMore = Boolean(data.hasMore);
	});

	const seasons = $derived(data.seasons as Season[]);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const showDates = $derived(
		(data.showDates ?? []) as Array<{
			id: string;
			year: number | null;
			month: number | null;
			city: string | null;
			shows: { name?: string } | { name?: string }[] | null;
		}>
	);
	const sourceTypes = $derived((data.sourceTypes ?? []) as Array<{ id: string; name: string }>);
	const reps = $derived((data.reps as { id: string; name: string }[] | undefined) ?? []);

	// Combined options for the unified Source filter (shows + source_types).
	// Values are prefixed so the server can route to the right column.
	const monthAbbrev = [
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
	// Dedupe source_types by name across visible orgs (BOA's view spans
	// every connected rep org, so "Road" can appear once per rep). Shows
	// are date-distinct (CALA Mar 2026 ≠ CALA Mar 2027) so they keep IDs.
	const dedupedSourceTypes = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const seen = new Set<string>();
		return sourceTypes.filter((st) => {
			const key = st.name.trim().toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});
	const sourceItems = $derived([
		{ value: '', label: 'All Sources' },
		...showDates.map((sd) => {
			const shows = sd.shows;
			const showName = Array.isArray(shows) ? (shows[0]?.name ?? 'Show') : (shows?.name ?? 'Show');
			return {
				value: `show:${sd.id}`,
				label: `${showName} — ${monthAbbrev[(sd.month ?? 1) - 1]} ${sd.year}${sd.city ? `, ${sd.city}` : ''}`
			};
		}),
		...dedupedSourceTypes.map((st) => ({ value: `srctype:${st.name}`, label: st.name }))
	]);
	const hasSourceOptions = $derived(showDates.length > 0 || sourceTypes.length > 0);
	const isBrandOrg = $derived(Boolean(data.isBrandOrg));
	const canCreate = $derived(data.membership?.role !== 'guest');
	// Brand-level sales reps shouldn't export org-wide data.
	const canExport = $derived(!(isBrandOrg && data.membership?.role === 'sales'));
	const metrics = $derived(
		data.metrics as {
			pipelineValue: number;
			pipelineCount: number;
			deliveredRevenue: number;
			shippedCount: number;
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

	const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
	function attentionReason(o: OrderRow): 'stale-draft' | 'overdue' | null {
		const status = (o as { status?: string }).status;
		if (status === 'draft') {
			const created = (o as { created_at?: string }).created_at;
			if (created && Date.now() - new Date(created).getTime() > SEVEN_DAYS_MS) return 'stale-draft';
		}
		if (status === 'submitted' || status === 'confirmed') {
			const expected = (o as { expected_ship_date?: string | null }).expected_ship_date;
			if (expected) {
				const todayStr = new Date().toISOString().slice(0, 10);
				if (expected < todayStr) return 'overdue';
			}
		}
		return null;
	}

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
	const activeType = $derived($page.url.searchParams.get('type') ?? 'order');
	const activeFrom = $derived($page.url.searchParams.get('from'));
	const activeTo = $derived($page.url.searchParams.get('to'));
	const activeDatePreset = $derived<DatePresetId>(matchPreset(activeFrom, activeTo));

	let search = $state($page.url.searchParams.get('search') ?? '');
	const filtered = $derived(
		orderList.filter((o) => {
			const activeType = $page.url.searchParams.get('type') ?? 'order';
			if (activeType !== 'all' && o.order_type !== activeType) return false;
			return true;
		})
	);

	// Debounced server-side search
	const debouncedSearch = debounce((value: string) => {
		setFilter('search', value);
	}, 500);

	function onSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		search = value;
		// Don't fire server search for a single character — too noisy and
		// matches too much. Empty string clears the filter.
		if (value.length === 0 || value.length >= 2) {
			debouncedSearch(value);
		}
	}

	// Infinite scroll — load more orders
	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
			const params = new URLSearchParams($page.url.searchParams);
			params.set('offset', String(orderList.length));
			params.set('limit', String(PAGE_SIZE));
			const res = await fetch(`/api/orders/list?${params.toString()}`);
			if (res.ok) {
				const json = await res.json();
				orderList = [...orderList, ...(json.orders as OrderRow[])];
				hasMore = Boolean(json.hasMore);
			}
		} finally {
			loadingMore = false;
		}
	}

	// IntersectionObserver for sentinel
	$effect(() => {
		if (!sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loadingMore) {
					loadMore();
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});

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
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
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
		const rows = filtered.map((o) => ({
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
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (!value || value === 'all') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		goto(resolve(`/orders?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function setDateRange(from: string | null, to: string | null) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (from) params.set('from', from);
		else params.delete('from');
		if (to) params.set('to', to);
		else params.delete('to');
		goto(resolve(`/orders?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function onDatePresetChange(presetId: DatePresetId) {
		if (presetId === 'all') {
			setDateRange(null, null);
			return;
		}
		if (presetId === 'custom') {
			// Pre-fill Custom with today so the two date inputs aren't empty.
			const today = new Date();
			const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			setDateRange(iso, iso);
			return;
		}
		const window = computePreset(presetId);
		if (window) setDateRange(window.from, window.to);
	}
</script>

<div class="space-y-6">
	<PageHeader
		title="Orders"
		subtitle="{data.totalCount ?? orderList.length} {activeType === 'note'
			? 'Note'
			: 'Order'}{(data.totalCount ?? orderList.length) !== 1 ? 's' : ''}"
	>
		{#if filtered.length > 0 && canExport}
			<Button variant="outline" onclick={exportOrders}>Export CSV</Button>
		{/if}
		{#if isBrandOrg && canCreate}
			<Button variant="outline" onclick={() => (showImport = true)}>Import</Button>
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
	</PageHeader>

	<!-- Type tabs: Orders / Notes -->
	<div class="flex gap-1 border-b">
		{#each ['order', 'note'] as t (t)}
			{@const label = t === 'note' ? 'Notes' : 'Orders'}
			<button
				class="-mb-px px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors {activeType ===
				t
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				style="border-bottom: 1px solid {activeType === t ? 'currentColor' : 'transparent'}"
				onclick={() => setFilter('type', t)}
			>
				{label}
			</button>
		{/each}
	</div>

	<!-- Analytics Cards -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Pipeline Value</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.pipelineValue)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{fmt.format(metrics.avgOrderValue)} avg order
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Delivered Revenue</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.deliveredRevenue)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.shippedCount} order{metrics.shippedCount !== 1 ? 's' : ''} shipped
				</p>
			</CardContent>
		</Card>

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
					class="mt-0.5 font-mono text-sm {metrics.needsAttention.total > 0
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

		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Conversion Rate</p>
				<p class="mt-1 text-2xl font-semibold">{Math.round(metrics.conversion.rate * 100)}%</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.conversion.converted} of {metrics.conversion.submitted} submitted
				</p>
			</CardContent>
		</Card>
	</div>

	<!-- Filters / Bulk action bar -->
	<div class="flex min-h-[44px] flex-wrap items-center gap-3">
		{#if selectedIds.size > 0}
			{@const nextStatuses = bulkNextStatuses()}
			<span class="text-sm font-medium">{selectedIds.size} selected</span>
			<div class="h-5 w-px bg-border"></div>
			{#if nextStatuses.length > 0}
				{#each nextStatuses as status (status)}
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
				class="ml-auto text-muted-foreground hover:text-foreground"
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
		{:else}
			<SearchInput
				placeholder="Search orders..."
				value={search}
				oninput={onSearchInput}
				class="w-64"
			/>
			{#if activeType !== 'note'}
				<SelectField
					value={activeStatus}
					items={statusTabs.map((s) => ({ value: s, label: statusLabels[s] ?? s }))}
					placeholder="Status"
					class="min-w-[120px]"
					onValueChange={(v) => setFilter('status', v)}
				/>
			{/if}
			<SelectField
				class="min-w-[158px]"
				value={$page.url.searchParams.get('season') ?? ''}
				items={[
					{ value: '', label: 'All Seasons' },
					...seasons.map((s) => ({ value: s.name, label: s.name }))
				]}
				placeholder="All Seasons"
				onValueChange={(v) => setFilter('season', v)}
			/>
			<div class="flex-1"></div>
			{#if isBrandOrg && reps.length > 0}
				<SelectField
					class="min-w-[158px]"
					value={$page.url.searchParams.get('rep') ?? ''}
					items={[
						{ value: '', label: 'All Reps' },
						...reps.map((r) => ({ value: r.id, label: r.name }))
					]}
					placeholder="All Reps"
					onValueChange={(v) => setFilter('rep', v)}
				/>
			{/if}
			{#if !isBrandOrg}
				<SelectField
					class="min-w-[158px]"
					value={$page.url.searchParams.get('brand') ?? ''}
					items={[
						{ value: '', label: 'All Brands' },
						...brands.map((b) => ({ value: b.name, label: b.name }))
					]}
					placeholder="All Brands"
					onValueChange={(v) => setFilter('brand', v)}
				/>
			{/if}
			{#if hasSourceOptions}
				<SelectField
					class="max-w-[240px] min-w-[158px]"
					value={$page.url.searchParams.get('source') ?? ''}
					items={sourceItems}
					placeholder="All Sources"
					onValueChange={(v) => setFilter('source', v)}
				/>
			{/if}
			<SelectField
				class="min-w-[158px]"
				value={activeDatePreset}
				items={Object.entries(DATE_PRESET_LABELS).map(([value, label]) => ({ value, label }))}
				placeholder="All Time"
				onValueChange={(v) => onDatePresetChange(v as DatePresetId)}
			/>
			{#if activeDatePreset === 'custom'}
				<input
					type="date"
					aria-label="From date"
					class="min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm"
					value={activeFrom ?? ''}
					onchange={(e) => setDateRange((e.target as HTMLInputElement).value || null, activeTo)}
				/>
				<span class="text-sm text-muted-foreground">to</span>
				<input
					type="date"
					aria-label="To date"
					class="min-h-[44px] rounded-lg border border-input bg-background px-3 text-sm"
					value={activeTo ?? ''}
					onchange={(e) => setDateRange(activeFrom, (e.target as HTMLInputElement).value || null)}
				/>
			{/if}
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
		<div class="overflow-x-auto border-b">
			<table class="w-full">
				<thead>
					<tr class="border-b">
						<th class="w-8 py-2.5 pr-1 pl-4">
							<Checkbox
								checked={allSelected}
								indeterminate={selectedIds.size > 0 && !allSelected}
								onCheckedChange={() => toggleAll()}
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
						{#if isBrandOrg}
							<th
								class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:table-cell"
								>Source</th
							>
						{/if}
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
					{#each filtered as order (order.id)}
						{@const repName = order.profiles?.display_name ?? '—'}
						{@const showDate = order.show_dates}
						{@const sourceName = showDate?.shows?.name ?? order.source_types?.name ?? null}
						{@const sourceLocation = showDate
							? [showDate.city, showDate.state].filter(Boolean).join(', ')
							: null}
						{@const delivery = order.season_deliveries}
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
						{@const reason = attentionReason(order)}
						<tr
							class="group transition-colors hover:bg-muted/30 {selectedIds.has(order.id)
								? 'bg-primary/5'
								: ''}"
						>
							<td class="w-8 py-3 pr-1 pl-4 align-top">
								<div class="flex h-5 items-center justify-center text-sm">
									{#if reason}
										<TooltipProvider delayDuration={150}>
											<Tooltip>
												<TooltipTrigger
													class="inline-flex"
													aria-label={reason === 'stale-draft' ? 'Stale note' : 'Overdue shipment'}
												>
													<span class="block h-2 w-2 rounded-full bg-amber-500"></span>
												</TooltipTrigger>
												<TooltipContent side="right">
													{reason === 'stale-draft' ? 'Stale note' : 'Overdue shipment'}
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									{/if}
								</div>
								<div
									class="flex h-6 items-center justify-center {selectedIds.has(order.id) ||
									selectedIds.size > 0
										? 'opacity-100'
										: 'opacity-0 group-hover:opacity-100'} transition-opacity"
								>
									<Checkbox
										checked={selectedIds.has(order.id)}
										onCheckedChange={() => toggleOne(order.id)}
									/>
								</div>
							</td>
							<td class="px-4 py-3">
								<p class="text-sm text-muted-foreground">
									{order.accounts?.business_name ?? '—'}
								</p>
								<a
									href={resolve(`/orders/${order.id}`)}
									class="font-mono text-base font-medium hover:underline">{order.order_number}</a
								>
								<p class="font-mono text-sm text-muted-foreground">{seasonLabel(order)}</p>
							</td>
							<td class="px-4 py-3 text-center">
								{#if order.order_type === 'note'}
									<span class="text-sm font-medium text-muted-foreground">Note</span>
								{:else}
									<span
										class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeColors[
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
								</td>
							{/if}
							<td class="hidden px-4 py-3 md:table-cell">
								{#if isBrandOrg}
									{@const repName = order.profiles?.display_name ?? order.source_org?.name ?? '—'}
									<span class="text-sm {repName === '—' ? 'text-muted-foreground/50' : ''}"
										>{repName}</span
									>
								{:else}
									<span class="text-sm {sourceName ? '' : 'text-muted-foreground/50'}"
										>{sourceName ?? '—'}</span
									>
									{#if showDate}
										<span
											class="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
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
											][(showDate.month ?? 1) - 1]}</span
										>
									{/if}
								{/if}
								{#if showDate && !isBrandOrg && sourceLocation}
									<p class="mt-0.5 font-mono text-sm text-muted-foreground">{sourceLocation}</p>
								{/if}
							</td>
							{#if isBrandOrg}
								<td class="hidden px-4 py-3 md:table-cell">
									<span class="text-sm {sourceName ? '' : 'text-muted-foreground/50'}"
										>{sourceName ?? '—'}</span
									>
									{#if showDate}
										<span
											class="ml-2 inline-flex items-center rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
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
											][(showDate.month ?? 1) - 1]}</span
										>
									{/if}
									{#if showDate && sourceLocation}
										<p class="mt-0.5 font-mono text-sm text-muted-foreground">{sourceLocation}</p>
									{/if}
								</td>
							{/if}
							<td class="hidden px-4 py-3 md:table-cell">
								<span class="text-sm {repName === '—' ? 'text-muted-foreground/50' : ''}"
									>{repName}</span
								>
								<p class="font-mono text-sm text-muted-foreground">
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
								{#if order.status === 'shipped' || order.status === 'delivered'}
									<span class="text-sm"
										>{fmt.format(Number(order.shipped_amount ?? order.total_amount))}</span
									>
									<p class="text-xs text-muted-foreground">
										{fmt.format(Number(order.total_amount))}
									</p>
								{:else}
									<span class="text-sm">{fmt.format(Number(order.total_amount))}</span>
									<p class="text-xs text-muted-foreground/50">—</p>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Infinite scroll sentinel -->
		{#if hasMore || loadingMore}
			<div bind:this={sentinelEl} class="flex items-center justify-center py-6">
				{#if loadingMore}
					<span class="text-sm text-muted-foreground">Loading more orders…</span>
				{/if}
			</div>
		{/if}
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
