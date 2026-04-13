<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { OrderType } from '$lib/types/database.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import type { CartLine, DeliveryChoice } from '$lib/server/orders/cart.js';

	type Brand = { id: string; name: string };
	type Season = { id: string; name: string; sort_order: number | null };
	type SeasonDeliveryRow = {
		id: string;
		season_id: string;
		label: string;
		delivery_month: number;
		delivery_day: number;
	};
	type Account = { id: string; business_name: string; city: string | null; state: string | null };
	type LocationRow = {
		id: string;
		account_id: string;
		label: string;
		city: string | null;
		state: string | null;
		is_default: boolean;
	};
	type ProductVariant = {
		id: string;
		color: string | null;
		size: string | null;
		price_override: number | null;
	};
	type ProductImage = { id: string; is_primary: boolean; sort_order: number | null };
	type Product = {
		id: string;
		brand_id: string;
		season_id: string | null;
		style_number: string;
		name: string;
		wholesale_price: number;
		category: string | null;
		product_variants: ProductVariant[];
		product_images: ProductImage[];
	};

	// A per-product picked entry; colors/sizes chosen via qty grid. Matches the prior wizard's pattern.
	type OrderItem = {
		product_id: string;
		brand_id: string;
		season_id: string;
		style_number: string;
		name: string;
		unit_price: number;
		image_id: string | null;
		available_colors: string[];
		available_sizes: string[];
		selected_color: string;
		size_qtys: Record<string, number>; // size -> qty (per selected color)
	};

	let { data } = $props();
	const accounts = $derived(data.accounts as Account[]);
	const allLocations = $derived(data.locations as LocationRow[]);
	const brands = $derived(data.brands as Brand[]);
	const seasons = $derived(data.seasons as Season[]);
	const deliveries = $derived(data.deliveries as SeasonDeliveryRow[]);
	const isBuyer = $derived(data.isBuyer === true);

	const monthAbbrev = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// ── Cart state ──────────────────────────────────────────────────────────
	const cart = $state<{
		type: OrderType | null;
		brandFilter: 'all' | string[];
		items: OrderItem[];
		groupMeta: Record<string, { delivery: DeliveryChoice | null; location_id: string | null }>;
		account_id: string | null;
		freeform_name: string | null;
		order_year: number;
		freeformDetails: {
			business_name: string;
			contact_first_name: string;
			contact_last_name: string;
			contact_email: string;
			phone: string;
			address_line1: string;
			city: string;
			state: string;
			zip: string;
		};
	}>({
		type: null,
		brandFilter: 'all',
		items: [],
		groupMeta: {},
		account_id: isBuyer && accounts.length === 1 ? accounts[0].id : null,
		freeform_name: null,
		order_year: new Date().getFullYear(),
		freeformDetails: {
			business_name: '',
			contact_first_name: '',
			contact_last_name: '',
			contact_email: '',
			phone: '',
			address_line1: '',
			city: '',
			state: '',
			zip: ''
		}
	});

	// Convert OrderItems → CartLines (one line per color/size with qty > 0) for submit
	function toCartLines(items: OrderItem[]): CartLine[] {
		const lines: CartLine[] = [];
		for (const it of items) {
			for (const size of it.available_sizes.length > 0 ? it.available_sizes : ['']) {
				const qty = it.size_qtys[size] ?? 0;
				if (qty <= 0) continue;
				lines.push({
					product_id: it.product_id,
					brand_id: it.brand_id,
					season_id: it.season_id,
					style_number: it.style_number,
					description: it.name,
					color: it.selected_color || null,
					size: size || null,
					qty,
					unit_price: it.unit_price
				});
			}
		}
		return lines;
	}

	function itemUnits(it: OrderItem): number {
		return Object.values(it.size_qtys).reduce((s, q) => s + (q || 0), 0);
	}
	function itemTotal(it: OrderItem): number {
		return itemUnits(it) * it.unit_price;
	}
	function itemIsSized(it: OrderItem): boolean {
		return itemUnits(it) > 0;
	}

	// Groups — derived from sized cart items; these are what the Delivery/Review steps show.
	function groupKey(brand_id: string, season_id: string): string {
		return `${brand_id}::${season_id}`;
	}
	const groups = $derived.by(() => {
		const map = new Map<
			string,
			{ brand_id: string; season_id: string; items: OrderItem[]; total: number; units: number }
		>();
		for (const it of cart.items) {
			if (!itemIsSized(it)) continue;
			const key = groupKey(it.brand_id, it.season_id);
			let g = map.get(key);
			if (!g) {
				g = { brand_id: it.brand_id, season_id: it.season_id, items: [], total: 0, units: 0 };
				map.set(key, g);
			}
			g.items.push(it);
			g.total += itemTotal(it);
			g.units += itemUnits(it);
		}
		return [...map.values()];
	});

	const account = $derived(accounts.find((a) => a.id === cart.account_id) ?? null);
	const accountLocations = $derived(
		cart.account_id ? allLocations.filter((l) => l.account_id === cart.account_id) : []
	);
	const isFreeform = $derived(cart.account_id === null && (cart.freeform_name?.trim().length ?? 0) > 0);
	const hasAccountChoice = $derived(cart.account_id !== null || isFreeform);
	const needsLocationStep = $derived(account !== null && accountLocations.length >= 2);
	const needsAccountDetailsStep = $derived(isFreeform);

	// ── Steps ───────────────────────────────────────────────────────────────
	const stepsAll = $derived.by(() => {
		const s = ['Type', 'Brand', 'Items', 'Delivery', 'Account'];
		if (needsLocationStep) s.push('Location');
		if (needsAccountDetailsStep) s.push('Details');
		s.push('Review');
		return s;
	});

	let currentStep = $state(0);
	const stepName = $derived(stepsAll[currentStep] ?? 'Review');

	// Clamp currentStep when stepsAll shrinks (e.g., user picks a single-location account, Location step drops)
	$effect(() => {
		if (currentStep >= stepsAll.length) currentStep = stepsAll.length - 1;
	});

	function brandName(id: string): string {
		return brands.find((b) => b.id === id)?.name ?? 'Brand';
	}
	function seasonName(id: string): string {
		return seasons.find((s) => s.id === id)?.name ?? 'Season';
	}
	function deliveryLabelFor(d: SeasonDeliveryRow): string {
		return `${d.label} (${monthAbbrev[d.delivery_month - 1]} ${d.delivery_day})`;
	}
	function describeDelivery(meta: { delivery: DeliveryChoice | null } | undefined): string {
		const choice = meta?.delivery;
		if (!choice) return 'Pick a ship window';
		if (choice.kind === 'delivery') {
			const d = deliveries.find((x) => x.id === choice.delivery_id);
			return d ? deliveryLabelFor(d) : 'Delivery';
		}
		const dt = new Date(choice.expected_ship_date);
		return `Custom — ${monthAbbrev[dt.getMonth()]} ${dt.getDate()}`;
	}
	function getMeta(brand_id: string, season_id: string) {
		const key = groupKey(brand_id, season_id);
		if (!cart.groupMeta[key]) cart.groupMeta[key] = { delivery: null, location_id: null };
		return cart.groupMeta[key];
	}

	function canAdvance(): boolean {
		switch (stepName) {
			case 'Type':
				return cart.type !== null;
			case 'Brand':
				return cart.brandFilter === 'all' || (cart.brandFilter as string[]).length > 0;
			case 'Items':
				return cart.items.length > 0 && cart.items.every(itemIsSized);
			case 'Delivery':
				return groups.length > 0 && groups.every((g) => getMeta(g.brand_id, g.season_id).delivery !== null);
			case 'Account':
				return hasAccountChoice;
			case 'Location':
				return groups.every((g) => getMeta(g.brand_id, g.season_id).location_id !== null);
			case 'Details':
				return true;
			case 'Review':
				return true;
		}
		return true;
	}

	function nextStep() {
		if (currentStep < stepsAll.length - 1) currentStep++;
	}
	function prevStep() {
		if (currentStep > 0) currentStep--;
	}

	function handleCancel() {
		goto('/orders');
	}

	function pickType(t: OrderType) {
		cart.type = t;
		nextStep();
	}

	// Brand filter ↔ combobox
	let brandQuery = $state('');
	const brandMatches = $derived(
		brandQuery.trim()
			? brands.filter((b) =>
					normalize(b.name).includes(normalize(brandQuery))
				)
			: brands
	);
	function normalize(s: string): string {
		return s.toLowerCase().replace(/[^a-z0-9]/g, '');
	}
	function brandSelected(id: string): boolean {
		return cart.brandFilter !== 'all' && (cart.brandFilter as string[]).includes(id);
	}
	function toggleBrand(id: string) {
		if (cart.brandFilter === 'all') {
			cart.brandFilter = [id];
			return;
		}
		const list = cart.brandFilter as string[];
		const i = list.indexOf(id);
		if (i >= 0) list.splice(i, 1);
		else list.push(id);
	}
	function useAllBrands() {
		cart.brandFilter = 'all';
		nextStep();
	}

	const allowedBrandIds = $derived.by(() => {
		if (cart.brandFilter === 'all') return brands.map((b) => b.id);
		return cart.brandFilter as string[];
	});

	// ── Items / modal ───────────────────────────────────────────────────────
	let modalOpen = $state(false);
	let modalSearch = $state('');
	let modalSeason = $state<string | null>(null);
	let modalBrand = $state<string | null>(null);
	let modalMinPrice = $state('');
	let modalMaxPrice = $state('');
	let modalProducts = $state<Product[]>([]);
	let modalLoading = $state(false);
	let modalDebounce: ReturnType<typeof setTimeout> | undefined;
	// Sidebar: which product is currently being sized
	let sizingProductId = $state<string | null>(null);

	async function loadModalProducts() {
		modalLoading = true;
		const params = new URLSearchParams();
		if (modalSearch) params.set('q', modalSearch);
		const brandIds = modalBrand ? [modalBrand] : allowedBrandIds;
		for (const b of brandIds) params.append('brand_id', b);
		if (modalSeason) params.append('season_id', modalSeason);
		if (modalMinPrice) params.set('min_price', modalMinPrice);
		if (modalMaxPrice) params.set('max_price', modalMaxPrice);
		params.set('limit', '200');
		try {
			const res = await fetch(`/api/products?${params.toString()}`);
			const json = await res.json();
			modalProducts = (json.products ?? []) as Product[];
		} finally {
			modalLoading = false;
		}
	}

	function openAddItemsModal() {
		modalOpen = true;
		sizingProductId = null;
		loadModalProducts();
	}
	function closeAddItemsModal() {
		modalOpen = false;
		sizingProductId = null;
	}

	function onModalSearchChange() {
		clearTimeout(modalDebounce);
		modalDebounce = setTimeout(loadModalProducts, 250);
	}

	function primaryImageId(p: Product): string | null {
		const primary = p.product_images?.find((i) => i.is_primary);
		return primary?.id ?? p.product_images?.[0]?.id ?? null;
	}
	function productColors(p: Product): string[] {
		return [...new Set(p.product_variants.map((v) => v.color).filter(Boolean) as string[])];
	}
	function productSizes(p: Product): string[] {
		return [...new Set(p.product_variants.map((v) => v.size).filter(Boolean) as string[])];
	}

	function productInCart(p: Product): boolean {
		return cart.items.some((it) => it.product_id === p.id);
	}

	function addProduct(p: Product) {
		if (productInCart(p)) return;
		if (!p.season_id) return;
		const colors = productColors(p);
		const sizes = productSizes(p);
		const size_qtys: Record<string, number> = {};
		for (const s of sizes) size_qtys[s] = 0;
		cart.items.push({
			product_id: p.id,
			brand_id: p.brand_id,
			season_id: p.season_id,
			style_number: p.style_number,
			name: p.name,
			unit_price: p.wholesale_price,
			image_id: primaryImageId(p),
			available_colors: colors,
			available_sizes: sizes,
			selected_color: colors[0] ?? '',
			size_qtys
		});
	}
	function removeProduct(product_id: string) {
		const i = cart.items.findIndex((it) => it.product_id === product_id);
		if (i >= 0) cart.items.splice(i, 1);
		if (sizingProductId === product_id) sizingProductId = null;
	}
	function toggleProduct(p: Product) {
		if (productInCart(p)) removeProduct(p.id);
		else addProduct(p);
	}
	function openSizing(p: Product) {
		if (!productInCart(p)) addProduct(p);
		sizingProductId = p.id;
	}
	function findItem(product_id: string): OrderItem | undefined {
		return cart.items.find((it) => it.product_id === product_id);
	}

	// Keep group meta clean
	$effect(() => {
		const validKeys = new Set(groups.map((g) => groupKey(g.brand_id, g.season_id)));
		for (const k of Object.keys(cart.groupMeta)) {
			if (!validKeys.has(k)) delete cart.groupMeta[k];
		}
	});

	// Auto-assign location when account has exactly one
	$effect(() => {
		if (account && accountLocations.length === 1) {
			const loc = accountLocations[0];
			for (const g of groups) {
				const m = getMeta(g.brand_id, g.season_id);
				if (!m.location_id) m.location_id = loc.id;
			}
		}
	});

	// ── Account combobox ────────────────────────────────────────────────────
	let accountQuery = $state('');
	let accountFocus = $state(false);
	const accountMatches = $derived.by(() => {
		const q = normalize(accountQuery);
		if (!q) return accounts;
		return accounts
			.map((a) => ({ a, score: accountScore(a, q) }))
			.filter((x) => x.score > 0)
			.sort((x, y) => y.score - x.score)
			.map((x) => x.a);
	});
	function accountScore(a: Account, q: string): number {
		const name = normalize(a.business_name);
		const city = normalize(a.city ?? '');
		const state = normalize(a.state ?? '');
		if (name.startsWith(q)) return 100;
		if (name.includes(q)) return 80;
		// Token prefix match ("ml leddys" → "mlleddys" → starts with q stripped? Handled by normalize above.)
		// Token initial match: e.g. "ml" matches "M.L. Leddy's"
		const tokens = a.business_name.toLowerCase().split(/\s+/);
		const initials = tokens.map((t) => t.replace(/[^a-z0-9]/g, '').charAt(0)).join('');
		if (initials.startsWith(q)) return 60;
		if (city.includes(q) || state.includes(q)) return 20;
		return 0;
	}
	function accountLabel(a: Account): string {
		const loc = [a.city, a.state].filter(Boolean).join(', ');
		return loc ? `${a.business_name} — ${loc}` : a.business_name;
	}
	function pickAccount(a: Account) {
		cart.account_id = a.id;
		cart.freeform_name = null;
		accountQuery = a.business_name;
		accountFocus = false;
	}
	function useFreeform() {
		cart.account_id = null;
		cart.freeform_name = accountQuery.trim() || null;
		accountFocus = false;
	}
	function clearAccount() {
		cart.account_id = null;
		cart.freeform_name = null;
		accountQuery = '';
	}

	// ── Submit ──────────────────────────────────────────────────────────────
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let submitStatus = $state<'draft' | 'submitted'>('draft');

	const payload = $derived({
		type: cart.type ?? 'order',
		account_id: cart.account_id,
		freeform_name: cart.freeform_name,
		order_year: cart.order_year,
		submitStatus,
		lines: toCartLines(cart.items),
		groups: groups.map((g) => ({
			brand_id: g.brand_id,
			season_id: g.season_id,
			delivery: getMeta(g.brand_id, g.season_id).delivery,
			location_id: getMeta(g.brand_id, g.season_id).location_id
		}))
	});
</script>

<svelte:head><title>New {cart.type === 'note' ? 'Note' : 'Order'} — Threadline</title></svelte:head>

<div class="mx-auto max-w-5xl p-6">
	<!-- Top nav: Back (left) + Cancel (right) -->
	<div class="mb-4 flex items-center justify-between">
		{#if currentStep > 0}
			<Button variant="ghost" size="sm" onclick={prevStep}><LongArrow direction="left" /> Back</Button>
		{:else}
			<span></span>
		{/if}
		<Button variant="ghost" size="sm" onclick={handleCancel}>Cancel</Button>
	</div>

	<!-- Header / progress -->
	<div class="mb-4">
		<h1 class="text-2xl font-semibold">New {cart.type === 'note' ? 'Note' : 'Order'}</h1>
		<p class="text-sm text-muted-foreground">
			Step {currentStep + 1} of {stepsAll.length} — {stepName}
		</p>
	</div>

	<div class="mb-6 flex gap-1">
		{#each stepsAll as s, i (s + i)}
			<div
				class="h-1.5 flex-1 rounded-full {i <= currentStep ? 'bg-foreground' : 'bg-border'}"
				aria-label={s}
			></div>
		{/each}
	</div>

	<!-- ── Type step ──────────────────────────────────────────────────── -->
	{#if stepName === 'Type'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<button
				type="button"
				class="rounded-lg border p-6 text-left transition hover:border-foreground"
				onclick={() => pickType('order')}
			>
				<div class="text-lg font-semibold">Order</div>
				<p class="mt-2 text-sm text-muted-foreground">
					Standard wholesale order with full lifecycle (draft → submitted → confirmed → shipped).
				</p>
			</button>
			<button
				type="button"
				class="rounded-lg border p-6 text-left transition hover:border-foreground"
				onclick={() => pickType('note')}
			>
				<div class="text-lg font-semibold">Note</div>
				<p class="mt-2 text-sm text-muted-foreground">
					Quick capture for shows or the road. At least one item required; account can be added later.
				</p>
			</button>
		</div>
	{/if}

	<!-- ── Brand step ─────────────────────────────────────────────────── -->
	{#if stepName === 'Brand'}
		<div>
			<Label for="brand-search">Brands</Label>
			<Input
				id="brand-search"
				class="mt-1"
				placeholder="Search brands…"
				bind:value={brandQuery}
			/>

			{#if cart.brandFilter !== 'all' && (cart.brandFilter as string[]).length > 0}
				<div class="mt-3 flex flex-wrap gap-2">
					{#each cart.brandFilter as string[] as id (id)}
						<button
							type="button"
							class="flex items-center gap-1 rounded-full border border-foreground bg-foreground px-3 py-1 text-sm text-background"
							onclick={() => toggleBrand(id)}
						>
							{brandName(id)}
							<span aria-hidden="true">×</span>
						</button>
					{/each}
				</div>
			{/if}

			<div class="mt-3 max-h-80 overflow-auto rounded-lg border">
				<ul class="divide-y">
					{#each brandMatches as b (b.id)}
						<li>
							<button
								type="button"
								class="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-muted/50"
								onclick={() => toggleBrand(b.id)}
							>
								<span>{b.name}</span>
								<span class="text-muted-foreground">
									{brandSelected(b.id) ? '✓ Selected' : ''}
								</span>
							</button>
						</li>
					{/each}
					{#if brandMatches.length === 0}
						<li class="px-4 py-3 text-sm text-muted-foreground">No matching brands.</li>
					{/if}
				</ul>
			</div>

			<div class="mt-3">
				<button
					type="button"
					class="inline-flex items-center gap-1 text-sm underline hover:no-underline"
					onclick={useAllBrands}
				>
					Continue with All Brands
					<LongArrow direction="right" class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}

	<!-- ── Items step ─────────────────────────────────────────────────── -->
	{#if stepName === 'Items'}
		<div>
			<div class="mb-4 flex items-center justify-between">
				<div class="text-sm text-muted-foreground">
					{cart.items.length} product{cart.items.length === 1 ? '' : 's'}
					{#if cart.items.some((i) => !itemIsSized(i))}
						· <span class="text-amber-700">
							{cart.items.filter((i) => !itemIsSized(i)).length} unsized
						</span>
					{/if}
				</div>
				<Button onclick={openAddItemsModal}>+ Add Items</Button>
			</div>

			{#if cart.items.length === 0}
				<div class="rounded-lg border border-dashed p-12 text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-6 w-6 text-muted-foreground">
							<circle cx="9" cy="21" r="1" />
							<circle cx="20" cy="21" r="1" />
							<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
						</svg>
					</div>
					<div class="text-base font-semibold">No items yet</div>
					<p class="mt-1 text-sm text-muted-foreground">Click Add to open the catalog.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each cart.items as it, idx (it.product_id)}
						<div class="rounded-lg border p-4">
							<div class="flex items-start gap-3">
								<div class="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
									{#if it.image_id}
										<img
											src={`/api/products/${it.product_id}/images/${it.image_id}`}
											alt=""
											class="h-full w-full object-cover"
										/>
									{/if}
								</div>
								<div class="min-w-0 flex-1">
									<div class="text-sm text-muted-foreground">{it.style_number}</div>
									<div class="truncate text-base font-semibold">{it.name}</div>
									<div class="text-sm text-muted-foreground">
										{fmt.format(it.unit_price)} · {brandName(it.brand_id)} · {seasonName(it.season_id)}
									</div>
								</div>
								<div class="shrink-0 text-right">
									<div class="text-sm font-semibold">
										{itemUnits(it)} unit{itemUnits(it) === 1 ? '' : 's'}
									</div>
									<div class="text-sm text-muted-foreground">{fmt.format(itemTotal(it))}</div>
									<Button
										variant="outline"
										size="sm"
										class="border-red-500/60 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
										onclick={() => removeProduct(it.product_id)}
									>
										Remove
									</Button>
								</div>
							</div>

							{#if it.available_colors.length > 0}
								<div class="mt-3 flex flex-wrap items-center gap-2">
									<span class="text-sm text-muted-foreground">Color:</span>
									{#each it.available_colors as color (color)}
										<button
											type="button"
											class="rounded-full px-3 py-1 text-sm font-medium transition {it.selected_color ===
											color
												? 'bg-foreground text-background'
												: 'bg-muted text-muted-foreground hover:text-foreground'}"
											onclick={() => (cart.items[idx].selected_color = color)}
										>
											{color}
										</button>
									{/each}
								</div>
							{/if}

							{#if it.available_sizes.length > 0}
								<div class="mt-3 flex flex-wrap items-end gap-2">
									{#each it.available_sizes as size (size)}
										<div class="flex flex-col items-center gap-1">
											<span class="text-sm text-muted-foreground">{size}</span>
											<input
												type="number"
												min="0"
												class="h-9 w-16 rounded border bg-background px-2 text-center text-sm"
												value={it.size_qtys[size] ?? 0}
												oninput={(e) => {
													const n = parseInt((e.target as HTMLInputElement).value, 10);
													cart.items[idx].size_qtys[size] = Number.isNaN(n) ? 0 : Math.max(0, n);
												}}
											/>
										</div>
									{/each}
								</div>
							{:else}
								<div class="mt-3 flex items-center gap-2">
									<span class="text-sm text-muted-foreground">Qty:</span>
									<input
										type="number"
										min="0"
										class="h-9 w-20 rounded border bg-background px-2 text-center text-sm"
										value={it.size_qtys[''] ?? 0}
										oninput={(e) => {
											const n = parseInt((e.target as HTMLInputElement).value, 10);
											cart.items[idx].size_qtys[''] = Number.isNaN(n) ? 0 : Math.max(0, n);
										}}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<!-- ── Delivery step ──────────────────────────────────────────────── -->
	{#if stepName === 'Delivery'}
		<div>
			<p class="mb-4 text-sm text-muted-foreground">
				{groups.length === 1
					? 'Pick the ship window for this order.'
					: `${groups.length} orders will be created — one per brand + season. Pick a ship window for each.`}
			</p>
			<div class="space-y-4">
				{#each groups as g (groupKey(g.brand_id, g.season_id))}
					{@const meta = getMeta(g.brand_id, g.season_id)}
					{@const seasonDeliveries = deliveries.filter((d) => d.season_id === g.season_id)}
					<div class="rounded-lg border p-4">
						<div class="mb-3 flex items-center justify-between">
							<div class="font-semibold">
								{brandName(g.brand_id)}
								<span class="text-muted-foreground"> · {seasonName(g.season_id)}</span>
							</div>
							<div class="text-sm text-muted-foreground">
								{g.units} unit{g.units === 1 ? '' : 's'} · {fmt.format(g.total)}
							</div>
						</div>

						{#if seasonDeliveries.length > 0}
							<div class="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
								{#each seasonDeliveries as d (d.id)}
									<button
										type="button"
										class="rounded border p-3 text-left text-sm transition {meta.delivery?.kind ===
											'delivery' && meta.delivery.delivery_id === d.id
											? 'border-foreground bg-muted/30'
											: 'hover:border-foreground'}"
										onclick={() => (meta.delivery = { kind: 'delivery', delivery_id: d.id })}
									>
										{deliveryLabelFor(d)}
									</button>
								{/each}
							</div>
						{:else}
							<p class="mb-3 text-sm text-muted-foreground">
								No delivery slots configured for this season. Use a custom date below.
							</p>
						{/if}

						<div class="flex items-center gap-2">
							<Label for={`custom-${groupKey(g.brand_id, g.season_id)}`} class="text-sm">
								Custom date:
							</Label>
							<Input
								id={`custom-${groupKey(g.brand_id, g.season_id)}`}
								type="date"
								class="w-44"
								value={meta.delivery?.kind === 'custom' ? meta.delivery.expected_ship_date : ''}
								oninput={(e) => {
									const v = (e.target as HTMLInputElement).value;
									meta.delivery = v ? { kind: 'custom', expected_ship_date: v } : null;
								}}
							/>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- ── Account step ───────────────────────────────────────────────── -->
	{#if stepName === 'Account'}
		<div>
			<Label for="account-input">Account</Label>
			<div class="relative mt-1">
				<Input
					id="account-input"
					placeholder="Type to search (e.g. “ml leddys”) or enter a new name"
					value={accountQuery}
					oninput={(e) => {
						accountQuery = (e.target as HTMLInputElement).value;
						accountFocus = true;
						// Typing clears the confirmed selection so freeform can engage if user continues
						if (cart.account_id !== null) cart.account_id = null;
						cart.freeform_name = null;
					}}
					onfocus={() => (accountFocus = true)}
				/>
				{#if accountFocus && accountQuery.trim()}
					<div class="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-lg border bg-background shadow-lg">
						<ul class="divide-y">
							{#each accountMatches as a (a.id)}
								<li>
									<button
										type="button"
										class="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50"
										onclick={() => pickAccount(a)}
									>
										<span class="font-medium">{a.business_name}</span>
										<span class="text-muted-foreground">
											{[a.city, a.state].filter(Boolean).join(', ')}
										</span>
									</button>
								</li>
							{/each}
							<li>
								<button
									type="button"
									class="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-amber-700 hover:bg-muted/50"
									onclick={useFreeform}
								>
									<span>Use "{accountQuery.trim()}" as a freeform name</span>
									<span class="text-muted-foreground">Save as draft</span>
								</button>
							</li>
						</ul>
					</div>
				{/if}
			</div>

			{#if cart.account_id}
				<div class="mt-3 flex items-center gap-2 rounded border border-foreground/30 bg-muted/30 px-3 py-2 text-sm">
					<span class="font-semibold">{account?.business_name}</span>
					<span class="text-muted-foreground">
						{account ? [account.city, account.state].filter(Boolean).join(', ') : ''}
					</span>
					<button type="button" class="ml-auto underline" onclick={clearAccount}>Change</button>
				</div>
			{:else if isFreeform}
				<div class="mt-3 flex items-center gap-2 rounded border border-amber-500/50 bg-amber-50 px-3 py-2 text-sm text-amber-900">
					<span class="font-semibold">{cart.freeform_name}</span>
					<span>— freeform (will save as draft)</span>
					<button type="button" class="ml-auto underline" onclick={clearAccount}>Change</button>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ── Location step ──────────────────────────────────────────────── -->
	{#if stepName === 'Location'}
		<div>
			<p class="mb-4 text-sm text-muted-foreground">
				This account has multiple locations. Pick one per order.
			</p>
			<div class="space-y-4">
				{#each groups as g (groupKey(g.brand_id, g.season_id))}
					{@const meta = getMeta(g.brand_id, g.season_id)}
					<div class="rounded-lg border p-4">
						<div class="mb-3 font-semibold">
							{brandName(g.brand_id)} · {seasonName(g.season_id)}
						</div>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each accountLocations as loc (loc.id)}
								<button
									type="button"
									class="rounded border p-3 text-left text-sm transition {meta.location_id ===
									loc.id
										? 'border-foreground bg-muted/30'
										: 'hover:border-foreground'}"
									onclick={() => (meta.location_id = loc.id)}
								>
									<div class="font-medium">{loc.label}{loc.is_default ? ' (default)' : ''}</div>
									<div class="text-muted-foreground">
										{[loc.city, loc.state].filter(Boolean).join(', ')}
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- ── Details step (freeform only) ───────────────────────────────── -->
	{#if stepName === 'Details'}
		<div>
			<p class="mb-4 text-sm text-muted-foreground">
				These details save as a new account. You can skip and come back later — orders stay as drafts
				until this is complete.
			</p>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<Label for="biz">Business name</Label>
					<Input
						id="biz"
						bind:value={cart.freeformDetails.business_name}
						class="mt-1"
						placeholder={cart.freeform_name ?? ''}
					/>
				</div>
				<div>
					<Label for="fn">Contact first name</Label>
					<Input id="fn" bind:value={cart.freeformDetails.contact_first_name} class="mt-1" />
				</div>
				<div>
					<Label for="ln">Contact last name</Label>
					<Input id="ln" bind:value={cart.freeformDetails.contact_last_name} class="mt-1" />
				</div>
				<div>
					<Label for="em">Email</Label>
					<Input id="em" type="email" bind:value={cart.freeformDetails.contact_email} class="mt-1" />
				</div>
				<div>
					<Label for="ph">Phone</Label>
					<Input id="ph" bind:value={cart.freeformDetails.phone} class="mt-1" />
				</div>
				<div class="sm:col-span-2">
					<Label for="ad">Address</Label>
					<Input id="ad" bind:value={cart.freeformDetails.address_line1} class="mt-1" />
				</div>
				<div>
					<Label for="ci">City</Label>
					<Input id="ci" bind:value={cart.freeformDetails.city} class="mt-1" />
				</div>
				<div>
					<Label for="st">State</Label>
					<Input id="st" bind:value={cart.freeformDetails.state} class="mt-1" />
				</div>
				<div>
					<Label for="zp">Zip</Label>
					<Input id="zp" bind:value={cart.freeformDetails.zip} class="mt-1" />
				</div>
			</div>
		</div>
	{/if}

	<!-- ── Review step ────────────────────────────────────────────────── -->
	{#if stepName === 'Review'}
		<div class="space-y-4">
			<div class="rounded-lg border p-4">
				<div class="text-sm text-muted-foreground">Type</div>
				<div class="text-lg font-semibold capitalize">{cart.type}</div>
			</div>
			<div class="rounded-lg border p-4">
				<div class="text-sm text-muted-foreground">Account</div>
				<div class="text-lg font-semibold">
					{account ? account.business_name : (cart.freeform_name ?? '—')}
				</div>
				{#if isFreeform}
					<div class="mt-1 text-sm text-amber-700">Freeform — orders will be saved as drafts.</div>
				{/if}
			</div>
			<div class="rounded-lg border p-4">
				<div class="mb-2 text-sm text-muted-foreground">
					{groups.length} order{groups.length === 1 ? '' : 's'} will be created
				</div>
				<ul class="divide-y">
					{#each groups as g (groupKey(g.brand_id, g.season_id))}
						{@const meta = getMeta(g.brand_id, g.season_id)}
						{@const loc = meta.location_id
							? accountLocations.find((x) => x.id === meta.location_id)
							: null}
						<li class="py-3">
							<div class="flex items-center justify-between">
								<div class="font-medium">
									{brandName(g.brand_id)} · {seasonName(g.season_id)}
								</div>
								<div class="text-sm text-muted-foreground">
									{g.units} unit{g.units === 1 ? '' : 's'} · {fmt.format(g.total)}
								</div>
							</div>
							<div class="text-sm text-muted-foreground">
								Ship: {describeDelivery(meta)}{loc ? ` · ${loc.label}` : ''}
							</div>
						</li>
					{/each}
				</ul>
			</div>

			{#if submitError}
				<div class="rounded border border-red-500 bg-red-50 p-3 text-sm text-red-900">
					{submitError}
				</div>
			{/if}

			<form
				method="POST"
				action="?/submit"
				use:enhance={() => {
					submitting = true;
					submitError = null;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'failure') {
							submitError = (result.data as { message?: string })?.message ?? 'Submit failed';
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="payload" value={JSON.stringify(payload)} />
				<div class="flex gap-3">
					<Button
						type="submit"
						variant="outline"
						disabled={submitting}
						onclick={() => (submitStatus = 'draft')}
					>
						Save as Draft
					</Button>
					<Button
						type="submit"
						disabled={submitting || isFreeform}
						onclick={() => (submitStatus = 'submitted')}
					>
						{cart.type === 'note' ? 'Save Note' : 'Submit Order'}
					</Button>
				</div>
			</form>
		</div>
	{/if}

	<!-- Bottom nav: Next only (Back moved to top). Type step has no Next (click advances). -->
	{#if stepName !== 'Review' && stepName !== 'Type'}
		<div class="mt-8 flex justify-end">
			<Button onclick={nextStep} disabled={!canAdvance()}>Next</Button>
		</div>
	{/if}
</div>

<!-- ── Full-screen Add Items modal ─────────────────────────────────────── -->
{#if modalOpen}
	<div
		class="fixed inset-0 z-50 flex flex-col bg-background"
		role="dialog"
		aria-modal="true"
	>
		<!-- Top bar -->
		<div class="flex items-center justify-between border-b px-5 py-3">
			<div>
				<h2 class="text-lg font-semibold">Add Items</h2>
				<p class="text-sm text-muted-foreground">
					{cart.items.length} added · {cart.items.filter(itemIsSized).length} sized
				</p>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="rounded p-2 hover:bg-muted/50"
					aria-label="Close"
					onclick={closeAddItemsModal}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
						<path d="M18 6L6 18M6 6l12 12" />
					</svg>
				</button>
				<Button onclick={closeAddItemsModal}>Done</Button>
			</div>
		</div>

		<!-- Filters -->
		<div class="flex flex-wrap items-center gap-3 border-b px-5 py-3">
			<Input
				placeholder="Search style # or name…"
				bind:value={modalSearch}
				oninput={onModalSearchChange}
				class="w-64"
			/>
			<select
				class="h-10 rounded-md border bg-background px-3 text-sm"
				bind:value={modalSeason}
				onchange={loadModalProducts}
			>
				<option value={null}>All seasons</option>
				{#each seasons as s (s.id)}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>
			{#if allowedBrandIds.length > 1}
				<select
					class="h-10 rounded-md border bg-background px-3 text-sm"
					bind:value={modalBrand}
					onchange={loadModalProducts}
				>
					<option value={null}>All brands</option>
					{#each brands.filter((b) => allowedBrandIds.includes(b.id)) as b (b.id)}
						<option value={b.id}>{b.name}</option>
					{/each}
				</select>
			{/if}
			<Input placeholder="Min $" bind:value={modalMinPrice} oninput={onModalSearchChange} class="w-24" />
			<Input placeholder="Max $" bind:value={modalMaxPrice} oninput={onModalSearchChange} class="w-24" />
		</div>

		<!-- Body: grid + optional sidebar -->
		<div class="flex flex-1 overflow-hidden">
			<div class="flex-1 overflow-auto p-5">
				{#if modalLoading}
					<div class="p-10 text-center text-sm text-muted-foreground">Loading…</div>
				{:else if modalProducts.length === 0}
					<div class="p-10 text-center">
						<div class="text-base font-semibold">No products match</div>
						<p class="mt-1 text-sm text-muted-foreground">Adjust the filters above.</p>
					</div>
				{:else}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
						{#each modalProducts as p (p.id)}
							{@const added = productInCart(p)}
							{@const imgId = primaryImageId(p)}
							<div
								class="flex flex-col rounded-lg border-2 transition {added
									? 'border-foreground'
									: 'border-border'}"
							>
								<div class="aspect-square overflow-hidden rounded-t-lg bg-muted">
									{#if imgId}
										<img
											src={`/api/products/${p.id}/images/${imgId}`}
											alt=""
											class="h-full w-full object-cover"
										/>
									{:else}
										<div class="flex h-full w-full items-center justify-center">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
												class="h-10 w-10 text-muted-foreground/40"
											>
												<rect x="3" y="3" width="18" height="18" rx="2" />
												<circle cx="8.5" cy="8.5" r="1.5" />
												<path d="M21 15l-5-5L5 21" />
											</svg>
										</div>
									{/if}
								</div>
								<div class="flex flex-1 flex-col gap-1 p-3">
									<div class="text-sm text-muted-foreground">{p.style_number}</div>
									<div class="line-clamp-2 text-sm font-semibold">{p.name}</div>
									<div class="text-sm text-muted-foreground">
										{brandName(p.brand_id)}{p.season_id ? ' · ' + seasonName(p.season_id) : ''}
									</div>
									<div class="mt-1 text-sm font-semibold">{fmt.format(p.wholesale_price)}</div>
									<div class="mt-auto grid grid-cols-2 gap-2 pt-3">
										<Button
											size="sm"
											variant={added ? 'outline' : 'default'}
											class={added
												? 'border-red-500/60 text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30'
												: ''}
											onclick={() => toggleProduct(p)}
										>
											{added ? 'Remove' : 'Add'}
										</Button>
										<Button
											size="sm"
											variant="outline"
											disabled={!added}
											onclick={() => openSizing(p)}
										>
											Size
										</Button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Sizing sidebar -->
			{#if sizingProductId}
				{@const it = findItem(sizingProductId)}
				{#if it}
					<aside class="flex w-[380px] shrink-0 flex-col border-l">
						<div class="flex items-center justify-between border-b px-4 py-3">
							<div>
								<div class="text-sm text-muted-foreground">{it.style_number}</div>
								<div class="text-base font-semibold">{it.name}</div>
							</div>
							<button
								type="button"
								class="rounded p-1 hover:bg-muted/50"
								aria-label="Close sizing"
								onclick={() => (sizingProductId = null)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
									<path d="M18 6L6 18M6 6l12 12" />
								</svg>
							</button>
						</div>
						<div class="flex-1 overflow-auto p-4">
							{#if it.available_colors.length > 0}
								<div class="mb-3">
									<div class="mb-2 text-sm text-muted-foreground">Color</div>
									<div class="flex flex-wrap gap-2">
										{#each it.available_colors as color (color)}
											{@const idx = cart.items.findIndex((x) => x.product_id === it.product_id)}
											<button
												type="button"
												class="rounded-full px-3 py-1 text-sm font-medium transition {it.selected_color ===
												color
													? 'bg-foreground text-background'
													: 'bg-muted text-muted-foreground hover:text-foreground'}"
												onclick={() => (cart.items[idx].selected_color = color)}
											>
												{color}
											</button>
										{/each}
									</div>
								</div>
							{/if}

							{#if it.available_sizes.length > 0}
								<div class="mb-2 text-sm text-muted-foreground">Sizes</div>
								<div class="flex flex-wrap gap-3">
									{#each it.available_sizes as size (size)}
										{@const idx = cart.items.findIndex((x) => x.product_id === it.product_id)}
										<div class="flex flex-col items-center gap-1">
											<span class="text-sm text-muted-foreground">{size}</span>
											<input
												type="number"
												min="0"
												class="h-10 w-16 rounded border bg-background px-2 text-center text-sm"
												value={it.size_qtys[size] ?? 0}
												oninput={(e) => {
													const n = parseInt((e.target as HTMLInputElement).value, 10);
													cart.items[idx].size_qtys[size] = Number.isNaN(n) ? 0 : Math.max(0, n);
												}}
											/>
										</div>
									{/each}
								</div>
							{:else}
								{@const idx = cart.items.findIndex((x) => x.product_id === it.product_id)}
								<div class="flex items-center gap-2">
									<span class="text-sm text-muted-foreground">Qty:</span>
									<input
										type="number"
										min="0"
										class="h-10 w-20 rounded border bg-background px-2 text-center text-sm"
										value={it.size_qtys[''] ?? 0}
										oninput={(e) => {
											const n = parseInt((e.target as HTMLInputElement).value, 10);
											cart.items[idx].size_qtys[''] = Number.isNaN(n) ? 0 : Math.max(0, n);
										}}
									/>
								</div>
							{/if}
						</div>
						<div class="border-t p-4 text-sm">
							<div class="flex items-center justify-between">
								<span class="text-muted-foreground">Total</span>
								<span class="font-semibold">
									{itemUnits(it)} units · {fmt.format(itemTotal(it))}
								</span>
							</div>
						</div>
					</aside>
				{/if}
			{/if}
		</div>
	</div>
{/if}
