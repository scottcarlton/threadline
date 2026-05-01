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
	import SizeStepperSheet from '$lib/components/shared/SizeStepperSheet.svelte';
	import ColorPickerSheet from '$lib/components/shared/ColorPickerSheet.svelte';
	import type { CatalogCartItem } from '$lib/components/shared/catalog-picker-types.js';
	import ColorSwatch from '$lib/components/shared/ColorSwatch.svelte';
	import ColorSwatchPicker from '$lib/components/shared/ColorSwatchPicker.svelte';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Dialog, DropdownMenu } from 'bits-ui';
	import { acceptedMethodsOnly, acceptedTermsOnly } from '$lib/payment-methods';
	import { SHIPPING_METHODS } from '$lib/schemas/order-finalize';

	type Brand = { id: string; name: string; logo_url: string | null };
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
	const brands = $derived(
		data.brands as Array<Brand & { products_count: number; seasons_count: number }>
	);
	const seasons = $derived(data.seasons as Season[]);
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
		show_date_id: string | null;
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
		show_date_id: null,
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
	// Buyers always skip 'Brand' (they only shop the catalogs they have access
	// to) and skip 'Account' when they have exactly one account (auto-seeded
	// in the effect below).
	const stepsAll = $derived.by(() => {
		const s = isBuyer
			? accounts.length > 1
				? ['Account']
				: []
			: isBrandOrg
				? ['Account']
				: brands.length <= 1
					? ['Account']
					: ['Brand', 'Account'];
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

	// Auto-pin brandFilter when a rep org has exactly one brand — Brand step is skipped.
	$effect(() => {
		if (!isBuyer && !isBrandOrg && brands.length === 1) {
			const only = brands[0].id;
			const current = cart.brandFilter;
			const alreadyPinned = current !== 'all' && current.length === 1 && current[0] === only;
			if (!alreadyPinned) cart.brandFilter = [only];
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
	function selectBrandAndAdvance(id: string) {
		cart.brandFilter = [id];
		nextStep();
	}
	function useAllBrands() {
		cart.brandFilter = 'all';
		nextStep();
	}
	const inMultiSelect = $derived(
		cart.brandFilter !== 'all' && (cart.brandFilter as string[]).length > 0
	);

	const allowedBrandIds = $derived.by(() => {
		if (cart.brandFilter === 'all') return brands.map((b) => b.id);
		return cart.brandFilter as string[];
	});

	// ── Items / catalog picker ──────────────────────────────────────────────
	let modalOpen = $state(false);
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

	function openAddItemsModal() {
		modalOpen = true;
	}
	function closeAddItemsModal() {
		modalOpen = false;
	}
	// Apply All / Undo (per-row, transient — not persisted with the cart).
	// `sizeTouches` records the order in which sizes were edited so the template
	// for Apply All is the most-recently-typed value (with qty > 0). `applySnapshots`
	// holds the pre-Apply qtys so Undo can restore them. Any value change clears
	// the snapshot, flipping the button back to "Apply All" per spec.
	const sizeTouches = $state<Record<string, string[]>>({});
	const applySnapshots = $state<Record<string, Record<string, number>>>({});

	function recordTouch(productId: string, size: string) {
		const list = (sizeTouches[productId] ?? []).filter((s) => s !== size);
		list.push(size);
		sizeTouches[productId] = list;
		if (applySnapshots[productId]) delete applySnapshots[productId];
	}

	function applyAllTemplate(it: OrderItem): number {
		const list = sizeTouches[it.product_id] ?? [];
		for (let i = list.length - 1; i >= 0; i--) {
			const q = it.size_qtys[list[i]] ?? 0;
			if (q > 0) return q;
		}
		// Fallback when nothing has been touched yet (e.g. seeded from another flow):
		// pick any size with qty > 0, in declared order.
		for (const s of it.available_sizes) {
			const q = it.size_qtys[s] ?? 0;
			if (q > 0) return q;
		}
		return 0;
	}

	function applyAll(idx: number) {
		const it = cart.items[idx];
		const template = applyAllTemplate(it);
		if (template === 0) return;
		const snapshot: Record<string, number> = {};
		for (const s of it.available_sizes) snapshot[s] = it.size_qtys[s] ?? 0;
		for (const s of it.available_sizes) {
			if ((it.size_qtys[s] ?? 0) === 0) cart.items[idx].size_qtys[s] = template;
		}
		applySnapshots[it.product_id] = snapshot;
	}

	function undoApplyAll(idx: number) {
		const it = cart.items[idx];
		const snap = applySnapshots[it.product_id];
		if (!snap) return;
		for (const s of it.available_sizes) cart.items[idx].size_qtys[s] = snap[s] ?? 0;
		delete applySnapshots[it.product_id];
	}

	function removeProduct(product_id: string) {
		const i = cart.items.findIndex((it) => it.product_id === product_id);
		if (i >= 0) cart.items.splice(i, 1);
	}

	// Undoable delete: splice immediately, stash a snapshot, render an inline
	// placeholder until the user clicks Undo or the 6s window elapses.
	type PendingUndo = {
		snapshot: OrderItem;
		originalIndex: number;
		timeoutId: ReturnType<typeof setTimeout>;
	};
	const pendingUndos = $state<PendingUndo[]>([]);
	const UNDO_WINDOW_MS = 6000;

	function requestDelete(idx: number) {
		const it = cart.items[idx];
		if (!it) return;
		const snapshot = $state.snapshot(it) as OrderItem;
		const originalIndex = idx;
		cart.items.splice(idx, 1);
		const timeoutId = setTimeout(() => finalizeDelete(snapshot.product_id), UNDO_WINDOW_MS);
		pendingUndos.push({ snapshot, originalIndex, timeoutId });
	}

	function undoDelete(product_id: string) {
		const i = pendingUndos.findIndex((p) => p.snapshot.product_id === product_id);
		if (i < 0) return;
		const entry = pendingUndos[i];
		clearTimeout(entry.timeoutId);
		const insertAt = Math.min(entry.originalIndex, cart.items.length);
		cart.items.splice(insertAt, 0, entry.snapshot);
		pendingUndos.splice(i, 1);
		// Wipe any Apply All snapshot for this row — the restored item is fresh
		// and shouldn't carry a stale undo state.
		if (applySnapshots[product_id]) delete applySnapshots[product_id];
	}

	function finalizeDelete(product_id: string) {
		const i = pendingUndos.findIndex((p) => p.snapshot.product_id === product_id);
		if (i >= 0) pendingUndos.splice(i, 1);
	}

	$effect(() => {
		// Cleanup any in-flight undo timers when the page unmounts so they don't
		// fire against a stale component.
		return () => {
			for (const p of pendingUndos) clearTimeout(p.timeoutId);
		};
	});

	// iOS-Mail-style swipe-to-delete. Pointer events cover touch + mouse drag.
	// Past MIN reveals a tap-to-confirm Delete button; past COMMIT_RATIO of the
	// row width commits immediately. Vertical movement cancels (preserves scroll).
	function swipeToDelete(
		node: HTMLElement,
		opts: { onCommit: () => void; onRevealChange?: (revealed: boolean) => void }
	) {
		const MIN_REVEAL = 88;
		const COMMIT_RATIO = 0.45;
		const SLOP = 8;
		let startX = 0;
		let startY = 0;
		let currentDx = 0;
		let pointerId: number | null = null;
		let isSwiping = false;
		let revealed = false;
		let prevUserSelect = '';

		function setOffset(px: number) {
			node.style.transform = px === 0 ? '' : `translateX(${px}px)`;
		}

		function isInteractive(target: EventTarget | null) {
			if (!(target instanceof HTMLElement)) return false;
			return !!target.closest('button, input, select, textarea, a, [role="button"]');
		}

		function onPointerDown(e: PointerEvent) {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			if (isInteractive(e.target)) return;
			startX = e.clientX;
			startY = e.clientY;
			currentDx = revealed ? -MIN_REVEAL : 0;
			pointerId = e.pointerId;
			isSwiping = false;
			node.style.transition = 'none';
		}

		function onPointerMove(e: PointerEvent) {
			if (pointerId !== e.pointerId) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			if (!isSwiping) {
				if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
				if (Math.abs(dx) <= Math.abs(dy)) {
					pointerId = null;
					return;
				}
				isSwiping = true;
				prevUserSelect = node.style.userSelect;
				node.style.userSelect = 'none';
				try {
					node.setPointerCapture(e.pointerId);
				} catch {
					/* noop */
				}
			}
			const base = revealed ? -MIN_REVEAL : 0;
			currentDx = Math.min(0, base + dx);
			setOffset(currentDx);
			e.preventDefault();
		}

		function onPointerUp(e: PointerEvent) {
			if (pointerId !== e.pointerId) return;
			pointerId = null;
			if (!isSwiping) return;
			isSwiping = false;
			node.style.userSelect = prevUserSelect;
			node.style.transition = 'transform 180ms ease-out';
			const commitAt = node.clientWidth * COMMIT_RATIO;
			if (Math.abs(currentDx) >= commitAt) {
				setOffset(-node.clientWidth);
				revealed = false;
				opts.onRevealChange?.(false);
				setTimeout(() => opts.onCommit(), 170);
			} else if (Math.abs(currentDx) >= MIN_REVEAL) {
				revealed = true;
				setOffset(-MIN_REVEAL);
				opts.onRevealChange?.(true);
			} else {
				revealed = false;
				setOffset(0);
				opts.onRevealChange?.(false);
			}
		}

		function onPointerCancel(e: PointerEvent) {
			if (pointerId !== e.pointerId) return;
			pointerId = null;
			if (!isSwiping) return;
			isSwiping = false;
			node.style.userSelect = prevUserSelect;
			node.style.transition = 'transform 180ms ease-out';
			setOffset(revealed ? -MIN_REVEAL : 0);
		}

		node.style.touchAction = 'pan-y';
		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		node.addEventListener('pointerup', onPointerUp);
		node.addEventListener('pointercancel', onPointerCancel);

		return {
			destroy() {
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('pointermove', onPointerMove);
				node.removeEventListener('pointerup', onPointerUp);
				node.removeEventListener('pointercancel', onPointerCancel);
			}
		};
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
	let submitStatus = $state<'draft' | 'submitted' | 'confirmed'>('draft');
	let submitFormEl: HTMLFormElement | null = $state(null);
	let submitComboEl: HTMLDivElement | null = $state(null);
	function submitOrderAs(status: 'draft' | 'submitted' | 'confirmed') {
		cart.type = 'order';
		submitStatus = status;
		submitFormEl?.requestSubmit();
	}
	let finalizeExpandedKey = $state<string | null>(null);
	let finalizeExpandAll = $state(false);
	let shipEditOpen = $state(false);
	let billEditOpen = $state(false);

	// Default the shared source to the org's first source type when the user
	// first arrives at Finalize; manual picks (source or show) override.
	$effect(() => {
		if (!cart.source_type_id && !cart.show_date_id && sourceTypes.length > 0) {
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

	// Unified source picker: shows (specific dates) on top, then source types.
	// Values are tagged (`show:<id>` or `source:<id>`) so the picker can write
	// to the right cart field and the server can hydrate the right FK.
	// Nx-BLSR (sales-role member of multiple brand-orgs) sees source_types
	// from each of their brand-orgs, so identical names like "Road" appear
	// once per org. Collapse by trimmed lowercase name; first occurrence wins
	// (load query orders by sort_order). The picked id is a representative —
	// the server resolves the actual per-order id from the picked name.
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
		{@const showMulti = brands.length > 2}
		{@const showSearch = brands.length > 7}
		<div class="mx-auto max-w-[756px]">
			{#if showSearch}
				<Input
					id="brand-search"
					class="mb-4"
					placeholder="Search brands…"
					bind:value={brandQuery}
				/>
			{/if}

			<ul class="space-y-2">
				{#each brandMatches as b (b.id)}
					{@const isSelected = brandSelected(b.id)}
					<li class="group/card flex items-center gap-3">
						{#if showMulti}
							<div
								class="shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 {inMultiSelect
									? '[@media(hover:hover)]:!opacity-100'
									: ''}"
							>
								<Checkbox checked={isSelected} onCheckedChange={() => toggleBrand(b.id)} />
							</div>
						{/if}
						<button
							type="button"
							class="flex flex-1 items-center gap-4 rounded-lg border bg-background px-4 py-3 text-left transition-colors {isSelected
								? 'border-foreground'
								: '[@media(hover:hover)]:hover:border-foreground/40'}"
							onclick={() => selectBrandAndAdvance(b.id)}
						>
							<div
								class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-base font-semibold text-muted-foreground"
							>
								{#if b.logo_url}
									<img src={b.logo_url} alt="" class="h-full w-full object-cover" />
								{:else}
									{b.name.charAt(0).toUpperCase()}
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="font-semibold">{b.name}</div>
								<div class="text-sm text-muted-foreground">
									{b.products_count} products · {b.seasons_count}
									{b.seasons_count === 1 ? 'Season' : 'Seasons'}
								</div>
							</div>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="currentColor"
								class="h-5 w-5 shrink-0 text-muted-foreground transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100"
								aria-hidden="true"
							>
								<path
									d="M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z"
								/>
							</svg>
						</button>
					</li>
				{/each}
				{#if brandMatches.length === 0}
					<li
						class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
					>
						No matching brands.
					</li>
				{/if}
			</ul>

			<div class="mt-4 flex items-center justify-between gap-3">
				<button
					type="button"
					class="inline-flex items-center gap-1 text-sm underline hover:no-underline"
					onclick={useAllBrands}
				>
					Continue with all brands
					<LongArrow direction="right" class="h-4 w-4" />
				</button>
				{#if showMulti && inMultiSelect}
					<Button onclick={nextStep}>Next</Button>
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
				{@const renderRows = (() => {
					type Row =
						| { kind: 'item'; it: OrderItem; idx: number }
						| { kind: 'placeholder'; undo: PendingUndo };
					const rows: Row[] = cart.items.map((it, idx) => ({ kind: 'item', it, idx }));
					const sorted = [...pendingUndos].sort((a, b) => a.originalIndex - b.originalIndex);
					for (const u of sorted) {
						const at = Math.min(u.originalIndex, rows.length);
						rows.splice(at, 0, { kind: 'placeholder', undo: u });
					}
					return rows;
				})()}
				<div class="space-y-3">
					{#each renderRows as row (row.kind === 'item' ? row.it.product_id : `__pending__${row.undo.snapshot.product_id}`)}
						{#if row.kind === 'placeholder'}
							{@const p = row.undo}
							<div
								class="flex items-center justify-between rounded-lg border border-dashed bg-muted/30 px-6 py-4 text-sm"
							>
								<span class="text-muted-foreground">
									Removed <span class="font-medium text-foreground">{p.snapshot.name}</span>
								</span>
								<button
									type="button"
									class="inline-flex items-center gap-1.5 text-sm font-medium text-foreground transition-colors hover:text-foreground/70"
									onclick={() => undoDelete(p.snapshot.product_id)}
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
										<path d="M9 14l-4-4 4-4" />
										<path d="M5 10h9a5 5 0 010 10h-2" />
									</svg>
									Undo
								</button>
							</div>
						{:else}
							{@const it = row.it}
							{@const idx = row.idx}
							{@const rowUnits = itemUnits(it)}
							{@const rowTotal = itemTotal(it)}
							<div class="group/item relative overflow-hidden rounded-lg border">
								<div
									class="pointer-events-none absolute inset-y-0 right-0 flex w-22 items-center justify-center"
								>
									<button
										type="button"
										aria-label="Delete {it.name}"
										class="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:ring-2 focus-visible:ring-destructive/40 focus-visible:outline-none"
										onclick={() => requestDelete(idx)}
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="currentColor"
											class="h-5 w-5"
										>
											<path
												d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
											/>
										</svg>
									</button>
								</div>
								<div
									class="relative bg-background"
									use:swipeToDelete={{
										onCommit: () => {
											const i = cart.items.findIndex((x) => x.product_id === it.product_id);
											if (i >= 0) requestDelete(i);
										}
									}}
								>
									<!-- Mobile: compact card, tap sizes to edit ──────────────────── -->
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

									<!-- Desktop: full inline editor ─────────────────────────────── -->
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
											{@const hasAnyValue = it.available_sizes.some(
												(s) => (it.size_qtys[s] ?? 0) > 0
											)}
											{@const isUndo = !!applySnapshots[it.product_id]}
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
																	recordTouch(it.product_id, size);
																}}
															>
																−
															</button>
															<div
																class="flex flex-col items-center justify-center px-1 text-center"
															>
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
																		recordTouch(it.product_id, size);
																	}}
																	onkeydown={(e) => {
																		if (e.key === 'ArrowUp') {
																			e.preventDefault();
																			cart.items[idx].size_qtys[size] = qty + 1;
																			recordTouch(it.product_id, size);
																		} else if (e.key === 'ArrowDown') {
																			e.preventDefault();
																			cart.items[idx].size_qtys[size] = Math.max(0, qty - 1);
																			recordTouch(it.product_id, size);
																		} else if (e.key === 'Enter') {
																			e.preventDefault();
																			(e.currentTarget as HTMLInputElement).blur();
																		}
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
																	recordTouch(it.product_id, size);
																}}
															>
																+
															</button>
														</div>
													{/each}
												</div>
												{#if hasAnyValue || isUndo}
													<button
														type="button"
														class="inline-flex h-14 shrink-0 items-center gap-1.5 px-3 text-sm text-foreground transition-colors hover:text-foreground/70"
														onclick={() => (isUndo ? undoApplyAll(idx) : applyAll(idx))}
													>
														{#if isUndo}
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
																<path d="M9 14l-4-4 4-4" />
																<path d="M5 10h9a5 5 0 010 10h-2" />
															</svg>
															Undo
														{:else}
															<svg
																xmlns="http://www.w3.org/2000/svg"
																viewBox="0 0 24 24"
																fill="currentColor"
																class="h-4 w-4"
															>
																<path
																	d="M22 4C21.4477 4 21 4.44772 21 5V10.6665L11.7774 4.51806C11.6952 4.4633 11.5987 4.43408 11.5 4.43408C11.2239 4.43408 11 4.65794 11 4.93408V10.6665L1.77735 4.51806C1.69522 4.4633 1.59871 4.43408 1.5 4.43408C1.22386 4.43408 1 4.65794 1 4.93408V19.0656C1 19.1643 1.02922 19.2608 1.08397 19.3429C1.23715 19.5727 1.54759 19.6348 1.77735 19.4816L11 13.3332V19.0656C11 19.1643 11.0292 19.2608 11.084 19.3429C11.2372 19.5727 11.5476 19.6348 11.7774 19.4816L21 13.3332V19C21 19.5523 21.4477 20 22 20C22.5523 20 23 19.5523 23 19V5C23 4.44772 22.5523 4 22 4Z"
																/>
															</svg>
															Apply All
														{/if}
													</button>
												{/if}
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

										<button
											type="button"
											aria-label="Remove {it.name}"
											class="absolute right-3 bottom-3 hidden h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive opacity-0 transition-all group-hover/item:opacity-100 hover:bg-destructive/20 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-destructive/40 focus-visible:outline-none sm:inline-flex"
											onclick={() => requestDelete(idx)}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="currentColor"
												class="h-4 w-4"
											>
												<path
													d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
												/>
											</svg>
										</button>
									</div>
								</div>
							</div>
						{/if}
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
		<div class="mx-auto max-w-[756px]">
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
		{@const termsBlockedBrands = distinctBrandsInCart.filter((b) => termsForBrand(b.id) !== null)}
		<div class="space-y-6">
			<!-- ─────── Hero ─────── -->
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

			{#if isFreeform && !hasFreeformDetails}
				<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
					No account details — orders will be saved as drafts.
				</div>
			{/if}

			<!-- ─────── Applies to all orders ─────── -->
			<section class="space-y-3">
				<div class="flex items-baseline justify-between">
					<div class="text-xs tracking-wider text-muted-foreground uppercase">
						Applies to all orders
					</div>
					{#if !singleOrder}
						<div class="text-sm text-muted-foreground">Override per order below if needed</div>
					{/if}
				</div>

				{#if singleOrder}
					<!-- Single-order: Account card + Rep/Source card side-by-side -->
					<div class="grid gap-4 md:grid-cols-2">
						<!-- Account + Contact -->
						<div class="rounded-lg border bg-muted/30 p-5">
							<div class="text-xs tracking-wider text-muted-foreground uppercase">Account</div>
							<div class="mt-2 text-base font-semibold">
								{account ? account.business_name : (cart.freeform_name ?? '—')}
							</div>
							<div class="mt-4 border-t pt-4">
								<div class="flex items-center justify-between">
									<div class="text-xs tracking-wider text-muted-foreground uppercase">
										Contact for this order
									</div>
									<button
										type="button"
										class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
									>
										Change
									</button>
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
											onValueChange={(v) => (cart.rep_user_id = v || null)}
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
											onValueChange={onSourceChange}
										/>
									{:else}
										<div class="text-sm text-muted-foreground">No sources configured</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else}
					<!-- Multi-order: single 4-col card -->
					<div class="grid gap-5 rounded-lg border bg-muted/30 p-5 md:grid-cols-4">
						<div>
							<div class="text-sm text-muted-foreground">Account</div>
							<div class="mt-1.5 text-sm font-medium">
								{account ? account.business_name : (cart.freeform_name ?? '—')}
							</div>
						</div>
						<div class="min-w-0">
							<div class="text-sm text-muted-foreground">Contact</div>
							<div class="mt-1.5 text-sm">{contactName}</div>
							{#if accountEmail}
								<div class="truncate text-sm text-muted-foreground/70">{accountEmail}</div>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="rep-select-multi">
								<span class="text-sm text-muted-foreground">Sales Rep</span>
							</Label>
							{#if repItems.length > 0}
								<SelectField
									value={cart.rep_user_id ?? ''}
									items={repItems}
									placeholder="Select a sales rep"
									class="w-full"
									onValueChange={(v) => (cart.rep_user_id = v || null)}
								/>
							{:else}
								<div class="text-sm text-muted-foreground">—</div>
							{/if}
						</div>
						<div class="space-y-1.5">
							<Label for="source-select-multi">
								<span class="text-sm text-muted-foreground">Source</span>
							</Label>
							{#if sourceTypeItems.length > 0}
								<SelectField
									value={selectedSourceValue}
									items={sourceTypeItems}
									placeholder="Select a source"
									class="w-full"
									onValueChange={onSourceChange}
								/>
							{:else}
								<div class="text-sm text-muted-foreground">—</div>
							{/if}
						</div>
					</div>
				{/if}
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

				<!-- ─────── Ship To / Bill To (single-order top-level) ─────── -->
				{#if locsForAccount.length > 0}
					<section class="grid gap-4 md:grid-cols-2">
						<!-- Ship To -->
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
										onValueChange={(v) =>
											setMeta(g.brand_id, g.season_id, { location_id: v || null })}
									/>
								</div>
							{:else if selectedShipLoc}
								<div class="mt-3">
									<div class="text-sm font-medium">
										{selectedShipLoc.label}
										{#if isShipDefault}
											<span class="ml-1 text-sm font-normal text-muted-foreground/70">
												(account default)
											</span>
										{/if}
									</div>
									<div class="mt-1 text-sm leading-relaxed text-muted-foreground">
										{selectedShipLoc.address_line1 ?? '—'}
										{#if selectedShipLoc.address_line2}<br />{selectedShipLoc.address_line2}{/if}
										{#if selectedShipLoc.city || selectedShipLoc.state || selectedShipLoc.zip}
											<br />
											{[
												selectedShipLoc.city,
												[selectedShipLoc.state, selectedShipLoc.zip].filter(Boolean).join(' ')
											]
												.filter(Boolean)
												.join(', ')}
										{/if}
									</div>
								</div>
							{:else}
								<div class="mt-3 text-sm text-muted-foreground">No ship-to address on file.</div>
							{/if}
						</div>

						<!-- Bill To -->
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
										onValueChange={(v) =>
											setMeta(g.brand_id, g.season_id, { bill_to_location_id: v || null })}
									/>
								</div>
							{:else if selectedBillLoc}
								<div class="mt-3">
									<div class="text-sm font-medium">
										{selectedBillLoc.label}
										{#if isBillSameAsShip}
											<span class="ml-1 text-sm font-normal text-muted-foreground/70">
												(same as ship-to)
											</span>
										{:else if selectedBillLoc.is_default}
											<span class="ml-1 text-sm font-normal text-muted-foreground/70">
												(account default)
											</span>
										{/if}
									</div>
									<div class="mt-1 text-sm leading-relaxed text-muted-foreground">
										{selectedBillLoc.address_line1 ?? '—'}
										{#if selectedBillLoc.address_line2}<br />{selectedBillLoc.address_line2}{/if}
										{#if selectedBillLoc.city || selectedBillLoc.state || selectedBillLoc.zip}
											<br />
											{[
												selectedBillLoc.city,
												[selectedBillLoc.state, selectedBillLoc.zip].filter(Boolean).join(' ')
											]
												.filter(Boolean)
												.join(', ')}
										{/if}
									</div>
								</div>
							{:else}
								<div class="mt-3 text-sm text-muted-foreground">No bill-to address on file.</div>
							{/if}
						</div>
					</section>
				{/if}

				<!-- ─────── Payment & Logistics (single-order) ─────── -->
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
							<Label for="po-single">
								PO / Customer ref
								<span class="text-muted-foreground/70">(optional)</span>
							</Label>
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

				<!-- ─────── Internal notes (single-order) ─────── -->
				<section class="rounded-lg border bg-muted/30 p-5">
					<div class="flex items-center justify-between">
						<div class="text-xs tracking-wider text-muted-foreground uppercase">Internal notes</div>
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
			{:else}
				<!-- ─────── Per-order (multi) ─────── -->
				<section class="space-y-3">
					<div class="flex items-baseline justify-between">
						<div class="text-xs tracking-wider text-muted-foreground uppercase">Per order</div>
						<button
							type="button"
							class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
							onclick={() => (finalizeExpandAll = !finalizeExpandAll)}
						>
							{finalizeExpandAll ? 'Collapse all' : 'Expand all'}
						</button>
					</div>

					{#each groups as g, i (groupKey(g.brand_id, g.season_id))}
						{@const key = groupKey(g.brand_id, g.season_id)}
						{@const meta = getMeta(g.brand_id, g.season_id)}
						{@const hasOverrides = Boolean(
							meta.bill_to_location_id ||
							meta.payment_preference ||
							meta.payment_terms ||
							meta.shipping_method ||
							meta.po_number ||
							meta.internal_note
						)}
						{@const isOpen =
							finalizeExpandAll || finalizeExpandedKey === key || hasOverrides || i === 0}
						{@const prevBrandId = i > 0 ? groups[i - 1].brand_id : null}
						{@const isDifferentBrand = prevBrandId !== null && prevBrandId !== g.brand_id}
						{@const locsForAccount = accountLocations.filter(
							(l) => account && l.account_id === account.id
						)}

						<article class="rounded-lg border bg-muted/30">
							<button
								type="button"
								class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
								onclick={() => (finalizeExpandedKey = isOpen ? null : key)}
							>
								<div class="flex min-w-0 items-center gap-4">
									<span class="w-4 font-mono text-sm text-muted-foreground/70">{i + 1}</span>
									<div class="min-w-0">
										<div class="text-sm font-medium">
											{brandName(g.brand_id)} · {seasonLabel(g.season_id, g.product_year)}
										</div>
										<div class="font-mono text-sm text-muted-foreground/70">
											{g.units} units · {describeDelivery(meta)}
										</div>
									</div>
									{#if !isOpen}
										{#if isDifferentBrand}
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
								</div>
								<div class="flex items-center gap-4">
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
								<div class="space-y-4 border-t px-5 pt-4 pb-5">
									<!-- Ship / Bill pickers as cards (inside detail) -->
									{#if locsForAccount.length > 0}
										<div class="grid gap-4 md:grid-cols-2">
											<div class="space-y-2 rounded-md border bg-muted/30 p-4">
												<Label>
													<span class="text-xs tracking-wider text-muted-foreground uppercase">
														Ship to
													</span>
												</Label>
												<SelectField
													value={meta.location_id ?? ''}
													items={locsForAccount.map((l) => ({
														value: l.id,
														label: `${l.label}${l.is_default ? ' · default' : ''}`
													}))}
													placeholder="Account default"
													class="w-full"
													onValueChange={(v) =>
														setMeta(g.brand_id, g.season_id, { location_id: v || null })}
												/>
											</div>
											<div class="space-y-2 rounded-md border bg-muted/30 p-4">
												<Label>
													<span class="text-xs tracking-wider text-muted-foreground uppercase">
														Bill to
													</span>
												</Label>
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
														setMeta(g.brand_id, g.season_id, {
															bill_to_location_id: v || null
														})}
												/>
											</div>
										</div>
									{/if}

									<!-- Payment / shipping / PO -->
									<div class="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
										<div class="space-y-2">
											<Label>Payment</Label>
											<SelectField
												value={meta.payment_preference ?? cart.payment_preference ?? ''}
												items={methodOnlyItems}
												placeholder="Inherit"
												class="w-full"
												onValueChange={(v) =>
													setMeta(g.brand_id, g.season_id, {
														payment_preference: v || null
													})}
											/>
										</div>
										<div class="space-y-2">
											<Label>Terms</Label>
											<SelectField
												value={meta.payment_terms ?? ''}
												items={termsOnlyItems}
												placeholder="Inherit"
												class="w-full"
												onValueChange={(v) =>
													setMeta(g.brand_id, g.season_id, { payment_terms: v || null })}
											/>
										</div>
										<div class="space-y-2">
											<Label>Ship method</Label>
											<SelectField
												value={meta.shipping_method ?? ''}
												items={shippingMethodItems}
												placeholder="Inherit"
												class="w-full"
												onValueChange={(v) =>
													setMeta(g.brand_id, g.season_id, {
														shipping_method: v || null
													})}
											/>
										</div>
										<div class="space-y-2">
											<Label for={`po-${key}`}>
												PO
												<span class="text-muted-foreground/70">(optional)</span>
											</Label>
											<Input
												id={`po-${key}`}
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

									<!-- Internal note -->
									<div class="space-y-2">
										<Label for={`note-${key}`}>
											Internal note
											<span class="text-muted-foreground/70">(optional, your org only)</span>
										</Label>
										<textarea
											id={`note-${key}`}
											rows={2}
											maxlength={2000}
											class="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
											placeholder="Anything for fulfillment…"
											value={meta.internal_note ?? ''}
											oninput={(e) =>
												setMeta(g.brand_id, g.season_id, {
													internal_note: (e.currentTarget as HTMLTextAreaElement).value || null
												})}
										></textarea>
									</div>
								</div>
							{/if}
						</article>
					{/each}
				</section>
			{/if}

			<!-- ─────── Buyer terms ─────── -->
			{#if distinctBrandsInCart.length > 0}
				<section class="space-y-2">
					<div class="text-xs tracking-wider text-muted-foreground uppercase">Buyer terms</div>

					<div class="divide-y rounded-lg border bg-muted/30">
						{#each distinctBrandsInCart as b (b.id)}
							{@const terms = termsForBrand(b.id)}
							{@const coveredOrders = groups
								.map((g, i) => (g.brand_id === b.id ? i + 1 : null))
								.filter((n): n is number => n !== null)}
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
													{#if singleOrder}
														{terms.title} · v{terms.version}
													{:else if coveredOrders.length === 1}
														Covers order {coveredOrders[0]}.
													{:else if coveredOrders.length > 1}
														Covers orders {coveredOrders.join(', ')}.
													{/if}
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
									</div>
								{:else}
									<div class="flex items-start justify-between gap-4">
										<div class="text-sm">
											<span class="font-medium">{b.name}</span>
											<span class="text-muted-foreground"> — no terms on file.</span>
											<span class="mt-0.5 block text-sm text-muted-foreground/70">
												{#if isBrandOrg}
													Add them in Organization settings → Terms.
												{:else}
													Submission won't require a signature.
												{/if}
											</span>
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

			<!-- ─────── Actions ─────── -->
			<form
				bind:this={submitFormEl}
				method="POST"
				action="?/submit"
				use:enhance={() => {
					submitting = true;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'failure') {
							toast.error((result.data as { message?: string })?.message ?? 'Could not save order');
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Something went wrong. Please try again.');
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
							cart.type = 'note';
							submitStatus = 'submitted';
						}}
					>
						{groups.length > 1 ? `Save ${groups.length} Notes` : 'Save as Notes'}
					</Button>
					<div class="contents min-[756px]:flex min-[756px]:flex-col min-[756px]:gap-2">
						<div bind:this={submitComboEl} class="order-1 flex w-full min-[756px]:order-none">
							<Button
								type="submit"
								size="lg"
								class="flex-1 rounded-none"
								disabled={submitting ||
									(isFreeform && !hasFreeformDetails) ||
									(termsBlockedBrands.length > 0 && !allBrandTermsAgreed)}
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
									type="button"
									aria-label="More submit options"
									disabled={submitting ||
										(isFreeform && !hasFreeformDetails) ||
										(termsBlockedBrands.length > 0 && !allBrandTermsAgreed)}
									class="inline-flex h-11 w-11 shrink-0 items-center justify-center border-l border-l-primary-foreground/20 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
											class="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 text-sm outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="1.6"
												class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
												aria-hidden="true"
											>
												<circle cx="12" cy="12" r="9" />
												<path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" />
											</svg>
											<span class="flex flex-col">
												<span class="font-medium">Submit as Pending</span>
												<span class="text-sm text-muted-foreground"
													>Send to the brand for review.</span
												>
											</span>
										</DropdownMenu.Item>
										<DropdownMenu.Item
											onSelect={() => submitOrderAs('draft')}
											class="flex cursor-pointer items-start gap-3 rounded-sm px-3 py-2.5 text-sm outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="1.6"
												class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
												aria-hidden="true"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"
												/>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M18.5 3.5a2.121 2.121 0 0 1 3 3L12 16l-4 1 1-4 9.5-9.5Z"
												/>
											</svg>
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
								{termsBlockedBrands.length === 1
									? 'Check the terms box to submit'
									: `Agree to each brand's terms to submit`}
							</span>
						{/if}
					</div>
				</div>
			</form>
		</div>
	{/if}

	<!-- Bottom nav: Next only (Back moved to top). -->
	{#if stepName !== 'Finalize' && stepName !== 'Account' && stepName !== 'Brand'}
		<div class="mt-8 flex flex-col items-stretch gap-4 lg:flex-row lg:items-center lg:justify-end">
			{#if stepName === 'Details'}
				<button
					type="button"
					class="text-center text-sm underline hover:no-underline lg:text-left"
					onclick={nextStep}
				>
					Skip
				</button>
			{/if}
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

<!-- ── Full-screen Add Items modal ─────────────────────────────────────── -->
<CatalogPickerModal
	bind:open={modalOpen}
	bind:items={cart.items}
	brandIds={allowedBrandIds}
	{brands}
	{seasons}
	showBrandFilter={cart.brandFilter === 'all' || (cart.brandFilter as string[]).length > 1}
	onclose={closeAddItemsModal}
	ondone={() => {}}
/>

<!-- ── Mobile per-item size editor ─────────────────────────────────────── -->
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
