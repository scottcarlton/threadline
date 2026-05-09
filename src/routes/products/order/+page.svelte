<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { ShipWindowPicker } from '$lib/components/ui/ship-window-picker/index.js';
	import CatalogPickerModal from '$lib/components/shared/CatalogPickerModal.svelte';
	import SizeStepperSheet from '$lib/components/shared/SizeStepperSheet.svelte';
	import ColorPickerSheet from '$lib/components/shared/ColorPickerSheet.svelte';
	import ColorSwatch from '$lib/components/shared/ColorSwatch.svelte';
	import ColorSwatchPicker from '$lib/components/shared/ColorSwatchPicker.svelte';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Dialog, DropdownMenu } from 'bits-ui';
	import { acceptedMethodsOnly, acceptedTermsOnly } from '$lib/payment-methods';
	import { SHIPPING_METHODS } from '$lib/schemas/order-finalize';
	import { selectedProductIds } from '$lib/stores/productSelection.js';
	import type { CatalogCartItem } from '$lib/components/shared/catalog-picker-types.js';
	import {
		type CatalogProduct,
		catalogProductToCartItem
	} from '$lib/components/shared/catalog-picker-types.js';

	type Brand = { id: string; name: string; logo_url: string | null };
	type Season = { id: string; name: string; sort_order: number | null };
	type Account = {
		id: string;
		business_name: string;
		contact_email: string | null;
		address_line1: string | null;
		address_line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
		payment_preference: string | null;
	};
	type Rep = { user_id: string; name: string };
	type OrderItem = CatalogCartItem;
	type CartLine = {
		product_id: string | null;
		brand_id: string;
		season_id: string | null;
		style_number: string;
		description: string;
		color: string | null;
		size: string | null;
		qty: number;
		unit_price: number;
	};
	type DeliveryChoice = {
		kind: 'custom';
		start_ship_date: string;
		expected_ship_date: string;
	};
	type GroupMeta = {
		delivery: DeliveryChoice | null;
		location_id: string | null;
		bill_to_location_id: string | null;
		payment_preference: string | null;
		payment_terms: string | null;
		shipping_method: string | null;
		po_number: string | null;
		internal_note: string | null;
	};

	const NO_SEASON = '__no_season__';

	let { data } = $props();
	const accounts = $derived(data.accounts as Account[]);
	const brands = $derived(
		data.brands as Array<Brand & { products_count: number; seasons_count: number }>
	);
	const seasons = $derived(data.seasons as Season[]);
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
	const allLocations = $derived(data.locations as LocationRow[]);
	const reps = $derived((data.reps ?? []) as Rep[]);
	const deliveries = $derived(
		data.deliveries as Array<{
			id: string;
			season_id: string;
			label: string;
			delivery_month: number;
			delivery_day: number;
			sort_order: number | null;
		}>
	);
	const currentUserId = $derived((data.currentUser?.id as string | undefined) ?? null);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
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

	let loading = $state(true);

	const cart = $state<{
		items: OrderItem[];
		groupMeta: Record<string, GroupMeta>;
		account_id: string | null;
		freeform_name: string | null;
		order_year: number;
		rep_user_id: string | null;
		source_type_id: string | null;
		show_date_id: string | null;
		payment_preference: string;
		payment_preference_touched: boolean;
		termsAgreedByBrand: Record<string, boolean>;
		type: 'order' | null;
	}>({
		items: [],
		groupMeta: {},
		account_id: null,
		freeform_name: null,
		order_year: new Date().getFullYear(),
		rep_user_id: null,
		source_type_id: null,
		show_date_id: null,
		payment_preference: '',
		payment_preference_touched: false,
		termsAgreedByBrand: {},
		type: null
	});

	$effect(() => {
		if (!cart.rep_user_id && currentUserId) cart.rep_user_id = currentUserId;
	});

	// Initialize group meta entries when groups change, prune stale ones.
	$effect(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local set
		const validKeys = new Set<string>();
		for (const g of groups) {
			const key = groupKey(g.brand_id, g.season_id);
			validKeys.add(key);
			if (!cart.groupMeta[key]) cart.groupMeta[key] = { ...EMPTY_META };
		}
		for (const k of Object.keys(cart.groupMeta)) {
			if (!validKeys.has(k)) delete cart.groupMeta[k];
		}
	});

	// Seed each group's Start/Complete Ship dates from season presets or today+30.
	$effect(() => {
		for (const g of groups) {
			const meta = getMeta(g.brand_id, g.season_id);
			if (meta.delivery) continue;
			const lastPreset = deliveries
				.filter((d) => d.season_id === g.season_id)
				.sort((a, b) => b.delivery_month - a.delivery_month || b.delivery_day - a.delivery_day)[0];
			if (lastPreset) {
				const yyyy = String(cart.order_year);
				const mm = String(lastPreset.delivery_month).padStart(2, '0');
				const dd = String(lastPreset.delivery_day).padStart(2, '0');
				setMeta(g.brand_id, g.season_id, {
					delivery: {
						kind: 'custom',
						start_ship_date: `${yyyy}-${mm}-01`,
						expected_ship_date: `${yyyy}-${mm}-${dd}`
					}
				});
				continue;
			}
			const today = new Date();
			const plus30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
			const fmtDate = (d: Date) =>
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			setMeta(g.brand_id, g.season_id, {
				delivery: {
					kind: 'custom',
					start_ship_date: fmtDate(today),
					expected_ship_date: fmtDate(plus30)
				}
			});
		}
	});

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

	function groupKey(brand_id: string, season_id: string | null): string {
		return `${brand_id}::${season_id ?? NO_SEASON}`;
	}
	const groups = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const map = new Map<
			string,
			{
				brand_id: string;
				season_id: string | null;
				product_year: number | null;
				items: OrderItem[];
				total: number;
				units: number;
			}
		>();
		for (const it of cart.items) {
			if (!itemIsSized(it)) continue;
			const key = groupKey(it.brand_id, it.season_id);
			let g = map.get(key);
			if (!g) {
				g = {
					brand_id: it.brand_id,
					season_id: it.season_id,
					product_year: it.product_year,
					items: [],
					total: 0,
					units: 0
				};
				map.set(key, g);
			}
			g.items.push(it);
			g.total += itemTotal(it);
			g.units += itemUnits(it);
		}
		return [...map.values()];
	});

	const EMPTY_META: GroupMeta = {
		delivery: null,
		location_id: null,
		bill_to_location_id: null,
		payment_preference: null,
		payment_terms: null,
		shipping_method: null,
		po_number: null,
		internal_note: null
	};
	function getMeta(brand_id: string, season_id: string | null) {
		return cart.groupMeta[groupKey(brand_id, season_id)] ?? EMPTY_META;
	}
	function setMeta(brand_id: string, season_id: string | null, patch: Partial<GroupMeta>) {
		const key = groupKey(brand_id, season_id);
		const current = cart.groupMeta[key] ?? { ...EMPTY_META };
		cart.groupMeta[key] = { ...current, ...patch };
	}

	const grandTotal = $derived(groups.reduce((sum, g) => sum + g.total, 0));
	const grandUnits = $derived(groups.reduce((sum, g) => sum + g.units, 0));

	const hasAccountChoice = $derived(cart.account_id !== null);
	const account = $derived(accounts.find((a) => a.id === cart.account_id) ?? null);
	const accountLocations = $derived(
		cart.account_id ? allLocations.filter((l) => l.account_id === cart.account_id) : []
	);

	function brandName(id: string): string {
		return brands.find((b) => b.id === id)?.name ?? 'Brand';
	}
	function seasonName(id: string | null): string {
		if (!id) return 'No season';
		return seasons.find((s) => s.id === id)?.name ?? 'Season';
	}
	function seasonLabel(id: string | null, year: number | null | undefined): string {
		const name = seasonName(id);
		if (!id) return year ? `${name} · ${year}` : name;
		return year ? `${name} ${year}` : name;
	}
	function describeDelivery(meta: { delivery: DeliveryChoice | null } | undefined): string {
		const choice = meta?.delivery;
		if (!choice) return 'Pick a ship window';
		const fmtShort = (s: string) => {
			if (!s) return '—';
			const dt = new Date(`${s}T00:00:00`);
			return `${monthAbbrev[dt.getMonth()]} ${dt.getDate()}`;
		};
		return `${fmtShort(choice.start_ship_date)} → ${fmtShort(choice.expected_ship_date)}`;
	}

	// Steps
	const stepsAll = ['Account', 'Items', 'Delivery', 'Finalize'];
	let currentStep = $state(0);
	const stepName = $derived(stepsAll[currentStep] ?? 'Finalize');

	function canAdvance(): boolean {
		switch (stepName) {
			case 'Account':
				return hasAccountChoice;
			case 'Items':
				return cart.items.length > 0 && cart.items.every(itemIsSized);
			case 'Delivery':
				return (
					groups.length > 0 &&
					groups.every((g) => {
						const d = getMeta(g.brand_id, g.season_id).delivery;
						if (!d) return false;
						return !!d.start_ship_date && !!d.expected_ship_date;
					})
				);
			case 'Finalize':
				return true;
		}
		return true;
	}

	function nextStep() {
		if (currentStep < stepsAll.length - 1) currentStep++;
	}
	function prevStep() {
		if (currentStep > 0) currentStep--;
		else goto(resolve('/products'));
	}
	function handleCancel() {
		goto(resolve('/products'));
	}

	// Account combobox
	let accountQuery = $state('');
	let accountFocus = $state(false);
	let accountMatches = $state<Account[]>([]);
	let accountSearching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	async function searchAccounts(query: string) {
		accountSearching = true;
		const url = new URL('/api/accounts/search', window.location.origin);
		if (query.trim()) url.searchParams.set('q', query.trim());
		url.searchParams.set('limit', '30');
		try {
			const res = await fetch(url.toString());
			if (res.ok) {
				const body = (await res.json()) as { accounts: Account[] };
				accountMatches = body.accounts ?? [];
			} else {
				accountMatches = [];
			}
		} catch {
			accountMatches = [];
		}
		accountSearching = false;
	}

	function onAccountInput(value: string) {
		accountQuery = value;
		if (cart.account_id !== null) cart.account_id = null;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => searchAccounts(value), 250);
	}

	function onAccountFocus() {
		accountFocus = true;
		if (accountMatches.length === 0 && !accountSearching) searchAccounts('');
	}

	function pickAccount(a: Account) {
		cart.account_id = a.id;
		accountQuery = a.business_name;
		accountFocus = false;
		if (a.payment_preference) cart.payment_preference = a.payment_preference;
		nextStep();
	}

	// Items / sizing
	let sizingSheetProductId = $state<string | null>(null);
	const sizingSheetIdx = $derived(
		sizingSheetProductId ? cart.items.findIndex((x) => x.product_id === sizingSheetProductId) : -1
	);
	const sizingSheetItem = $derived(sizingSheetIdx >= 0 ? cart.items[sizingSheetIdx] : null);
	let colorPickerProductId = $state<string | null>(null);
	const colorPickerIdx = $derived(
		colorPickerProductId ? cart.items.findIndex((x) => x.product_id === colorPickerProductId) : -1
	);
	const colorPickerItem = $derived(colorPickerIdx >= 0 ? cart.items[colorPickerIdx] : null);

	// Finalize
	let submitting = $state(false);
	let submitStatus = $state<'draft' | 'submitted' | 'confirmed'>('draft');
	let submitFormEl: HTMLFormElement | null = $state(null);
	let submitComboEl: HTMLDivElement | null = $state(null);
	let shipEditOpen = $state(false);
	let billEditOpen = $state(false);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in finalize step template
	let finalizeExpandedKey = $state<string | null>(null);
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in finalize step template
	let finalizeExpandAll = $state(false);

	function submitOrderAs(status: 'draft' | 'submitted' | 'confirmed') {
		cart.type = 'order';
		submitStatus = status;
		submitFormEl?.requestSubmit();
	}

	const repItems = $derived(reps.map((r) => ({ value: r.user_id, label: r.name })));
	const shippingMethodItems = SHIPPING_METHODS.map((s) => ({
		value: s,
		label: s.charAt(0).toUpperCase() + s.slice(1)
	}));
	const methodOnlyItems = $derived(
		acceptedMethodsOnly(data.acceptedPaymentMethods).map((m) => ({ value: m.code, label: m.label }))
	);
	const termsOnlyItems = $derived(
		acceptedTermsOnly(data.acceptedPaymentMethods).map((t) => ({ value: t.code, label: t.label }))
	);

	const sourceTypes = $derived(
		(data.sourceTypes ?? []) as Array<{ id: string; name: string; sort_order: number | null }>
	);
	const showDates = $derived(
		(data.showDates ?? []) as Array<{
			id: string;
			show_id: string;
			show_name: string;
			year: number;
			month: number;
			city: string | null;
			state: string | null;
			venue: string | null;
		}>
	);
	const brandTerms = $derived(
		(data.brandTerms ?? []) as Array<{
			id: string;
			brand_id: string;
			title: string;
			body: string;
			version: number;
		}>
	);
	const MONTH_LABELS = [
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
	function showDateLabel(sd: (typeof showDates)[number]) {
		const when = `${MONTH_LABELS[sd.month - 1] ?? ''} ${sd.year}`.trim();
		const where = [sd.city, sd.state].filter(Boolean).join(', ');
		return where ? `${sd.show_name} — ${when} (${where})` : `${sd.show_name} — ${when}`;
	}

	const sourceTypeItems = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const byName = new Map<string, { id: string; name: string; sort_order: number | null }>();
		for (const s of sourceTypes) {
			const key = s.name.trim().toLowerCase();
			if (!byName.has(key)) byName.set(key, s);
		}
		return [
			...showDates.map((sd) => ({ value: `show:${sd.id}`, label: showDateLabel(sd) })),
			...Array.from(byName.values()).map((s) => ({ value: `source:${s.id}`, label: s.name }))
		];
	});
	const selectedSourceValue = $derived(
		cart.show_date_id
			? `show:${cart.show_date_id}`
			: cart.source_type_id
				? `source:${cart.source_type_id}`
				: ''
	);
	function onSourceChange(v: string) {
		if (!v) {
			cart.source_type_id = null;
			cart.show_date_id = null;
			return;
		}
		if (v.startsWith('show:')) {
			cart.show_date_id = v.slice(5);
			cart.source_type_id = null;
		} else if (v.startsWith('source:')) {
			cart.source_type_id = v.slice(7);
			cart.show_date_id = null;
		}
	}

	function termsForBrand(brand_id: string) {
		return brandTerms.find((t) => t.brand_id === brand_id) ?? null;
	}

	const distinctBrandsInCart = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const seen = new Set<string>();
		const result: Array<{ id: string; name: string }> = [];
		for (const g of groups) {
			if (seen.has(g.brand_id)) continue;
			seen.add(g.brand_id);
			result.push({ id: g.brand_id, name: brandName(g.brand_id) });
		}
		return result;
	});
	const brandsRequiringAgreement = $derived(
		distinctBrandsInCart.filter((b) => termsForBrand(b.id) !== null)
	);
	const allBrandTermsAgreed = $derived(
		brandsRequiringAgreement.every((b) => cart.termsAgreedByBrand[b.id] === true)
	);

	const allowedBrandIds = $derived(distinctBrandsInCart.map((b) => b.id));

	const finalizePayload = $derived({
		submit_mode: 'order' as const,
		account_id: cart.account_id,
		freeform_name: cart.freeform_name ?? undefined,
		contact_location_id: null as string | null,
		rep_user_id: cart.rep_user_id ?? '',
		source_type_id: cart.source_type_id,
		show_date_id: cart.show_date_id,
		orders: groups.map((g) => {
			const meta = getMeta(g.brand_id, g.season_id);
			return {
				brand_id: g.brand_id,
				season_id: g.season_id,
				ship_to_location_id: meta.location_id,
				bill_to_location_id: meta.bill_to_location_id,
				payment_preference: meta.payment_preference,
				payment_terms: meta.payment_terms,
				shipping_method: meta.shipping_method,
				po_number: meta.po_number ?? undefined,
				internal_note: meta.internal_note ?? undefined
			};
		}),
		brand_agreements: distinctBrandsInCart.map((b) => ({
			brand_id: b.id,
			terms_id: termsForBrand(b.id)?.id ?? null,
			agreed: cart.termsAgreedByBrand[b.id] === true
		}))
	});

	const payload = $derived({
		type: cart.type ?? 'order',
		account_id: cart.account_id,
		freeform_name: cart.freeform_name,
		order_year: cart.order_year,
		submitStatus,
		payment_preference: cart.payment_preference || null,
		lines: toCartLines(cart.items),
		groups: groups.map((g) => ({
			brand_id: g.brand_id,
			season_id: g.season_id,
			delivery: getMeta(g.brand_id, g.season_id).delivery,
			location_id: getMeta(g.brand_id, g.season_id).location_id
		})),
		finalize: finalizePayload
	});

	// On mount: fetch selected products
	onMount(async () => {
		const ids = $selectedProductIds;
		if (ids.length === 0) {
			toast.error('Select products first');
			goto(resolve('/products'));
			return;
		}

		const params = ids.map((id) => `id=${encodeURIComponent(id)}`).join('&');
		try {
			const res = await fetch(`/api/products?${params}&limit=200`);
			if (res.ok) {
				const body = (await res.json()) as { products: CatalogProduct[] };
				cart.items = body.products.map(catalogProductToCartItem);
				selectedProductIds.set([]);
			}
		} catch {
			toast.error('Failed to load products');
			goto(resolve('/products'));
			return;
		}

		loading = false;
	});

	// CatalogPicker for adding more items
	let modalOpen = $state(false);
	function mergeColorItems() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local map
		const byProduct = new Map<string, OrderItem>();
		for (const it of cart.items) {
			const color = it.selected_color || '';
			const liveSizeQtys = { ...it.size_qtys };
			const existing = byProduct.get(it.product_id);
			if (!existing) {
				const merged: OrderItem = {
					...it,
					color_size_qtys: { [color]: liveSizeQtys },
					color_image_ids: {
						...(it.color_image_ids ?? {}),
						...(it.image_id ? { [color]: it.image_id } : {})
					}
				};
				byProduct.set(it.product_id, merged);
			} else {
				existing.color_size_qtys[color] = liveSizeQtys;
				if (it.image_id) {
					if (!existing.color_image_ids) existing.color_image_ids = {};
					existing.color_image_ids[color] = it.image_id;
				}
			}
		}
		cart.items = [...byProduct.values()];
	}

	function expandColorItems() {
		const expanded: OrderItem[] = [];
		for (const it of cart.items) {
			const colorEntries = Object.entries(it.color_size_qtys);
			if (colorEntries.length === 0) {
				expanded.push(it);
				continue;
			}
			let anyExpanded = false;
			for (const [color, sizeMap] of colorEntries) {
				const hasQty = Object.values(sizeMap).some((q) => q > 0);
				if (!hasQty) continue;
				anyExpanded = true;
				const size_qtys: Record<string, number> = {};
				for (const s of it.available_sizes) size_qtys[s] = sizeMap[s] ?? 0;
				expanded.push({
					...it,
					product_id: it.product_id,
					selected_color: color,
					image_id: it.color_image_ids?.[color] ?? it.image_id,
					size_qtys,
					color_size_qtys: { [color]: sizeMap }
				});
			}
			if (!anyExpanded) {
				expanded.push(it);
			}
		}
		cart.items = expanded;
	}

	function openAddItemsModal() {
		mergeColorItems();
		modalOpen = true;
	}
	function closeAddItemsModal() {
		modalOpen = false;
		expandColorItems();
	}
</script>

<svelte:head><title>Start Order — Threadline</title></svelte:head>

{#if loading}
	<div class="flex h-64 items-center justify-center">
		<div
			class="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground"
		></div>
	</div>
{:else}
	<div class="w-full">
		<!-- Top nav: Back (left) + Cancel (right) -->
		<div class="mb-4 flex items-center justify-between">
			{#if currentStep > 0}
				<Button variant="ghost" size="sm" onclick={prevStep}
					><LongArrow direction="left" /> Back</Button
				>
			{:else}
				<span></span>
			{/if}
			<Button variant="ghost" size="sm" onclick={handleCancel}>Cancel</Button>
		</div>

		<!-- Header / progress -->
		<div class="mb-4">
			<h1 class="text-2xl font-semibold">Start Order</h1>
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

		<!-- ── Account step ───────────────────────────────────────────────── -->
		{#if stepName === 'Account'}
			<div class="mx-auto max-w-[756px]">
				<Label for="account-input">Account</Label>
				<div class="relative mt-1">
					<Input
						id="account-input"
						placeholder="Type to search (e.g. &quot;Elm & Ivory&quot;)"
						value={accountQuery}
						oninput={(e) => {
							onAccountInput((e.target as HTMLInputElement).value);
							accountFocus = true;
						}}
						onfocus={onAccountFocus}
					/>
					{#if accountFocus && (accountQuery.trim() || accountMatches.length > 0)}
						<div
							class="absolute top-full right-0 left-0 z-10 mt-1 max-h-72 overflow-auto rounded-lg border bg-background shadow-lg"
						>
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
							</ul>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── Items step ─────────────────────────────────────────────────── -->
		{#if stepName === 'Items'}
			<div>
				<div class="mb-4 flex items-center justify-between">
					<div class="text-sm text-muted-foreground">
						{cart.items.length}
						{cart.items.length === 1 ? 'Item' : 'Items'}
						{#if cart.items.some((i) => !itemIsSized(i))}
							<span class="text-amber-700">
								({cart.items.filter((i) => !itemIsSized(i)).length} Unsized)
							</span>
						{/if}
					</div>
					<Button onclick={openAddItemsModal}>+ Add Items</Button>
				</div>

				<div class="space-y-3">
					{#each cart.items as it, idx (`${it.product_id}|${it.selected_color}`)}
						{@const rowUnits = itemUnits(it)}
						{@const rowTotal = itemTotal(it)}
						<div class="group/item relative overflow-hidden rounded-lg border">
							<div class="relative bg-background">
								<!-- Mobile: compact card -->
								<div class="block sm:hidden">
									<div class="px-4 py-3">
										<div class="flex items-start gap-3">
											<div class="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
												{#if it.image_id}
													<img
														src={`/api/products/${it.product_id}/images/${it.image_id}`}
														alt=""
														class="h-full w-full object-cover"
													/>
												{:else}
													<div
														class="flex h-full w-full items-center justify-center text-muted-foreground/40"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5"
															class="h-5 w-5"
														>
															<rect x="3" y="3" width="18" height="18" rx="2" />
															<circle cx="8.5" cy="8.5" r="1.5" />
															<path d="M21 15l-5-5L5 21" />
														</svg>
													</div>
												{/if}
											</div>
											<div class="min-w-0 flex-1">
												<div class="font-mono text-sm text-muted-foreground/70">
													{it.style_number}
												</div>
												<div class="truncate text-sm font-semibold">{it.name}</div>
												<div class="truncate text-sm text-muted-foreground">
													{brandName(it.brand_id)} · {seasonLabel(it.season_id, it.product_year)}
												</div>
											</div>
											<button
												type="button"
												class="shrink-0 self-start pt-1 transition active:scale-95 disabled:pointer-events-none"
												aria-label="Choose color for {it.name}"
												disabled={it.available_colors.length === 0}
												onclick={() => (colorPickerProductId = it.product_id)}
											>
												<ColorSwatch color={it.selected_color || null} size={20} />
											</button>
										</div>

										{#if it.available_sizes.length > 0}
											<button
												type="button"
												class="mt-3 grid w-full gap-1.5 transition-opacity active:opacity-60"
												style="grid-template-columns: repeat({it.available_sizes
													.length}, minmax(0, 1fr));"
												aria-label="Edit sizes for {it.name}"
												onclick={() => (sizingSheetProductId = it.product_id)}
											>
												{#each it.available_sizes as size (size)}
													{@const qty = it.size_qtys[size] ?? 0}
													<div
														class="flex flex-col items-center justify-center rounded-md border bg-muted/40 py-1.5 {qty ===
														0
															? 'border-dashed opacity-60'
															: ''}"
													>
														<div class="text-sm text-muted-foreground">{size}</div>
														<div class="font-mono text-sm">{qty}</div>
													</div>
												{/each}
											</button>
										{/if}

										<div class="mt-3 flex items-center justify-between">
											<div class="text-sm text-muted-foreground">
												{rowUnits}
												{rowUnits === 1 ? 'unit' : 'units'} · {fmt.format(it.unit_price)}/ea
											</div>
											<div class="font-mono text-sm font-medium">{fmt.format(rowTotal)}</div>
										</div>
									</div>
								</div>

								<!-- Desktop: full inline editor -->
								<div class="hidden px-6 py-4 sm:block">
									<div class="flex items-center justify-between gap-6">
										<div class="flex min-w-0 flex-1 items-center gap-4">
											<div class="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
												{#if it.image_id}
													<img
														src={`/api/products/${it.product_id}/images/${it.image_id}`}
														alt=""
														class="h-full w-full object-cover"
													/>
												{:else}
													<div
														class="flex h-full w-full items-center justify-center text-muted-foreground/40"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5"
															class="h-6 w-6"
														>
															<rect x="3" y="3" width="18" height="18" rx="2" />
															<circle cx="8.5" cy="8.5" r="1.5" />
															<path d="M21 15l-5-5L5 21" />
														</svg>
													</div>
												{/if}
											</div>

											<div class="min-w-0">
												<div class="font-mono text-sm">{it.style_number}</div>
												<div class="text-sm font-medium">{it.name}</div>
												<div class="text-sm text-muted-foreground">
													{brandName(it.brand_id)} · {seasonLabel(it.season_id, it.product_year)}
												</div>
											</div>

											<div class="shrink-0 self-center md:ml-4">
												{#if it.available_colors.length > 1}
													<ColorSwatchPicker
														value={it.selected_color || null}
														options={it.available_colors}
														onChange={(c) => (cart.items[idx].selected_color = c ?? '')}
													/>
												{:else}
													<div class="flex items-center gap-2 text-sm">
														<ColorSwatch color={it.selected_color || null} size={28} />
														{#if it.selected_color}
															<span>{it.selected_color}</span>
														{/if}
													</div>
												{/if}
											</div>
											<div class="flex-1"></div>
										</div>

										<div class="shrink-0 text-right">
											<div class="font-mono text-sm font-medium">{fmt.format(rowTotal)}</div>
											<div class="text-sm text-muted-foreground">
												{rowUnits}
												{rowUnits === 1 ? 'unit' : 'units'} · {fmt.format(it.unit_price)}/ea
											</div>
										</div>
									</div>

									{#if it.available_sizes.length > 0}
										<div class="mt-3 flex flex-wrap items-start gap-3">
											<div
												class="grid gap-3"
												style="grid-template-columns: repeat({it.available_sizes
													.length}, minmax(0, 7rem));"
											>
												{#each it.available_sizes as size (size)}
													{@const qty = it.size_qtys[size] ?? 0}
													<div
														role="group"
														aria-label="{it.name} size {size} quantity"
														class="grid min-h-14 grid-cols-[2.5rem_1fr_2.5rem] overflow-hidden rounded-md border bg-muted/40 transition focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground/20 hover:border-foreground/20 {qty ===
														0
															? 'border-dashed opacity-60'
															: ''}"
													>
														<button
															type="button"
															aria-label="Decrease {size}"
															class="flex h-full w-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-30"
															disabled={qty === 0}
															onclick={() => {
																cart.items[idx].size_qtys[size] = Math.max(0, qty - 1);
															}}
														>
															−
														</button>
														<div class="flex flex-col items-center justify-center px-1 text-center">
															<div class="text-xs text-muted-foreground">{size}</div>
															<input
																type="text"
																inputmode="numeric"
																pattern="[0-9]*"
																aria-label="{size} quantity"
																value={qty}
																oninput={(e) => {
																	const raw = (e.currentTarget as HTMLInputElement).value.replace(
																		/[^0-9]/g,
																		''
																	);
																	const n = raw === '' ? 0 : parseInt(raw, 10);
																	cart.items[idx].size_qtys[size] = Number.isNaN(n)
																		? 0
																		: Math.max(0, n);
																}}
																class="w-full bg-transparent text-center font-mono text-sm outline-none"
															/>
														</div>
														<button
															type="button"
															aria-label="Increase {size}"
															class="flex h-full w-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none focus-visible:ring-inset"
															onclick={() => {
																cart.items[idx].size_qtys[size] = qty + 1;
															}}
														>
															+
														</button>
													</div>
												{/each}
											</div>
										</div>
									{:else}
										<div class="mt-3 flex items-center gap-3">
											<span class="text-sm text-muted-foreground">Qty</span>
											<input
												type="number"
												min="0"
												class="h-9 w-20 rounded-md border border-input bg-background px-2 text-center font-mono text-sm"
												value={it.size_qtys[''] ?? 0}
												oninput={(e) => {
													const n = parseInt((e.target as HTMLInputElement).value, 10);
													cart.items[idx].size_qtys[''] = Number.isNaN(n) ? 0 : Math.max(0, n);
												}}
											/>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ── Delivery step ──────────────────────────────────────────────── -->
		{#if stepName === 'Delivery'}
			<div>
				<p class="mb-4 text-sm text-muted-foreground">
					{groups.length === 1
						? 'Review items and pick a ship window.'
						: `${groups.length} orders will be created — one per brand + season.`}
				</p>
				<div class="space-y-4">
					{#each groups as g (groupKey(g.brand_id, g.season_id))}
						{@const meta = getMeta(g.brand_id, g.season_id)}
						{@const customDates =
							meta.delivery?.kind === 'custom'
								? meta.delivery
								: { start_ship_date: '', expected_ship_date: '' }}
						<div class="rounded-lg border bg-background p-4">
							<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
								<div class="flex items-center gap-2">
									<span class="font-semibold">{brandName(g.brand_id)}</span>
									<span class="text-sm text-muted-foreground">·</span>
									<span class="text-sm text-muted-foreground"
										>{seasonLabel(g.season_id, g.product_year)}</span
									>
								</div>
								<div class="text-sm">
									<span class="text-muted-foreground"
										>{g.units} unit{g.units === 1 ? '' : 's'} ·
									</span>
									<span class="font-semibold">{fmt.format(g.total)}</span>
								</div>
							</div>

							<div class="mb-4">
								<ShipWindowPicker
									id={`ship-window-${groupKey(g.brand_id, g.season_id)}`}
									deliveries={deliveries.filter((d) => d.season_id === g.season_id)}
									orderYear={cart.order_year}
									startShipDate={customDates.start_ship_date}
									completeShipDate={customDates.expected_ship_date}
									onApply={(range) =>
										setMeta(g.brand_id, g.season_id, {
											delivery: {
												kind: 'custom',
												start_ship_date: range.startShipDate,
												expected_ship_date: range.completeShipDate
											}
										})}
								/>
							</div>

							<div class="space-y-2">
								{#each g.items as it (`${it.product_id}|${it.selected_color}`)}
									<div class="flex items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm">
										{#if it.image_id}
											<img
												src={`/api/products/${it.product_id}/images/${it.image_id}`}
												alt=""
												class="h-8 w-8 shrink-0 rounded object-cover"
											/>
										{/if}
										<div class="min-w-0 flex-1">
											<div class="truncate font-medium">{it.name}</div>
											<div class="text-muted-foreground">
												{it.style_number} · {it.selected_color || '—'} · {itemUnits(it)} unit{itemUnits(
													it
												) === 1
													? ''
													: 's'}
											</div>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}

					{#if groups.length === 0}
						<div class="rounded-lg border border-dashed p-12 text-center">
							<div class="text-base font-semibold">No sized items</div>
							<p class="mt-1 text-sm text-muted-foreground">Go back to Items and set sizes.</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- ── Finalize step ──────────────────────────────────────────────── -->
		{#if stepName === 'Finalize'}
			{@const singleOrder = groups.length === 1}
			{@const firstGroup = groups[0]}
			{@const firstMeta = firstGroup ? getMeta(firstGroup.brand_id, firstGroup.season_id) : null}
			{@const firstStyleCount = firstGroup ? firstGroup.items.length : 0}
			{@const firstSkuCount = firstGroup
				? firstGroup.items.reduce(
						(sum, it) => sum + Object.values(it.size_qtys).filter((q) => (q ?? 0) > 0).length,
						0
					)
				: 0}
			{@const seasonCount = new Set(groups.map((g) => g.season_id ?? NO_SEASON)).size}
			{@const defaultLocation =
				accountLocations.find((l) => l.is_default) ?? accountLocations[0] ?? null}
			{@const accountEmail = defaultLocation?.contact_email ?? account?.contact_email ?? null}
			{@const contactName =
				(defaultLocation &&
					[defaultLocation.contact_first_name, defaultLocation.contact_last_name]
						.filter(Boolean)
						.join(' ')) ||
				account?.business_name ||
				'—'}
			{@const termsBlockedBrands = distinctBrandsInCart.filter((b) => termsForBrand(b.id) !== null)}
			<div class="space-y-6">
				<!-- Hero -->
				<section class="overflow-hidden rounded-lg border bg-muted/30">
					<div
						class="flex items-center justify-between gap-4 border-b px-6 py-4 text-sm text-muted-foreground"
					>
						<div>
							{#if singleOrder}
								1 order will be created
							{:else}
								<span class="font-medium text-foreground">{groups.length} orders</span> will be created
							{/if}
						</div>
						<div class="font-mono text-xs text-muted-foreground/70">
							{#if singleOrder}
								draft → pending submission
							{:else}
								{distinctBrandsInCart.length} brand{distinctBrandsInCart.length === 1 ? '' : 's'} · {seasonCount}
								season{seasonCount === 1 ? '' : 's'} · {grandUnits} units
							{/if}
						</div>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-[1fr_320px]">
						<div class="px-6 py-6">
							{#if singleOrder && firstGroup}
								<div class="text-sm text-muted-foreground">
									{brandName(firstGroup.brand_id)} · {seasonLabel(
										firstGroup.season_id,
										firstGroup.product_year
									)}
								</div>
								<div class="mt-1 font-mono text-3xl font-medium tracking-tight">
									{fmt.format(grandTotal)}
								</div>
								<div class="mt-1 font-mono text-sm text-muted-foreground/70">
									{firstGroup.units} units · avg {fmt.format(grandTotal / firstGroup.units)}/unit
								</div>
								<div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
									<div>
										<div class="text-sm text-muted-foreground">Ship window</div>
										<div class="mt-0.5 text-sm">{describeDelivery(firstMeta ?? undefined)}</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">Season</div>
										<div class="mt-0.5 text-sm">
											{seasonLabel(firstGroup.season_id, firstGroup.product_year)}
										</div>
									</div>
									<div>
										<div class="text-sm text-muted-foreground">Styles · SKUs</div>
										<div class="mt-0.5 text-sm">
											{firstStyleCount} style{firstStyleCount === 1 ? '' : 's'} · {firstSkuCount} SKU{firstSkuCount ===
											1
												? ''
												: 's'}
										</div>
									</div>
								</div>
							{:else}
								<div class="text-sm text-muted-foreground">
									Across {distinctBrandsInCart.length} brand{distinctBrandsInCart.length === 1
										? ''
										: 's'}
								</div>
								<div class="mt-1 font-mono text-3xl font-medium tracking-tight">
									{fmt.format(grandTotal)}
								</div>
								<div class="mt-1 font-mono text-sm text-muted-foreground/70">
									{grandUnits} units total
								</div>
								<div class="mt-6 space-y-2.5">
									{#each groups as g, i (groupKey(g.brand_id, g.season_id))}
										{@const meta = getMeta(g.brand_id, g.season_id)}
										<div class="flex items-center justify-between gap-4 text-sm">
											<div class="flex min-w-0 items-center gap-3">
												<span class="w-4 font-mono text-sm text-muted-foreground/70">{i + 1}</span>
												<span class="truncate">
													{brandName(g.brand_id)} · {seasonLabel(g.season_id, g.product_year)}
												</span>
												<span
													class="hidden truncate font-mono text-sm text-muted-foreground/70 sm:inline"
												>
													{g.units} units · {describeDelivery(meta)}
												</span>
											</div>
											<span class="shrink-0 font-mono">{fmt.format(g.total)}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
						<div class="border-t bg-muted/30 px-6 py-6 md:border-t-0 md:border-l">
							<div class="text-xs tracking-wider text-muted-foreground uppercase">Totals</div>
							<dl class="mt-3 space-y-2 text-sm">
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Wholesale subtotal</dt>
									<dd class="font-mono">{fmt.format(grandTotal)}</dd>
								</div>
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Order discount</dt>
									<dd class="font-mono text-muted-foreground/70">—</dd>
								</div>
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Shipping</dt>
									<dd class="font-mono text-muted-foreground/70">Calc. at ship</dd>
								</div>
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Tax</dt>
									<dd class="font-mono text-muted-foreground/70">—</dd>
								</div>
							</dl>
							<div class="mt-4 flex items-baseline justify-between border-t pt-3">
								<span class="text-sm">Total</span>
								<span class="font-mono text-lg font-medium">{fmt.format(grandTotal)}</span>
							</div>
						</div>
					</div>
				</section>

				<!-- Applies to all orders -->
				<section class="space-y-3">
					<div class="flex items-baseline justify-between">
						<div class="text-xs tracking-wider text-muted-foreground uppercase">
							Applies to all orders
						</div>
						{#if !singleOrder}
							<div class="text-sm text-muted-foreground">Override per order below if needed</div>
						{/if}
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<!-- Account + Contact -->
						<div class="rounded-lg border bg-muted/30 p-5">
							<div class="text-xs tracking-wider text-muted-foreground uppercase">Account</div>
							<div class="mt-2 text-base font-semibold">
								{account ? account.business_name : '—'}
							</div>
							<div class="mt-4 border-t pt-4">
								<div class="flex items-center justify-between">
									<div class="text-xs tracking-wider text-muted-foreground uppercase">
										Contact for this order
									</div>
									<button
										type="button"
										class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
										>Change</button
									>
								</div>
								<div class="mt-2 text-sm">{contactName}</div>
								{#if accountEmail}
									<div class="text-sm text-muted-foreground">{accountEmail}</div>
								{/if}
							</div>
						</div>

						<!-- Rep + Source -->
						<div class="rounded-lg border bg-muted/30 p-5">
							<div class="grid gap-5 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="rep-select">
										<span class="text-xs tracking-wider text-muted-foreground uppercase"
											>Sales Rep</span
										>
									</Label>
									{#if repItems.length > 0}
										<SelectField
											value={cart.rep_user_id ?? ''}
											items={repItems}
											placeholder="Select a sales rep"
											class="w-full"
											onValueChange={(v: string) => (cart.rep_user_id = v || null)}
										/>
									{:else}
										<div class="text-sm text-muted-foreground">No sales reps available</div>
									{/if}
								</div>
								<div class="space-y-2">
									<Label for="source-select">
										<span class="text-xs tracking-wider text-muted-foreground uppercase"
											>Source</span
										>
									</Label>
									{#if sourceTypeItems.length > 0}
										<SelectField
											value={selectedSourceValue}
											items={sourceTypeItems}
											placeholder="Select a source"
											class="w-full"
											onValueChange={(v: string) => onSourceChange(v)}
										/>
									{:else}
										<div class="text-sm text-muted-foreground">No sources configured</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</section>

				{#if singleOrder && firstGroup}
					{@const g = firstGroup}
					{@const meta = firstMeta!}
					{@const locsForAccount = accountLocations.filter(
						(l) => account && l.account_id === account.id
					)}
					{@const selectedShipLoc =
						locsForAccount.find((l) => l.id === meta.location_id) ?? defaultLocation}
					{@const selectedBillLoc = meta.bill_to_location_id
						? locsForAccount.find((l) => l.id === meta.bill_to_location_id)
						: selectedShipLoc}
					{@const isShipDefault = !meta.location_id || selectedShipLoc?.is_default}
					{@const isBillSameAsShip = !meta.bill_to_location_id}

					<!-- Ship To / Bill To -->
					{#if locsForAccount.length > 0}
						<section class="grid gap-4 md:grid-cols-2">
							<div class="rounded-lg border bg-muted/30 p-5">
								<div class="flex items-center justify-between">
									<div class="text-xs tracking-wider text-muted-foreground uppercase">Ship To</div>
									<button
										type="button"
										class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
										disabled={locsForAccount.length < 2}
										onclick={() => (shipEditOpen = !shipEditOpen)}
									>
										{shipEditOpen ? 'Done' : 'Edit for this order'}
									</button>
								</div>
								{#if shipEditOpen && locsForAccount.length > 0}
									<div class="mt-3">
										<SelectField
											value={meta.location_id ?? ''}
											items={locsForAccount.map((l) => ({
												value: l.id,
												label: `${l.label}${l.is_default ? ' · default' : ''}`
											}))}
											placeholder="Select ship-to address"
											class="w-full"
											onValueChange={(v: string) =>
												setMeta(g.brand_id, g.season_id, { location_id: v || null })}
										/>
									</div>
								{:else if selectedShipLoc}
									<div class="mt-3">
										<div class="text-sm font-medium">
											{selectedShipLoc.label}
											{#if isShipDefault}<span
													class="ml-1 text-sm font-normal text-muted-foreground/70"
													>(account default)</span
												>{/if}
										</div>
										<div class="mt-1 text-sm leading-relaxed text-muted-foreground">
											{selectedShipLoc.address_line1 ?? '—'}
											{#if selectedShipLoc.address_line2}<br />{selectedShipLoc.address_line2}{/if}
											{#if selectedShipLoc.city || selectedShipLoc.state || selectedShipLoc.zip}<br
												/>{[
													selectedShipLoc.city,
													[selectedShipLoc.state, selectedShipLoc.zip].filter(Boolean).join(' ')
												]
													.filter(Boolean)
													.join(', ')}{/if}
										</div>
									</div>
								{:else}
									<div class="mt-3 text-sm text-muted-foreground">No ship-to address on file.</div>
								{/if}
							</div>
							<div class="rounded-lg border bg-muted/30 p-5">
								<div class="flex items-center justify-between">
									<div class="text-xs tracking-wider text-muted-foreground uppercase">Bill To</div>
									<button
										type="button"
										class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
										disabled={locsForAccount.length < 1}
										onclick={() => (billEditOpen = !billEditOpen)}
									>
										{billEditOpen ? 'Done' : 'Edit for this order'}
									</button>
								</div>
								{#if billEditOpen && locsForAccount.length > 0}
									<div class="mt-3">
										<SelectField
											value={meta.bill_to_location_id ?? ''}
											items={[
												{ value: '', label: 'Same as ship-to' },
												...locsForAccount.map((l) => ({
													value: l.id,
													label: `${l.label}${l.is_default ? ' · default' : ''}`
												}))
											]}
											placeholder="Same as ship-to"
											class="w-full"
											onValueChange={(v: string) =>
												setMeta(g.brand_id, g.season_id, { bill_to_location_id: v || null })}
										/>
									</div>
								{:else if selectedBillLoc}
									<div class="mt-3">
										<div class="text-sm font-medium">
											{selectedBillLoc.label}
											{#if isBillSameAsShip}<span
													class="ml-1 text-sm font-normal text-muted-foreground/70"
													>(same as ship-to)</span
												>
											{:else if selectedBillLoc.is_default}<span
													class="ml-1 text-sm font-normal text-muted-foreground/70"
													>(account default)</span
												>{/if}
										</div>
										<div class="mt-1 text-sm leading-relaxed text-muted-foreground">
											{selectedBillLoc.address_line1 ?? '—'}
											{#if selectedBillLoc.address_line2}<br />{selectedBillLoc.address_line2}{/if}
											{#if selectedBillLoc.city || selectedBillLoc.state || selectedBillLoc.zip}<br
												/>{[
													selectedBillLoc.city,
													[selectedBillLoc.state, selectedBillLoc.zip].filter(Boolean).join(' ')
												]
													.filter(Boolean)
													.join(', ')}{/if}
										</div>
									</div>
								{:else}
									<div class="mt-3 text-sm text-muted-foreground">No bill-to address on file.</div>
								{/if}
							</div>
						</section>
					{/if}

					<!-- Payment & Logistics -->
					<section class="rounded-lg border bg-muted/30 p-5">
						<div class="text-xs tracking-wider text-muted-foreground uppercase">
							Payment & logistics
						</div>
						<div class="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
							<div class="space-y-2">
								<Label>Payment preference</Label>
								<SelectField
									value={meta.payment_preference ?? cart.payment_preference ?? ''}
									items={methodOnlyItems}
									placeholder="Inherit from account"
									class="w-full"
									onValueChange={(v: string) =>
										setMeta(g.brand_id, g.season_id, { payment_preference: v || null })}
								/>
							</div>
							<div class="space-y-2">
								<Label>Payment terms</Label>
								<SelectField
									value={meta.payment_terms ?? ''}
									items={termsOnlyItems}
									placeholder="Inherit from account"
									class="w-full"
									onValueChange={(v: string) =>
										setMeta(g.brand_id, g.season_id, { payment_terms: v || null })}
								/>
							</div>
							<div class="space-y-2">
								<Label>Shipping method</Label>
								<SelectField
									value={meta.shipping_method ?? ''}
									items={shippingMethodItems}
									placeholder="Inherit from account"
									class="w-full"
									onValueChange={(v: string) =>
										setMeta(g.brand_id, g.season_id, { shipping_method: v || null })}
								/>
							</div>
							<div class="space-y-2">
								<Label for="po-single"
									>PO / Customer ref <span class="text-muted-foreground/70">(optional)</span></Label
								>
								<Input
									id="po-single"
									maxlength={64}
									placeholder="—"
									value={meta.po_number ?? ''}
									oninput={(e) =>
										setMeta(g.brand_id, g.season_id, {
											po_number: (e.currentTarget as HTMLInputElement).value || null
										})}
								/>
							</div>
						</div>
						<p class="mt-3 text-sm text-muted-foreground/70">
							Pre-filled from the account where available. Changes here apply only to this order.
						</p>
					</section>

					<!-- Internal notes -->
					<section class="rounded-lg border bg-muted/30 p-5">
						<div class="flex items-center justify-between">
							<div class="text-xs tracking-wider text-muted-foreground uppercase">
								Internal notes
							</div>
							<div class="text-sm text-muted-foreground/70">Visible to your org only</div>
						</div>
						<textarea
							id="note-single"
							rows={2}
							maxlength={2000}
							class="mt-3 flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							placeholder="Context for fulfillment, follow-ups, anything the buyer won't see…"
							value={meta.internal_note ?? ''}
							oninput={(e) =>
								setMeta(g.brand_id, g.season_id, {
									internal_note: (e.currentTarget as HTMLTextAreaElement).value || null
								})}
						></textarea>
					</section>
				{/if}

				<!-- Buyer terms -->
				{#if distinctBrandsInCart.length > 0}
					<section class="space-y-2">
						<div class="text-xs tracking-wider text-muted-foreground uppercase">Buyer terms</div>
						<div class="divide-y rounded-lg border bg-muted/30">
							{#each distinctBrandsInCart as b (b.id)}
								{@const terms = termsForBrand(b.id)}
								<div class="px-5 py-4">
									{#if terms}
										<div class="flex items-start justify-between gap-4">
											<label class="flex flex-1 cursor-pointer items-start gap-3">
												<Checkbox
													checked={cart.termsAgreedByBrand[b.id] === true}
													onCheckedChange={(v) => (cart.termsAgreedByBrand[b.id] = v === true)}
												/>
												<span class="text-sm">
													Buyer agreed to <strong class="font-medium">{b.name}'s</strong> terms.
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
														<Dialog.Title class="text-base font-semibold"
															>{terms.title}</Dialog.Title
														>
														<Dialog.Description class="mt-1 text-sm text-muted-foreground"
															>{b.name} · v{terms.version}</Dialog.Description
														>
														<div class="mt-5 text-sm whitespace-pre-wrap">{terms.body}</div>
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
										<div class="flex items-start justify-between gap-4">
											<div class="text-sm">
												<span class="font-medium">{b.name}</span>
												<span class="text-muted-foreground"> — no terms on file.</span>
												<span class="mt-0.5 block text-sm text-muted-foreground/70"
													>Submission won't require a signature.</span
												>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
						{#if termsBlockedBrands.length > 0}
							<p class="text-sm text-muted-foreground/70">
								One checkbox per brand. Your name, timestamp, and the terms version are recorded on
								each submitted order.
							</p>
						{/if}
					</section>
				{/if}

				<!-- Actions -->
				<form
					bind:this={submitFormEl}
					method="POST"
					action="?/submit"
					use:enhance={() => {
						submitting = true;
						return async ({ result, update }) => {
							submitting = false;
							if (result.type === 'failure') {
								toast.error(
									(result.data as { message?: string })?.message ?? 'Could not save order'
								);
							} else if (result.type === 'error') {
								toast.error(result.error?.message ?? 'Something went wrong. Please try again.');
							} else {
								selectedProductIds.set([]);
							}
							await update({ reset: false });
						};
					}}
				>
					<input type="hidden" name="payload" value={JSON.stringify(payload)} />
					<div
						class="flex flex-col items-stretch gap-4 min-[756px]:grid min-[756px]:grid-cols-2 min-[756px]:items-start"
					>
						<Button
							type="submit"
							size="lg"
							variant="outline"
							class="order-last w-full min-[756px]:order-none"
							disabled={submitting}
							onclick={() => {
								cart.type = 'order';
								submitStatus = 'submitted';
							}}
						>
							Save as Notes
						</Button>
						<div class="contents min-[756px]:flex min-[756px]:flex-col min-[756px]:gap-2">
							<div bind:this={submitComboEl} class="order-1 flex w-full min-[756px]:order-none">
								<Button
									type="submit"
									size="lg"
									class="flex-1 rounded-none"
									disabled={submitting || (termsBlockedBrands.length > 0 && !allBrandTermsAgreed)}
									onclick={() => {
										cart.type = 'order';
										submitStatus = 'confirmed';
									}}
								>
									{groups.length > 1
										? `Submit & Confirm ${groups.length} Orders`
										: 'Submit & Confirm'}
								</Button>
								<DropdownMenu.Root>
									<DropdownMenu.Trigger
										class="inline-flex items-center rounded-l-none border-l border-primary-foreground/20 bg-primary px-2 text-primary-foreground transition-colors hover:bg-primary/90"
										aria-label="More submit options"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											class="h-4 w-4"
											aria-hidden="true"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
										</svg>
									</DropdownMenu.Trigger>
									<DropdownMenu.Portal>
										<DropdownMenu.Content
											customAnchor={submitComboEl}
											align="end"
											sideOffset={6}
											class="z-50 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
											style="width: var(--bits-dropdown-menu-anchor-width); min-width: 16rem;"
										>
											<DropdownMenu.Item
												onSelect={() => submitOrderAs('submitted')}
												class="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-muted"
											>
												<span class="flex flex-col">
													<span class="font-medium">Submit as Pending</span>
													<span class="text-sm text-muted-foreground"
														>Send to the brand for review.</span
													>
												</span>
											</DropdownMenu.Item>
											<DropdownMenu.Item
												onSelect={() => submitOrderAs('draft')}
												class="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 text-sm outline-none data-[highlighted]:bg-muted"
											>
												<span class="flex flex-col">
													<span class="font-medium">Save as Draft</span>
													<span class="text-sm text-muted-foreground"
														>Keep editing — nothing is sent yet.</span
													>
												</span>
											</DropdownMenu.Item>
										</DropdownMenu.Content>
									</DropdownMenu.Portal>
								</DropdownMenu.Root>
							</div>
							{#if termsBlockedBrands.length > 0 && !allBrandTermsAgreed}
								<span
									class="order-2 text-center text-sm text-muted-foreground/70 min-[756px]:order-none"
								>
									Check the terms box to submit
								</span>
							{/if}
						</div>
					</div>
				</form>
			</div>
		{/if}

		<!-- Bottom nav: Next -->
		{#if stepName !== 'Finalize' && stepName !== 'Account'}
			<div
				class="mt-8 flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-end"
			>
				<Button
					size="lg"
					class="w-full lg:w-auto lg:min-w-[164px]"
					onclick={nextStep}
					disabled={!canAdvance()}
				>
					Next
				</Button>
			</div>
		{/if}
	</div>
{/if}

<!-- Full-screen Add Items modal -->
<CatalogPickerModal
	bind:open={modalOpen}
	bind:items={cart.items}
	brandIds={allowedBrandIds}
	{brands}
	{seasons}
	showBrandFilter={distinctBrandsInCart.length > 1}
	onclose={closeAddItemsModal}
	ondone={() => {}}
/>

<!-- Mobile per-item size editor -->
<SizeStepperSheet
	open={sizingSheetProductId !== null}
	onClose={() => (sizingSheetProductId = null)}
	styleNumber={sizingSheetItem?.style_number}
	name={sizingSheetItem?.name}
	brand={sizingSheetItem ? brandName(sizingSheetItem.brand_id) : null}
	season={sizingSheetItem
		? seasonLabel(sizingSheetItem.season_id, sizingSheetItem.product_year)
		: null}
	color={sizingSheetItem?.selected_color || null}
	imageUrl={sizingSheetItem?.image_id
		? `/api/products/${sizingSheetItem.product_id}/images/${sizingSheetItem.image_id}`
		: null}
	unitPrice={sizingSheetItem?.unit_price}
	sizes={sizingSheetItem?.available_sizes}
	qtys={sizingSheetItem?.size_qtys}
	onChange={(size, qty) => {
		if (sizingSheetIdx >= 0) cart.items[sizingSheetIdx].size_qtys[size] = qty;
	}}
	onColorPickerOpen={() => {
		const id = sizingSheetItem?.product_id ?? null;
		sizingSheetProductId = null;
		if (id) colorPickerProductId = id;
	}}
/>

<ColorPickerSheet
	open={colorPickerProductId !== null}
	onClose={() => (colorPickerProductId = null)}
	styleNumber={colorPickerItem?.style_number}
	name={colorPickerItem?.name}
	brand={colorPickerItem ? brandName(colorPickerItem.brand_id) : null}
	season={colorPickerItem
		? seasonLabel(colorPickerItem.season_id, colorPickerItem.product_year)
		: null}
	imageUrl={colorPickerItem?.image_id
		? `/api/products/${colorPickerItem.product_id}/images/${colorPickerItem.image_id}`
		: null}
	colors={colorPickerItem?.available_colors}
	selected={colorPickerItem?.selected_color || null}
	onSelect={(color) => {
		if (colorPickerIdx >= 0) cart.items[colorPickerIdx].selected_color = color;
	}}
/>
