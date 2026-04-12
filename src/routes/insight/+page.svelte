<script lang="ts">
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '$lib/components/ui/tooltip/index.js';
	import { downloadCSV } from '$lib/utils/csv.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { conversation } from '$lib/stores/conversation.js';
	import ActionFeed from '$lib/components/insights/ActionFeed.svelte';
	import Scoreboard from '$lib/components/insights/Scoreboard.svelte';

	let { data } = $props();
	const isAdmin = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	// Action feed data
	let insightActions = $state(data.insightActions ?? []);
	const scoreboard = $derived(data.scoreboard ?? []);
	let isRefreshing = $state(false);
	let deepDiveOpen = $state(false);

	async function handleRefresh() {
		isRefreshing = true;
		try {
			const res = await fetch('/api/insight/refresh', { method: 'POST' });
			if (res.ok) {
				// Reload page data
				const url = new URL($page.url);
				goto(url.toString(), { invalidateAll: true });
			}
		} finally {
			isRefreshing = false;
		}
	}

	async function handleDismiss(id: string) {
		// Optimistically remove from list
		insightActions = insightActions.filter((i: { id: string }) => i.id !== id);
		await fetch('/api/insight/dismiss', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
	}

	async function handleAct(id: string) {
		await fetch('/api/insight/act', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id })
		});
	}

	const seasonSummary = $derived(data.seasonSummary ?? []);
	const yearlySummary = $derived(data.yearlySummary ?? []);
	const selectedYear = $derived(data.selectedYear);
	const availableYears = $derived(data.availableYears ?? []);

	// Delivery grid data
	const deliveries = $derived(data.deliveries ?? []);
	const gridAccounts = $derived(data.gridAccounts ?? []);
	const gridData = $derived(data.gridData ?? []);

	// Shows tab data
	const showDates = $derived(data.showDates ?? []);
	const selectedShowDateId = $derived(data.selectedShowDateId ?? null);
	const showVisits = $derived(data.showVisits ?? []);
	const showOrders = $derived(data.showOrders ?? []);
	const showDeliveries = $derived(data.showDeliveries ?? []);
	const showSummary = $derived(data.showSummary ?? []) as { showDateId: string; appointments: number; orders: number; revenue: number }[];
	const showAppointments = $derived(data.showAppointments ?? []) as any[];

	// Commission tab data
	const commissionOrders = $derived(data.commissionOrders ?? []);
	const commissionOverrides = $derived(data.commissionOverrides ?? []);
	const commissionBrands = $derived(data.commissionBrands ?? []);
	const commYearParam = $derived(data.commYearParam ?? null);
	const commBrandParam = $derived(data.commBrandParam ?? null);
	const commMonthParam = $derived(data.commMonthParam ?? null);

	// Style velocity data
	const styleVelocity = $derived(data.styleVelocity ?? []);
	const velocityWindow = $derived(data.velocityWindow ?? 14);

	// Tab state
	let activeTab = $state<'shows' | 'deliveries' | 'commissions' | 'velocity'>('deliveries');
	let sortBy = $state<'az' | 'za' | 'high' | 'low'>('az');
	let filterState = $state('');

	// Notes tooltip state
	let hoveredNoteId = $state<string | null>(null);

	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	// ── Shows tab computed ──────────────────────────────────────────────

	function showDateLabel(sd: { year: number; month: number; city: string | null; state: string | null; shows: { name: string } | null }): string {
		const showName = sd.shows?.name ?? 'Unknown Show';
		const mon = monthNames[sd.month - 1] ?? '';
		const loc = [sd.city, sd.state].filter(Boolean).join(' ');
		return `${showName} — ${mon} ${sd.year}${loc ? ', ' + loc : ''}`;
	}

	// Build order lookup: "accountId|deliveryId" -> total
	const showOrderLookup = $derived.by(() => {
		const map = new Map<string, number>();
		for (const o of showOrders) {
			const key = `${o.account_id}|${o.delivery_id ?? '__immediate__'}`;
			map.set(key, (map.get(key) ?? 0) + (o.total_amount ?? 0));
		}
		return map;
	});

	// Determine which delivery columns to show (only those with at least one order)
	const activeDeliveryColumns = $derived.by(() => {
		const deliveryIdsWithOrders = new Set<string>();
		for (const o of showOrders) {
			deliveryIdsWithOrders.add(o.delivery_id ?? '__immediate__');
		}

		const cols: { id: string; label: string }[] = [];
		for (const d of showDeliveries) {
			if (deliveryIdsWithOrders.has(d.id)) {
				cols.push({ id: d.id, label: `${d.delivery_month}/${d.delivery_day}` });
			}
		}
		if (deliveryIdsWithOrders.has('__immediate__')) {
			cols.push({ id: '__immediate__', label: 'Immediate' });
		}
		return cols;
	});

	function getShowOrderValue(accountId: string, deliveryId: string): number | null {
		return showOrderLookup.get(`${accountId}|${deliveryId}`) ?? null;
	}

	// Status badge styling
	function statusColor(status: string): string {
		switch (status) {
			case 'wrote': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
			case 'passed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
			case 'notes_out': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
			case 'scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
			default: return 'bg-muted text-muted-foreground';
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'wrote': return 'Wrote';
			case 'passed': return 'Passed';
			case 'notes_out': return 'Notes Out';
			case 'scheduled': return 'Scheduled';
			default: return status;
		}
	}

	async function handleShowDateChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const val = target.value;
		const url = new URL($page.url);
		if (val) {
			url.searchParams.set('show_date', val);
		} else {
			url.searchParams.delete('show_date');
		}
		goto(url.toString(), { replaceState: true });
	}

	// ── Delivery tab (existing) ─────────────────────────────────────────

	const maxSeasonRevenue = $derived(
		seasonSummary.length > 0
			? Math.max(...seasonSummary.map((s: { revenue: number }) => s.revenue))
			: 1
	);

	const maxYearlyRevenue = $derived(
		yearlySummary.length > 0
			? Math.max(...yearlySummary.map((y: { revenue: number }) => y.revenue))
			: 1
	);

	const totalSeasonRevenue = $derived(
		seasonSummary.reduce((sum: number, s: { revenue: number }) => sum + s.revenue, 0)
	);

	const totalSeasonOrders = $derived(
		seasonSummary.reduce((sum: number, s: { order_count: number }) => sum + s.order_count, 0)
	);

	// Build a lookup map for grid data: "accountId|deliveryId|year" -> total
	const gridLookup = $derived.by(() => {
		const map = new Map<string, number>();
		for (const row of gridData) {
			map.set(`${row.account_id}|${row.delivery_id}|${row.order_year}`, row.total);
		}
		return map;
	});

	// Build column groups for the header spanning row
	const columnGroups = $derived.by(() => {
		const groups: { label: string; colspan: number }[] = [];
		let currentLabel = '';
		let currentCount = 0;
		for (const d of deliveries) {
			const label = d.delivery_month >= 1 && d.delivery_month <= 6
				? 'Spring / Summer'
				: 'Fall / Holiday';
			if (label === currentLabel) {
				currentCount++;
			} else {
				if (currentLabel) {
					groups.push({ label: currentLabel, colspan: currentCount });
				}
				currentLabel = label;
				currentCount = 1;
			}
		}
		if (currentLabel) {
			groups.push({ label: currentLabel, colspan: currentCount });
		}
		return groups;
	});

	// Unique states for filter
	const availableStates = $derived.by(() => {
		const states = new Set<string>();
		for (const a of gridAccounts) {
			if (a.state) states.add(a.state);
		}
		return [...states].sort();
	});

	// Account total for the selected year (used for high/low sort)
	function getAccountTotal(accountId: string, year: number): number {
		let total = 0;
		for (const row of gridData) {
			if (row.account_id === accountId && row.order_year === year) {
				total += row.total;
			}
		}
		return total;
	}

	const activeGridAccounts = $derived.by(() => {
		let filtered = [...gridAccounts];

		// Filter by state
		if (filterState) {
			filtered = filtered.filter((a) => a.state === filterState);
		}

		// Sort
		const year = selectedYear ?? new Date().getFullYear();
		switch (sortBy) {
			case 'az':
				filtered.sort((a, b) => a.business_name.localeCompare(b.business_name));
				break;
			case 'za':
				filtered.sort((a, b) => b.business_name.localeCompare(a.business_name));
				break;
			case 'high':
				filtered.sort((a, b) => getAccountTotal(b.id, year) - getAccountTotal(a.id, year));
				break;
			case 'low':
				filtered.sort((a, b) => getAccountTotal(a.id, year) - getAccountTotal(b.id, year));
				break;
		}

		return filtered;
	});

	function exportDeliveryGrid() {
		const year = selectedYear ?? new Date().getFullYear();
		const rows = activeGridAccounts.map((account) => {
			const row: Record<string, string> = {
				account: account.business_name,
				city: account.city ?? '',
				state: account.state ?? ''
			};
			for (const delivery of deliveries) {
				const label = `${delivery.delivery_month}/${delivery.delivery_day}`;
				const current = getCellValue(account.id, delivery.id, year);
				const prior = getCellValue(account.id, delivery.id, year - 1);
				row[`${label} (${year})`] = current !== null ? current.toFixed(2) : '';
				row[`${label} (${year - 1})`] = prior !== null ? prior.toFixed(2) : '';
			}
			return row;
		});
		downloadCSV(rows, `delivery-grid-${year}.csv`);
	}

	function formatCurrency(value: number): string {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
	}

	function fmtRate(value: number): string {
		return Number.isInteger(value) ? `${value}%` : `${parseFloat(value.toFixed(2))}%`;
	}

	function formatCurrencyShort(value: number): string {
		if (value >= 1000) {
			return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
		}
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
	}

	function formatNumber(value: number): string {
		return new Intl.NumberFormat('en-US').format(value);
	}

	function handleYearChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const year = target.value;
		const url = new URL($page.url);
		if (year) {
			url.searchParams.set('year', year);
		} else {
			url.searchParams.delete('year');
		}
		goto(url.toString(), { replaceState: true });
	}

	function deliveryLabel(month: number, day: number): string {
		return `${month}/${day}`;
	}

	function getCellValue(accountId: string, deliveryId: string, year: number): number | null {
		return gridLookup.get(`${accountId}|${deliveryId}|${year}`) ?? null;
	}

	// ── Commissions tab computed ────────────────────────────────────────

	// Build override lookup: "brandId|accountId" -> rate
	const overrideLookup = $derived.by(() => {
		const map = new Map<string, number>();
		for (const ov of commissionOverrides) {
			map.set(`${ov.brand_id}|${ov.account_id}`, ov.rate);
		}
		return map;
	});

	function getEffectiveRate(brandId: string, accountId: string, brandRate: number): number {
		return overrideLookup.get(`${brandId}|${accountId}`) ?? brandRate;
	}

	// Commission rows with computed commission amount
	const commissionRows = $derived.by(() => {
		return commissionOrders.map((o: typeof commissionOrders[number]) => {
			const brandRate = o.brands?.commission_rate ?? 0;
			const effectiveRate = getEffectiveRate(o.brand_id, o.account_id, brandRate);
			const commissionAmount = (o.shipped_amount ?? o.total_amount ?? 0) * effectiveRate / 100;
			return { ...o, effectiveRate, commissionAmount };
		});
	});

	// Summary stats
	const totalCommissions = $derived(
		commissionRows.reduce((sum: number, r: { commissionAmount: number }) => sum + r.commissionAmount, 0)
	);

	const totalShipped = $derived(
		commissionRows.reduce((sum: number, r: any) => sum + (r.shipped_amount ?? r.total_amount ?? 0), 0)
	);

	const avgCommissionRate = $derived(
		totalShipped > 0 ? (totalCommissions / totalShipped) * 100 : 0
	);

	// Monthly summary grouped by month of shipped_at
	const commissionMonthly = $derived.by(() => {
		const map = new Map<string, { month: string; sortKey: string; shippedTotal: number; commissionTotal: number }>();
		for (const r of commissionRows) {
			if (!r.shipped_at) continue;
			const date = new Date(r.shipped_at);
			const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
			const label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
			const existing = map.get(key);
			if (existing) {
				existing.shippedTotal += r.shipped_amount ?? r.total_amount ?? 0;
				existing.commissionTotal += r.commissionAmount;
			} else {
				map.set(key, {
					month: label,
					sortKey: key,
					shippedTotal: r.shipped_amount ?? r.total_amount ?? 0,
					commissionTotal: r.commissionAmount
				});
			}
		}
		return [...map.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
	});

	// Available years for commission filter (derive from order years already loaded)
	const commAvailableYears = $derived(availableYears);

	function handleCommFilterChange(param: string, value: string) {
		const url = new URL($page.url);
		if (value) {
			url.searchParams.set(param, value);
		} else {
			url.searchParams.delete(param);
		}
		goto(url.toString(), { replaceState: true });
	}

	function exportCommissionCSV() {
		const rows = commissionRows.map((r: typeof commissionRows[number]) => ({
			'Order #': r.order_number,
			'Account': r.accounts?.business_name ?? '',
			'Brand': r.brands?.name ?? '',
			'Ordered': r.total_amount != null ? r.total_amount.toFixed(2) : '',
			'Shipped': (r.shipped_amount ?? r.total_amount ?? 0).toFixed(2),
			'Rate (%)': r.effectiveRate.toFixed(2),
			'Commission': r.commissionAmount.toFixed(2),
			'Shipped Date': r.shipped_at ?? ''
		}));
		const yearSuffix = commYearParam ?? 'all';
		downloadCSV(rows, `commissions-${yearSuffix}.csv`);
	}

	const seasonBarColors = [
		'bg-emerald-500',
		'bg-amber-500',
		'bg-orange-500',
		'bg-red-500',
		'bg-sky-500',
		'bg-violet-500'
	];

	// Setup checklist
	const firstName = data.user?.display_name?.split(' ')[0] ?? 'there';

	function handleShortcut(prompt: string) {
		const input = document.getElementById('ai-dock-input') as HTMLInputElement;
		if (input) {
			input.focus();
		}
		conversation.sendMessage(prompt);
	}
</script>

{#if data.setupComplete === false}
{@const cl = data.setupChecklist}
{@const done = [cl.hasBrands, cl.hasProducts, cl.hasAccounts, cl.hasOrders].filter(Boolean).length}
<div class="space-y-8">
	<div>
		<p class="text-sm text-muted-foreground">
			<span class="font-mono">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
		</p>
		<h1 class="mt-1 text-4xl">Welcome to Threadline, {firstName}.</h1>
		<p class="mt-3 text-base text-muted-foreground">Your AI-powered wholesale management platform. Complete the setup steps to unlock your full dashboard.</p>
	</div>

	<div class="grid grid-cols-[1fr_360px] gap-10">
		<!-- Left: Features & quick start -->
		<div class="space-y-8">
			<!-- What you can do -->
			<div>
			<h2 class="text-lg font-semibold">What you'll be able to do</h2>
			<div class="mt-4 grid gap-3 sm:grid-cols-2">
				<div class="flex items-start gap-3 rounded-lg border p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium">AI-powered insights</p>
						<p class="mt-0.5 text-sm text-muted-foreground">Ask about revenue, commissions, and trends in plain English.</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-lg border p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium">Order management</p>
						<p class="mt-0.5 text-sm text-muted-foreground">Create, track, and manage wholesale orders end-to-end.</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-lg border p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium">Email drafting</p>
						<p class="mt-0.5 text-sm text-muted-foreground">AI writes professional emails, you review and send via Gmail.</p>
					</div>
				</div>
				<div class="flex items-start gap-3 rounded-lg border p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium">Account health</p>
						<p class="mt-0.5 text-sm text-muted-foreground">Track at-risk accounts and get follow-up recommendations.</p>
					</div>
				</div>
			</div>
		</div>

		<!-- Try asking -->
		<div>
			<h2 class="text-lg font-semibold">Try asking</h2>
			<p class="mt-1 text-sm text-muted-foreground">Use the AI assistant at the bottom of the screen anytime.</p>
			<div class="mt-4 flex flex-wrap gap-2">
				<button
					class="rounded-full border px-4 py-2 text-sm transition-colors hover:bg-accent active:scale-[0.98]"
					onclick={() => handleShortcut('Help me draft a professional email. Who should I write to and what\'s the context?')}
				>Draft an email</button>
				<button
					class="rounded-full border px-4 py-2 text-sm transition-colors hover:bg-accent active:scale-[0.98]"
					onclick={() => handleShortcut('What can you help me with?')}
				>What can you do?</button>
				<button
					class="rounded-full border px-4 py-2 text-sm transition-colors hover:bg-accent active:scale-[0.98]"
					onclick={() => handleShortcut('Walk me through setting up my first brand and product catalog.')}
				>Help me get started</button>
			</div>
		</div>
	</div>

	<!-- Right: Setup checklist -->
	<div class="space-y-6 self-start sticky top-6">
		<div>
			<h2 class="text-lg font-semibold">Get started</h2>
			<p class="mt-1 text-sm text-muted-foreground">{done} of 4 complete</p>
			<div class="mt-3 h-1.5 w-full rounded-full bg-muted">
				<div class="h-1.5 rounded-full bg-foreground transition-all duration-500" style="width: {(done / 4) * 100}%"></div>
			</div>
		</div>

		<div class="space-y-2">
			<!-- 1. Add a brand -->
			<div class="flex items-center gap-3 rounded-lg border p-4 {cl.hasBrands ? 'opacity-60' : ''}">
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {cl.hasBrands ? 'bg-foreground' : 'border-2'}">
					{#if cl.hasBrands}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold {cl.hasBrands ? 'line-through' : ''}">Add a brand</p>
					<p class="mt-0.5 text-sm text-muted-foreground">The fashion labels you represent.</p>
				</div>
				{#if !cl.hasBrands}
					<a href="/brands/new" class="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors">Add</a>
				{/if}
			</div>

			<!-- 2. Add products -->
			<div class="flex items-center gap-3 rounded-lg border p-4 {cl.hasProducts ? 'opacity-60' : ''}">
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {cl.hasProducts ? 'bg-foreground' : 'border-2'}">
					{#if cl.hasProducts}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold {cl.hasProducts ? 'line-through' : ''}">Add products</p>
					<p class="mt-0.5 text-sm text-muted-foreground">Build your product catalog.</p>
				</div>
				{#if !cl.hasProducts && cl.hasBrands && cl.firstBrandId}
					<a href="/brands/{cl.firstBrandId}/products/new" class="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors">Add</a>
				{:else if !cl.hasProducts && !cl.hasBrands}
					<span class="shrink-0 text-sm text-muted-foreground">Brand first</span>
				{/if}
			</div>

			<!-- 3. Create an account -->
			<div class="flex items-center gap-3 rounded-lg border p-4 {cl.hasAccounts ? 'opacity-60' : ''}">
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {cl.hasAccounts ? 'bg-foreground' : 'border-2'}">
					{#if cl.hasAccounts}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold {cl.hasAccounts ? 'line-through' : ''}">Create an account</p>
					<p class="mt-0.5 text-sm text-muted-foreground">Retail buyers and stores you sell to.</p>
				</div>
				{#if !cl.hasAccounts}
					<a href="/accounts/new" class="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors">Add</a>
				{/if}
			</div>

			<!-- 4. Create an order -->
			<div class="flex items-center gap-3 rounded-lg border p-4 {cl.hasOrders ? 'opacity-60' : ''}">
				<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full {cl.hasOrders ? 'bg-foreground' : 'border-2'}">
					{#if cl.hasOrders}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-semibold {cl.hasOrders ? 'line-through' : ''}">Create your first order</p>
					<p class="mt-0.5 text-sm text-muted-foreground">Tie it all together.</p>
				</div>
				{#if !cl.hasOrders && cl.hasBrands && cl.hasAccounts}
					<a href="/orders/new" class="shrink-0 rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors">Create</a>
				{:else if !cl.hasOrders}
					<span class="shrink-0 text-sm text-muted-foreground">Brand & account first</span>
				{/if}
			</div>
		</div>
	</div>
	</div>
</div>
{:else}
<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-3xl">Insights</h1>
			<p class="text-sm font-mono text-muted-foreground">Action items and business intelligence</p>
		</div>
	</div>

	<!-- Action Feed + Scoreboard layout -->
	<div class="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-6">
		<ActionFeed
			insights={insightActions}
			{isRefreshing}
			onRefresh={handleRefresh}
			onDismiss={handleDismiss}
			onAct={handleAct}
		/>
		<div class="hidden lg:block">
			<Scoreboard kpis={scoreboard} />
		</div>
	</div>

	<!-- Deep Dive: Existing analytics tabs -->
	<div class="border-t pt-4">
		<button
			class="flex items-center gap-2 text-sm font-medium font-mono text-muted-foreground hover:text-foreground transition-colors"
			onclick={() => (deepDiveOpen = !deepDiveOpen)}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				fill="none"
				viewBox="0 0 24 24"
				stroke-width="1.5"
				stroke="currentColor"
				class="w-4 h-4 transition-transform {deepDiveOpen ? 'rotate-90' : ''}"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
			</svg>
			Deep Dive — Delivery Grid, Shows, Commissions, Style Velocity
		</button>
	</div>

	{#if deepDiveOpen}
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div></div>

		{#if activeTab === 'deliveries' && availableYears.length > 0}
			<div class="flex items-center gap-2">
				<label for="year-select" class="text-sm font-medium text-muted-foreground">Year</label>
				<select
					id="year-select"
					class="cursor-pointer rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
					value={selectedYear ?? ''}
					onchange={handleYearChange}
				>
					{#each availableYears as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
			</div>
		{/if}
		{#if activeTab === 'velocity'}
			<div class="flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
				{#each [7, 14, 30] as days}
					<button
						class="cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors {velocityWindow === days ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
						onclick={() => {
							const url = new URL($page.url);
							url.searchParams.set('velocity_window', String(days));
							goto(url.toString(), { replaceState: true });
						}}
					>
						{days}d
					</button>
				{/each}
			</div>
		{/if}
		{#if activeTab === 'commissions'}
			<div class="flex flex-wrap items-center gap-2">
				<select
					class="cursor-pointer rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
					value={commYearParam ?? ''}
					onchange={(e) => handleCommFilterChange('comm_year', (e.target as HTMLSelectElement).value)}
				>
					<option value="">All Years</option>
					{#each commAvailableYears as year}
						<option value={year}>{year}</option>
					{/each}
				</select>
				<select
					class="cursor-pointer rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
					value={commBrandParam ?? ''}
					onchange={(e) => handleCommFilterChange('comm_brand', (e.target as HTMLSelectElement).value)}
				>
					<option value="">All Brands</option>
					{#each commissionBrands as brand}
						<option value={brand.id}>{brand.name}</option>
					{/each}
				</select>
				<select
					class="cursor-pointer rounded-md border bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
					value={commMonthParam ?? ''}
					onchange={(e) => handleCommFilterChange('comm_month', (e.target as HTMLSelectElement).value)}
				>
					<option value="">All Months</option>
					{#each monthNames as name, i}
						<option value={i + 1}>{name}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	<!-- Tabs -->
	<div class="flex gap-1 rounded-lg border bg-muted/40 p-1">
		<button
			class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'deliveries' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'deliveries'}
		>
			Deliveries
		</button>
		<button
			class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'shows' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'shows'}
		>
			Shows
		</button>
		<button
			class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'commissions' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'commissions'}
		>
			Commissions
		</button>
		<button
			class="cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors {activeTab === 'velocity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
			onclick={() => activeTab = 'velocity'}
		>
			Style Velocity
		</button>
	</div>

	{#if activeTab === 'shows'}
		<!-- Show date selector -->
		<div class="flex flex-wrap items-center gap-3">
			<select
				class="cursor-pointer h-9 min-w-[300px] rounded-lg border border-input bg-background text-foreground px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
				value={selectedShowDateId ?? ''}
				onchange={handleShowDateChange}
			>
				<option value="">All Shows</option>
				{#each showDates as sd}
					<option value={sd.id}>{showDateLabel(sd)}</option>
				{/each}
			</select>
		</div>

		{#if !selectedShowDateId}
			<!-- All shows summary -->
			{#if showDates.length === 0}
				<div class="rounded-none p-12 text-center">
					<svg xmlns="http://www.w3.org/2000/svg" class="mx-auto h-16 w-16 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="0.4">
						<path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
					</svg>
					<p class="mt-4 text-lg font-semibold">Your shows live here</p>
					<p class="mt-2 text-sm text-muted-foreground">Add shows in Organization settings to start tracking market events</p>
				</div>
			{:else}
				<div class="overflow-x-auto rounded-none border">
					<table class="w-full">
						<thead>
							<tr class="border-b bg-muted/40">
								<th class="px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Show</th>
								<th class="px-4 py-2.5 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Appointments</th>
								<th class="px-4 py-2.5 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Orders</th>
								<th class="px-4 py-2.5 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Revenue</th>
							</tr>
						</thead>
						<tbody>
							{#each showDates as sd}
								{@const summary = showSummary.find((s) => s.showDateId === sd.id)}
								<tr
									class="border-b last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
									onclick={() => {
										const url = new URL($page.url);
										url.searchParams.set('show_date', sd.id);
										goto(url.toString(), { replaceState: true });
									}}
								>
									<td class="px-4 py-3">
										<span class="text-sm font-medium">{sd.shows?.name ?? 'Unknown'}</span>
										<p class="mt-0.5 text-xs text-muted-foreground">
											<span class="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium mr-1">{monthNames[sd.month - 1]} {sd.year}</span>{[sd.city, sd.state].filter(Boolean).join(', ')}
										</p>
									</td>
									<td class="px-4 py-3 text-sm text-right">{summary?.appointments ?? 0}</td>
									<td class="px-4 py-3 text-sm text-right">{summary?.orders ?? 0}</td>
									<td class="px-4 py-3 text-sm text-right font-mono">{formatCurrencyShort(summary?.revenue ?? 0)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else}
			<!-- Show visits grid -->
			{@const freeformAppts = showAppointments.filter((a) => !a.account_id && a.freeform_account_name)}
			{#if showVisits.length === 0 && freeformAppts.length === 0}
				<p class="text-sm text-muted-foreground">No data for this show yet.</p>
			{:else}
				<div class="overflow-x-auto rounded-none border">
					<table class="w-full">
						<thead>
							<tr class="border-b bg-muted/40">
								<th class="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
									Account
								</th>
								<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
									Buyer
								</th>
								{#if isAdmin}
									<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
										Rep
									</th>
								{/if}
								<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
									Status
								</th>
								{#each activeDeliveryColumns as col}
									<th class="border-l border-border/50 px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
										{col.label}
									</th>
								{/each}
								<th class="px-3 py-2 text-center text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
									Notes
								</th>
							</tr>
						</thead>
						<tbody>
							{#each showVisits as visit}
								{@const account = visit.accounts}
								{@const repName = (visit as any).profiles?.display_name ?? null}
								<tr class="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
									<!-- Account -->
									<td class="sticky left-0 z-10 bg-background px-4 py-3 min-w-[200px]">
										<div class="flex items-center gap-2">
											<div>
												<div class="text-sm font-semibold">{account?.business_name ?? '—'}</div>
												{#if account?.city || account?.state}
													<div class="text-sm text-muted-foreground">
														{[account?.city, account?.state].filter(Boolean).join(', ')}
													</div>
												{/if}
											</div>
											{#if visit.is_new_account}
												<span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
													New
												</span>
											{/if}
										</div>
									</td>

									<!-- Buyer -->
									<td class="px-3 py-3 text-sm whitespace-nowrap">
										{[account?.contact_first_name, account?.contact_last_name].filter(Boolean).join(' ') || '—'}
									</td>

									<!-- Rep (admin only) -->
									{#if isAdmin}
										<td class="px-3 py-3">
											{#if repName}
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger>
															<div class="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
																{repName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
															</div>
														</TooltipTrigger>
														<TooltipContent>{repName}</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											{/if}
										</td>
									{/if}

									<!-- Status -->
									<td class="px-3 py-3">
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusColor(visit.status)}">
											{statusLabel(visit.status)}
										</span>
									</td>

									<!-- Delivery columns -->
									{#each activeDeliveryColumns as col}
										{@const val = getShowOrderValue(visit.account_id, col.id)}
										<td class="border-l border-border/50 px-3 py-3 text-right whitespace-nowrap">
											{#if val !== null}
												<div class="text-sm font-mono">{formatCurrencyShort(val)}</div>
											{:else}
												<div class="text-sm text-muted-foreground/40">&mdash;</div>
											{/if}
										</td>
									{/each}

									<!-- Notes -->
									<td class="px-3 py-3 text-center">
										{#if visit.notes}
											<div class="relative inline-block">
												<button
													type="button"
													class="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
													title={visit.notes}
													onmouseenter={() => hoveredNoteId = visit.id}
													onmouseleave={() => hoveredNoteId = null}
												>
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
														<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path>
														<path d="M14 2v6h6"></path>
														<line x1="16" y1="13" x2="8" y2="13"></line>
														<line x1="16" y1="17" x2="8" y2="17"></line>
														<line x1="10" y1="9" x2="8" y2="9"></line>
													</svg>
												</button>
												{#if hoveredNoteId === visit.id}
													<div class="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border bg-popover p-3 text-left text-sm text-popover-foreground shadow-md">
														{visit.notes}
													</div>
												{/if}
											</div>
										{:else}
											<span class="text-sm text-muted-foreground/40">--</span>
										{/if}
									</td>
								</tr>
							{/each}
							<!-- Freeform appointments (no linked account) -->
							{#each freeformAppts as appt}
								{@const freeRepName = appt.profiles?.display_name ?? null}
								<tr class="border-b last:border-b-0 hover:bg-muted/20 transition-colors bg-muted/5">
									<td class="sticky left-0 z-10 bg-background px-4 py-3 min-w-[200px]">
										<div class="flex items-center gap-2">
											<div>
												<div class="text-sm font-semibold">{appt.freeform_account_name}</div>
												<div class="text-xs text-muted-foreground italic">New</div>
											</div>
										</div>
									</td>
									<td class="px-3 py-3 text-sm whitespace-nowrap">
										{[appt.freeform_contact_name].filter(Boolean).join(' ') || '—'}
									</td>
									{#if isAdmin}
										<td class="px-3 py-3">
											{#if freeRepName}
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger>
															<div class="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
																{freeRepName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)}
															</div>
														</TooltipTrigger>
														<TooltipContent>{freeRepName}</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											{/if}
										</td>
									{/if}
									<td class="px-3 py-3">
										<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusColor(appt.status)}">
											{statusLabel(appt.status)}
										</span>
									</td>
									{#each activeDeliveryColumns as _col}
										<td class="border-l border-border/50 px-3 py-3 text-right">
											<div class="text-sm text-muted-foreground/40">&mdash;</div>
										</td>
									{/each}
									<td class="px-3 py-3 text-center">
										{#if appt.notes}
											<div class="relative inline-block">
												<button
													type="button"
													class="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
													title={appt.notes}
													onmouseenter={() => hoveredNoteId = appt.id}
													onmouseleave={() => hoveredNoteId = null}
												>
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
														<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path>
														<path d="M14 2v6h6"></path>
														<line x1="16" y1="13" x2="8" y2="13"></line>
														<line x1="16" y1="17" x2="8" y2="17"></line>
														<line x1="10" y1="9" x2="8" y2="9"></line>
													</svg>
												</button>
												{#if hoveredNoteId === appt.id}
													<div class="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border bg-popover p-3 text-left text-sm text-popover-foreground shadow-md">
														{appt.notes}
													</div>
												{/if}
											</div>
										{:else}
											<span class="text-sm text-muted-foreground/40">--</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	{:else if activeTab === 'commissions'}
		<!-- Summary cards -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Total Commissions Earned</CardDescription>
					<CardTitle class="text-2xl">{formatCurrency(totalCommissions)}</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Total Shipped</CardDescription>
					<CardTitle class="text-2xl">{formatCurrency(totalShipped)}</CardTitle>
				</CardHeader>
			</Card>
			<Card>
				<CardHeader class="pb-2">
					<CardDescription>Avg Rate</CardDescription>
					<CardTitle class="text-2xl">{fmtRate(avgCommissionRate)}</CardTitle>
				</CardHeader>
			</Card>
		</div>

		<!-- Export button -->
		<div class="flex justify-end">
			<Button variant="outline" size="sm" onclick={exportCommissionCSV}>Export CSV</Button>
		</div>

		<!-- Detail table -->
		{#if commissionRows.length === 0}
			<Card>
				<CardHeader>
					<CardTitle>No Commission Data</CardTitle>
					<CardDescription>
						No orders with shipped amounts found for the selected filters.
					</CardDescription>
				</CardHeader>
			</Card>
		{:else}
			<div class="overflow-x-auto rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Order #</th>
							<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Account</th>
							<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Brand</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Ordered</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Shipped</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Rate</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Commission</th>
						</tr>
					</thead>
					<tbody>
						{#each commissionRows as row}
							<tr class="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
								<td class="px-4 py-3 text-sm font-medium">{row.order_number}</td>
								<td class="px-3 py-3 text-sm">{row.accounts?.business_name ?? '—'}</td>
								<td class="px-3 py-3 text-sm">{row.brands?.name ?? '—'}</td>
								<td class="px-3 py-3 text-sm text-right font-mono">{formatCurrency(row.total_amount)}</td>
								<td class="px-3 py-3 text-sm text-right font-mono">{formatCurrency(row.shipped_amount ?? row.total_amount)}</td>
								<td class="px-3 py-3 text-sm text-right font-mono">{fmtRate(row.effectiveRate)}</td>
								<td class="px-3 py-3 text-sm text-right font-mono">{formatCurrency(row.commissionAmount)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Monthly summary -->
			{#if commissionMonthly.length > 0}
				<h3 class="text-lg font-semibold">Monthly Summary</h3>
				<div class="overflow-x-auto rounded-none border">
					<table class="w-full">
						<thead>
							<tr class="border-b bg-muted/40">
								<th class="px-4 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Month</th>
								<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Shipped Total</th>
								<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Commission Total</th>
							</tr>
						</thead>
						<tbody>
							{#each commissionMonthly as row}
								<tr class="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
									<td class="px-4 py-3 text-sm font-medium">{row.month}</td>
									<td class="px-3 py-3 text-sm text-right font-mono">{formatCurrency(row.shippedTotal)}</td>
									<td class="px-3 py-3 text-sm text-right font-mono">{formatCurrency(row.commissionTotal)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	{:else if activeTab === 'velocity'}
		{@const maxAccounts = styleVelocity.length > 0 ? Math.max(...styleVelocity.map((s) => s.account_count)) : 1}
		{#if styleVelocity.length === 0}
			<Card>
				<CardHeader>
					<CardTitle>No Trending Styles</CardTitle>
					<CardDescription>
						No styles have been ordered by multiple accounts in the last {velocityWindow} days.
					</CardDescription>
				</CardHeader>
			</Card>
		{:else}
			<div class="overflow-x-auto rounded-none border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/40">
							<th class="px-4 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Style</th>
							<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Brand</th>
							<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Accounts</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Units</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Revenue</th>
							<th class="px-3 py-2 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Avg/Acct</th>
							<th class="px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Top Colors</th>
						</tr>
					</thead>
					<tbody>
						{#each styleVelocity as style}
							<tr class="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
								<td class="px-4 py-3">
									{#if style.product_name && style.product_name !== style.style_number}
										<div class="text-sm font-semibold">{style.product_name}</div>
									{/if}
									<div class="text-xs text-muted-foreground font-mono">{style.style_number}</div>
								</td>
								<td class="px-3 py-3 text-sm">{style.brand_name}</td>
								<td class="px-3 py-3">
									<div class="flex items-center gap-2">
										<div class="flex-1 min-w-[60px] max-w-[120px]">
											<div
												class="h-2 rounded-full bg-primary/25"
												style="width: {Math.round((style.account_count / maxAccounts) * 100)}%"
											>
												<div class="h-full rounded-full bg-primary" style="width: 100%"></div>
											</div>
										</div>
										<span class="text-sm font-semibold tabular-nums {style.account_count >= 10 ? 'text-emerald-600 dark:text-emerald-400' : ''}">
											{style.account_count}
										</span>
									</div>
								</td>
								<td class="px-3 py-3 text-sm text-right tabular-nums">{formatNumber(style.total_qty)}</td>
								<td class="px-3 py-3 text-sm text-right tabular-nums font-mono">{formatCurrencyShort(style.total_revenue)}</td>
								<td class="px-3 py-3 text-sm text-right tabular-nums">{style.avg_qty_per_account}</td>
								<td class="px-3 py-3">
									<div class="flex flex-wrap gap-1">
										{#each style.top_colors as color}
											<span class="inline-flex rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground">{color}</span>
										{/each}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{:else if activeTab === 'deliveries'}
		{#if deliveries.length === 0}
			<Card>
				<CardHeader>
					<CardTitle>No Delivery Dates</CardTitle>
					<CardDescription>
						Set up delivery dates in your season settings to see the account delivery grid here.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p class="text-sm text-muted-foreground">
						Once you have delivery dates configured and orders assigned to them, this grid will show revenue by account and delivery date.
					</p>
				</CardContent>
			</Card>
		{:else if activeGridAccounts.length === 0}
			<Card>
				<CardHeader>
					<CardTitle>No Accounts</CardTitle>
					<CardDescription>
						Add active accounts to see the delivery grid.
					</CardDescription>
				</CardHeader>
			</Card>
		{:else}
			<!-- Sort & Filter controls -->
			<div class="mb-4 flex flex-wrap items-center gap-3">
				<select
					bind:value={sortBy}
					class="cursor-pointer h-9 rounded-lg border border-input bg-background text-foreground px-3 text-sm shadow-sm"
				>
					<option value="az">Account A–Z</option>
					<option value="za">Account Z–A</option>
					<option value="high">Highest total</option>
					<option value="low">Lowest total</option>
				</select>
				<select
					bind:value={filterState}
					class="cursor-pointer h-9 rounded-lg border border-input bg-background text-foreground px-3 text-sm shadow-sm"
				>
					<option value="">All states</option>
					{#each availableStates as stateVal}
						<option value={stateVal}>{stateVal}</option>
					{/each}
				</select>
				{#if filterState}
					<button
						class="cursor-pointer text-sm text-muted-foreground hover:text-foreground"
						onclick={() => (filterState = '')}
					>
						Clear filter
					</button>
				{/if}
				<div class="ml-auto">
					<Button variant="outline" size="sm" onclick={exportDeliveryGrid}>Export CSV</Button>
				</div>
			</div>
			<div class="overflow-x-auto rounded-none border">
				<table class="w-full">
					<thead>
						<!-- Season group header row -->
						<tr class="border-b bg-muted/40">
							<th class="sticky left-0 z-10 bg-muted/40 px-4 py-2 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground" rowspan="2">
								Account
							</th>
							{#each columnGroups as group}
								<th
									class="border-l border-border/50 px-2 py-2 text-center text-[12px] font-medium uppercase tracking-wider text-muted-foreground"
									colspan={group.colspan}
								>
									{group.label}
								</th>
							{/each}
						</tr>
						<!-- Individual delivery date header row -->
						<tr class="border-b bg-muted/40">
							{#each deliveries as delivery}
								<th class="border-l border-border/50 px-3 py-2 text-right text-[12px] font-medium text-muted-foreground whitespace-nowrap">
									{deliveryLabel(delivery.delivery_month, delivery.delivery_day)}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each activeGridAccounts as account}
							<tr class="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
								<td class="sticky left-0 z-10 bg-background px-4 py-3 min-w-[200px]">
									<div class="flex items-center gap-2">
										<div>
											<div class="text-sm font-semibold">{account.business_name}</div>
											{#if account.city || account.state}
												<div class="text-sm text-muted-foreground">
													{[account.city, account.state].filter(Boolean).join(', ')}
												</div>
											{/if}
										</div>
										{#if account.notes}
											<div class="relative">
												<button
													class="cursor-pointer ml-1 rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
													title="View account notes"
													onmouseenter={() => hoveredNoteId = account.id}
													onmouseleave={() => hoveredNoteId = null}
													onfocus={() => hoveredNoteId = account.id}
													onblur={() => hoveredNoteId = null}
												>
													<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
														<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path>
														<path d="M14 2v6h6"></path>
														<line x1="16" y1="13" x2="8" y2="13"></line>
														<line x1="16" y1="17" x2="8" y2="17"></line>
														<line x1="10" y1="9" x2="8" y2="9"></line>
													</svg>
												</button>
												{#if hoveredNoteId === account.id}
													<div class="absolute left-0 top-full z-20 mt-1 w-64 rounded-lg border bg-popover p-3 text-sm text-popover-foreground shadow-md">
														{account.notes}
													</div>
												{/if}
											</div>
										{/if}
									</div>
								</td>
								{#each deliveries as delivery}
									{@const current = getCellValue(account.id, delivery.id, selectedYear ?? 0)}
									{@const prior = getCellValue(account.id, delivery.id, (selectedYear ?? 0) - 1)}
									<td class="border-l border-border/50 px-3 py-3 text-right whitespace-nowrap">
										{#if current !== null}
											<div class="text-sm font-mono">{formatCurrencyShort(current)}</div>
										{:else}
											<div class="text-sm text-muted-foreground/40">&mdash;</div>
										{/if}
										{#if prior !== null}
											<div class="text-xs font-mono text-muted-foreground">{formatCurrencyShort(prior)}</div>
										{:else}
											<div class="text-xs text-muted-foreground/30">&mdash;</div>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
	{/if}
</div>
{/if}
