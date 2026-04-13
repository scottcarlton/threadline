<script lang="ts">
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { OrderType } from '$lib/types/database.js';
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
	type ProductVariant = { id: string; color: string | null; size: string | null; price_override: number | null };
	type Product = {
		id: string;
		brand_id: string;
		season_id: string | null;
		style_number: string;
		name: string;
		wholesale_price: number;
		category: string | null;
		product_variants: ProductVariant[];
	};

	let { data } = $props();
	const accounts = $derived(data.accounts as Account[]);
	const allLocations = $derived(data.locations as LocationRow[]);
	const brands = $derived(data.brands as Brand[]);
	const seasons = $derived(data.seasons as Season[]);
	const deliveries = $derived(data.deliveries as SeasonDeliveryRow[]);
	const isBuyer = $derived(data.isBuyer === true);

	const monthAbbrev = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	// ── Cart state ──────────────────────────────────────────────────────────
	const cart = $state<{
		type: OrderType;
		brandFilter: 'all' | string[]; // 'all' or list of brand_ids
		lines: CartLine[];
		groupMeta: Record<string, { delivery: DeliveryChoice | null; location_id: string | null }>;
		account_id: string | null;
		freeform_name: string | null;
		order_year: number;
		// Freeform draft account details (saved as a real account on submit when filled in)
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
		type: 'order',
		brandFilter: 'all',
		lines: [],
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

	function groupKey(brand_id: string, season_id: string): string {
		return `${brand_id}::${season_id}`;
	}

	const groups = $derived.by(() => {
		const map = new Map<string, { brand_id: string; season_id: string; lines: CartLine[]; total: number }>();
		for (const l of cart.lines) {
			if (l.qty <= 0) continue;
			const key = groupKey(l.brand_id, l.season_id);
			let g = map.get(key);
			if (!g) {
				g = { brand_id: l.brand_id, season_id: l.season_id, lines: [], total: 0 };
				map.set(key, g);
			}
			g.lines.push(l);
			g.total += l.qty * l.unit_price;
		}
		return [...map.values()];
	});

	const account = $derived(accounts.find((a) => a.id === cart.account_id) ?? null);
	const accountLocations = $derived(
		cart.account_id ? allLocations.filter((l) => l.account_id === cart.account_id) : []
	);
	const isFreeform = $derived(cart.account_id === null);
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

	function brandName(id: string): string {
		return brands.find((b) => b.id === id)?.name ?? 'Brand';
	}
	function seasonName(id: string): string {
		return seasons.find((s) => s.id === id)?.name ?? 'Season';
	}
	function accountLabel(a: Account | null): string {
		if (!a) return '';
		const loc = [a.city, a.state].filter(Boolean).join(', ');
		return loc ? `${a.business_name} — ${loc}` : a.business_name;
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
				return true;
			case 'Brand':
				return cart.brandFilter === 'all' || (cart.brandFilter as string[]).length > 0;
			case 'Items':
				return cart.lines.some((l) => l.qty > 0);
			case 'Delivery':
				return groups.every((g) => getMeta(g.brand_id, g.season_id).delivery !== null);
			case 'Account':
				return cart.account_id !== null || (cart.freeform_name?.trim().length ?? 0) > 0;
			case 'Location':
				return groups.every((g) => getMeta(g.brand_id, g.season_id).location_id !== null);
			case 'Details':
				return true; // optional — can save later
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

	// ── Add Items modal state ───────────────────────────────────────────────
	let modalOpen = $state(false);
	let modalSearch = $state('');
	let modalSeason = $state<string | null>(null);
	let modalBrand = $state<string | null>(null);
	let modalMinPrice = $state('');
	let modalMaxPrice = $state('');
	let modalProducts = $state<Product[]>([]);
	let modalLoading = $state(false);
	let modalDebounce: ReturnType<typeof setTimeout> | undefined;
	let modalSelectedProduct = $state<Product | null>(null);
	let modalQty = $state<Record<string, number>>({}); // variant_id -> qty

	const allowedBrandIds = $derived.by(() => {
		if (cart.brandFilter === 'all') return brands.map((b) => b.id);
		return cart.brandFilter as string[];
	});

	async function loadModalProducts() {
		modalLoading = true;
		const params = new URLSearchParams();
		if (modalSearch) params.set('q', modalSearch);
		const brandIds = modalBrand ? [modalBrand] : allowedBrandIds;
		for (const b of brandIds) params.append('brand_id', b);
		if (modalSeason) params.append('season_id', modalSeason);
		if (modalMinPrice) params.set('min_price', modalMinPrice);
		if (modalMaxPrice) params.set('max_price', modalMaxPrice);
		params.set('limit', '100');
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
		modalSelectedProduct = null;
		modalQty = {};
		loadModalProducts();
	}
	function closeAddItemsModal() {
		modalOpen = false;
	}

	function onModalSearchChange() {
		clearTimeout(modalDebounce);
		modalDebounce = setTimeout(loadModalProducts, 250);
	}

	// Hide products that already have line items in the cart (de-noise)
	const inCartProductIds = $derived(
		new Set(cart.lines.map((l) => l.product_id).filter((id): id is string => !!id))
	);
	const visibleProducts = $derived(modalProducts.filter((p) => !inCartProductIds.has(p.id)));

	function selectProduct(p: Product) {
		modalSelectedProduct = p;
		modalQty = {};
	}

	function commitProductToCart() {
		if (!modalSelectedProduct) return;
		const p = modalSelectedProduct;
		if (!p.season_id) {
			alert('Product has no season assigned — cannot add to cart.');
			return;
		}
		for (const variant of p.product_variants) {
			const qty = modalQty[variant.id] ?? 0;
			if (qty <= 0) continue;
			cart.lines.push({
				product_id: p.id,
				brand_id: p.brand_id,
				season_id: p.season_id,
				style_number: p.style_number,
				description: p.name,
				color: variant.color,
				size: variant.size,
				qty,
				unit_price: variant.price_override ?? p.wholesale_price
			});
		}
		modalSelectedProduct = null;
		modalQty = {};
	}

	function removeLine(idx: number) {
		cart.lines.splice(idx, 1);
	}

	function moveLineToGroup(lineIdx: number, brand_id: string, season_id: string) {
		const l = cart.lines[lineIdx];
		if (!l) return;
		l.brand_id = brand_id;
		l.season_id = season_id;
	}

	// ── Submit ──────────────────────────────────────────────────────────────
	let submitting = $state(false);
	let submitError = $state<string | null>(null);
	let submitStatus = $state<'draft' | 'submitted'>('draft');
	let formEl = $state<HTMLFormElement | undefined>(undefined);

	const payload = $derived({
		type: cart.type,
		account_id: cart.account_id,
		freeform_name: cart.freeform_name,
		order_year: cart.order_year,
		submitStatus,
		lines: cart.lines,
		groups: groups.map((g) => ({
			brand_id: g.brand_id,
			season_id: g.season_id,
			delivery: getMeta(g.brand_id, g.season_id).delivery,
			location_id: getMeta(g.brand_id, g.season_id).location_id
		}))
	});

	function handleCancel() {
		goto('/orders');
	}

	// Keep group meta clean: drop entries for groups that no longer exist
	$effect(() => {
		const validKeys = new Set(groups.map((g) => groupKey(g.brand_id, g.season_id)));
		for (const k of Object.keys(cart.groupMeta)) {
			if (!validKeys.has(k)) delete cart.groupMeta[k];
		}
	});

	// If the user picks an account with only one location, auto-assign that location to all groups
	$effect(() => {
		if (account && accountLocations.length === 1) {
			const loc = accountLocations[0];
			for (const g of groups) {
				const m = getMeta(g.brand_id, g.season_id);
				if (!m.location_id) m.location_id = loc.id;
			}
		}
	});

	function brandFilterToggle(id: string) {
		if (cart.brandFilter === 'all') {
			cart.brandFilter = [id];
			return;
		}
		const list = cart.brandFilter as string[];
		const i = list.indexOf(id);
		if (i >= 0) list.splice(i, 1);
		else list.push(id);
		if (list.length === 0) cart.brandFilter = 'all';
	}
	function setBrandFilterAll() {
		cart.brandFilter = 'all';
	}

	function variantPrice(p: Product, v: ProductVariant): number {
		return v.price_override ?? p.wholesale_price;
	}
</script>

<svelte:head><title>New Order — Threadline</title></svelte:head>

<div class="mx-auto max-w-5xl p-6">
	<!-- Header / progress -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-semibold">New {cart.type === 'note' ? 'Note' : 'Order'}</h1>
			<p class="text-sm text-muted-foreground">Step {currentStep + 1} of {stepsAll.length} — {stepName}</p>
		</div>
		<Button variant="ghost" onclick={handleCancel}>Cancel</Button>
	</div>

	<div class="mb-6 flex gap-1">
		{#each stepsAll as s, i (s)}
			<div
				class="h-1.5 flex-1 rounded-full {i <= currentStep
					? 'bg-foreground'
					: 'bg-border'}"
				aria-label={s}
			></div>
		{/each}
	</div>

	<!-- Step bodies -->
	{#if stepName === 'Type'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<button
				type="button"
				class="rounded-lg border p-6 text-left transition hover:border-foreground {cart.type ===
				'order'
					? 'border-foreground bg-muted/30'
					: ''}"
				onclick={() => (cart.type = 'order')}
			>
				<div class="text-lg font-semibold">Order</div>
				<p class="mt-2 text-sm text-muted-foreground">
					Standard wholesale order with full lifecycle (draft → submitted → confirmed → shipped).
				</p>
			</button>
			<button
				type="button"
				class="rounded-lg border p-6 text-left transition hover:border-foreground {cart.type ===
				'note'
					? 'border-foreground bg-muted/30'
					: ''}"
				onclick={() => (cart.type = 'note')}
			>
				<div class="text-lg font-semibold">Note</div>
				<p class="mt-2 text-sm text-muted-foreground">
					Quick capture for shows or the road. At least one item required; account can be added
					later.
				</p>
			</button>
		</div>
	{/if}

	{#if stepName === 'Brand'}
		<div>
			<p class="mb-4 text-sm text-muted-foreground">
				Choose which brands to include. You can switch this later by reopening the Add Items modal.
			</p>
			<div class="mb-3 flex flex-wrap gap-2">
				<button
					type="button"
					class="rounded-full border px-4 py-1.5 text-sm transition {cart.brandFilter === 'all'
						? 'border-foreground bg-foreground text-background'
						: 'hover:border-foreground'}"
					onclick={setBrandFilterAll}
				>
					All Brands
				</button>
				{#each brands as b (b.id)}
					{@const selected =
						cart.brandFilter !== 'all' && (cart.brandFilter as string[]).includes(b.id)}
					<button
						type="button"
						class="rounded-full border px-4 py-1.5 text-sm transition {selected
							? 'border-foreground bg-foreground text-background'
							: 'hover:border-foreground'}"
						onclick={() => brandFilterToggle(b.id)}
					>
						{b.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if stepName === 'Items'}
		<div>
			<div class="mb-4 flex items-center justify-between">
				<div>
					<div class="text-sm text-muted-foreground">
						{cart.lines.length} item{cart.lines.length === 1 ? '' : 's'} added
					</div>
				</div>
				<Button onclick={openAddItemsModal}>+ Add Items</Button>
			</div>

			{#if groups.length === 0}
				<div class="rounded-lg border border-dashed p-12 text-center">
					<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							class="h-6 w-6 text-muted-foreground"
						>
							<circle cx="9" cy="21" r="1" />
							<circle cx="20" cy="21" r="1" />
							<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
						</svg>
					</div>
					<div class="text-base font-semibold">Cart is empty</div>
					<p class="mt-1 text-sm text-muted-foreground">Click "Add Items" to start building.</p>
				</div>
			{:else}
				<div class="space-y-4">
					{#each groups as g (groupKey(g.brand_id, g.season_id))}
						<div class="rounded-lg border">
							<div class="flex items-center justify-between border-b px-4 py-3">
								<div class="font-semibold">
									{brandName(g.brand_id)}
									<span class="text-muted-foreground"> · {seasonName(g.season_id)}</span>
								</div>
								<div class="text-sm text-muted-foreground">
									{g.lines.length} item{g.lines.length === 1 ? '' : 's'} ·
									${g.total.toFixed(2)}
								</div>
							</div>
							<ul class="divide-y">
								{#each g.lines as l (cart.lines.indexOf(l))}
									<li class="flex items-center justify-between px-4 py-2 text-sm">
										<div>
											<div class="font-medium">{l.style_number} — {l.description}</div>
											<div class="text-muted-foreground">
												{l.color ?? ''} {l.size ?? ''} · qty {l.qty}
												· ${l.unit_price.toFixed(2)} ea
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => removeLine(cart.lines.indexOf(l))}>Remove</Button
										>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if stepName === 'Delivery'}
		<div>
			<p class="mb-4 text-sm text-muted-foreground">
				{groups.length === 1
					? 'Pick the ship window for this order.'
					: `${groups.length} orders will be created — one per brand+season group. Pick a ship window for each.`}
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
							<div class="text-sm text-muted-foreground">${g.total.toFixed(2)}</div>
						</div>

						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

						<div class="mt-3 flex items-center gap-2">
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

	{#if stepName === 'Account'}
		<div>
			<Label for="account-pick">Account</Label>
			<select
				id="account-pick"
				class="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"
				value={cart.account_id ?? ''}
				onchange={(e) => {
					const v = (e.target as HTMLSelectElement).value;
					cart.account_id = v || null;
					if (cart.account_id) cart.freeform_name = null;
				}}
			>
				<option value="">— Pick or use freeform below —</option>
				{#each accounts as a (a.id)}
					<option value={a.id}>{accountLabel(a)}</option>
				{/each}
			</select>

			<div class="mt-6 rounded border border-dashed p-4">
				<Label for="freeform">No matching account? Use a freeform name</Label>
				<Input
					id="freeform"
					class="mt-2"
					placeholder="e.g. Joe's Shop (new)"
					value={cart.freeform_name ?? ''}
					oninput={(e) => {
						const v = (e.target as HTMLInputElement).value;
						cart.freeform_name = v || null;
						if (v) cart.account_id = null;
					}}
				/>
				<p class="mt-2 text-sm text-muted-foreground">
					Freeform orders save as drafts. You'll need to add full account details before submitting.
				</p>
			</div>
		</div>
	{/if}

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

	{#if stepName === 'Details'}
		<div>
			<p class="mb-4 text-sm text-muted-foreground">
				These details will be saved as a new account when filled in. You can skip and come back later
				— the orders will stay as drafts until this is complete.
			</p>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<Label for="biz">Business name</Label>
					<Input id="biz" bind:value={cart.freeformDetails.business_name} class="mt-1" />
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
					<div class="mt-1 text-sm text-amber-700">
						Freeform — orders will be saved as drafts.
					</div>
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
									{g.lines.length} item{g.lines.length === 1 ? '' : 's'} ·
									${g.total.toFixed(2)}
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
				bind:this={formEl}
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
				{#if isFreeform}
					<p class="mt-2 text-sm text-muted-foreground">
						Add account details to enable submission past draft.
					</p>
				{/if}
			</form>
		</div>
	{/if}

	<!-- Step navigation -->
	{#if stepName !== 'Review'}
		<div class="mt-8 flex justify-between">
			<Button variant="ghost" onclick={prevStep} disabled={currentStep === 0}>Back</Button>
			<Button onclick={nextStep} disabled={!canAdvance()}>Next</Button>
		</div>
	{:else}
		<div class="mt-8">
			<Button variant="ghost" onclick={prevStep}>Back</Button>
		</div>
	{/if}
</div>

<!-- ── Add Items Modal ─────────────────────────────────────────────────── -->
{#if modalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		aria-modal="true"
	>
		<div class="flex h-[85vh] w-full max-w-5xl flex-col rounded-lg bg-background shadow-2xl">
			<div class="flex items-center justify-between border-b px-5 py-3">
				<h2 class="text-lg font-semibold">Add Items</h2>
				<Button variant="ghost" size="sm" onclick={closeAddItemsModal}>Close</Button>
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
				<Input
					placeholder="Min $"
					bind:value={modalMinPrice}
					oninput={onModalSearchChange}
					class="w-24"
				/>
				<Input
					placeholder="Max $"
					bind:value={modalMaxPrice}
					oninput={onModalSearchChange}
					class="w-24"
				/>
			</div>

			<!-- Body -->
			<div class="flex flex-1 overflow-hidden">
				<!-- Catalog list -->
				<div class="w-1/2 overflow-auto border-r">
					{#if modalLoading}
						<div class="p-6 text-center text-sm text-muted-foreground">Loading…</div>
					{:else if visibleProducts.length === 0}
						<div class="p-12 text-center">
							<div class="text-base font-semibold">No products match</div>
							<p class="mt-1 text-sm text-muted-foreground">Adjust the filters above.</p>
						</div>
					{:else}
						<ul class="divide-y">
							{#each visibleProducts as p (p.id)}
								<li>
									<button
										type="button"
										class="w-full px-4 py-3 text-left transition hover:bg-muted/50 {modalSelectedProduct?.id ===
										p.id
											? 'bg-muted/50'
											: ''}"
										onclick={() => selectProduct(p)}
									>
										<div class="font-medium">{p.style_number} — {p.name}</div>
										<div class="text-sm text-muted-foreground">
											{brandName(p.brand_id)} · {p.season_id ? seasonName(p.season_id) : 'No season'}
											· ${p.wholesale_price.toFixed(2)}
										</div>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- Variant selector -->
				<div class="w-1/2 overflow-auto p-5">
					{#if !modalSelectedProduct}
						<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
							Select a product to choose colors and sizes.
						</div>
					{:else}
						{@const p = modalSelectedProduct}
						<div class="mb-4">
							<div class="text-base font-semibold">{p.style_number} — {p.name}</div>
							<div class="text-sm text-muted-foreground">
								{brandName(p.brand_id)} · ${p.wholesale_price.toFixed(2)}
							</div>
						</div>
						{#if p.product_variants.length === 0}
							<p class="text-sm text-muted-foreground">No variants on this product.</p>
						{:else}
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b text-left">
										<th class="py-2">Color</th>
										<th class="py-2">Size</th>
										<th class="py-2">Price</th>
										<th class="py-2 text-right">Qty</th>
									</tr>
								</thead>
								<tbody>
									{#each p.product_variants as v (v.id)}
										<tr class="border-b">
											<td class="py-2">{v.color ?? '—'}</td>
											<td class="py-2">{v.size ?? '—'}</td>
											<td class="py-2">${variantPrice(p, v).toFixed(2)}</td>
											<td class="py-2 text-right">
												<input
													type="number"
													min="0"
													class="h-9 w-20 rounded border bg-background px-2 text-right text-sm"
													value={modalQty[v.id] ?? 0}
													oninput={(e) => {
														const n = parseInt((e.target as HTMLInputElement).value, 10);
														modalQty[v.id] = Number.isNaN(n) ? 0 : Math.max(0, n);
													}}
												/>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
							<div class="mt-4 flex justify-end">
								<Button onclick={commitProductToCart}>Add to cart</Button>
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
