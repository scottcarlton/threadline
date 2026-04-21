<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { OrderType } from '$lib/types/database.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import DateSelect from '$lib/components/ui/date-select.svelte';
	import type { CartLine, DeliveryChoice } from '$lib/server/orders/cart.js';
	import CatalogPickerModal from '$lib/components/shared/CatalogPickerModal.svelte';
	import type { CatalogCartItem } from '$lib/components/shared/catalog-picker-types.js';
	import ColorSwatch from '$lib/components/shared/ColorSwatch.svelte';
	import ColorSwatchPicker from '$lib/components/shared/ColorSwatchPicker.svelte';
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Dialog } from 'bits-ui';
	import { acceptedMethodsOnly, acceptedTermsOnly } from '$lib/payment-methods';
	import { SHIPPING_METHODS } from '$lib/schemas/order-finalize';

	type Brand = { id: string; name: string };
	type Season = { id: string; name: string; sort_order: number | null };
	type SeasonDeliveryRow = {
		id: string;
		season_id: string;
		label: string;
		delivery_month: number;
		delivery_day: number;
		sort_order: number | null;
	};
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
	type Rep = { user_id: string; name: string };
	// Alias shared cart-item type so existing page code is unchanged.
	type OrderItem = CatalogCartItem;

	const NO_SEASON = '__no_season__';

	let { data } = $props();
	const accounts = $derived(data.accounts as Account[]);
	const allLocations = $derived(data.locations as LocationRow[]);
	const brands = $derived(data.brands as Brand[]);
	const seasons = $derived(data.seasons as Season[]);
	// Deduplicated by name for dropdown display; full `seasons` used for ID resolution
	const dedupedSeasons = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation inside $derived
		const seen = new Set<string>();
		return seasons.filter((s) => {
			const key = s.name.trim().toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});
	const deliveries = $derived(data.deliveries as SeasonDeliveryRow[]);
	const isBuyer = $derived(data.isBuyer === true);
	const isBrandOrg = $derived(data.isBrandOrg === true);
	const selfBrandId = $derived(data.selfBrandId ?? null);
	const reps = $derived((data.reps ?? []) as Rep[]);
	const currentUserId = $derived((data.currentUser?.id as string | undefined) ?? null);
	const orgDefaultMethod = $derived((data.defaultPaymentMethod ?? null) as string | null);

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
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// ── Cart state ──────────────────────────────────────────────────────────
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
	const cart = $state<{
		type: OrderType | null;
		brandFilter: 'all' | string[];
		items: OrderItem[];
		groupMeta: Record<string, GroupMeta>;
		account_id: string | null;
		freeform_name: string | null;
		contact_location_id: string | null;
		order_year: number;
		rep_user_id: string | null;
		source_type_id: string | null;
		payment_preference: string;
		payment_preference_touched: boolean;
		termsAgreedByBrand: Record<string, boolean>;
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
		account_id: null,
		freeform_name: null,
		contact_location_id: null,
		order_year: new Date().getFullYear(),
		rep_user_id: null,
		source_type_id: null,
		payment_preference: '',
		payment_preference_touched: false,
		termsAgreedByBrand: {},
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

	// Groups — derived from sized cart items; these are what the Delivery/Finalize steps show.
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

	// Native HTML5 DnD state for moving items between groups on the Delivery step.
	let draggingItemId = $state<string | null>(null);
	let dropTargetKey = $state<string | null>(null);

	// True when the given item is allowed to drop into the target (brand,season).
	// Rules: same brand, and target season sort_order >= item's ORIGINAL product
	// season sort_order (so a Spring item moved to Fall can come back to Spring,
	// but a Fall item can't go to Spring).
	function canDropItem(
		item_product_id: string,
		target_brand_id: string,
		target_season_id: string | null
	): boolean {
		const it = cart.items.find((ci) => ci.product_id === item_product_id);
		if (!it) return false;
		if (it.brand_id !== target_brand_id) return false;
		if (it.season_id === target_season_id) return false;
		const originSort = seasonSort(it.original_season_id);
		const targetSort = seasonSort(target_season_id);
		return targetSort >= originSort;
	}

	function onItemDragStart(e: DragEvent, product_id: string) {
		if (!e.dataTransfer) return;
		draggingItemId = product_id;
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', product_id);
	}

	function onItemDragEnd() {
		draggingItemId = null;
		dropTargetKey = null;
	}

	function onGroupDragOver(e: DragEvent, g: { brand_id: string; season_id: string | null }) {
		if (!draggingItemId) return;
		if (!canDropItem(draggingItemId, g.brand_id, g.season_id)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		dropTargetKey = groupKey(g.brand_id, g.season_id);
	}

	function onGroupDragLeave(g: { brand_id: string; season_id: string | null }) {
		const key = groupKey(g.brand_id, g.season_id);
		if (dropTargetKey === key) dropTargetKey = null;
	}

	function onGroupDrop(e: DragEvent, g: { brand_id: string; season_id: string | null }) {
		e.preventDefault();
		const id = e.dataTransfer?.getData('text/plain') || draggingItemId;
		draggingItemId = null;
		dropTargetKey = null;
		if (!id) return;
		if (!canDropItem(id, g.brand_id, g.season_id)) return;
		moveItem(id, g.season_id);
	}

	const account = $derived(accounts.find((a) => a.id === cart.account_id) ?? null);
	const accountLocations = $derived(
		cart.account_id ? allLocations.filter((l) => l.account_id === cart.account_id) : []
	);
	const isFreeform = $derived(
		cart.account_id === null && (cart.freeform_name?.trim().length ?? 0) > 0
	);
	const hasAccountChoice = $derived(cart.account_id !== null || isFreeform);
	const needsLocationStep = $derived(account !== null && accountLocations.length >= 2);
	const needsAccountDetailsStep = $derived(isFreeform);
	const hasFreeformDetails = $derived((cart.freeformDetails.business_name?.trim().length ?? 0) > 0);

	// ── Steps ───────────────────────────────────────────────────────────────
	// Brand orgs skip the 'Brand' step — their self-brand is auto-selected.
	const stepsAll = $derived.by(() => {
		const s = isBrandOrg ? ['Account'] : ['Brand', 'Account'];
		if (needsAccountDetailsStep) s.push('Details');
		s.push('Items', 'Delivery');
		if (needsLocationStep) s.push('Location');
		s.push('Finalize');
		return s;
	});

	// Auto-pin brandFilter to the self-brand for brand orgs.
	$effect(() => {
		if (isBrandOrg && selfBrandId) {
			const current = cart.brandFilter;
			const alreadyPinned = current !== 'all' && current.length === 1 && current[0] === selfBrandId;
			if (!alreadyPinned) cart.brandFilter = [selfBrandId];
		}
	});

	let currentStep = $state(0);
	const stepName = $derived(stepsAll[currentStep] ?? 'Finalize');

	// Clamp currentStep when stepsAll shrinks (e.g., user picks a single-location account, Location step drops)
	$effect(() => {
		if (currentStep >= stepsAll.length) currentStep = stepsAll.length - 1;
	});

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
	function deliveryLabelFor(d: SeasonDeliveryRow): string {
		// Display as a window from the 1st of the delivery month → the delivery day.
		const dd = String(d.delivery_day).padStart(2, '0');
		return `${d.delivery_month}/01 - ${d.delivery_month}/${dd}`;
	}
	function describeDelivery(meta: { delivery: DeliveryChoice | null } | undefined): string {
		const choice = meta?.delivery;
		if (!choice) return 'Pick a ship window';
		if (choice.kind === 'delivery') {
			const d = deliveries.find((x) => x.id === choice.delivery_id);
			return d ? deliveryLabelFor(d) : 'Delivery';
		}
		const fmtShort = (s: string) => {
			if (!s) return '—';
			// Parse YYYY-MM-DD as a local date — `new Date("2026-03-01")` interprets the string as
			// UTC midnight, which renders as the prior day in negative-offset timezones.
			const dt = new Date(`${s}T00:00:00`);
			return `${monthAbbrev[dt.getMonth()]} ${dt.getDate()}`;
		};
		return `${fmtShort(choice.start_ship_date)} → ${fmtShort(choice.expected_ship_date)}`;
	}
	// Group-level season sort_order helper. Null season acts as a floor (-1)
	// so a no-season item can move forward into any real season; null
	// sort_orders on real seasons sort last.
	function seasonSort(id: string | null): number {
		if (!id) return -1;
		return seasons.find((s) => s.id === id)?.sort_order ?? 9999;
	}

	// Valid forward-only destinations for a group (same brand, same order year).
	// Groups are keyed by (brand, season), so year stays constant for now.
	function moveTargetsFor(source_season_id: string | null) {
		const srcSort = seasonSort(source_season_id);
		return seasons
			.filter((s) => s.sort_order != null && s.sort_order > srcSort)
			.map((s) => ({ season_id: s.id, label: s.name }));
	}

	// Move every item in (brand, season) source to the destination season.
	// Existing items at the destination merge naturally (groups re-derive).
	function moveGroup(
		source_brand_id: string,
		source_season_id: string | null,
		dest_season_id: string
	) {
		for (const it of cart.items) {
			if (it.brand_id === source_brand_id && it.season_id === source_season_id) {
				it.season_id = dest_season_id;
			}
		}
	}

	// Move a single item to a destination season (null = no-season group).
	function moveItem(product_id: string, dest_season_id: string | null) {
		const it = cart.items.find((i) => i.product_id === product_id);
		if (!it) return;
		it.season_id = dest_season_id;
	}

	// Remove every item in a group.
	function removeGroup(brand_id: string, season_id: string | null) {
		cart.items = cart.items.filter(
			(it) => !(it.brand_id === brand_id && it.season_id === season_id)
		);
	}

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
	// Pure read — never mutate during render. Initialization happens in the $effect below.
	function getMeta(brand_id: string, season_id: string | null) {
		return cart.groupMeta[groupKey(brand_id, season_id)] ?? EMPTY_META;
	}
	function setMeta(brand_id: string, season_id: string | null, patch: Partial<GroupMeta>) {
		const key = groupKey(brand_id, season_id);
		const current = cart.groupMeta[key] ?? { ...EMPTY_META };
		cart.groupMeta[key] = { ...current, ...patch };
	}

	function canAdvance(): boolean {
		switch (stepName) {
			case 'Brand':
				return cart.brandFilter === 'all' || (cart.brandFilter as string[]).length > 0;
			case 'Items':
				return cart.items.length > 0 && cart.items.every(itemIsSized);
			case 'Delivery':
				return (
					groups.length > 0 &&
					groups.every((g) => {
						const d = getMeta(g.brand_id, g.season_id).delivery;
						if (!d) return false;
						if (d.kind === 'custom') return !!d.start_ship_date && !!d.expected_ship_date;
						return true;
					})
				);
			case 'Account':
				return hasAccountChoice;
			case 'Location':
				return groups.every((g) => getMeta(g.brand_id, g.season_id).location_id !== null);
			case 'Details':
				return true;
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
	}

	function handleCancel() {
		goto(resolve('/orders'));
	}

	// Brand filter ↔ combobox
	let brandQuery = $state('');
	const brandMatches = $derived(
		brandQuery.trim()
			? brands.filter((b) => normalize(b.name).includes(normalize(brandQuery)))
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

	// ── Items / catalog picker ──────────────────────────────────────────────
	let modalOpen = $state(false);

	function openAddItemsModal() {
		modalOpen = true;
	}
	function closeAddItemsModal() {
		modalOpen = false;
	}
	// Auto-size: take the first non-zero size qty and apply it to every other size.
	function autoSize(idx: number) {
		const it = cart.items[idx];
		const sizes = it.available_sizes;
		if (sizes.length === 0) return;
		let template = 0;
		for (const s of sizes) {
			const q = it.size_qtys[s] ?? 0;
			if (q > 0) {
				template = q;
				break;
			}
		}
		if (template === 0) return;
		for (const s of sizes) {
			cart.items[idx].size_qtys[s] = template;
		}
	}

	function removeProduct(product_id: string) {
		const i = cart.items.findIndex((it) => it.product_id === product_id);
		if (i >= 0) cart.items.splice(i, 1);
	}

	// Initialize group meta entries when groups change, and prune entries that no longer apply.
	$effect(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
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

	// Seed payment_preference from the selected account (or the org default).
	// Runs until the user explicitly picks one on the Finalize step.
	$effect(() => {
		if (cart.payment_preference_touched) return;
		const acc = accounts.find((a) => a.id === cart.account_id);
		const seeded = acc?.payment_preference ?? orgDefaultMethod ?? '';
		cart.payment_preference = seeded;
	});

	// Default the rep to the current user on mount.
	$effect(() => {
		if (cart.rep_user_id === null && currentUserId) {
			cart.rep_user_id = currentUserId;
		}
	});

	// Seed the account for buyers with a single account. Runs inside an effect
	// (not at cart init) so the reactive `isBuyer` / `accounts` props aren't
	// captured as frozen snapshots.
	$effect(() => {
		if (cart.account_id === null && isBuyer && accounts.length === 1) {
			cart.account_id = accounts[0].id;
		}
	});

	// Seed freeform business_name from the typed-in freeform_name on entry to Details
	// step. This lets the value render at full contrast instead of a dim placeholder.
	$effect(() => {
		if (
			stepName === 'Details' &&
			cart.freeform_name &&
			!(cart.freeformDetails.business_name?.trim().length ?? 0)
		) {
			cart.freeformDetails.business_name = cart.freeform_name;
		}
	});

	// Seed each group's Start/Complete Ship dates:
	//  - Season group with presets → latest preset (last valid ship window).
	//  - No-season group (or season without presets) → today + 30 days so the
	//    Delivery step isn't a dead end for rep-created ad-hoc orders.
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
			const fmt = (d: Date) =>
				`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
			setMeta(g.brand_id, g.season_id, {
				delivery: {
					kind: 'custom',
					start_ship_date: fmt(today),
					expected_ship_date: fmt(plus30)
				}
			});
		}
	});

	// Auto-assign location when account has exactly one
	$effect(() => {
		if (account && accountLocations.length === 1) {
			const loc = accountLocations[0];
			for (const g of groups) {
				if (!getMeta(g.brand_id, g.season_id).location_id) {
					setMeta(g.brand_id, g.season_id, { location_id: loc.id });
				}
			}
		}
	});

	// ── Account combobox ────────────────────────────────────────────────────
	let accountQuery = $state('');
	let accountFocus = $state(false);
	let accountMatches = $state<Account[]>([]);
	let accountSearching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | null = null;

	async function searchAccounts(query: string) {
		if (!data.organization?.id) return;
		accountSearching = true;
		// Server endpoint handles federation (own org + active connections).
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
		cart.freeform_name = null;
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => searchAccounts(value), 250);
	}

	// Seed results on first focus so the dropdown isn't empty before typing
	function onAccountFocus() {
		accountFocus = true;
		if (accountMatches.length === 0 && !accountSearching) searchAccounts('');
	}
	function pickAccount(a: Account) {
		cart.account_id = a.id;
		cart.freeform_name = null;
		accountQuery = a.business_name;
		accountFocus = false;
		nextStep();
	}
	function useFreeform() {
		cart.account_id = null;
		cart.freeform_name = accountQuery.trim() || null;
		accountFocus = false;
		nextStep();
	}
	// ── Submit ──────────────────────────────────────────────────────────────
	let submitting = $state(false);
	let submitStatus = $state<'draft' | 'submitted'>('draft');
	let finalizeExpandedKey = $state<string | null>(null);
	let finalizeExpandAll = $state(false);

	// Default the shared source to the org's first source type when the user
	// first arrives at Finalize; manual picks override.
	$effect(() => {
		if (!cart.source_type_id && sourceTypes.length > 0) {
			cart.source_type_id = sourceTypes[0].id;
		}
	});

	// ── Finalize step helpers ─────────────────────────────────────────────
	const brandTerms = $derived(
		(data.brandTerms ?? []) as Array<{
			id: string;
			brand_id: string;
			title: string;
			body: string;
			version: number;
		}>
	);
	const sourceTypes = $derived(
		(data.sourceTypes ?? []) as Array<{ id: string; name: string; sort_order: number | null }>
	);
	const distinctBrandsInCart = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const seen = new Set<string>();
		const out: Array<{ id: string; name: string }> = [];
		for (const g of groups) {
			if (seen.has(g.brand_id)) continue;
			seen.add(g.brand_id);
			out.push({ id: g.brand_id, name: brandName(g.brand_id) });
		}
		return out;
	});
	function termsForBrand(brand_id: string) {
		return brandTerms.find((t) => t.brand_id === brand_id) ?? null;
	}
	const brandsRequiringAgreement = $derived(
		distinctBrandsInCart.filter((b) => termsForBrand(b.id) !== null)
	);
	const allBrandTermsAgreed = $derived(
		brandsRequiringAgreement.every((b) => cart.termsAgreedByBrand[b.id] === true)
	);

	const grandTotal = $derived(groups.reduce((sum, g) => sum + g.total, 0));
	const grandUnits = $derived(groups.reduce((sum, g) => sum + g.units, 0));

	const sourceTypeItems = $derived(sourceTypes.map((s) => ({ value: s.id, label: s.name })));
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

	const finalizePayload = $derived({
		submit_mode: (cart.type === 'note' ? 'note' : 'order') as 'note' | 'order',
		account_id: cart.account_id,
		freeform_name: cart.freeform_name ?? undefined,
		contact_location_id: cart.contact_location_id,
		rep_user_id: cart.rep_user_id ?? '',
		source_type_id: cart.source_type_id,
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
		freeformDetails: isFreeform && hasFreeformDetails ? cart.freeformDetails : undefined,
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
</script>

<svelte:head><title>New Order — Threadline</title></svelte:head>

<div class="w-full p-6">
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
		<h1 class="text-2xl font-semibold">New Order</h1>
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

	<!-- ── Brand step ─────────────────────────────────────────────────── -->
	{#if stepName === 'Brand'}
		<div>
			<Label for="brand-search">Brands</Label>
			<Input id="brand-search" class="mt-1" placeholder="Search brands…" bind:value={brandQuery} />

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
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted"
					>
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
					<div class="text-base font-semibold">No items yet</div>
					<p class="mt-1 text-sm text-muted-foreground">Click Add to open the catalog.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each cart.items as it, idx (it.product_id)}
						{@const rowUnits = itemUnits(it)}
						{@const rowTotal = itemTotal(it)}
						<div class="group/item rounded-lg border p-4">
							<div class="flex items-start gap-4">
								<div class="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
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

								<div class="min-w-0 flex-1">
									<div class="font-mono text-sm">{it.style_number}</div>
									<div class="text-sm font-medium">{it.name}</div>
									<div class="text-sm text-muted-foreground">
										{brandName(it.brand_id)} · {seasonLabel(it.season_id, it.product_year)}
									</div>
								</div>

								<div class="shrink-0 self-center">
									{#if it.available_colors.length > 1}
										<ColorSwatchPicker
											value={it.selected_color || null}
											options={it.available_colors}
											onChange={(c) => (cart.items[idx].selected_color = c ?? '')}
										/>
									{:else}
										<div class="flex items-center justify-center gap-2 text-sm">
											<ColorSwatch color={it.selected_color || null} size={28} />
											{#if it.selected_color}
												<span>{it.selected_color}</span>
											{/if}
										</div>
									{/if}
								</div>

								<div class="shrink-0">
									{#if it.available_sizes.length > 0}
										<div class="flex flex-wrap items-end gap-2">
											{#each it.available_sizes as size (size)}
												<label class="flex flex-col items-center gap-1">
													<span class="text-sm text-muted-foreground">{size}</span>
													<input
														type="number"
														min="0"
														class="h-9 w-14 rounded-md border border-input bg-background px-2 text-center text-sm"
														value={it.size_qtys[size] ?? 0}
														oninput={(e) => {
															const n = parseInt((e.target as HTMLInputElement).value, 10);
															cart.items[idx].size_qtys[size] = Number.isNaN(n)
																? 0
																: Math.max(0, n);
														}}
													/>
												</label>
											{/each}
											<TooltipProvider>
												<Tooltip>
													<TooltipTrigger>
														<button
															type="button"
															aria-label="Fill all sizes"
															class="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40"
															disabled={rowUnits === 0}
															onclick={() => autoSize(idx)}
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="1.75"
																stroke-linecap="round"
																stroke-linejoin="round"
																class="h-4 w-4"
															>
																<path d="M3 6h13" />
																<path d="M3 12h13" />
																<path d="M3 18h13" />
																<path d="M19 9l3 3-3 3" />
															</svg>
														</button>
													</TooltipTrigger>
													<TooltipContent>
														Apply this row's first non-zero qty to every size
													</TooltipContent>
												</Tooltip>
											</TooltipProvider>
										</div>
									{:else}
										<label class="flex flex-col items-center gap-1">
											<span class="text-sm text-muted-foreground">Qty</span>
											<input
												type="number"
												min="0"
												class="h-9 w-20 rounded-md border border-input bg-background px-2 text-center text-sm"
												value={it.size_qtys[''] ?? 0}
												oninput={(e) => {
													const n = parseInt((e.target as HTMLInputElement).value, 10);
													cart.items[idx].size_qtys[''] = Number.isNaN(n) ? 0 : Math.max(0, n);
												}}
											/>
										</label>
									{/if}
								</div>

								<div class="shrink-0 pt-[1.5rem] text-right font-mono text-sm">
									{fmt.format(it.unit_price)}
								</div>

								<div class="shrink-0 pt-[1.5rem] text-right font-mono text-sm font-medium">
									<div>{fmt.format(rowTotal)}</div>
									<div class="text-sm font-normal text-muted-foreground">
										{rowUnits}
										{rowUnits === 1 ? 'unit' : 'units'}
									</div>
								</div>

								<div class="shrink-0 pt-[1.5rem]">
									<button
										type="button"
										aria-label="Remove item"
										class="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground opacity-0 transition-all group-hover/item:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
										onclick={() => removeProduct(it.product_id)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.75"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="h-4 w-4"
										>
											<path d="M3 6h18" />
											<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
											<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
											<path d="M10 11v6" />
											<path d="M14 11v6" />
										</svg>
									</button>
								</div>
							</div>
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
					? 'Review items and pick a ship window.'
					: `${groups.length} orders will be created — one per brand + season. Drag items or whole orders forward in time.`}
			</p>
			<div class="space-y-4">
				{#each groups as g (groupKey(g.brand_id, g.season_id))}
					{@const meta = getMeta(g.brand_id, g.season_id)}
					{@const moveTargets = moveTargetsFor(g.season_id)}
					{@const customDates =
						meta.delivery?.kind === 'custom'
							? meta.delivery
							: { start_ship_date: '', expected_ship_date: '' }}
					{@const isDropTarget = dropTargetKey === groupKey(g.brand_id, g.season_id)}
					{@const canAcceptDrop =
						draggingItemId !== null && canDropItem(draggingItemId, g.brand_id, g.season_id)}
					<div
						class="rounded-lg border bg-background p-4 transition-colors {isDropTarget
							? 'border-foreground bg-muted/30'
							: canAcceptDrop
								? 'border-dashed border-foreground/40'
								: ''}"
						ondragover={(e) => onGroupDragOver(e, g)}
						ondragleave={() => onGroupDragLeave(g)}
						ondrop={(e) => onGroupDrop(e, g)}
						role="region"
						aria-label="Order for {brandName(g.brand_id)} {seasonLabel(
							g.season_id,
							g.product_year
						)}"
					>
						<!-- Header: brand · season · (Move menu) | units/total · delete -->
						<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<span class="font-semibold">{brandName(g.brand_id)}</span>
								<span class="text-sm text-muted-foreground">·</span>
								<span class="text-sm text-muted-foreground"
									>{seasonLabel(g.season_id, g.product_year)}</span
								>
								{#if moveTargets.length > 0}
									<details
										class="relative ml-1 marker:hidden [&>summary::-webkit-details-marker]:hidden"
									>
										<summary
											class="cursor-pointer list-none text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
											aria-label="Move this order to a later season"
										>
											Move →
										</summary>
										<div
											class="absolute top-full left-0 z-20 mt-1 min-w-[140px] rounded-md border bg-background py-1 shadow-lg"
										>
											{#each moveTargets as t (t.season_id)}
												<button
													type="button"
													class="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
													onclick={(e) => {
														moveGroup(g.brand_id, g.season_id, t.season_id);
														(e.currentTarget as HTMLElement)
															.closest('details')
															?.removeAttribute('open');
													}}
												>
													{t.label}
												</button>
											{/each}
										</div>
									</details>
								{/if}
							</div>
							<div class="flex items-center gap-3">
								<div class="text-sm">
									<span class="text-muted-foreground"
										>{g.units} unit{g.units === 1 ? '' : 's'} ·
									</span><span class="font-semibold">{fmt.format(g.total)}</span>
								</div>
								<button
									type="button"
									class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
									aria-label="Delete order"
									onclick={() => removeGroup(g.brand_id, g.season_id)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</div>
						</div>

						<!-- Items list — drag each row to another group card -->
						<div class="mb-4 space-y-2">
							{#each g.items as it (it.product_id)}
								<div
									class="group/item flex cursor-grab items-center gap-3 rounded-md bg-muted/30 px-3 py-2 text-sm transition-opacity {draggingItemId ===
									it.product_id
										? 'opacity-40'
										: ''}"
									draggable="true"
									role="listitem"
									aria-label="Drag {it.name} to another order"
									ondragstart={(e) => onItemDragStart(e, it.product_id)}
									ondragend={onItemDragEnd}
								>
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
									<button
										type="button"
										class="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100"
										aria-label="Remove item"
										onclick={() => removeProduct(it.product_id)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</div>
							{/each}
						</div>

						<!-- Delivery selection: MM / DD / YYYY dropdowns, always visible -->
						<div class="flex flex-wrap gap-6">
							<div>
								<Label for={`start-${groupKey(g.brand_id, g.season_id)}`} class="text-sm">
									Start Ship
								</Label>
								<div class="mt-1">
									<DateSelect
										id={`start-${groupKey(g.brand_id, g.season_id)}`}
										value={customDates.start_ship_date}
										onchange={(v) =>
											setMeta(g.brand_id, g.season_id, {
												delivery: {
													kind: 'custom',
													start_ship_date: v,
													expected_ship_date: customDates.expected_ship_date
												}
											})}
									/>
								</div>
							</div>
							<div>
								<Label for={`end-${groupKey(g.brand_id, g.season_id)}`} class="text-sm">
									Complete Ship
								</Label>
								<div class="mt-1">
									<DateSelect
										id={`end-${groupKey(g.brand_id, g.season_id)}`}
										value={customDates.expected_ship_date}
										onchange={(v) =>
											setMeta(g.brand_id, g.season_id, {
												delivery: {
													kind: 'custom',
													start_ship_date: customDates.start_ship_date,
													expected_ship_date: v
												}
											})}
									/>
								</div>
							</div>
						</div>
					</div>
				{/each}

				{#if groups.length === 0}
					<div class="rounded-lg border border-dashed p-12 text-center">
						<div
							class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class="h-6 w-6 text-muted-foreground"
							>
								<path d="M3 3h18v4H3zM3 10h18v11H3z" />
							</svg>
						</div>
						<div class="text-base font-semibold">No orders</div>
						<p class="mt-1 text-sm text-muted-foreground">Go back to Items to add products.</p>
					</div>
				{/if}
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
					placeholder="Type to search (e.g. &quot;Elm & Ivory&quot;) or enter a new account name"
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
							{#if accountQuery.trim().length >= 2}
								<li>
									<button
										type="button"
										class="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-normal text-foreground hover:bg-muted/50"
										onclick={useFreeform}
									>
										<span class="flex items-center gap-2">
											<span aria-hidden="true">+</span>
											<span>Add "{accountQuery.trim()}" as new account</span>
										</span>
										<span class="text-muted-foreground">New Account</span>
									</button>
								</li>
							{/if}
						</ul>
					</div>
				{/if}
			</div>
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
							{brandName(g.brand_id)} · {seasonLabel(g.season_id, g.product_year)}
						</div>
						<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
							{#each accountLocations as loc (loc.id)}
								<button
									type="button"
									class="rounded border p-3 text-left text-sm transition {meta.location_id ===
									loc.id
										? 'border-foreground bg-muted/30'
										: 'hover:border-foreground'}"
									onclick={() => setMeta(g.brand_id, g.season_id, { location_id: loc.id })}
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
				These details save as a new account. You can skip and come back later — orders stay as
				drafts until this is complete.
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
					<Input
						id="em"
						type="email"
						bind:value={cart.freeformDetails.contact_email}
						class="mt-1"
					/>
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

	<!-- ── Finalize step ──────────────────────────────────────────────── -->
	{#if stepName === 'Finalize'}
		{@const defaultLocation =
			accountLocations.find((l) => l.is_default) ?? accountLocations[0] ?? null}
		{@const accountEmail = defaultLocation?.contact_email ?? account?.contact_email ?? null}
		{@const contactName =
			(defaultLocation &&
				[defaultLocation.contact_first_name, defaultLocation.contact_last_name]
					.filter(Boolean)
					.join(' ')) ||
			account?.business_name ||
			cart.freeform_name ||
			'—'}
		<div class="space-y-6">
			<!-- Hero: aggregate summary + totals -->
			<div class="rounded-lg border bg-card">
				<div class="grid gap-0 sm:grid-cols-[1fr_320px]">
					<div class="space-y-4 p-6">
						<div class="flex items-start justify-between gap-4">
							<div>
								<div class="text-sm text-muted-foreground">
									{#if groups.length > 1}
										{groups.length} orders will be created
									{:else}
										1 order will be created
									{/if}
								</div>
								<div class="mt-2 font-mono text-3xl font-semibold">{fmt.format(grandTotal)}</div>
								<div class="mt-1 text-sm text-muted-foreground">
									{grandUnits} units total · {distinctBrandsInCart.length} brand{distinctBrandsInCart.length ===
									1
										? ''
										: 's'}
								</div>
							</div>
						</div>
						{#if groups.length > 1}
							<ul class="divide-y border-t">
								{#each groups as g, i (groupKey(g.brand_id, g.season_id))}
									{@const meta = getMeta(g.brand_id, g.season_id)}
									<li class="flex items-center justify-between py-3 text-sm">
										<div class="flex items-center gap-3">
											<span class="font-mono text-muted-foreground">{i + 1}</span>
											<div>
												<div class="font-medium">
													{brandName(g.brand_id)} · {seasonLabel(g.season_id, g.product_year)}
												</div>
												<div class="text-sm text-muted-foreground">
													{g.units} units · {describeDelivery(meta)}
												</div>
											</div>
										</div>
										<div class="font-mono">{fmt.format(g.total)}</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					<div class="space-y-3 border-t bg-muted/30 p-6 sm:border-t-0 sm:border-l">
						<div class="text-sm font-medium">Totals</div>
						<dl class="space-y-2 text-sm">
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Wholesale subtotal</dt>
								<dd class="font-mono">{fmt.format(grandTotal)}</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Order discount</dt>
								<dd class="font-mono text-muted-foreground">—</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Shipping</dt>
								<dd class="font-mono text-muted-foreground">Calc. at ship</dd>
							</div>
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Tax</dt>
								<dd class="font-mono text-muted-foreground">—</dd>
							</div>
							<div class="flex justify-between border-t pt-2 font-semibold">
								<dt>Total</dt>
								<dd class="font-mono">{fmt.format(grandTotal)}</dd>
							</div>
						</dl>
					</div>
				</div>
			</div>

			<!-- Account + Contact -->
			<div class="rounded-lg border p-5">
				<div class="grid gap-6 sm:grid-cols-2">
					<div>
						<div class="text-sm text-muted-foreground">Account</div>
						<div class="mt-1 text-base font-semibold">
							{account ? account.business_name : (cart.freeform_name ?? '—')}
						</div>
						{#if isFreeform && !hasFreeformDetails}
							<div class="mt-1 text-sm text-amber-700">
								No account details — orders will be saved as drafts.
							</div>
						{/if}
					</div>
					<div>
						<div class="text-sm text-muted-foreground">Contact</div>
						<div class="mt-1 text-base font-semibold">{contactName}</div>
						{#if accountEmail}
							<div class="text-sm text-muted-foreground">{accountEmail}</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Shared fields: Rep + Source -->
			<div class="rounded-lg border p-5">
				<div class="text-sm font-medium">Applies to all orders</div>
				<div class="mt-1 text-sm text-muted-foreground">Override per order below if needed.</div>
				<div class="mt-4 grid gap-4 sm:grid-cols-2">
					{#if repItems.length > 0}
						<div class="space-y-2">
							<Label for="rep-select">Rep</Label>
							<SelectField
								value={cart.rep_user_id ?? ''}
								items={repItems}
								placeholder="Select a rep"
								class="w-full"
								onValueChange={(v) => (cart.rep_user_id = v || null)}
							/>
						</div>
					{/if}
					{#if sourceTypeItems.length > 0}
						<div class="space-y-2">
							<Label for="source-select">Source</Label>
							<SelectField
								value={cart.source_type_id ?? ''}
								items={sourceTypeItems}
								placeholder="Select a source"
								class="w-full"
								onValueChange={(v) => (cart.source_type_id = v || null)}
							/>
						</div>
					{/if}
				</div>
			</div>

			<!-- Per-order cards -->
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<div class="text-sm font-medium">Per order</div>
					{#if groups.length > 1}
						<button
							type="button"
							class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
							onclick={() => (finalizeExpandAll = !finalizeExpandAll)}
						>
							{finalizeExpandAll ? 'Collapse all' : 'Expand all'}
						</button>
					{/if}
				</div>
				{#each groups as g, i (groupKey(g.brand_id, g.season_id))}
					{@const key = groupKey(g.brand_id, g.season_id)}
					{@const meta = getMeta(g.brand_id, g.season_id)}
					{@const isOpen =
						groups.length === 1 ||
						finalizeExpandAll ||
						finalizeExpandedKey === key ||
						Boolean(
							meta.bill_to_location_id ||
							meta.payment_preference ||
							meta.payment_terms ||
							meta.shipping_method ||
							meta.po_number ||
							meta.internal_note
						)}
					{@const locsForAccount = accountLocations.filter(
						(l) => account && l.account_id === account.id
					)}
					<div class="rounded-lg border">
						<button
							type="button"
							class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
							onclick={() => (finalizeExpandedKey = isOpen ? null : key)}
						>
							<div class="flex items-center gap-3">
								<span class="font-mono text-sm text-muted-foreground">{i + 1}</span>
								<div>
									<div class="text-sm font-medium">
										{brandName(g.brand_id)} · {seasonLabel(g.season_id, g.product_year)}
									</div>
									<div class="text-sm text-muted-foreground">
										{g.units} units · {describeDelivery(meta)}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-3">
								{#if !isOpen}
									{@const prevBrandId = i > 0 ? groups[i - 1].brand_id : null}
									{@const hasOverrides = Boolean(
										meta.bill_to_location_id ||
										meta.payment_preference ||
										meta.payment_terms ||
										meta.shipping_method ||
										meta.po_number ||
										meta.internal_note
									)}
									{#if prevBrandId !== null && prevBrandId !== g.brand_id}
										<span
											class="rounded-full border bg-muted/40 px-2 py-0.5 text-sm text-muted-foreground"
											>Different brand</span
										>
									{:else if !hasOverrides}
										<span
											class="rounded-full border bg-muted/40 px-2 py-0.5 text-sm text-muted-foreground"
											>Defaults from account</span
										>
									{/if}
								{/if}
								<span class="font-mono text-sm">{fmt.format(g.total)}</span>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4 text-muted-foreground transition-transform {isOpen
										? 'rotate-180'
										: ''}"
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
							</div>
						</button>
						{#if isOpen}
							<div class="space-y-5 border-t px-5 py-4">
								<!-- Ship / Bill to pickers -->
								{#if locsForAccount.length > 0}
									<div class="grid gap-4 sm:grid-cols-2">
										<div class="space-y-2">
											<Label>Ship to</Label>
											<SelectField
												value={meta.location_id ?? ''}
												items={locsForAccount.map((l) => ({
													value: l.id,
													label: `${l.label}${l.is_default ? ' · default' : ''}`
												}))}
												placeholder="Select ship-to address"
												class="w-full"
												onValueChange={(v) =>
													setMeta(g.brand_id, g.season_id, { location_id: v || null })}
											/>
										</div>
										<div class="space-y-2">
											<Label>Bill to</Label>
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
												onValueChange={(v) =>
													setMeta(g.brand_id, g.season_id, { bill_to_location_id: v || null })}
											/>
										</div>
									</div>
								{/if}

								<!-- Payment / shipping / PO -->
								<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
									<div class="space-y-2">
										<Label>Payment preference</Label>
										<SelectField
											value={meta.payment_preference ?? cart.payment_preference ?? ''}
											items={methodOnlyItems}
											placeholder="Inherit from account"
											class="w-full"
											onValueChange={(v) =>
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
											onValueChange={(v) =>
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
											onValueChange={(v) =>
												setMeta(g.brand_id, g.season_id, { shipping_method: v || null })}
										/>
									</div>
									<div class="space-y-2">
										<Label for={`po-${key}`}>PO / customer ref</Label>
										<Input
											id={`po-${key}`}
											maxlength={64}
											placeholder="Optional"
											value={meta.po_number ?? ''}
											oninput={(e) =>
												setMeta(g.brand_id, g.season_id, {
													po_number: (e.currentTarget as HTMLInputElement).value || null
												})}
										/>
									</div>
								</div>

								<!-- Internal note -->
								<div class="space-y-2">
									<Label for={`note-${key}`}>Internal note</Label>
									<textarea
										id={`note-${key}`}
										rows={2}
										maxlength={2000}
										class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
										placeholder="Add fulfillment context for the warehouse."
										value={meta.internal_note ?? ''}
										oninput={(e) =>
											setMeta(g.brand_id, g.season_id, {
												internal_note: (e.currentTarget as HTMLTextAreaElement).value || null
											})}
									></textarea>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Terms block -->
			{#if brandsRequiringAgreement.length > 0}
				<div class="rounded-lg border">
					<div class="border-b px-5 py-3 text-sm font-medium">Buyer terms</div>
					<ul class="divide-y">
						{#each brandsRequiringAgreement as b (b.id)}
							{@const terms = termsForBrand(b.id)!}
							{@const coveredOrders = groups
								.map((g, i) => (g.brand_id === b.id ? i + 1 : null))
								.filter((n): n is number => n !== null)}
							<li class="flex items-start justify-between gap-4 px-5 py-4">
								<label class="flex cursor-pointer gap-3">
									<Checkbox
										checked={cart.termsAgreedByBrand[b.id] === true}
										onCheckedChange={(v) => (cart.termsAgreedByBrand[b.id] = v === true)}
									/>
									<div>
										<span class="text-sm">
											Buyer agreed to <strong>{b.name}'s</strong> terms.
										</span>
										<p class="mt-1 text-sm text-muted-foreground">
											{#if coveredOrders.length === 1}
												Covers order {coveredOrders[0]}.
											{:else if coveredOrders.length > 1}
												Covers orders {coveredOrders.join(', ')}.
											{/if}
										</p>
									</div>
								</label>
								<Dialog.Root>
									<Dialog.Trigger
										class="shrink-0 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
										>View</Dialog.Trigger
									>
									<Dialog.Portal>
										<Dialog.Overlay
											class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
										/>
										<Dialog.Content
											class="fixed top-[50%] left-[50%] z-50 max-h-[80vh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-auto rounded-lg border bg-background p-6 shadow-lg"
										>
											<Dialog.Title class="text-base font-semibold">{terms.title}</Dialog.Title>
											<Dialog.Description class="mt-1 text-sm text-muted-foreground">
												{b.name} · v{terms.version}
											</Dialog.Description>
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
							</li>
						{/each}
					</ul>
					<p class="border-t px-5 py-3 text-sm text-muted-foreground">
						One checkbox per brand. Your name, timestamp, and terms version are recorded on each
						submitted order.
					</p>
				</div>
			{/if}

			<!-- Action bar -->
			<form
				method="POST"
				action="?/submit"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'failure') {
							toast.error((result.data as { message?: string })?.message ?? 'Could not save order');
						} else if (result.type === 'redirect') {
							toast.success(submitStatus === 'submitted' ? 'Order submitted' : 'Notes saved');
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Something went wrong. Please try again.');
						}
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="payload" value={JSON.stringify(payload)} />
				<div class="flex items-center justify-between gap-3">
					<Button
						type="submit"
						variant="outline"
						disabled={submitting}
						onclick={() => {
							cart.type = 'note';
							submitStatus = 'submitted';
						}}
					>
						{groups.length > 1 ? `Save ${groups.length} Notes` : 'Save as Note'}
					</Button>
					<div class="flex items-center gap-3">
						{#if brandsRequiringAgreement.length > 0 && !allBrandTermsAgreed}
							<span class="text-sm text-muted-foreground">
								Agree to each brand's terms to submit.
							</span>
						{/if}
						<Button
							type="submit"
							disabled={submitting ||
								(isFreeform && !hasFreeformDetails) ||
								(brandsRequiringAgreement.length > 0 && !allBrandTermsAgreed)}
							onclick={() => {
								cart.type = 'order';
								submitStatus = 'submitted';
							}}
						>
							{groups.length > 1 ? `Submit ${groups.length} Orders` : 'Submit Order'}
						</Button>
					</div>
				</div>
			</form>
		</div>
	{/if}

	<!-- Bottom nav: Next only (Back moved to top). -->
	{#if stepName !== 'Finalize'}
		<div class="mt-8 flex items-center justify-end gap-4">
			{#if stepName === 'Details'}
				<button type="button" class="text-sm underline hover:no-underline" onclick={nextStep}>
					Skip
				</button>
			{/if}
			<Button onclick={nextStep} disabled={!canAdvance()}>Next</Button>
		</div>
	{/if}
</div>

<!-- ── Full-screen Add Items modal ─────────────────────────────────────── -->
<CatalogPickerModal
	bind:open={modalOpen}
	bind:items={cart.items}
	brandIds={allowedBrandIds}
	{brands}
	seasons={dedupedSeasons}
	showBrandFilter={cart.brandFilter === 'all' || (cart.brandFilter as string[]).length > 1}
	onclose={closeAddItemsModal}
	ondone={() => {}}
/>
