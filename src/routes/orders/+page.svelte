<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ListPageToolbar from '$lib/components/shared/ListPageToolbar.svelte';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import SeasonFilter from '$lib/components/shared/SeasonFilter.svelte';
	import BrandFilter from '$lib/components/shared/BrandFilter.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import FilterBySheet from '$lib/components/shared/FilterBySheet.svelte';
	import FilterSortSheet from '$lib/components/shared/FilterSortSheet.svelte';
	import { isLgUp } from '$lib/utils/viewport.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { DropdownMenu } from 'bits-ui';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip/index.js';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import OrderImportModal from '$lib/components/orders/OrderImportModal.svelte';
	import { toast } from 'svelte-sonner';
	import type { Order, Season } from '$lib/types/database.js';
	import {
		computePreset,
		matchPreset,
		DATE_PRESET_LABELS,
		type DatePresetId
	} from '$lib/utils/date-presets.js';

	type OrderRow = Order & {
		profiles?: { display_name?: string | null } | null;
		rep_profile?: { display_name?: string | null } | null;
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
	import {
		classifyOrder,
		SPOTLIGHT_BUCKETS,
		SPOTLIGHT_LABELS,
		type SpotlightBucket
	} from '$lib/utils/order-spotlight.js';
	import { Popover } from 'bits-ui';

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
	const metrics = $derived(
		data.metrics as {
			pipelineValue: number;
			pipelineCount: number;
			deliveredRevenue: number;
			shippedCount: number;
			avgOrderValue: number;
			needsAttention: { staleDrafts: number; overdueShipments: number; total: number };
			spotlight: Record<SpotlightBucket, number> & { total: number };
			conversion: { submitted: number; converted: number; rate: number };
		}
	);
	const activeSpotlight = $derived($page.url.searchParams.get('spotlight'));
	const spotlightOn = $derived(activeSpotlight != null);
	const spotlightCounts = $derived(
		metrics.spotlight ?? {
			total: 0,
			overdue: 0,
			approaching_start: 0,
			in_window: 0,
			approaching_complete: 0,
			stale_draft: 0
		}
	);
	let spotlightMenuOpen = $state(false);
	function setSpotlight(value: SpotlightBucket | 'all' | null) {
		spotlightMenuOpen = false;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (value == null) params.delete('spotlight');
		else params.set('spotlight', value);
		goto(resolve(`/orders?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
	function toggleSpotlight() {
		setSpotlight(spotlightOn ? null : 'all');
	}

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	function rowSpotlight(o: OrderRow): SpotlightBucket[] {
		return classifyOrder({
			status: o.status,
			start_ship_date: o.start_ship_date,
			expected_ship_date: o.expected_ship_date,
			shipped_at: o.shipped_at,
			updated_at: o.updated_at
		});
	}

	const SHIP_DAY_MS = 24 * 60 * 60 * 1000;
	function fmtShortDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
	function daysBetween(targetIso: string): number {
		const today = new Date();
		const t = new Date(`${targetIso}T00:00:00`);
		const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
		const targetUtc = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
		return Math.round((targetUtc - todayUtc) / SHIP_DAY_MS);
	}
	function shipWindowMeta(o: OrderRow): { text: string; overdue: boolean } | null {
		if (o.shipped_at) {
			return { text: `Shipped ${fmtShortDate(o.shipped_at)}`, overdue: false };
		}
		if (o.status === 'delivered' && o.delivered_at) {
			return { text: `Delivered ${fmtShortDate(o.delivered_at)}`, overdue: false };
		}
		const expected = o.expected_ship_date;
		const start = o.start_ship_date;
		if (expected) {
			const dExpected = daysBetween(expected);
			if (dExpected < 0) return { text: `Overdue · ${Math.abs(dExpected)}d`, overdue: true };
			if (start) {
				const dStart = daysBetween(start);
				if (dStart > 0) {
					if (dStart > 7) return null;
					return { text: `${dStart}d to start`, overdue: false };
				}
				return { text: `${dExpected}d to complete`, overdue: false };
			}
			return { text: `${dExpected}d to ship`, overdue: false };
		}
		if (start) {
			const dStart = daysBetween(start);
			if (dStart > 0 && dStart <= 7) return { text: `${dStart}d to start`, overdue: false };
		}
		return null;
	}

	const statusTabs = [
		'all',
		'draft',
		'submitted',
		'confirmed',
		'preparing',
		'shipped',
		'delivered',
		'cancelled'
	] as const;
	const statusLabels: Record<string, string> = {
		all: 'All',
		draft: 'Draft',
		submitted: 'Submitted',
		confirmed: 'Confirmed',
		preparing: 'Preparing',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};
	const activeStatuses = $derived(
		($page.url.searchParams.get('status') ?? '').split(',').filter(Boolean)
	);
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
		preparing: 'bg-violet-50 text-violet-700',
		shipped: 'bg-indigo-50 text-indigo-700',
		delivered: 'bg-emerald-50 text-emerald-700',
		cancelled: 'bg-red-50 text-red-700'
	};
	const statusDotColors: Record<string, string> = {
		draft: 'bg-zinc-400',
		submitted: 'bg-amber-500',
		confirmed: 'bg-blue-500',
		preparing: 'bg-violet-500',
		shipped: 'bg-indigo-500',
		delivered: 'bg-emerald-500',
		cancelled: 'bg-red-500'
	};

	function seasonLabel(order: Order): string {
		const name = order.seasons?.name;
		if (name && order.order_year) return `${name} ${order.order_year}`;
		if (name) return name;
		if (order.order_year) return String(order.order_year);
		return '—';
	}

	let showImport = $state(false);

	// Order import is handled by <OrderImportModal>, which wraps
	// <OrderImportFlow> and POSTs to /api/orders/import on commit. The
	// server resolves accounts (by business_name) and products (by
	// style_number) per row and skips rows whose references don't match.

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

	function setMultiFilter(key: string, values: string[]) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (values.length === 0) {
			params.delete(key);
		} else {
			params.set(key, values.join(','));
		}
		goto(resolve(`/orders?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	let filterSortOpen = $state(false);
	let statusSheetOpen = $state(false);
	let seasonSheetOpen = $state(false);
	let brandSheetOpen = $state(false);
	let sourceSheetOpen = $state(false);
	let repSheetOpen = $state(false);
	let dateSheetOpen = $state(false);

	const activeSeasonCount = $derived(
		($page.url.searchParams.get('season') ?? '').split(',').filter(Boolean).length
	);
	const activeBrandCount = $derived(
		($page.url.searchParams.get('brand') ?? '').split(',').filter(Boolean).length
	);
	const activeRepCount = $derived(
		($page.url.searchParams.get('rep') ?? '').split(',').filter(Boolean).length
	);
	const activeSourceCount = $derived(
		($page.url.searchParams.get('source') ?? '').split(',').filter(Boolean).length
	);

	const hasActiveFilters = $derived(
		activeStatuses.length > 0 ||
			($page.url.searchParams.get('season') ?? '') !== '' ||
			($page.url.searchParams.get('brand') ?? '') !== '' ||
			($page.url.searchParams.get('source') ?? '') !== '' ||
			($page.url.searchParams.get('from') ?? '') !== '' ||
			($page.url.searchParams.get('rep') ?? '') !== ''
	);

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
		{#if canCreate}
			{#if isBrandOrg}
				<Button variant="outline" class="hidden sm:inline-flex" onclick={() => (showImport = true)}
					>Import</Button
				>
			{/if}
			<Button href="/orders/new" class="min-w-[100px]">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
				>
				New<span class="hidden sm:inline"> Order</span>
			</Button>
		{/if}
	</PageHeader>

	<!-- Type tabs: Orders / Notes + Spotlight cluster -->
	<div class="flex items-end justify-between border-b">
		<div class="flex gap-1">
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

		<div class="flex items-center pb-1">
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-l-md py-1 pr-2 pl-2 text-sm font-medium transition-colors hover:bg-muted/50"
				onclick={toggleSpotlight}
				aria-pressed={spotlightOn}
				aria-label="Toggle spotlight filter"
			>
				<span class="relative flex h-2 w-2 items-center justify-center">
					{#if spotlightOn && spotlightCounts.total > 0}
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60"
						></span>
					{/if}
					<span
						class="relative inline-flex h-2 w-2 rounded-full {spotlightCounts.total === 0
							? 'bg-muted-foreground/40'
							: spotlightOn
								? 'bg-amber-500'
								: 'bg-amber-500/60'}"
					></span>
				</span>
				<span>Spotlight</span>
				<span
					class="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-muted px-1.5 text-xs tabular-nums {spotlightOn
						? 'text-foreground'
						: 'text-muted-foreground'}"
				>
					{spotlightCounts.total}
				</span>
			</button>

			<Popover.Root bind:open={spotlightMenuOpen}>
				<Popover.Trigger
					class="inline-flex h-7 w-6 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
					aria-label="Narrow spotlight"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
					</svg>
				</Popover.Trigger>
				<Popover.Content
					class="animate-in fade-in-0 zoom-in-95 z-50 w-72 rounded-md border bg-background p-1 shadow-lg"
					sideOffset={6}
					align="end"
				>
					<button
						type="button"
						class="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted/60 {activeSpotlight ===
						'all'
							? 'bg-muted/40 font-medium'
							: ''}"
						onclick={() => setSpotlight('all')}
					>
						<span class="flex items-center gap-2">
							{#if activeSpotlight === 'all'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
									><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
								>
							{:else}
								<span class="inline-block h-4 w-4"></span>
							{/if}
							All issues
						</span>
						<span class="text-muted-foreground tabular-nums">{spotlightCounts.total}</span>
					</button>
					<div class="my-1 h-px bg-border"></div>
					{#each SPOTLIGHT_BUCKETS as bucket (bucket)}
						{@const fullLabel = SPOTLIGHT_LABELS[bucket]}
						{@const hintIdx = fullLabel.indexOf(' (')}
						{@const labelName = hintIdx >= 0 ? fullLabel.slice(0, hintIdx) : fullLabel}
						{@const labelHint = hintIdx >= 0 ? fullLabel.slice(hintIdx + 1) : ''}
						<button
							type="button"
							class="flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted/60 {activeSpotlight ===
							bucket
								? 'bg-muted/40 font-medium'
								: ''}"
							onclick={() => setSpotlight(bucket)}
						>
							<span class="flex items-center gap-2">
								{#if activeSpotlight === bucket}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
										><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg
									>
								{:else}
									<span class="inline-block h-4 w-4"></span>
								{/if}
								{labelName}{#if labelHint}
									<span class="text-xs text-muted-foreground">{labelHint}</span>
								{/if}
							</span>
							<span class="text-muted-foreground tabular-nums">{spotlightCounts[bucket]}</span>
						</button>
					{/each}
					{#if spotlightOn}
						<div class="my-1 h-px bg-border"></div>
						<button
							type="button"
							class="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
							onclick={() => setSpotlight(null)}
						>
							<span class="inline-block h-4 w-4"></span>
							Clear spotlight
						</button>
					{/if}
				</Popover.Content>
			</Popover.Root>
		</div>
	</div>

	<!-- Analytics Cards -->
	<div
		class="hide-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0 lg:pb-0"
	>
		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Pipeline Value</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.pipelineValue)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{fmt.format(metrics.avgOrderValue)} avg order
				</p>
			</CardContent>
		</Card>

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Delivered Revenue</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.deliveredRevenue)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.shippedCount} order{metrics.shippedCount !== 1 ? 's' : ''} shipped
				</p>
			</CardContent>
		</Card>

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Needs Attention</p>
				<p class="mt-1 text-2xl font-semibold">
					{metrics.needsAttention.total}
				</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
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

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
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
	{#if selectedIds.size > 0}
		{@const nextStatuses = bulkNextStatuses()}
		<div
			class="-mx-4 flex min-h-[44px] items-center gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0"
		>
			<span class="text-sm font-medium">{selectedIds.size} selected</span>
			<div class="h-5 w-px bg-border"></div>
			{#if nextStatuses.length > 0}
				{#each nextStatuses as status (status)}
					<Button size="sm" onclick={() => bulkUpdateStatus(status)} loading={bulkUpdating}>
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
		</div>
	{:else}
		<ListPageToolbar
			{search}
			{onSearchInput}
			searchPlaceholder="Search orders..."
			showFilterToggle={true}
			{hasActiveFilters}
			onFilterToggle={() => (filterSortOpen = true)}
		>
			{#if activeType !== 'note'}
				{#if $isLgUp}
					<SelectField
						value={activeStatuses.length === 1 ? activeStatuses[0] : 'all'}
						items={statusTabs.map((s) => ({ value: s, label: statusLabels[s] ?? s }))}
						placeholder="Status"
						class="min-w-[120px] shrink-0"
						onValueChange={(v) => setMultiFilter('status', v && v !== 'all' ? [v] : [])}
					/>
				{:else}
					<button
						class="flex min-h-[44px] min-w-[100px] shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/50"
						onclick={() => (statusSheetOpen = true)}
					>
						Status<span class={activeStatuses.length > 0 ? '' : 'invisible'}>
							({activeStatuses.length})</span
						>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/>
						</svg>
					</button>
				{/if}
			{/if}
			<!-- Season -->
			{#if $isLgUp}
				<SeasonFilter
					class="min-w-[158px] shrink-0"
					{seasons}
					value={$page.url.searchParams.get('season') ?? ''}
					onValueChange={(v) => setFilter('season', v)}
				/>
			{:else}
				<button
					class="flex min-h-[44px] shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/50"
					onclick={() => (seasonSheetOpen = true)}
				>
					Season<span class={activeSeasonCount > 0 ? '' : 'invisible'}> ({activeSeasonCount})</span>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19.5 8.25l-7.5 7.5-7.5-7.5"
						/></svg
					>
				</button>
			{/if}
			<div class="hidden lg:block lg:flex-1"></div>
			<!-- Rep (brand orgs) -->
			{#if isBrandOrg && reps.length > 0}
				{#if $isLgUp}
					<SelectField
						class="min-w-[158px] shrink-0"
						value={$page.url.searchParams.get('rep') ?? ''}
						items={[
							{ value: '', label: 'All Reps' },
							...reps.map((r) => ({ value: r.id, label: r.name }))
						]}
						placeholder="All Reps"
						onValueChange={(v) => setFilter('rep', v)}
					/>
				{:else}
					<button
						class="flex min-h-[44px] min-w-[100px] shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/50"
						onclick={() => (repSheetOpen = true)}
					>
						Rep<span class={activeRepCount > 0 ? '' : 'invisible'}> ({activeRepCount})</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/></svg
						>
					</button>
				{/if}
			{/if}
			<!-- Brand (rep orgs) -->
			{#if !isBrandOrg}
				{#if $isLgUp}
					<BrandFilter
						class="min-w-[158px] shrink-0"
						{brands}
						valueKey="name"
						value={$page.url.searchParams.get('brand') ?? ''}
						onValueChange={(v) => setFilter('brand', v)}
					/>
				{:else}
					<button
						class="flex min-h-[44px] min-w-[100px] shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/50"
						onclick={() => (brandSheetOpen = true)}
					>
						Brand<span class={activeBrandCount > 0 ? '' : 'invisible'}> ({activeBrandCount})</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/></svg
						>
					</button>
				{/if}
			{/if}
			<!-- Source -->
			{#if hasSourceOptions}
				{#if $isLgUp}
					<SelectField
						class="max-w-[240px] min-w-[158px] shrink-0"
						value={$page.url.searchParams.get('source') ?? ''}
						items={sourceItems}
						placeholder="All Sources"
						onValueChange={(v) => setFilter('source', v)}
					/>
				{:else}
					<button
						class="flex min-h-[44px] min-w-[100px] shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/50"
						onclick={() => (sourceSheetOpen = true)}
					>
						Source<span class={activeSourceCount > 0 ? '' : 'invisible'}>
							({activeSourceCount})</span
						>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19.5 8.25l-7.5 7.5-7.5-7.5"
							/></svg
						>
					</button>
				{/if}
			{/if}
			<!-- Date -->
			{#if $isLgUp}
				<SelectField
					class="min-w-[158px] shrink-0"
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
			{:else}
				<button
					class="flex min-h-[44px] shrink-0 items-center gap-2 rounded-sm border border-input bg-background px-3.5 text-sm whitespace-nowrap transition-colors hover:bg-muted/50"
					onclick={() => (dateSheetOpen = true)}
				>
					{activeDatePreset !== 'all' ? DATE_PRESET_LABELS[activeDatePreset] : 'Time'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M19.5 8.25l-7.5 7.5-7.5-7.5"
						/></svg
					>
				</button>
			{/if}
		</ListPageToolbar>
	{/if}

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search}
				<p class="text-lg font-semibold">No orders match your search</p>
				<p class="mt-2 text-sm text-muted-foreground">Try adjusting your filters</p>
			{:else if spotlightOn}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto h-16 w-16 text-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="0.75"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Nothing in the spotlight</p>
				<p class="mt-2 text-sm text-muted-foreground">All orders are on track.</p>
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
						<th class="hidden w-8 py-2.5 pr-1 pl-4 sm:table-cell">
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
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Total</th
						>
						<th class="hidden w-10 px-4 py-2.5 sm:table-cell"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as order (order.id)}
						{@const creatorName = order.profiles?.display_name ?? '—'}
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
						{@const rowBuckets = rowSpotlight(order)}
						{@const rowTooltip = rowBuckets.map((b) => SPOTLIGHT_LABELS[b]).join(', ')}
						{@const shipMeta = shipWindowMeta(order)}
						<tr
							role="link"
							tabindex="0"
							aria-label={order.order_number}
							onclick={() => goto(resolve(`/orders/${order.id}`))}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									goto(resolve(`/orders/${order.id}`));
								}
							}}
							class="group cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none {selectedIds.has(
								order.id
							)
								? 'bg-primary/5'
								: ''}"
						>
							<td class="hidden w-8 py-3 pr-1 pl-4 align-top sm:table-cell">
								<div class="flex h-5 items-center justify-center text-sm">
									{#if rowBuckets.length > 0}
										<TooltipProvider delayDuration={150}>
											<Tooltip>
												<TooltipTrigger
													class="inline-flex"
													aria-label={rowTooltip}
													onclick={(e) => e.stopPropagation()}
												>
													<span
														class="block h-2 w-2 rounded-full {rowBuckets.includes('overdue')
															? 'bg-red-500'
															: 'bg-amber-500'}"
													></span>
												</TooltipTrigger>
												<TooltipContent side="right">
													{rowTooltip}
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
									onclick={(e) => e.stopPropagation()}
									role="presentation"
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
									onclick={(e) => e.stopPropagation()}
									class="font-mono text-base font-medium hover:underline">{order.order_number}</a
								>
								<p class="font-mono text-sm text-muted-foreground">{seasonLabel(order)}</p>
							</td>
							<td class="px-4 py-3 text-center">
								{#if order.order_type === 'note'}
									<span class="text-sm font-medium text-muted-foreground">Note</span>
								{:else}
									<span
										class="inline-block h-2.5 w-2.5 rounded-full sm:hidden {statusDotColors[
											order.status
										] ?? 'bg-zinc-400'}"
										aria-label={statusLabels[order.status] ?? order.status}
									></span>
									<span
										class="hidden items-center rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-flex {statusBadgeColors[
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
									{@const repName =
										order.rep_profile?.display_name ??
										order.profiles?.display_name ??
										order.source_org?.name ??
										'—'}
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
									<p class="mt-0.5 font-mono text-xs text-muted-foreground">{sourceLocation}</p>
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
										<p class="mt-0.5 font-mono text-xs text-muted-foreground">{sourceLocation}</p>
									{/if}
								</td>
							{/if}
							<td class="hidden px-4 py-3 md:table-cell">
								<span class="text-sm {creatorName === '—' ? 'text-muted-foreground/50' : ''}"
									>{creatorName}</span
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
								{#if shipWindowStart && shipWindowEnd}
									<p class="text-sm text-muted-foreground">{shipWindowStart} – {shipWindowEnd}</p>
								{:else if shipWindowStart || shipWindowEnd}
									<p class="text-sm text-muted-foreground">{shipWindowStart ?? shipWindowEnd}</p>
								{:else}
									<p class="text-sm text-muted-foreground/50">—</p>
								{/if}
								{#if shipMeta}
									<p class="text-xs {shipMeta.overdue ? 'text-red-700' : 'text-muted-foreground'}">
										{shipMeta.text}
									</p>
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
							<td class="hidden w-10 px-4 py-3 text-right align-middle sm:table-cell">
								<DropdownMenu.Root>
									<DropdownMenu.Trigger
										aria-label="More actions"
										onclick={(e: Event) => e.stopPropagation()}
										onkeydown={(e: KeyboardEvent) => {
											if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
										}}
										class="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none [@media(hover:none)]:opacity-100"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											class="h-4 w-4"
											aria-hidden="true"
										>
											<circle cx="12" cy="5" r="1.75" />
											<circle cx="12" cy="12" r="1.75" />
											<circle cx="12" cy="19" r="1.75" />
										</svg>
									</DropdownMenu.Trigger>
									<DropdownMenu.Portal>
										<DropdownMenu.Content
											align="end"
											sideOffset={4}
											class="z-50 min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
										>
											<DropdownMenu.Item
												disabled
												class="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm opacity-50 outline-none"
											>
												Duplicate
											</DropdownMenu.Item>
											<DropdownMenu.Item
												disabled
												class="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm opacity-50 outline-none"
											>
												Archive
											</DropdownMenu.Item>
											<DropdownMenu.Separator class="my-1 h-px bg-border" />
											<DropdownMenu.Item
												disabled
												class="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm text-destructive opacity-50 outline-none"
											>
												Delete
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Portal>
								</DropdownMenu.Root>
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

<FilterBySheet
	open={statusSheetOpen}
	onclose={() => (statusSheetOpen = false)}
	title="Filter by Status"
	options={statusTabs
		.filter((s) => s !== 'all')
		.map((s) => ({ value: s, label: statusLabels[s] ?? s }))}
	selected={activeStatuses}
	onApply={(values) => setMultiFilter('status', values)}
/>

<FilterBySheet
	open={seasonSheetOpen}
	onclose={() => (seasonSheetOpen = false)}
	title="Filter by Season"
	options={seasons.map((s) => ({ value: s.name, label: s.name }))}
	selected={($page.url.searchParams.get('season') ?? '').split(',').filter(Boolean)}
	onApply={(values) => setMultiFilter('season', values)}
/>

{#if isBrandOrg && reps.length > 0}
	<FilterBySheet
		open={repSheetOpen}
		onclose={() => (repSheetOpen = false)}
		title="Filter by Rep"
		options={reps.map((r) => ({ value: r.id, label: r.name }))}
		selected={($page.url.searchParams.get('rep') ?? '').split(',').filter(Boolean)}
		onApply={(values) => setMultiFilter('rep', values)}
	/>
{/if}

{#if !isBrandOrg}
	<FilterBySheet
		open={brandSheetOpen}
		onclose={() => (brandSheetOpen = false)}
		title="Filter by Brand"
		options={brands.map((b) => ({ value: b.name, label: b.name }))}
		selected={($page.url.searchParams.get('brand') ?? '').split(',').filter(Boolean)}
		onApply={(values) => setMultiFilter('brand', values)}
	/>
{/if}

{#if hasSourceOptions}
	<FilterBySheet
		open={sourceSheetOpen}
		onclose={() => (sourceSheetOpen = false)}
		title="Filter by Source"
		options={sourceItems
			.filter((s) => s.value !== '')
			.map((s) => ({ value: s.value, label: s.label }))}
		selected={($page.url.searchParams.get('source') ?? '').split(',').filter(Boolean)}
		onApply={(values) => setMultiFilter('source', values)}
	/>
{/if}

<FilterBySheet
	open={dateSheetOpen}
	onclose={() => (dateSheetOpen = false)}
	title="Filter by Time"
	options={Object.entries(DATE_PRESET_LABELS).map(([value, label]) => ({ value, label }))}
	selected={activeDatePreset !== 'all' ? [activeDatePreset] : []}
	onApply={(values) => onDatePresetChange((values[0] ?? 'all') as DatePresetId)}
	singleSelect={true}
/>

<FilterSortSheet
	open={filterSortOpen}
	onclose={() => (filterSortOpen = false)}
	onApply={() => {}}
	onClear={() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		params.delete('status');
		params.delete('season');
		params.delete('brand');
		params.delete('source');
		params.delete('rep');
		params.delete('from');
		params.delete('to');
		goto(resolve(`/orders?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}}
	activeCount={[
		activeStatuses.length > 0,
		($page.url.searchParams.get('season') ?? '') !== '',
		($page.url.searchParams.get('brand') ?? '') !== '',
		($page.url.searchParams.get('source') ?? '') !== '',
		($page.url.searchParams.get('from') ?? '') !== '',
		($page.url.searchParams.get('rep') ?? '') !== ''
	].filter(Boolean).length}
>
	<div class="space-y-6">
		<!-- Status -->
		<div>
			<h3 class="mb-3 text-sm font-medium text-muted-foreground">Status</h3>
			<div class="space-y-2">
				{#each statusTabs.filter((s) => s !== 'all') as s (s)}
					<label class="flex items-center gap-3">
						<Checkbox
							checked={activeStatuses.includes(s)}
							onCheckedChange={(v) => {
								const next = v ? [...activeStatuses, s] : activeStatuses.filter((x) => x !== s);
								setMultiFilter('status', next);
							}}
						/>
						<span class="text-base">{statusLabels[s] ?? s}</span>
					</label>
				{/each}
			</div>
		</div>

		<div class="h-px bg-border"></div>

		<!-- Season -->
		{#if seasons.length > 0}
			<div>
				<h3 class="mb-3 text-sm font-medium text-muted-foreground">Season</h3>
				<div class="space-y-2">
					{#each seasons as season (season.id)}
						<label class="flex items-center gap-3">
							<Checkbox
								checked={($page.url.searchParams.get('season') ?? '') === season.name}
								onCheckedChange={(v) => setFilter('season', v ? season.name : '')}
							/>
							<span class="text-base">{season.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="h-px bg-border"></div>
		{/if}

		<!-- Brand (rep orgs only) -->
		{#if !isBrandOrg && brands.length > 0}
			<div>
				<h3 class="mb-3 text-sm font-medium text-muted-foreground">Brand</h3>
				<div class="space-y-2">
					{#each brands as brand (brand.id)}
						<label class="flex items-center gap-3">
							<Checkbox
								checked={($page.url.searchParams.get('brand') ?? '') === brand.name}
								onCheckedChange={(v) => setFilter('brand', v ? brand.name : '')}
							/>
							<span class="text-base">{brand.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="h-px bg-border"></div>
		{/if}

		<!-- Rep (brand orgs only) -->
		{#if isBrandOrg && reps.length > 0}
			<div>
				<h3 class="mb-3 text-sm font-medium text-muted-foreground">Rep</h3>
				<div class="space-y-2">
					{#each reps as rep (rep.id)}
						<label class="flex items-center gap-3">
							<Checkbox
								checked={($page.url.searchParams.get('rep') ?? '') === rep.id}
								onCheckedChange={(v) => setFilter('rep', v ? rep.id : '')}
							/>
							<span class="text-base">{rep.name}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="h-px bg-border"></div>
		{/if}

		<!-- Source -->
		{#if hasSourceOptions}
			<div>
				<h3 class="mb-3 text-sm font-medium text-muted-foreground">Source</h3>
				<div class="space-y-2">
					{#each sourceItems.filter((s) => s.value !== '') as source (source.value)}
						<label class="flex items-center gap-3">
							<Checkbox
								checked={($page.url.searchParams.get('source') ?? '') === source.value}
								onCheckedChange={(v) => setFilter('source', v ? source.value : '')}
							/>
							<span class="text-base">{source.label}</span>
						</label>
					{/each}
				</div>
			</div>

			<div class="h-px bg-border"></div>
		{/if}

		<!-- Date -->
		<div>
			<h3 class="mb-3 text-sm font-medium text-muted-foreground">Time Period</h3>
			<div class="space-y-2">
				{#each Object.entries(DATE_PRESET_LABELS) as [value, label] (value)}
					<label class="flex items-center gap-3">
						<input
							type="radio"
							name="date-filter"
							class="h-5 w-5 accent-foreground"
							checked={activeDatePreset === value}
							onchange={() => onDatePresetChange(value as DatePresetId)}
						/>
						<span class="text-base">{label}</span>
					</label>
				{/each}
			</div>
		</div>
	</div>
</FilterSortSheet>

{#if isBrandOrg}
	<OrderImportModal
		bind:open={showImport}
		onOpenChange={(v) => (showImport = v)}
		onImported={(result) => {
			const created = result.created;
			const skipped = result.skipped.length;
			const errors = result.errors.length;
			if (created > 0) invalidateAll();
			if (created === 0 && (skipped > 0 || errors > 0)) {
				toast.error(
					`No orders created. ${skipped} skipped, ${errors} failed. Check that accounts and styles exist.`
				);
			} else if (skipped > 0 || errors > 0) {
				toast.success(
					`${created} order${created === 1 ? '' : 's'} imported · ${skipped + errors} skipped`
				);
			} else {
				toast.success(`${created} order${created === 1 ? '' : 's'} imported`);
			}
		}}
	/>
{/if}
