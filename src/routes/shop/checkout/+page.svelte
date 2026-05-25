<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import DateSelect from '$lib/components/ui/date-select.svelte';
	import { Dialog } from 'bits-ui';
	import { cart } from '$lib/stores/cart.js';
	import type { CartItem } from '$lib/stores/cart.js';
	import type { SeasonDelivery } from '$lib/types/database.js';
	import { acceptedMethodsOnly, acceptedTermsOnly } from '$lib/payment-methods';
	import { SHIPPING_METHODS } from '$lib/schemas/order-finalize';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const items = $derived($cart);
	const deliveries = $derived(
		data.deliveries as (SeasonDelivery & { seasons?: { name: string } | null })[]
	);
	const seasons = $derived(
		(data.seasons ?? []) as Array<{ id: string; name: string; sort_order: number | null }>
	);
	const account = $derived(
		data.account as {
			id: string;
			business_name: string;
			contact_email: string | null;
			payment_preference: string | null;
			payment_terms: string | null;
			shipping_method: string | null;
		} | null
	);
	type LocationRow = {
		id: string;
		account_id: string;
		label: string;
		contact_first_name: string | null;
		contact_last_name: string | null;
		contact_email: string | null;
		phone: string | null;
		address_line1: string | null;
		address_line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
		is_default: boolean;
	};
	const locations = $derived((data.locations ?? []) as LocationRow[]);
	const brandTerms = $derived(
		(data.brandTerms ?? []) as Array<{
			id: string;
			brand_id: string;
			title: string;
			body: string;
			version: number;
		}>
	);
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const NO_SEASON = '__no_season__';

	// ── Steps ────────────────────────────────────────────────────────────
	const steps = ['Cart', 'Delivery', 'Finalize'] as const;
	let currentStep = $state(1);
	const stepName = $derived(steps[currentStep]);

	function canAdvance(): boolean {
		switch (stepName) {
			case 'Delivery':
				return (
					orderGroups.length > 0 &&
					orderGroups.every((g) => {
						const d = getShipDates(g.key);
						return !!d.startShip && !!d.completeShip;
					})
				);
			case 'Finalize':
				return true;
		}
		return true;
	}

	function nextStep() {
		if (currentStep < steps.length - 1) currentStep++;
	}
	function prevStep() {
		if (currentStep <= 1) {
			goto(resolve('/shop/cart'));
		} else {
			currentStep--;
		}
	}

	// ── Grouping ─────────────────────────────────────────────────────────
	type OrderGroup = {
		key: string;
		brandId: string;
		brandName: string;
		seasonId: string | null;
		seasonName: string | null;
		items: CartItem[];
	};

	type ShipDates = { startShip: string; completeShip: string };

	let shipDatesByGroup = $state<Record<string, ShipDates>>({});

	function groupKey(brandId: string, seasonId: string | null): string {
		return `${brandId}::${seasonId ?? NO_SEASON}`;
	}

	function seasonNameById(id: string | null): string | null {
		if (!id) return null;
		return seasons.find((s) => s.id === id)?.name ?? null;
	}

	function getItemUnits(item: CartItem): number {
		return Object.values(item.sizeQtys).reduce((s, q) => s + (q || 0), 0);
	}

	function getItemTotal(item: CartItem): number {
		return getItemUnits(item) * item.price;
	}

	const orderGroups = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const map = new Map<string, OrderGroup>();
		for (const item of items) {
			if (getItemUnits(item) === 0) continue;
			const brandId = item.brandId ?? 'unknown';
			const brandName = item.brandName ?? 'Unknown';
			const sId = item.seasonId;
			const key = groupKey(brandId, sId);
			let g = map.get(key);
			if (!g) {
				g = {
					key,
					brandId,
					brandName,
					seasonId: sId,
					seasonName: seasonNameById(sId) ?? item.seasonName,
					items: []
				};
				map.set(key, g);
			}
			g.items.push(item);
		}
		return Array.from(map.values());
	});

	// Seed ship dates from season delivery windows
	$effect(() => {
		const orderYear = String(new Date().getFullYear());
		for (const g of orderGroups) {
			if (shipDatesByGroup[g.key]) continue;
			const lastPreset = deliveries
				.filter((d) => d.season_id === g.seasonId)
				.sort((a, b) => b.delivery_month - a.delivery_month || b.delivery_day - a.delivery_day)[0];
			if (lastPreset) {
				const mm = String(lastPreset.delivery_month).padStart(2, '0');
				const dd = String(lastPreset.delivery_day).padStart(2, '0');
				shipDatesByGroup = {
					...shipDatesByGroup,
					[g.key]: {
						startShip: `${orderYear}-${mm}-01`,
						completeShip: `${orderYear}-${mm}-${dd}`
					}
				};
			} else {
				const today = new Date();
				const plus30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
				const fmtDate = (d: Date) =>
					`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
				shipDatesByGroup = {
					...shipDatesByGroup,
					[g.key]: {
						startShip: fmtDate(today),
						completeShip: fmtDate(plus30)
					}
				};
			}
		}
	});

	function getShipDates(key: string): ShipDates {
		return shipDatesByGroup[key] ?? { startShip: '', completeShip: '' };
	}

	function setStartShip(key: string, v: string) {
		const cur = getShipDates(key);
		shipDatesByGroup = { ...shipDatesByGroup, [key]: { ...cur, startShip: v } };
	}

	function setCompleteShip(key: string, v: string) {
		const cur = getShipDates(key);
		shipDatesByGroup = { ...shipDatesByGroup, [key]: { ...cur, completeShip: v } };
	}

	// ── Finalize state ───────────────────────────────────────────────────
	let submitting = $state(false);
	let error = $state('');

	let locationByGroup = $state<Record<string, string | null>>({});
	let billToByGroup = $state<Record<string, string | null>>({});
	let paymentByGroup = $state<Record<string, string | null>>({});
	let termsByGroup = $state<Record<string, string | null>>({});
	let shippingByGroup = $state<Record<string, string | null>>({});
	let poByGroup = $state<Record<string, string | null>>({});
	let termsAgreedByBrand = $state<Record<string, boolean>>({});

	const defaultLocation = $derived(locations.find((l) => l.is_default) ?? locations[0] ?? null);

	$effect(() => {
		if (defaultLocation) {
			for (const g of orderGroups) {
				if (!(g.key in locationByGroup)) {
					locationByGroup = { ...locationByGroup, [g.key]: defaultLocation.id };
				}
			}
		}
	});

	const distinctBrandIds = $derived([...new Set(orderGroups.map((g) => g.brandId))]);

	function termsForBrand(brandId: string) {
		return brandTerms.find((t) => t.brand_id === brandId) ?? null;
	}

	const methodOnlyItems = $derived(
		acceptedMethodsOnly(data.acceptedPaymentMethods as string[]).map((m) => ({
			value: m.code,
			label: m.label
		}))
	);
	const termsOnlyItems = $derived(
		acceptedTermsOnly(data.acceptedPaymentMethods as string[]).map((t) => ({
			value: t.code,
			label: t.label
		}))
	);
	const shippingMethodItems = SHIPPING_METHODS.map((s) => ({
		value: s,
		label: s.charAt(0).toUpperCase() + s.slice(1)
	}));

	// ── Totals ────────────────────────────────────────────────────────────
	const groupTotals = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const totals = new Map<string, { qty: number; amount: number }>();
		for (const group of orderGroups) {
			let qty = 0;
			let amount = 0;
			for (const item of group.items) {
				qty += getItemUnits(item);
				amount += getItemTotal(item);
			}
			totals.set(group.key, { qty, amount });
		}
		return totals;
	});

	const grandTotal = $derived(
		Array.from(groupTotals.values()).reduce((sum, t) => sum + t.amount, 0)
	);

	const totalQty = $derived(Array.from(groupTotals.values()).reduce((sum, t) => sum + t.qty, 0));

	const brandsWithTerms = $derived(distinctBrandIds.filter((id) => termsForBrand(id) !== null));
	const allTermsAgreed = $derived(
		brandsWithTerms.length === 0 || brandsWithTerms.every((id) => termsAgreedByBrand[id])
	);

	const canSubmit = $derived.by(() => {
		if (orderGroups.length === 0) return false;
		for (const group of orderGroups) {
			const dates = getShipDates(group.key);
			if (!dates.startShip || !dates.completeShip) return false;
		}
		if (!allTermsAgreed) return false;
		return true;
	});

	// ── Payload for server action ─────────────────────────────────────────
	let submitFormEl = $state<HTMLFormElement | null>(null);

	const payload = $derived.by(() => {
		const lines = orderGroups.flatMap((g) =>
			g.items.flatMap((item) => {
				const color = item.selectedColor || item.colors[0] || '';
				return Object.entries(item.sizeQtys)
					.filter(([, qty]) => qty > 0)
					.map(([size, qty]) => ({
						product_id: item.productId,
						brand_id: g.brandId,
						season_id: g.seasonId,
						style_number: item.styleNumber,
						description: item.productName,
						color,
						size,
						qty,
						unit_price: item.price
					}));
			})
		);

		const groups = orderGroups.map((g) => {
			const dates = getShipDates(g.key);
			return {
				brand_id: g.brandId,
				season_id: g.seasonId,
				delivery: {
					kind: 'custom' as const,
					start_ship_date: dates.startShip,
					expected_ship_date: dates.completeShip
				},
				location_id: locationByGroup[g.key] ?? defaultLocation?.id ?? null
			};
		});

		const finalize = {
			submit_mode: 'order',
			account_id: data.accountId,
			contact_location_id: defaultLocation?.id ?? null,
			rep_user_id: data.currentUser?.id ?? data.userId ?? '',
			source_type_id: data.portalSourceTypeId,
			show_date_id: null,
			orders: orderGroups.map((g) => ({
				brand_id: g.brandId,
				season_id: g.seasonId,
				ship_to_location_id: locationByGroup[g.key] ?? defaultLocation?.id ?? null,
				bill_to_location_id: billToByGroup[g.key] ?? null,
				payment_preference: paymentByGroup[g.key] ?? account?.payment_preference ?? null,
				payment_terms: termsByGroup[g.key] ?? account?.payment_terms ?? null,
				shipping_method: shippingByGroup[g.key] ?? account?.shipping_method ?? null,
				po_number: poByGroup[g.key] ?? undefined,
				internal_note: undefined
			})),
			brand_agreements: distinctBrandIds.map((brandId) => {
				const terms = termsForBrand(brandId);
				return {
					brand_id: brandId,
					terms_id: terms?.id ?? null,
					agreed: termsAgreedByBrand[brandId] ?? false
				};
			})
		};

		return {
			type: 'order',
			account_id: data.accountId,
			freeform_name: undefined,
			order_year: new Date().getFullYear(),
			submitStatus: 'confirmed',
			payment_preference: null,
			lines,
			groups,
			finalize
		};
	});

	function doSubmit() {
		if (!canSubmit || submitting) return;
		cart.clearCart();
		submitFormEl?.requestSubmit();
	}
</script>

<div class="space-y-6">
	<!-- Top nav -->
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="sm" onclick={prevStep}>← Back</Button>
		<a
			href={resolve('/shop/cart')}
			class="text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			Cancel
		</a>
	</div>

	<!-- Header / progress -->
	<div>
		<h1 class="text-2xl font-semibold">Checkout</h1>
		<p class="text-sm text-muted-foreground">
			Step {currentStep + 1} of {steps.length} — {stepName}
		</p>
	</div>

	<div class="flex gap-1">
		{#each steps as s, i (s)}
			<div
				class="h-1.5 flex-1 rounded-full {i <= currentStep ? 'bg-foreground' : 'bg-border'}"
				aria-label={s}
			></div>
		{/each}
	</div>

	{#if error}
		<div class="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
	{/if}

	{#if orderGroups.length === 0}
		<div class="rounded-none p-12 text-center">
			<p class="text-lg font-semibold">No sized items</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Go back to your cart and add quantities before checking out.
			</p>
			<Button href="/shop/cart" variant="outline" class="mt-4">Back to Cart</Button>
		</div>
	{:else}
		<!-- ── Delivery step ──────────────────────────────────────────────── -->
		{#if stepName === 'Delivery'}
			<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
				<div>
					<p class="mb-4 text-sm text-muted-foreground">
						{orderGroups.length === 1
							? 'Review items and pick a ship window.'
							: `${orderGroups.length} orders will be created — one per brand + season.`}
					</p>
					<div class="space-y-4">
						{#each orderGroups as group (group.key)}
							{@const gt = groupTotals.get(group.key)}
							{@const dates = getShipDates(group.key)}
							<div class="rounded-lg border bg-background p-4">
								<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
									<div class="flex items-center gap-2">
										<span class="font-semibold">{group.brandName}</span>
										{#if group.seasonName}
											<span class="text-sm text-muted-foreground">·</span>
											<span class="text-sm text-muted-foreground">{group.seasonName}</span>
										{/if}
									</div>
									<div class="text-sm">
										<span class="text-muted-foreground"
											>{gt?.qty ?? 0} unit{(gt?.qty ?? 0) === 1 ? '' : 's'} ·
										</span>
										<span class="font-semibold">{fmt.format(gt?.amount ?? 0)}</span>
									</div>
								</div>

								<div class="mb-4 space-y-2">
									{#each group.items as item (item.productId)}
										{@const units = getItemUnits(item)}
										<div
											class="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm"
										>
											<div class="flex items-center gap-3">
												{#if item.imageUrl}
													<img
														src={item.imageUrl}
														alt={item.productName}
														class="h-10 w-10 shrink-0 rounded-md object-cover"
													/>
												{/if}
												<div class="min-w-0">
													<span class="font-medium">{item.productName}</span>
													<p class="text-muted-foreground">
														{item.styleNumber} · {units} unit{units !== 1 ? 's' : ''}
														{#if item.selectedColor}
															· {item.selectedColor}
														{/if}
													</p>
												</div>
											</div>
											<span class="font-medium">{fmt.format(getItemTotal(item))}</span>
										</div>
									{/each}
								</div>

								<div class="flex flex-wrap gap-6">
									<div>
										<Label for={`start-${group.key}`} class="text-sm">Start Ship</Label>
										<div class="mt-1">
											<DateSelect
												id={`start-${group.key}`}
												value={dates.startShip}
												onchange={(v) => setStartShip(group.key, v)}
											/>
										</div>
									</div>
									<div>
										<Label for={`end-${group.key}`} class="text-sm">Complete Ship</Label>
										<div class="mt-1">
											<DateSelect
												id={`end-${group.key}`}
												value={dates.completeShip}
												onchange={(v) => setCompleteShip(group.key, v)}
											/>
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Delivery sidebar -->
				<div class="h-fit lg:sticky lg:top-6">
					<div class="space-y-4 rounded-none border bg-card p-5">
						<div class="flex items-center justify-between">
							<h2 class="text-base font-semibold">Summary</h2>
							<a
								href={resolve('/shop/cart')}
								class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
							>
								Edit
							</a>
						</div>
						<dl class="space-y-2 text-sm">
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Items</dt>
								<dd>{orderGroups.reduce((s, g) => s + g.items.length, 0)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Total Units</dt>
								<dd>{totalQty}</dd>
							</div>
							<div class="h-px bg-border"></div>
							<div class="flex justify-between text-base">
								<dt>Estimated Total</dt>
								<dd class="font-semibold">{fmt.format(grandTotal)}</dd>
							</div>
						</dl>
						<Button class="w-full" onclick={nextStep} disabled={!canAdvance()}>
							Finalize Order
						</Button>
					</div>
				</div>
			</div>
		{/if}

		<!-- ── Finalize step ──────────────────────────────────────────────── -->
		{#if stepName === 'Finalize'}
			<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
				<div class="space-y-6">
					<!-- Order overview -->
					<section class="overflow-hidden rounded-lg border bg-muted/30">
						<div
							class="flex items-center justify-between gap-4 border-b px-6 py-4 text-sm text-muted-foreground"
						>
							<div>
								{#if orderGroups.length === 1}
									1 order will be created
								{:else}
									<span class="font-medium text-foreground">{orderGroups.length} orders</span> will be
									created
								{/if}
							</div>
							<div class="font-mono text-sm text-muted-foreground/70">
								{totalQty} units
							</div>
						</div>
						<div class="px-6 py-6">
							{#if orderGroups.length === 1}
								{@const g = orderGroups[0]}
								{@const gt = groupTotals.get(g.key)}
								{@const dates = getShipDates(g.key)}
								<div class="text-sm text-muted-foreground">
									{g.brandName}{g.seasonName ? ` · ${g.seasonName}` : ''}
								</div>
								<div class="mt-1 font-mono text-3xl font-medium tracking-tight">
									{fmt.format(gt?.amount ?? 0)}
								</div>
								<div class="mt-1 font-mono text-sm text-muted-foreground/70">
									{gt?.qty ?? 0} units · avg {fmt.format((gt?.amount ?? 0) / (gt?.qty || 1))}/unit
								</div>
								<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
									<div>
										<div class="text-sm text-muted-foreground">Ship window</div>
										<div class="mt-0.5 text-sm">
											{dates.startShip && dates.completeShip
												? `${dates.startShip} → ${dates.completeShip}`
												: '—'}
										</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">Season</div>
										<div class="mt-0.5 text-sm">{g.seasonName ?? '—'}</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">Styles</div>
										<div class="mt-0.5 text-sm">
											{g.items.length} style{g.items.length === 1 ? '' : 's'}
										</div>
									</div>
								</div>
							{:else}
								<div class="text-sm text-muted-foreground">
									{distinctBrandIds.length} brand{distinctBrandIds.length === 1 ? '' : 's'}
								</div>
								<div class="mt-1 font-mono text-3xl font-medium tracking-tight">
									{fmt.format(grandTotal)}
								</div>
								<div class="mt-1 font-mono text-sm text-muted-foreground/70">
									{totalQty} units total
								</div>
								<div class="mt-6 space-y-2.5">
									{#each orderGroups as g, i (g.key)}
										{@const gt = groupTotals.get(g.key)}
										{@const dates = getShipDates(g.key)}
										<div class="flex items-center justify-between gap-4 text-sm">
											<div class="flex min-w-0 items-center gap-3">
												<span class="w-4 font-mono text-sm text-muted-foreground/70">{i + 1}</span>
												<span class="truncate">
													{g.brandName}{g.seasonName ? ` · ${g.seasonName}` : ''}
												</span>
												<span
													class="hidden truncate font-mono text-sm text-muted-foreground/70 sm:inline"
												>
													{gt?.qty ?? 0} units · {dates.startShip || '—'} → {dates.completeShip ||
														'—'}
												</span>
											</div>
											<span class="shrink-0 font-mono">{fmt.format(gt?.amount ?? 0)}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</section>

					<!-- Ship To / Bill To -->
					{#if locations.length > 0}
						{@const shipLoc =
							locations.find((l) => l.id === (locationByGroup[orderGroups[0]?.key] ?? '')) ??
							defaultLocation}
						{@const billLoc = billToByGroup[orderGroups[0]?.key]
							? locations.find((l) => l.id === billToByGroup[orderGroups[0]?.key])
							: shipLoc}
						<section class="grid gap-4 md:grid-cols-2">
							<div class="rounded-lg border bg-muted/30 p-5">
								<div class="text-sm tracking-wider text-muted-foreground uppercase">Ship To</div>
								{#if locations.length > 1}
									<div class="mt-3">
										<SelectField
											value={locationByGroup[orderGroups[0]?.key] ?? defaultLocation?.id ?? ''}
											items={locations.map((l) => ({
												value: l.id,
												label: `${l.label}${l.is_default ? ' · default' : ''}`
											}))}
											placeholder="Select ship-to address"
											class="w-full"
											onValueChange={(v) => {
												for (const g of orderGroups) {
													locationByGroup = { ...locationByGroup, [g.key]: v || null };
												}
											}}
										/>
									</div>
								{/if}
								{#if shipLoc}
									<div class="mt-3">
										<div class="text-sm font-medium">
											{shipLoc.label}
											{#if shipLoc.is_default}
												<span class="ml-1 text-sm font-normal text-muted-foreground/70">
													(default)
												</span>
											{/if}
										</div>
										<div class="mt-1 text-sm leading-relaxed text-muted-foreground">
											{shipLoc.address_line1 ?? '—'}
											{#if shipLoc.address_line2}<br />{shipLoc.address_line2}{/if}
											{#if shipLoc.city || shipLoc.state || shipLoc.zip}
												<br />
												{[shipLoc.city, [shipLoc.state, shipLoc.zip].filter(Boolean).join(' ')]
													.filter(Boolean)
													.join(', ')}
											{/if}
										</div>
									</div>
								{:else}
									<div class="mt-3 text-sm text-muted-foreground">No ship-to address on file.</div>
								{/if}
							</div>

							<div class="rounded-lg border bg-muted/30 p-5">
								<div class="text-sm tracking-wider text-muted-foreground uppercase">Bill To</div>
								<div class="mt-3">
									<SelectField
										value={billToByGroup[orderGroups[0]?.key] ?? ''}
										items={[
											{ value: '', label: 'Same as ship-to' },
											...locations.map((l) => ({
												value: l.id,
												label: `${l.label}${l.is_default ? ' · default' : ''}`
											}))
										]}
										placeholder="Same as ship-to"
										class="w-full"
										onValueChange={(v) => {
											for (const g of orderGroups) {
												billToByGroup = { ...billToByGroup, [g.key]: v || null };
											}
										}}
									/>
								</div>
								{#if billLoc}
									<div class="mt-3">
										<div class="text-sm font-medium">
											{billLoc.label}
											{#if !billToByGroup[orderGroups[0]?.key]}
												<span class="ml-1 text-sm font-normal text-muted-foreground/70">
													(same as ship-to)
												</span>
											{/if}
										</div>
										<div class="mt-1 text-sm leading-relaxed text-muted-foreground">
											{billLoc.address_line1 ?? '—'}
											{#if billLoc.address_line2}<br />{billLoc.address_line2}{/if}
											{#if billLoc.city || billLoc.state || billLoc.zip}
												<br />
												{[billLoc.city, [billLoc.state, billLoc.zip].filter(Boolean).join(' ')]
													.filter(Boolean)
													.join(', ')}
											{/if}
										</div>
									</div>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Payment & Logistics -->
					<section class="rounded-lg border bg-muted/30 p-5">
						<div class="text-sm tracking-wider text-muted-foreground uppercase">
							Payment & logistics
						</div>
						<div class="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
							<div class="space-y-2">
								<Label>Payment preference</Label>
								<SelectField
									value={paymentByGroup[orderGroups[0]?.key] ?? account?.payment_preference ?? ''}
									items={methodOnlyItems}
									placeholder="Select"
									class="w-full"
									onValueChange={(v) => {
										for (const g of orderGroups) {
											paymentByGroup = { ...paymentByGroup, [g.key]: v || null };
										}
									}}
								/>
							</div>
							<div class="space-y-2">
								<Label>Payment terms</Label>
								<SelectField
									value={termsByGroup[orderGroups[0]?.key] ?? account?.payment_terms ?? ''}
									items={termsOnlyItems}
									placeholder="Select"
									class="w-full"
									onValueChange={(v) => {
										for (const g of orderGroups) {
											termsByGroup = { ...termsByGroup, [g.key]: v || null };
										}
									}}
								/>
							</div>
							<div class="space-y-2">
								<Label>Shipping method</Label>
								<SelectField
									value={shippingByGroup[orderGroups[0]?.key] ?? account?.shipping_method ?? ''}
									items={shippingMethodItems}
									placeholder="Select"
									class="w-full"
									onValueChange={(v) => {
										for (const g of orderGroups) {
											shippingByGroup = { ...shippingByGroup, [g.key]: v || null };
										}
									}}
								/>
							</div>
							<div class="space-y-2">
								<Label>
									PO / Customer ref
									<span class="text-muted-foreground/70">(optional)</span>
								</Label>
								<Input
									maxlength={64}
									placeholder="—"
									value={poByGroup[orderGroups[0]?.key] ?? ''}
									oninput={(e) => {
										const val = (e.currentTarget as HTMLInputElement).value || null;
										for (const g of orderGroups) {
											poByGroup = { ...poByGroup, [g.key]: val };
										}
									}}
								/>
							</div>
						</div>
					</section>

					<!-- Buyer Terms -->
					{#if distinctBrandIds.length > 0}
						<section class="space-y-2">
							<div class="text-sm tracking-wider text-muted-foreground uppercase">Buyer terms</div>
							<div class="divide-y rounded-lg border bg-muted/30">
								{#each distinctBrandIds as brandId (brandId)}
									{@const brandName =
										orderGroups.find((g) => g.brandId === brandId)?.brandName ?? 'Unknown'}
									{@const terms = termsForBrand(brandId)}
									<div class="px-5 py-4">
										{#if terms}
											<div class="flex items-start justify-between gap-4">
												<label class="flex flex-1 cursor-pointer items-start gap-3">
													<Checkbox
														checked={termsAgreedByBrand[brandId] === true}
														onCheckedChange={(v) => (termsAgreedByBrand[brandId] = v === true)}
													/>
													<span class="text-sm">
														I agree to <strong class="font-medium">{brandName}'s</strong>
														terms.
														<span class="mt-0.5 block text-sm text-muted-foreground/70">
															{terms.title} · v{terms.version}
														</span>
													</span>
												</label>
												<Dialog.Root>
													<Dialog.Trigger
														class="shrink-0 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
														>View</Dialog.Trigger
													>
													<Dialog.Portal>
														<Dialog.Overlay
															class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
														/>
														<Dialog.Content
															class="fixed top-[50%] left-[50%] z-50 max-h-[80vh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-auto rounded-lg border bg-background p-6 shadow-lg"
														>
															<Dialog.Title class="text-base font-semibold">
																{terms.title}
															</Dialog.Title>
															<Dialog.Description class="mt-1 text-sm text-muted-foreground">
																{brandName} · v{terms.version}
															</Dialog.Description>
															<div class="mt-5 text-sm whitespace-pre-wrap">
																{terms.body}
															</div>
															<div class="mt-6 flex justify-end">
																<Dialog.Close
																	class="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted"
																	>Close</Dialog.Close
																>
															</div>
														</Dialog.Content>
													</Dialog.Portal>
												</Dialog.Root>
											</div>
										{:else}
											<div class="text-sm">
												<span class="font-medium">{brandName}</span>
												<span class="text-muted-foreground"> — no terms on file.</span>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</section>
					{/if}
				</div>

				<!-- Summary sidebar -->
				<div class="h-fit lg:sticky lg:top-6">
					<div class="space-y-4 rounded-none border bg-card p-5">
						<div class="flex items-center justify-between">
							<h2 class="text-base font-semibold">Summary</h2>
							<button
								type="button"
								class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
								onclick={prevStep}
							>
								Edit
							</button>
						</div>

						<dl class="space-y-3 text-sm">
							{#each orderGroups as group (group.key)}
								{@const gt = groupTotals.get(group.key)}
								<div>
									<dt class="font-medium">
										{group.brandName}
										{#if group.seasonName}
											<span class="font-normal text-muted-foreground">
												· {group.seasonName}
											</span>
										{/if}
									</dt>
									<dd class="text-muted-foreground">
										{gt?.qty ?? 0} units · {fmt.format(gt?.amount ?? 0)}
									</dd>
								</div>
							{/each}

							<div class="h-px bg-border"></div>

							<div class="flex justify-between">
								<dt class="text-muted-foreground">Wholesale subtotal</dt>
								<dd class="font-mono">{fmt.format(grandTotal)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Shipping</dt>
								<dd class="font-mono text-muted-foreground/70">Calc. at ship</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Tax</dt>
								<dd class="font-mono text-muted-foreground/70">—</dd>
							</div>

							<div class="h-px bg-border"></div>

							<div class="flex justify-between text-base">
								<dt>Total</dt>
								<dd class="font-mono font-semibold">{fmt.format(grandTotal)}</dd>
							</div>
						</dl>

						<Button class="w-full" disabled={!canSubmit || submitting} onclick={doSubmit}>
							{#if submitting}
								Submitting...
							{:else}
								Submit & Confirm{orderGroups.length > 1 ? ` ${orderGroups.length} Orders` : ''}
							{/if}
						</Button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Hidden form for server action -->
<form
	bind:this={submitFormEl}
	method="POST"
	action="?/submit"
	class="hidden"
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			submitting = false;
			if (result.type === 'failure') {
				error = (result.data as { message?: string })?.message ?? 'Could not place order';
				toast.error(error);
			} else if (result.type === 'error') {
				error = result.error?.message ?? 'Something went wrong. Please try again.';
				toast.error(error);
			}
			await update({ reset: false });
		};
	}}
>
	<input type="hidden" name="payload" value={JSON.stringify(payload)} />
</form>
