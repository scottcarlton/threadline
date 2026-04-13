<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cart } from '$lib/stores/cart.js';
	import type { CartItem } from '$lib/stores/cart.js';
	import type { SeasonDelivery } from '$lib/types/database.js';

	let { data } = $props();

	const items = $derived($cart);
	const deliveries = $derived(
		data.deliveries as (SeasonDelivery & { seasons?: { name: string } | null })[]
	);
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Group items by brand
	type BrandGroup = {
		brandId: string;
		brandName: string;
		items: CartItem[];
		deliveryId: string;
	};

	// State: delivery selection per brand, quantities per product per color per size
	let deliveryByBrand = $state<Record<string, string>>({});
	let quantities = $state<Record<string, Record<string, Record<string, number>>>>({});
	// quantities[productId][color][size] = qty

	let submitting = $state(false);
	let error = $state('');

	const brandGroups = $derived.by(() => {
		const groups = new Map<string, BrandGroup>();
		for (const item of items) {
			const brandId = item.brandId ?? 'unknown';
			const brandName = item.brandName ?? 'Unknown';
			if (!groups.has(brandId)) {
				groups.set(brandId, {
					brandId,
					brandName,
					items: [],
					deliveryId: deliveryByBrand[brandId] ?? ''
				});
			}
			groups.get(brandId)!.items.push(item);
		}
		return Array.from(groups.values());
	});

	// Get selected color per product (default to first)
	let selectedColors = $state<Record<string, string>>({});

	function getSelectedColor(productId: string, colors: string[]): string {
		return selectedColors[productId] ?? colors[0] ?? '';
	}

	function setColor(productId: string, color: string) {
		selectedColors = { ...selectedColors, [productId]: color };
	}

	function getQty(productId: string, color: string, size: string): number {
		return quantities[productId]?.[color]?.[size] ?? 0;
	}

	function setQty(productId: string, color: string, size: string, value: number) {
		const qty = Math.max(0, Math.floor(value) || 0);
		quantities = {
			...quantities,
			[productId]: {
				...quantities[productId],
				[color]: {
					...quantities[productId]?.[color],
					[size]: qty
				}
			}
		};
	}

	// Compute totals
	function getItemTotal(item: CartItem): number {
		let total = 0;
		const colorQtys = quantities[item.productId];
		if (!colorQtys) return 0;
		for (const color of Object.keys(colorQtys)) {
			for (const size of Object.keys(colorQtys[color])) {
				total += (colorQtys[color][size] ?? 0) * item.price;
			}
		}
		return total;
	}

	function getItemQtyCount(item: CartItem): number {
		let total = 0;
		const colorQtys = quantities[item.productId];
		if (!colorQtys) return 0;
		for (const color of Object.keys(colorQtys)) {
			for (const size of Object.keys(colorQtys[color])) {
				total += colorQtys[color][size] ?? 0;
			}
		}
		return total;
	}

	const brandTotals = $derived.by(() => {
		const totals = new Map<string, { qty: number; amount: number }>();
		for (const group of brandGroups) {
			let qty = 0;
			let amount = 0;
			for (const item of group.items) {
				qty += getItemQtyCount(item);
				amount += getItemTotal(item);
			}
			totals.set(group.brandId, { qty, amount });
		}
		return totals;
	});

	const grandTotal = $derived(
		Array.from(brandTotals.values()).reduce((sum, t) => sum + t.amount, 0)
	);

	const totalQty = $derived(Array.from(brandTotals.values()).reduce((sum, t) => sum + t.qty, 0));

	// Validation
	const canSubmit = $derived.by(() => {
		if (totalQty === 0) return false;
		for (const group of brandGroups) {
			if (!deliveryByBrand[group.brandId]) return false;
			const bt = brandTotals.get(group.brandId);
			if (!bt || bt.qty === 0) return false;
		}
		return true;
	});

	// Group deliveries by season for the dropdown
	const deliveriesBySeason = $derived.by(() => {
		const groups = new Map<string, { seasonName: string; deliveries: typeof deliveries }>();
		for (const d of deliveries) {
			const seasonName = d.seasons?.name ?? 'Other';
			if (!groups.has(seasonName)) {
				groups.set(seasonName, { seasonName, deliveries: [] });
			}
			groups.get(seasonName)!.deliveries.push(d);
		}
		return Array.from(groups.values());
	});

	async function submitOrders() {
		if (!canSubmit || submitting) return;
		submitting = true;
		error = '';

		try {
			for (const group of brandGroups) {
				const deliveryId = deliveryByBrand[group.brandId];
				const delivery = deliveries.find((d) => d.id === deliveryId);
				if (!delivery) continue;

				const bt = brandTotals.get(group.brandId);
				if (!bt || bt.qty === 0) continue;

				// Calculate expected ship date
				const orderYear = new Date().getFullYear();
				const month = String(delivery.delivery_month).padStart(2, '0');
				const day = String(delivery.delivery_day).padStart(2, '0');
				const expectedShipDate = `${orderYear}-${month}-${day}`;

				// Create order
				const { data: newOrder, error: orderErr } = await supabase
					.from('orders')
					.insert({
						organization_id: data.organizationId,
						account_id: data.accountId,
						brand_id: group.brandId,
						season_id: delivery.season_id,
						delivery_id: deliveryId,
						order_year: orderYear,
						expected_ship_date: expectedShipDate,
						status: 'draft',
						created_by: data.user?.id,
						notes: null
					})
					.select('id')
					.single();

				if (orderErr || !newOrder) {
					error = `Failed to create order for ${group.brandName}: ${orderErr?.message}`;
					submitting = false;
					return;
				}

				// Build order lines
				const lines: Array<{
					order_id: string;
					product_id: string;
					style_number: string;
					description: string;
					color: string;
					size: string;
					qty: number;
					unit_price: number;
				}> = [];

				for (const item of group.items) {
					const colorQtys = quantities[item.productId];
					if (!colorQtys) continue;
					for (const color of Object.keys(colorQtys)) {
						for (const size of Object.keys(colorQtys[color])) {
							const qty = colorQtys[color][size];
							if (qty > 0) {
								lines.push({
									order_id: newOrder.id,
									product_id: item.productId,
									style_number: item.styleNumber,
									description: item.productName,
									color,
									size,
									qty,
									unit_price: item.price
								});
							}
						}
					}
				}

				if (lines.length > 0) {
					const { error: lineErr } = await supabase.from('order_lines').insert(lines);

					if (lineErr) {
						error = `Order created but lines failed for ${group.brandName}: ${lineErr.message}`;
						submitting = false;
						return;
					}
				}

				// Update order total and submit
				const total = lines.reduce((sum, l) => sum + l.qty * l.unit_price, 0);
				await supabase
					.from('orders')
					.update({
						total_amount: total,
						status: 'submitted',
						submitted_at: new Date().toISOString()
					})
					.eq('id', newOrder.id);
			}

			cart.clearCart();
			goto('/orders');
		} catch (err) {
			error = 'Something went wrong. Please try again.';
			submitting = false;
		}
	}
</script>

<div class="mx-auto max-w-6xl space-y-6">
	<a
		href="/shop/cart"
		class="inline-flex items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground"
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-4 w-4"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
		</svg>
		Back to Cart
	</a>

	<h1 class="text-3xl">Checkout</h1>

	{#if error}
		<div class="rounded-lg bg-destructive/10 p-4 text-base text-destructive">{error}</div>
	{/if}

	{#if items.length === 0}
		<div class="rounded-none p-12 text-center">
			<p class="text-lg font-semibold">Your cart is empty</p>
			<p class="mt-2 text-base text-muted-foreground">Add items from the shop to get started</p>
			<Button href="/shop" variant="outline" class="mt-4">Browse Shop</Button>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
			<!-- Brand groups -->
			<div class="space-y-6">
				{#each brandGroups as group}
					{@const bt = brandTotals.get(group.brandId)}
					<div class="rounded-none border bg-card">
						<!-- Brand header -->
						<div class="flex items-center justify-between border-b px-5 py-4">
							<h2 class="text-lg font-semibold">{group.brandName}</h2>
							{#if bt && bt.qty > 0}
								<span class="text-base text-muted-foreground"
									>{bt.qty} units &middot; {fmt.format(bt.amount)}</span
								>
							{/if}
						</div>

						<!-- Delivery selection -->
						<div class="border-b px-5 py-4">
							<label class="text-sm font-medium text-muted-foreground">Delivery Window</label>
							<select
								class="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								value={deliveryByBrand[group.brandId] ?? ''}
								onchange={(e) => {
									deliveryByBrand = {
										...deliveryByBrand,
										[group.brandId]: (e.target as HTMLSelectElement).value
									};
								}}
							>
								<option value="">Select delivery...</option>
								{#each deliveriesBySeason as seasonGroup}
									<optgroup label={seasonGroup.seasonName}>
										{#each seasonGroup.deliveries as d}
											<option value={d.id}>{d.label}</option>
										{/each}
									</optgroup>
								{/each}
							</select>
						</div>

						<!-- Items -->
						<div class="divide-y">
							{#each group.items as item}
								{@const colors = item.colors ?? []}
								{@const sizes = item.sizes ?? []}
								{@const color =
									colors.length > 0 ? getSelectedColor(item.productId, colors) : '_default'}
								{@const itemQty = getItemQtyCount(item)}
								<div class="space-y-3 px-5 py-4">
									<!-- Product info -->
									<div class="flex items-start gap-3">
										{#if item.imageUrl}
											<img
												src={item.imageUrl}
												alt={item.productName}
												class="h-14 w-14 shrink-0 rounded-lg object-cover"
											/>
										{/if}
										<div class="min-w-0 flex-1">
											<p class="text-base">{item.productName}</p>
											<p class="text-sm text-muted-foreground">
												{item.styleNumber} &middot; {fmt.format(item.price)}/unit
											</p>
										</div>
										{#if itemQty > 0}
											<span class="text-base">{fmt.format(itemQty * item.price)}</span>
										{/if}
									</div>

									<!-- Color selector -->
									{#if colors.length > 1}
										<div class="flex flex-wrap gap-1.5">
											{#each colors as c}
												<button
													class="rounded-full border px-3 py-1 text-sm transition-colors {c ===
													color
														? 'border-primary bg-primary/10 text-foreground'
														: 'text-muted-foreground hover:border-foreground/20'}"
													onclick={() => setColor(item.productId, c)}
												>
													{c}
												</button>
											{/each}
										</div>
									{:else if colors.length === 1}
										<p class="text-sm text-muted-foreground">Color: {colors[0]}</p>
									{/if}

									<!-- Size grid -->
									{#if sizes.length > 0}
										<div class="flex flex-wrap gap-2">
											{#each sizes as size}
												<div class="flex flex-col items-center gap-1">
													<span class="text-xs text-muted-foreground">{size}</span>
													<Input
														type="number"
														min="0"
														class="h-9 w-16 text-center text-base"
														value={getQty(item.productId, color, size)}
														onchange={(e) =>
															setQty(
																item.productId,
																color,
																size,
																parseInt((e.target as HTMLInputElement).value) || 0
															)}
													/>
												</div>
											{/each}
										</div>
									{:else}
										<p class="text-sm text-muted-foreground">
											No sizes configured for this product
										</p>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<!-- Summary sidebar -->
			<div class="h-fit lg:sticky lg:top-6">
				<div class="space-y-4 rounded-none border bg-card p-5">
					<h2 class="text-base font-semibold">Order Summary</h2>

					<dl class="space-y-3 text-base">
						{#each brandGroups as group}
							{@const bt = brandTotals.get(group.brandId)}
							<div>
								<dt class="font-medium">{group.brandName}</dt>
								<dd class="text-muted-foreground">
									{bt?.qty ?? 0} units &middot; {fmt.format(bt?.amount ?? 0)}
								</dd>
							</div>
						{/each}

						<div class="h-px bg-border"></div>

						<div class="flex justify-between">
							<dt>Total</dt>
							<dd class="font-semibold">{fmt.format(grandTotal)}</dd>
						</div>
						<div class="flex justify-between text-muted-foreground">
							<dt>Orders</dt>
							<dd>{brandGroups.length}</dd>
						</div>
						<div class="flex justify-between text-muted-foreground">
							<dt>Total Units</dt>
							<dd>{totalQty}</dd>
						</div>
					</dl>

					<Button class="w-full" disabled={!canSubmit || submitting} onclick={submitOrders}>
						{#if submitting}
							Placing Orders...
						{:else}
							Place {brandGroups.length} Order{brandGroups.length !== 1 ? 's' : ''}
						{/if}
					</Button>

					<Button href="/shop/cart" variant="outline" class="w-full">Back to Cart</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
