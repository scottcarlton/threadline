<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { SeasonDelivery, ShowDate, Show, SourceType } from '$lib/types/database.js';

	type ShowDateWithShow = ShowDate & { shows?: Pick<Show, 'name'> | null };

	let { data } = $props();
	const accounts = $derived(data.accounts as { id: string; business_name: string; city: string | null; state: string | null }[]);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const seasons = $derived(data.seasons as { id: string; name: string }[]);
	const showDates = $derived(data.showDates as ShowDateWithShow[]);
	const allDeliveries = $derived(data.deliveries as (SeasonDelivery & { seasons?: { name: string } | null })[]);
	const sourceTypes = $derived(data.sourceTypes as SourceType[]);

	const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	function showDateLabel(sd: ShowDateWithShow): string {
		const showName = sd.shows?.name ?? 'Show';
		const month = monthNames[sd.month - 1] ?? '';
		const location = [sd.city, sd.state].filter(Boolean).join(' ');
		return `${showName} — ${month} ${sd.year}${location ? `, ${location}` : ''}`;
	}

	// Steps — buyers skip the Account step since we know their account
	const isBuyer = $derived(data.isBuyer === true);
	const allSteps = ['Account', 'Brand & Delivery', 'Line Items', 'Review'];
	const steps = $derived(isBuyer ? allSteps.slice(1) : allSteps);
	let step = $state(0); // initialized in $effect below

	// Auto-set account for buyers and skip to step 2
	$effect(() => {
		if (isBuyer && accounts.length > 0 && !accountId) {
			accountId = accounts[0].id;
			accountSearch = accounts[0].business_name;
		}
		if (step === 0) {
			step = isBuyer ? 2 : 1;
		}
	});

	// Form state
	let accountId = $state('');
	let brandId = $state('');
	let deliveryId = $state('');
	let orderYear = $state(new Date().getFullYear());
	let showDateId = $state('');
	let sourceTypeId = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	// Combobox state
	let accountSearch = $state('');
	let accountDropdownOpen = $state(false);
	let brandSearch = $state('');
	let brandDropdownOpen = $state(false);

	const filteredAccounts = $derived(
		accountSearch
			? accounts.filter(a => a.business_name.toLowerCase().includes(accountSearch.toLowerCase()) ||
				(a.city?.toLowerCase().includes(accountSearch.toLowerCase()) ?? false))
			: accounts
	);

	const filteredBrands = $derived(
		brandSearch
			? brands.filter(b => b.name.toLowerCase().includes(brandSearch.toLowerCase()))
			: brands
	);

	// Derive season from delivery
	const selectedDelivery = $derived(allDeliveries.find((d) => d.id === deliveryId));
	const seasonId = $derived(selectedDelivery?.season_id ?? '');
	const selectedAccount = $derived(accounts.find((a) => a.id === accountId));
	const selectedBrand = $derived(brands.find((b) => b.id === brandId));
	const selectedSeason = $derived(seasons.find((s) => s.id === seasonId));
	const selectedShowDate = $derived(showDates.find((sd) => sd.id === showDateId));
	const selectedSourceType = $derived(sourceTypes.find((st) => st.id === sourceTypeId));

	// Order items — one per product+color with size run
	type OrderItem = {
		product_id: string | null;
		style_number: string;
		name: string;
		unit_price: number;
		imageId: string | null;
		selectedColor: string;
		availableColors: string[];
		availableSizes: string[];
		sizeQtys: Record<string, number>; // size -> qty
	};
	let orderItems = $state<OrderItem[]>([]);
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function getItemUnits(item: OrderItem): number {
		return Object.values(item.sizeQtys).reduce((sum, q) => sum + (q || 0), 0);
	}
	function getItemTotal(item: OrderItem): number {
		return getItemUnits(item) * item.unit_price;
	}
	const orderTotal = $derived(orderItems.reduce((sum, item) => sum + getItemTotal(item), 0));
	const totalUnits = $derived(orderItems.reduce((sum, item) => sum + getItemUnits(item), 0));

	// Product picker
	type CatalogProduct = { id: string; style_number: string; name: string; wholesale_price: number; category: string | null; product_variants: { id: string; color: string | null; size: string | null; price_override: number | null }[]; product_images: { id: string; is_primary: boolean }[] };
	let catalogProducts = $state<CatalogProduct[]>([]);
	let productSearch = $state('');
	let loadingProducts = $state(false);
	let showManualEntry = $state(false);
	let categoryFilter = $state('');

	const catalogCategories = $derived([...new Set(catalogProducts.map(p => p.category).filter(Boolean))]);
	const filteredCatalog = $derived(
		categoryFilter ? catalogProducts.filter(p => p.category === categoryFilter) : catalogProducts
	);

	async function loadProducts() {
		if (!brandId) return;
		loadingProducts = true;
		const res = await fetch(`/api/products?brand_id=${brandId}&q=${encodeURIComponent(productSearch)}`);
		const data = await res.json();
		catalogProducts = data.products ?? [];
		loadingProducts = false;
	}

	function getPrimaryImageId(product: CatalogProduct): string | null {
		const primary = product.product_images?.find(i => i.is_primary);
		return primary?.id ?? product.product_images?.[0]?.id ?? null;
	}

	function getProductColors(product: CatalogProduct): string[] {
		return [...new Set(product.product_variants.map(v => v.color).filter(Boolean) as string[])];
	}

	function getProductSizes(product: CatalogProduct): string[] {
		return [...new Set(product.product_variants.map(v => v.size).filter(Boolean) as string[])];
	}

	function addProduct(product: CatalogProduct) {
		const colors = getProductColors(product);
		const sizes = getProductSizes(product);
		const sizeQtys: Record<string, number> = {};
		for (const s of sizes) sizeQtys[s] = 0;

		orderItems = [...orderItems, {
			product_id: product.id,
			style_number: product.style_number,
			name: product.name,
			unit_price: product.wholesale_price,
			imageId: getPrimaryImageId(product),
			selectedColor: colors[0] ?? '',
			availableColors: colors,
			availableSizes: sizes,
			sizeQtys
		}];
	}

	function removeItem(index: number) {
		orderItems = orderItems.filter((_, i) => i !== index);
	}

	$effect(() => {
		if (brandId) {
			productSearch = '';
			categoryFilter = '';
			loadProducts();
		} else {
			catalogProducts = [];
		}
	});

	async function handleSubmit(asDraft: boolean) {
		error = '';
		loading = true;

		let expectedShipDate: string | null = null;
		if (selectedDelivery && orderYear) {
			const month = String(selectedDelivery.delivery_month).padStart(2, '0');
			const day = String(selectedDelivery.delivery_day).padStart(2, '0');
			expectedShipDate = `${orderYear}-${month}-${day}`;
		}

		const { data: order, error: orderErr } = await supabase
			.from('orders')
			.insert({
				organization_id: data.organization?.id,
				account_id: accountId,
				brand_id: brandId,
				season_id: seasonId || null,
				delivery_id: deliveryId || null,
				order_year: orderYear || null,
				expected_ship_date: expectedShipDate,
				show_date_id: showDateId || null,
				source_type_id: sourceTypeId || null,
				notes: notes || null,
				status: asDraft ? 'draft' : 'submitted',
				submitted_at: asDraft ? null : new Date().toISOString(),
				created_by: data.user?.id
			})
			.select()
			.single();

		if (orderErr || !order) {
			error = orderErr?.message ?? 'Failed to create order';
			loading = false;
			return;
		}

		// Flatten order items into individual order_lines (one per size with qty > 0)
		const flatLines: { product_id: string | null; style_number: string; description: string; color: string; size: string; qty: number; unit_price: number }[] = [];
		for (const item of orderItems) {
			if (item.availableSizes.length > 0) {
				for (const size of item.availableSizes) {
					const qty = item.sizeQtys[size] || 0;
					if (qty > 0) {
						flatLines.push({
							product_id: item.product_id,
							style_number: item.style_number,
							description: item.name,
							color: item.selectedColor,
							size,
							qty,
							unit_price: item.unit_price
						});
					}
				}
			} else {
				// No sizes — single line
				const totalQty = Object.values(item.sizeQtys).reduce((s, q) => s + (q || 0), 0) || getItemUnits(item);
				if (totalQty > 0) {
					flatLines.push({
						product_id: item.product_id,
						style_number: item.style_number,
						description: item.name,
						color: item.selectedColor,
						size: '',
						qty: totalQty,
						unit_price: item.unit_price
					});
				}
			}
		}

		if (flatLines.length > 0) {
			const { error: lineErr } = await supabase.from('order_lines').insert(
				flatLines.map((l, i) => ({
					order_id: order.id,
					product_id: l.product_id || null,
					variant_id: null,
					style_number: l.style_number || null,
					description: l.description || null,
					color: l.color || null,
					size: l.size || null,
					qty: l.qty,
					unit_price: l.unit_price,
					sort_order: i
				}))
			);

			if (lineErr) {
				error = lineErr.message;
				loading = false;
				return;
			}
		}

		loading = false;
		goto(`/orders/${order.id}`);
	}
</script>

<div class="mx-auto max-w-3xl space-y-6">
	<!-- Step indicator -->
	<div class="flex items-center gap-2">
		{#each steps as s, i}
			{@const stepNum = isBuyer ? i + 2 : i + 1}
			<button
				class="flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors {stepNum === step ? 'bg-primary text-primary-foreground' : stepNum < step ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}"
				onclick={() => { if (stepNum < step) step = stepNum; }}
			>
				{#if stepNum < step}
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
					</svg>
				{/if}
				{s}
			</button>
			{#if i < steps.length - 1}
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			{/if}
		{/each}
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}

	<!-- Step 1: Account (Combobox) -->
	{#if step === 1}
		<Card>
			<CardHeader>
				<CardTitle>Account</CardTitle>
				<CardDescription>Which buyer is this order for?</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="relative">
					<Input
						placeholder="Search accounts..."
						bind:value={accountSearch}
						onfocus={() => (accountDropdownOpen = true)}
						oninput={() => (accountDropdownOpen = true)}
					/>
					{#if accountId && selectedAccount}
						<div class="pointer-events-none absolute inset-y-0 right-3 flex items-center">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
							</svg>
						</div>
					{/if}
					{#if accountDropdownOpen && filteredAccounts.length > 0}
						<div class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-none border bg-card shadow-lg">
							{#each filteredAccounts as account}
								<button
									class="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors {accountId === account.id ? 'bg-primary/5' : ''}"
									onclick={() => { accountId = account.id; accountSearch = account.business_name; accountDropdownOpen = false; }}
								>
									<div>
										<p class="font-medium">{account.business_name}</p>
										{#if account.city || account.state}
											<p class="text-sm text-muted-foreground">{[account.city, account.state].filter(Boolean).join(', ')}</p>
										{/if}
									</div>
									{#if accountId === account.id}
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
											<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
										</svg>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" href="/orders">Cancel</Button>
				<Button disabled={!accountId} onclick={() => (step = 2)}>Next</Button>
			</CardFooter>
		</Card>
	{/if}

	<!-- Step 2: Brand & Delivery -->
	{#if step === 2}
		<Card>
			<CardHeader>
				<CardTitle>Brand & Delivery</CardTitle>
				<CardDescription>Select the brand and delivery window</CardDescription>
			</CardHeader>
			<CardContent class="space-y-5">
				<!-- Brand combobox -->
				<div class="space-y-2">
					<Label>Brand *</Label>
					<div class="relative">
						<Input
							placeholder="Search brands..."
							bind:value={brandSearch}
							onfocus={() => (brandDropdownOpen = true)}
							oninput={() => (brandDropdownOpen = true)}
						/>
						{#if brandId && selectedBrand}
							<div class="pointer-events-none absolute inset-y-0 right-3 flex items-center">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
									<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
								</svg>
							</div>
						{/if}
						{#if brandDropdownOpen && filteredBrands.length > 0}
							<div class="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-none border bg-card shadow-lg">
								{#each filteredBrands as brand}
									<button
										class="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-muted/50 transition-colors {brandId === brand.id ? 'bg-primary/5' : ''}"
										onclick={() => { brandId = brand.id; brandSearch = brand.name; brandDropdownOpen = false; }}
									>
										<span class="font-medium">{brand.name}</span>
										{#if brandId === brand.id}
											<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
												<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
											</svg>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>

				<!-- Delivery (drives season automatically) -->
				<div class="space-y-2">
					<Label for="delivery">Delivery Window</Label>
					<p class="text-sm text-muted-foreground">Season is set automatically from the delivery</p>
					<select
						id="delivery"
						bind:value={deliveryId}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<option value="">Select delivery...</option>
						{#each seasons as season}
							{@const seasonDeliveries = allDeliveries.filter((d) => d.season_id === season.id)}
							{#if seasonDeliveries.length > 0}
								<optgroup label={season.name}>
									{#each seasonDeliveries as delivery}
										<option value={delivery.id}>{delivery.delivery_month}/01 – {delivery.delivery_month}/{String(delivery.delivery_day).padStart(2, '0')}</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					</select>
					{#if selectedDelivery && selectedSeason}
						<p class="text-sm text-muted-foreground">Season: <span class="font-medium text-foreground">{selectedSeason.name}</span></p>
					{/if}
				</div>

				<!-- Year -->
				<div class="space-y-2">
					<Label for="year">Year</Label>
					<Input id="year" type="number" bind:value={orderYear} min={2020} max={2040} />
				</div>

				<!-- Source (hidden for buyers — source is the web portal) -->
				{#if !isBuyer}
				<div class="space-y-2">
					<Label for="source">Source</Label>
					<select
						id="source"
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						value={showDateId ? `show:${showDateId}` : sourceTypeId ? `source:${sourceTypeId}` : ''}
						onchange={(e) => {
							const val = (e.target as HTMLSelectElement).value;
							if (val.startsWith('show:')) { showDateId = val.slice(5); sourceTypeId = ''; }
							else if (val.startsWith('source:')) { sourceTypeId = val.slice(7); showDateId = ''; }
							else { showDateId = ''; sourceTypeId = ''; }
						}}
					>
						<option value="">Select source...</option>
						{#if sourceTypes.length > 0}
							<optgroup label="Sources">
								{#each sourceTypes as st}
									<option value="source:{st.id}">{st.name}</option>
								{/each}
							</optgroup>
						{/if}
						{#if showDates.length > 0}
							<optgroup label="Shows">
								{#each showDates as sd}
									<option value="show:{sd.id}">{showDateLabel(sd)}</option>
								{/each}
							</optgroup>
						{/if}
					</select>
				</div>
				{/if}
			</CardContent>
			<CardFooter class="justify-between">
				{#if isBuyer}
					<Button variant="outline" href="/orders">Cancel</Button>
				{:else}
					<Button variant="outline" onclick={() => (step = 1)}>Back</Button>
				{/if}
				<Button disabled={!brandId} onclick={() => (step = 3)}>Next</Button>
			</CardFooter>
		</Card>
	{/if}

	<!-- Step 3: Line Items -->
	{#if step === 3}
		<Card>
			<CardHeader>
				<CardTitle>Line Items</CardTitle>
				<CardDescription>Add products to this order</CardDescription>
			</CardHeader>
			<CardContent>
				<!-- Product catalog (one row per product) -->
				{#if catalogProducts.length > 0}
					<div class="mb-5">
						<div class="flex items-center gap-3 mb-3">
							<Input
								placeholder="Search products..."
								bind:value={productSearch}
								oninput={() => loadProducts()}
								class="flex-1"
							/>
							{#if catalogCategories.length > 1}
								<select
									class="h-10 rounded-md border border-input bg-background px-3 text-sm"
									bind:value={categoryFilter}
								>
									<option value="">All Categories</option>
									{#each catalogCategories as cat}
										<option value={cat}>{cat}</option>
									{/each}
								</select>
							{/if}
						</div>
						<div class="max-h-72 overflow-y-auto rounded-none border divide-y">
							{#each filteredCatalog as product}
								{@const imageId = getPrimaryImageId(product)}
								{@const colors = getProductColors(product)}
								<button
									class="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/50 transition-colors"
									onclick={() => addProduct(product)}
								>
									<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
										{#if imageId}
											<img src="/api/products/{product.id}/images/{imageId}" alt="" class="h-full w-full object-cover" />
										{/if}
									</div>
									<div class="flex-1 min-w-0">
										<p class="text-xs">{product.style_number}</p>
										<p class="text-sm font-semibold truncate">{product.name}</p>
										{#if colors.length > 0}<p class="text-xs text-muted-foreground mt-0.5">{colors.join(', ')}</p>{/if}
									</div>
									<div class="shrink-0 text-right">
										<p class="text-sm font-medium">{fmt.format(product.wholesale_price)}</p>
										<p class="text-xs text-primary mt-0.5">+ Add</p>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{:else if brandId && !loadingProducts}
					<p class="mb-4 text-sm text-muted-foreground">No products in catalog. Add items manually below.</p>
				{:else if loadingProducts}
					<p class="mb-4 text-sm text-muted-foreground">Loading products...</p>
				{/if}

				<!-- Order items (size run cards) -->
				{#if orderItems.length > 0}
					<div class="space-y-4">
						<p class="text-sm font-medium">Order Items ({orderItems.length})</p>
						{#each orderItems as item, i}
							<div class="rounded-none border p-4 space-y-3">
								<!-- Header row: thumbnail, name, price, remove -->
								<div class="flex items-center gap-3">
									{#if item.imageId && item.product_id}
										<div class="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
											<img src="/api/products/{item.product_id}/images/{item.imageId}" alt="" class="h-full w-full object-cover" />
										</div>
									{:else}
										<div class="h-12 w-12 shrink-0 rounded-lg bg-muted"></div>
									{/if}
									<div class="flex-1 min-w-0">
										<p class="text-xs">{item.style_number}</p>
										<p class="text-sm font-semibold truncate">{item.name}</p>
										<p class="text-xs text-muted-foreground mt-0.5">{fmt.format(item.unit_price)}</p>
									</div>
									<button aria-label="Remove item" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors" onclick={() => removeItem(i)}>
										<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									</button>
								</div>

								<!-- Color selector -->
								{#if item.availableColors.length > 0}
									<div class="flex items-center gap-2">
										<span class="text-sm text-muted-foreground">Color:</span>
										{#each item.availableColors as color}
											<button
												class="rounded-full px-3 py-1 text-sm font-medium transition-colors {item.selectedColor === color ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}"
												onclick={() => { item.selectedColor = color; }}
											>
												{color}
											</button>
										{/each}
									</div>
								{/if}

								<!-- Size run grid -->
								{#if item.availableSizes.length > 0}
									<div class="flex items-center gap-1 flex-wrap">
										{#each item.availableSizes as size}
											<div class="flex flex-col items-center gap-1">
												<span class="text-[11px] font-medium text-muted-foreground">{size}</span>
												<input
													type="number"
													min="0"
													value={item.sizeQtys[size] || ''}
													oninput={(e) => { item.sizeQtys[size] = parseInt((e.target as HTMLInputElement).value) || 0; orderItems = [...orderItems]; }}
													placeholder="0"
													class="h-9 w-14 rounded-lg border border-input bg-background text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
												/>
											</div>
										{/each}
									</div>
								{:else}
									<!-- No sizes — single qty -->
									<div class="flex items-center gap-2">
										<span class="text-sm text-muted-foreground">Qty:</span>
										<input
											type="number"
											min="1"
											value={item.sizeQtys['default'] || ''}
											oninput={(e) => { item.sizeQtys['default'] = parseInt((e.target as HTMLInputElement).value) || 0; orderItems = [...orderItems]; }}
											placeholder="0"
											class="h-9 w-20 rounded-lg border border-input bg-background text-center text-sm focus:outline-none focus:ring-2 focus:ring-ring/20"
										/>
									</div>
								{/if}

								<!-- Line summary -->
								<div class="flex items-center justify-between text-sm border-t pt-2">
									<span class="text-muted-foreground">{getItemUnits(item)} units</span>
									<span class="font-medium">{fmt.format(getItemTotal(item))}</span>
								</div>
							</div>
						{/each}

						<div class="flex justify-end pt-2 border-t">
							<p class="text-sm">{totalUnits} units &middot; <span class="text-lg font-bold ml-1">{fmt.format(orderTotal)}</span></p>
						</div>
					</div>
				{/if}

				<!-- Manual entry -->
				{#if showManualEntry}
					<div class="mt-4 space-y-3 rounded-none border border-dashed p-4">
						<p class="text-sm font-medium">Manual Entry</p>
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-1">
								<Label for="manual-style">Style # — Name</Label>
								<Input id="manual-style" placeholder="ST-001 Silk Blouse" />
							</div>
							<div class="space-y-1">
								<Label for="manual-color">Color</Label>
								<Input id="manual-color" placeholder="Navy" />
							</div>
							<div class="space-y-1">
								<Label for="manual-qty">Qty</Label>
								<Input id="manual-qty" type="number" value="1" min="1" />
							</div>
							<div class="space-y-1">
								<Label for="manual-price">Price</Label>
								<Input id="manual-price" type="number" step="0.01" placeholder="0.00" />
							</div>
						</div>
						<div class="flex gap-2">
							<Button size="sm" onclick={() => {
								const raw = (document.getElementById('manual-style') as HTMLInputElement)?.value ?? '';
								const color = (document.getElementById('manual-color') as HTMLInputElement)?.value ?? '';
								const qty = parseInt((document.getElementById('manual-qty') as HTMLInputElement)?.value ?? '1') || 1;
								const price = parseFloat((document.getElementById('manual-price') as HTMLInputElement)?.value ?? '0') || 0;
								const parts = raw.split(/\s+(.+)/);
								orderItems = [...orderItems, {
									product_id: null, style_number: parts[0] ?? raw, name: parts[1] ?? '',
									unit_price: price, imageId: null, selectedColor: color,
									availableColors: [], availableSizes: [],
									sizeQtys: { default: qty }
								}];
								showManualEntry = false;
							}}>Add to Order</Button>
							<Button variant="outline" size="sm" onclick={() => (showManualEntry = false)}>Cancel</Button>
						</div>
					</div>
				{:else}
					<div class="mt-3">
						<button class="text-sm text-muted-foreground hover:text-foreground transition-colors" onclick={() => (showManualEntry = true)}>
							+ Add manual item
						</button>
					</div>
				{/if}
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (step = 2)}>Back</Button>
				<Button onclick={() => (step = 4)} disabled={orderItems.length === 0 || totalUnits === 0}>Review</Button>
			</CardFooter>
		</Card>
	{/if}

	<!-- Step 4: Review -->
	{#if step === 4}
		<Card>
			<CardHeader>
				<CardTitle>Review Order</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<dl class="space-y-3">
					<div class="flex justify-between">
						<dt class="text-sm text-muted-foreground">Account</dt>
						<dd class="text-sm font-medium">{selectedAccount?.business_name}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-sm text-muted-foreground">Brand</dt>
						<dd class="text-sm font-medium">{selectedBrand?.name}</dd>
					</div>
					{#if selectedSeason}
						<div class="flex justify-between">
							<dt class="text-sm text-muted-foreground">Season</dt>
							<dd class="text-sm font-medium">{selectedSeason.name} {orderYear}</dd>
						</div>
					{/if}
					{#if selectedDelivery}
						<div class="flex justify-between">
							<dt class="text-sm text-muted-foreground">Delivery</dt>
							<dd class="text-sm font-medium">{selectedDelivery.delivery_month}/01 – {selectedDelivery.delivery_month}/{String(selectedDelivery.delivery_day).padStart(2, '0')}</dd>
						</div>
					{/if}
					{#if !isBuyer}
						{#if selectedShowDate}
							<div class="flex justify-between">
								<dt class="text-sm text-muted-foreground">Source</dt>
								<dd class="text-sm font-medium">{showDateLabel(selectedShowDate)}</dd>
							</div>
						{:else if selectedSourceType}
							<div class="flex justify-between">
								<dt class="text-sm text-muted-foreground">Source</dt>
								<dd class="text-sm font-medium">{selectedSourceType.name}</dd>
							</div>
						{/if}
					{/if}
				</dl>

				<!-- Line items -->
				<div class="space-y-3">
					{#each orderItems as item}
						<div class="rounded-none border p-4">
							<div class="flex items-center gap-3">
								{#if item.imageId && item.product_id}
									<div class="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
										<img src="/api/products/{item.product_id}/images/{item.imageId}" alt="" class="h-full w-full object-cover" />
									</div>
								{/if}
								<div class="flex-1 min-w-0">
									<p class="text-xs">{item.style_number}</p>
									<p class="text-sm font-semibold truncate">{item.name}</p>
									<p class="text-xs text-muted-foreground mt-0.5">
										{item.selectedColor ? `${item.selectedColor} · ` : ''}{getItemUnits(item)} units
										{#if item.availableSizes.length > 0}
											({item.availableSizes.filter(s => (item.sizeQtys[s] || 0) > 0).map(s => `${s}:${item.sizeQtys[s]}`).join(', ')})
										{/if}
									</p>
								</div>
								<p class="shrink-0 text-sm font-medium">{fmt.format(getItemTotal(item))}</p>
							</div>
						</div>
					{/each}
					<div class="flex justify-end pt-2 border-t">
						<p class="text-sm">{totalUnits} units &middot; <span class="text-lg font-bold ml-1">{fmt.format(orderTotal)}</span></p>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="order-notes">Notes</Label>
					<textarea
						id="order-notes"
						bind:value={notes}
						rows="2"
						placeholder="Order notes..."
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					></textarea>
				</div>
			</CardContent>
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (step = 3)}>Back</Button>
				<div class="flex gap-2">
					<Button variant="outline" disabled={loading} onclick={() => handleSubmit(true)}>
						{loading ? 'Saving...' : 'Save as Notes Out'}
					</Button>
					<Button disabled={loading} onclick={() => handleSubmit(false)}>
						{loading ? 'Submitting...' : 'Submit Order'}
					</Button>
				</div>
			</CardFooter>
		</Card>
	{/if}
</div>

<!-- Close dropdowns on outside click -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
{#if accountDropdownOpen || brandDropdownOpen}
	<div class="fixed inset-0 z-0" onclick={() => { accountDropdownOpen = false; brandDropdownOpen = false; }}></div>
{/if}
