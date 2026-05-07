<script lang="ts">
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { Order, OrderLine, OrderStatus, BrandAsset } from '$lib/types/database.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { ShipWindowPicker } from '$lib/components/ui/ship-window-picker/index.js';
	import { entityContext } from '$lib/stores/entityContext.js';
	import { fetchOrderAttentionCount } from '$lib/stores/orderAttention.js';
	import CatalogPickerModal from '$lib/components/shared/CatalogPickerModal.svelte';
	import SizeStepperSheet from '$lib/components/shared/SizeStepperSheet.svelte';
	import ColorPickerSheet from '$lib/components/shared/ColorPickerSheet.svelte';
	import type { CatalogCartItem } from '$lib/components/shared/catalog-picker-types.js';
	import ColorSwatch from '$lib/components/shared/ColorSwatch.svelte';
	import ColorSwatchPicker from '$lib/components/shared/ColorSwatchPicker.svelte';
	import { diffLineEdits, type DraftRowInput } from '$lib/utils/order-line-diff.js';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Dialog, DropdownMenu } from 'bits-ui';
	import {
		acceptedPaymentMethods,
		acceptedMethodsOnly,
		acceptedTermsOnly,
		paymentMethodLabel
	} from '$lib/payment-methods';
	import { SHIPPING_METHODS } from '$lib/schemas/order-finalize';
	import { CARRIERS, SERVICE_LEVELS, trackingUrl } from '$lib/utils/carriers.js';

	// Refresh the Orders nav badge as soon as this page mounts — the loader
	// just marked the order viewed; status changes below also call this.
	onMount(() => {
		fetchOrderAttentionCount();
	});

	let { data } = $props();
	type OrderDetail = Order & {
		show_dates?: {
			city?: string | null;
			state?: string | null;
			month?: number | null;
			year?: number | null;
			shows?: { name?: string } | null;
		} | null;
		source_types?: { name?: string } | null;
		season_deliveries?: { delivery_month?: number | null } | null;
		profiles?: { display_name?: string | null } | null;
	};
	const order = $derived(data.order as OrderDetail);
	const orderLocation = $derived(
		(
			order as unknown as {
				account_locations: {
					label: string;
					address_line1: string | null;
					address_line2: string | null;
					city: string | null;
					state: string | null;
					zip: string | null;
				} | null;
			}
		).account_locations ?? null
	);
	const accountAddress = $derived(
		(order.accounts as {
			business_name?: string;
			contact_first_name?: string | null;
			contact_last_name?: string | null;
			contact_email?: string | null;
			contact_phone?: string | null;
			phone?: string | null;
			address_line1?: string | null;
			address_line2?: string | null;
			city?: string | null;
			state?: string | null;
			zip?: string | null;
		} | null) ?? null
	);

	$effect(() => {
		const o = order;
		const brandName = o.brands?.name ?? 'Unknown brand';
		const accountName = o.accounts?.business_name ?? 'Unknown account';
		entityContext.set({
			type: 'order',
			id: o.id,
			summary: `Order #${o.order_number} | Brand: ${brandName} | Account: ${accountName} | Status: ${o.status} | Total: $${Number(o.total_amount).toLocaleString()} | ${data.lines?.length ?? 0} line items`
		});
		return () => entityContext.set({ type: null, id: null, summary: null });
	});
	const allLines = $derived(data.lines as OrderLine[]);
	const activeLines = $derived(allLines.filter((l) => !l.removed_at));

	type ProductMeta = {
		primary_image_id: string | null;
		colors: string[];
		sizes: string[];
		season_name: string | null;
		season_year: number | null;
	};
	const productsById = $derived((data.productsById ?? {}) as Record<string, ProductMeta>);

	type LineRow = {
		key: string;
		product_id: string;
		style_number: string;
		name: string;
		season_label: string | null;
		image_id: string | null;
		unit_price: number;
		color: string | null;
		available_colors: string[];
		available_sizes: string[];
		lines: Array<{ id: string; size: string | null; qty: number; original_qty: number | null }>;
	};

	const lineRows = $derived.by<LineRow[]>(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient map
		const byKey = new Map<string, LineRow>();
		for (const l of activeLines) {
			const pid = (l as { product_id?: string | null }).product_id;
			if (!pid) continue; // custom lines fall through; we render them separately below
			const meta = productsById[pid];
			const key = `${pid}|${l.color ?? ''}`;
			if (!byKey.has(key)) {
				const season =
					meta?.season_name && meta?.season_year
						? `${meta.season_name} ${meta.season_year}`
						: (meta?.season_name ?? null);
				byKey.set(key, {
					key,
					product_id: pid,
					style_number: l.style_number ?? '',
					name: l.description ?? l.style_number ?? '',
					season_label: season,
					image_id: meta?.primary_image_id ?? null,
					unit_price: Number(l.unit_price),
					color: l.color,
					available_colors: meta?.colors ?? [],
					available_sizes: meta?.sizes ?? [],
					lines: []
				});
			}
			const row = byKey.get(key)!;
			row.lines.push({
				id: l.id,
				size: l.size,
				qty: l.qty,
				original_qty: l.original_qty
			});
		}
		return [...byKey.values()];
	});

	// Lines without a product_id (custom entered) don't fit the new row model —
	// render them as flat single-line rows at the end until they're migrated.
	const customLines = $derived(
		activeLines.filter((l) => !(l as { product_id?: string | null }).product_id)
	);

	// Projected order total while in edit mode (includes in-memory qty edits).
	const projectedOrderTotal = $derived.by(() =>
		draftRows
			.filter((r) => !r.to_remove)
			.reduce(
				(sum, r) =>
					sum + Object.values(r.qty_by_size).reduce((s, q) => s + (q || 0) * r.unit_price, 0),
				0
			)
	);
	const projectedOrderUnits = $derived.by(() =>
		draftRows
			.filter((r) => !r.to_remove)
			.reduce((sum, r) => sum + Object.values(r.qty_by_size).reduce((s, q) => s + (q || 0), 0), 0)
	);
	const savedOrderUnits = $derived(activeLines.reduce((s, l) => s + l.qty, 0));
	const brandAssets = $derived((data.brandAssets ?? []) as BrandAsset[]);
	const isBrandOrg = $derived(data.orgType === 'brand');
	const canEdit = $derived(
		data.isBuyer
			? order.status === 'draft' && order.created_by === data.user?.id
			: data.membership?.role !== 'guest' &&
					order.status !== 'preparing' &&
					order.status !== 'shipped' &&
					order.status !== 'delivered' &&
					order.status !== 'cancelled'
	);
	const canModify = $derived(canEdit);
	const canAdvanceStatus = $derived(
		data.isBuyer
			? false
			: data.membership?.role !== 'guest' &&
					order.status !== 'delivered' &&
					order.status !== 'cancelled'
	);
	const repCommissionRate = $derived(data.repCommissionRate as number);
	const repName = $derived(
		(data.repName as string | null) ??
			(data.federation as { repDisplayName?: string | null } | undefined)?.repDisplayName ??
			null
	);

	const canEditPayment = $derived(canEdit && data.canEditOrder === true);
	const paymentItems = $derived(
		acceptedPaymentMethods(
			(data.acceptedPaymentMethods ?? []) as string[],
			order.payment_preference
		).map((m) => ({ value: m.code, label: m.label }))
	);
	let paymentPrefForm: HTMLFormElement | null = $state(null);
	let paymentPrefValue = $state('');
	$effect(() => {
		const next = order.payment_preference ?? '';
		// Guard against re-entry: writing the same value still bumps the reactive
		// chain through SelectField's bind:value → Bits UI Select → bind:value,
		// which can pile up into an effect_update_depth_exceeded under rapid
		// `invalidate()` cycles (realtime + form submits).
		if (paymentPrefValue !== next) paymentPrefValue = next;
	});

	const statusLabels: Record<string, string> = {
		draft: 'Draft',
		submitted: 'Submitted',
		confirmed: 'Confirmed',
		preparing: 'Preparing',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};

	const statusBadgeColors: Record<string, string> = {
		draft: 'bg-zinc-100 text-zinc-600',
		submitted: 'bg-amber-50 text-amber-700',
		confirmed: 'bg-blue-50 text-blue-700',
		preparing: 'bg-violet-50 text-violet-700',
		shipped: 'bg-indigo-50 text-indigo-700',
		delivered: 'bg-emerald-50 text-emerald-700',
		cancelled: 'bg-red-50 text-red-700'
	};

	const statusFlow: Record<string, OrderStatus[]> = {
		draft: ['submitted', 'cancelled'],
		submitted: ['confirmed', 'cancelled'],
		confirmed: ['preparing', 'cancelled'],
		preparing: ['shipped', 'cancelled'],
		shipped: ['delivered'],
		delivered: [],
		cancelled: []
	};

	const federation = $derived(
		data.federation as
			| {
					isFederatedView: boolean;
					sourceOrg: { id: string; name: string } | null;
					repDisplayName: string | null;
			  }
			| undefined
	);
	const isFederatedView = $derived(federation?.isFederatedView === true);

	// Brand-side federated view: BOA can advance status at every step AND can
	// cancel before the order ships. After ship, cancellation is reconciled
	// differently (via return/credit), so it's removed from the allowed set.
	const brandAllowedNext: Record<string, OrderStatus[]> = {
		submitted: ['confirmed', 'cancelled'],
		confirmed: ['preparing', 'cancelled'],
		preparing: ['shipped', 'cancelled'],
		shipped: ['delivered']
	};
	const nextStatuses = $derived(
		isFederatedView ? (brandAllowedNext[order.status] ?? []) : (statusFlow[order.status] ?? [])
	);

	function seasonLabel(): string {
		const name = order.seasons?.name;
		if (name && order.order_year) return `${name} ${order.order_year}`;
		if (name) return name;
		if (order.order_year) return String(order.order_year);
		return '—';
	}

	// ── Convert-to-Order modal ─────────────────────────────────────────────
	type ConvertLocation = {
		id: string;
		label: string | null;
		is_default: boolean | null;
		address_line1: string | null;
		address_line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
	};
	type ConvertBrandTerms = { id: string; title: string; body: string; version: number };
	const noteAccountLocations = $derived((data.accountLocations ?? []) as ConvertLocation[]);
	const currentBrandTerms = $derived((data.currentBrandTerms ?? null) as ConvertBrandTerms | null);

	// Generic-terms fallback used when a brand hasn't configured its own. Buyers
	// always agree to SOMETHING before a note converts or a submit lands, even
	// if the brand hasn't published terms yet.
	const GENERIC_TERMS = {
		id: 'generic',
		title: 'Standard wholesale terms',
		version: 1,
		body: `All sales subject to availability and credit approval.

Cancellations require written notice 45+ days before the start-ship date; cancellations inside that window incur a 10% fee.

No returns without written authorization from the brand.

Shipping is at buyer's expense unless otherwise agreed in writing. Shipping fees are added to the invoice before charge.`
	} as const;
	// "Effective" terms: prefer the brand-specific row when the brand has one,
	// otherwise the generic fallback. Non-null for every order.
	const effectiveTerms = $derived(currentBrandTerms ?? GENERIC_TERMS);
	const effectiveTermsIsGeneric = $derived(currentBrandTerms === null);
	const convertMethodItems = $derived(
		acceptedMethodsOnly((data.acceptedPaymentMethods ?? []) as string[]).map((m) => ({
			value: m.code,
			label: m.label
		}))
	);
	const convertTermsItems = $derived(
		acceptedTermsOnly((data.acceptedPaymentMethods ?? []) as string[]).map((t) => ({
			value: t.code,
			label: t.label
		}))
	);
	const convertShippingItems = SHIPPING_METHODS.map((s) => ({
		value: s,
		label: s.charAt(0).toUpperCase() + s.slice(1)
	}));
	const convertLocationItems = $derived(
		noteAccountLocations.map((l) => {
			const addr = [l.address_line1, l.city].filter(Boolean).join(', ');
			const base = l.label ?? 'Location';
			return {
				value: l.id,
				label: addr ? `${base} — ${addr}` : base
			};
		})
	);
	const convertBillToItems = $derived([
		{ value: '', label: 'Same as ship to' },
		...convertLocationItems
	]);

	let convertOpen = $state(false);
	let convertTermsViewOpen = $state(false);
	let convertSubmitting = $state(false);
	let convertTermsAgreed = $state(false);
	let convertForm = $state({
		start_ship_date: '',
		expected_ship_date: '',
		location_id: '',
		bill_to_location_id: '',
		payment_preference: '',
		payment_terms: '',
		shipping_method: '',
		po_number: ''
	});

	function openConvertModal() {
		// Seed defaults from the current note so the user starts close to done.
		const defaultLoc = noteAccountLocations.find((l) => l.is_default) ?? noteAccountLocations[0];
		convertForm = {
			start_ship_date: (order.start_ship_date as string | null) ?? '',
			expected_ship_date: (order.expected_ship_date as string | null) ?? '',
			location_id: (order.location_id as string | null) ?? defaultLoc?.id ?? '',
			bill_to_location_id: (order.bill_to_location_id as string | null) ?? '',
			payment_preference: (order.payment_preference as string | null) ?? '',
			payment_terms: (order.payment_terms as string | null) ?? '',
			shipping_method: (order.shipping_method as string | null) ?? '',
			po_number: (order.po_number as string | null) ?? ''
		};
		convertTermsAgreed = false;
		convertOpen = true;
	}

	const convertCanSubmit = $derived(
		convertForm.start_ship_date !== '' &&
			convertForm.expected_ship_date !== '' &&
			convertTermsAgreed
	);

	async function updateStatus(newStatus: OrderStatus) {
		const res = await fetch(`/api/orders/${order.id}/status`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: newStatus })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			toast.error((body as { error?: string }).error ?? 'Status update failed');
			return;
		}
		invalidateAll();
		fetchOrderAttentionCount();
	}

	const timeline = $derived([
		{ status: 'draft', label: 'Draft', date: order.created_at },
		{ status: 'submitted', label: 'Submitted', date: order.submitted_at },
		{ status: 'confirmed', label: 'Confirmed', date: order.confirmed_at },
		{
			status: 'preparing',
			label: 'Preparing',
			date: (order as unknown as Record<string, unknown>).preparing_at as string | null
		},
		{ status: 'shipped', label: 'Shipped', date: order.shipped_at },
		{ status: 'delivered', label: 'Delivered', date: order.delivered_at }
	]);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Shipped amount
	let shippedAmountInput = $state('');
	let savingShipped = $state(false);

	const isShippedOrDelivered = $derived(order.status === 'shipped' || order.status === 'delivered');
	const repCommissionOnTotal = $derived((Number(order.total_amount) * repCommissionRate) / 100);
	const repCommissionOnShipped = $derived(
		order.shipped_amount != null ? (Number(order.shipped_amount) * repCommissionRate) / 100 : null
	);

	// ── Ship-window derived values for the StatusCard band 2 ──────────────
	function daysBetween(start: string | null | undefined, end: string | null | undefined) {
		if (!start || !end) return null;
		const a = new Date(`${start}T00:00:00`).getTime();
		const b = new Date(`${end}T00:00:00`).getTime();
		return Math.round((b - a) / 86_400_000);
	}
	const shipWindowLength = $derived(daysBetween(order.start_ship_date, order.expected_ship_date));
	const shipsInDays = $derived.by(() => {
		if (!order.start_ship_date) return null;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local value
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const start = new Date(`${order.start_ship_date}T00:00:00`).getTime();
		return Math.round((start - today.getTime()) / 86_400_000);
	});
	const shortDate = (s: string | null | undefined) => {
		if (!s) return '—';
		const d = new Date(`${s}T00:00:00`);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	};
	const longDate = (s: string | null | undefined) => {
		if (!s) return '—';
		const d = new Date(s);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	};
	const prettify = (code: string | null | undefined) => {
		if (!code) return null;
		return code
			.split('_')
			.map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
			.join(' ');
	};

	// ── Status context copy shown under the stepper ───────────────────────
	const statusContext = $derived.by(() => {
		// If the viewer created the order, collapse to "You" — first-person
		// reads more naturally than seeing your own name on your own work.
		// Otherwise: `order.profiles.display_name` resolves the creator's name;
		// on federated views that join is RLS-gated, so fall back to the
		// admin-fetched `federation.repDisplayName`.
		const viewerIsCreator =
			(data.user?.id as string | undefined) !== undefined && data.user?.id === order.created_by;
		const actor = viewerIsCreator
			? 'You'
			: ((order.profiles?.display_name as string | undefined) ??
				federation?.repDisplayName ??
				null);
		// Brand-side viewers (own-brand OR federated-target BOA) read
		// "your confirmation" / "leaves your warehouse" — not the rep
		// perspective "brand confirmation" / "leaves the brand".
		const isBrandSide = isBrandOrg || federation?.isFederatedView === true;
		switch (order.status) {
			case 'draft':
				return "Draft — not yet sent to the brand. Submit when you're ready.";
			case 'submitted': {
				const head = `Submitted${actor ? ` by ${actor}` : ''}${order.submitted_at ? ` · ${longDate(order.submitted_at as string)}` : ''}.`;
				const tail = isBrandSide
					? 'Awaiting your confirmation — move to Confirmed when you accept.'
					: 'Awaiting brand confirmation — move to Confirmed when the brand accepts.';
				return `${head} ${tail}`;
			}
			case 'confirmed': {
				const head = `Confirmed${order.confirmed_at ? ` · ${longDate(order.confirmed_at as string)}` : ''}.`;
				const tail = isBrandSide
					? 'Start preparing this order for shipment.'
					: 'Move to Preparing when the brand starts fulfillment.';
				return `${head} ${tail}`;
			}
			case 'preparing': {
				const preparingAt = (order as unknown as Record<string, unknown>).preparing_at as
					| string
					| null;
				const head = `Preparing${preparingAt ? ` · ${longDate(preparingAt)}` : ''}.`;
				const tail = isBrandSide
					? 'Fill in shipment details. Mark as Shipped when the order leaves your warehouse.'
					: 'The brand is preparing this order for shipment.';
				return `${head} ${tail}`;
			}
			case 'shipped':
				return `Shipped${order.shipped_at ? ` · ${longDate(order.shipped_at as string)}` : ''}. Move to Delivered once the buyer receives it.`;
			case 'delivered':
				return `Delivered${order.delivered_at ? ` · ${longDate(order.delivered_at as string)}` : ''}.`;
			case 'cancelled':
				return `Cancelled${order.cancelled_at ? ` · ${longDate(order.cancelled_at as string)}` : ''}.`;
			default:
				return null;
		}
	});

	// ── Copy for the primary "advance to next" action button ─────────────
	const advanceActionLabel: Record<string, string> = {
		submitted: 'Submit',
		confirmed: 'Mark confirmed',
		preparing: 'Prepare shipment',
		shipped: 'Mark shipped',
		delivered: 'Mark delivered'
	};

	// ── Meta strip source data (extracted from the old OrderDetails card) ─
	const monthNames = [
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
	type ShowDateJoin = {
		year: number | null;
		month: number | null;
		city: string | null;
		state: string | null;
		shows: { name: string | null } | null;
	};
	// Supabase can return embedded joins as either an object or a single-element
	// array depending on the relationship's cardinality inference. Normalize so
	// `order.show_dates` and `order.source_types` render the same either way.
	function firstOrObject<T>(v: T | T[] | null | undefined): T | null {
		if (!v) return null;
		if (Array.isArray(v)) return v[0] ?? null;
		return v;
	}
	const showDateData = $derived(
		firstOrObject(order.show_dates as ShowDateJoin | ShowDateJoin[] | null | undefined)
	);
	const sourceTypeData = $derived(
		firstOrObject(
			order.source_types as { name?: string | null } | { name?: string | null }[] | null | undefined
		)
	);
	const sourceDisplay = $derived(showDateData?.shows?.name ?? sourceTypeData?.name ?? null);
	const sourceLocation = $derived.by(() => {
		if (!showDateData) return null;
		const parts = [showDateData.city, showDateData.state].filter(Boolean);
		return parts.length > 0 ? parts.join(', ') : null;
	});
	const createdByName = $derived(order.profiles?.display_name ?? null);

	// Bill-to location join (nullable — falls back to the account address for display).
	type BillToLocation = {
		label: string | null;
		address_line1: string | null;
		address_line2: string | null;
		city: string | null;
		state: string | null;
		zip: string | null;
	};
	const billToLocation = $derived(
		(order as typeof order & { bill_to_location?: BillToLocation | null }).bill_to_location ?? null
	);

	// Terms agreement summary (for the right-rail TermsRecord panel).
	type TermsJoin = {
		brand_terms?: { id: string; title: string; body: string; version: number } | null;
		terms_agreed_profile?: { display_name: string | null } | null;
	};
	const termsAgreedInfo = $derived.by(() => {
		if (!order.terms_id) return null;
		const o = order as typeof order & TermsJoin;
		return {
			brand_terms: o.brand_terms ?? null,
			agreed_by: o.terms_agreed_profile?.display_name ?? null,
			agreed_at: order.terms_agreed_at ?? null
		};
	});

	// Totals panel aggregates — subtotal matches total_amount today (no discounts yet).
	const totalUnits = $derived(activeLines.reduce((s, l) => s + (l.qty ?? 0), 0));
	const totalStyles = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient counting set
		const set = new Set<string>();
		for (const l of activeLines) {
			const pid = (l as { product_id?: string | null }).product_id;
			if (pid) set.add(pid);
		}
		return set.size;
	});

	// Ship window dates
	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used in template
	let savingShipDate = $state(false);

	// Line item editing — bulk edit mode
	// ── Line Items edit mode ────────────────────────────────────────────────
	// Edit mode snapshots each LineRow into a DraftRow. On Save Items we diff
	// draftRows vs the live rows and run the resulting ops. Cancel discards.
	type DraftRow = DraftRowInput & {
		key: string;
		season_label: string | null;
		image_id: string | null;
		available_colors: string[];
		added_here: boolean;
	};

	let editMode = $state(false);
	let draftRows = $state<DraftRow[]>([]);
	let sizingSheetDraftIdx = $state<number | null>(null);
	const sizingSheetDraft = $derived(
		sizingSheetDraftIdx !== null && sizingSheetDraftIdx >= 0
			? (draftRows[sizingSheetDraftIdx] ?? null)
			: null
	);
	let colorPickerDraftIdx = $state<number | null>(null);
	const colorPickerDraft = $derived(
		colorPickerDraftIdx !== null && colorPickerDraftIdx >= 0
			? (draftRows[colorPickerDraftIdx] ?? null)
			: null
	);
	const colorPickerUsedColors = $derived(
		colorPickerDraft
			? draftRows
					.filter(
						(r, i) =>
							i !== colorPickerDraftIdx &&
							r.product_id === colorPickerDraft.product_id &&
							!r.to_remove
					)
					.map((r) => r.color_edit)
					.filter((c): c is string => !!c)
			: []
	);
	let savingEdits = $state(false);

	// Count of DB ops that would be generated if the user saves right now.
	// Each size-cell change, color change, or removed style contributes one op.
	const pendingChanges = $derived(editMode ? diffLineEdits(draftRows).length : 0);

	function snapshotDrafts(): DraftRow[] {
		return lineRows.map((row) => {
			const qty_by_size: Record<string, number> = {};
			for (const s of row.available_sizes) qty_by_size[s] = 0;
			for (const l of row.lines) qty_by_size[l.size ?? ''] = l.qty;
			return {
				key: row.key,
				product_id: row.product_id,
				style_number: row.style_number,
				name: row.name,
				season_label: row.season_label,
				image_id: row.image_id,
				color: row.color,
				color_edit: row.color,
				unit_price: row.unit_price,
				available_sizes: row.available_sizes,
				available_colors: row.available_colors,
				qty_by_size,
				lines: row.lines.map((l) => ({
					id: l.id,
					product_id: row.product_id,
					color: row.color,
					size: l.size,
					qty: l.qty
				})),
				to_remove: false,
				added_here: false
			};
		});
	}

	function enterEditMode() {
		draftRows = snapshotDrafts();
		editMode = true;
	}

	function cancelEdit() {
		draftRows = [];
		editMode = false;
	}

	function removeDraftRow(idx: number) {
		const row = draftRows[idx];
		if (row.added_here) {
			draftRows.splice(idx, 1);
		} else {
			draftRows[idx].to_remove = true;
		}
	}

	function restoreDraftRow(idx: number) {
		draftRows[idx].to_remove = false;
	}

	async function saveEdits() {
		savingEdits = true;
		try {
			// Send the client's desired row state to the server endpoint; server
			// runs diffLineEdits against fresh DB rows and applies ops with
			// status + role gating. Single round-trip replaces the previous
			// per-op client loop.
			const rows = draftRows.map(({ lines: _lines, ...rest }) => {
				void _lines;
				return rest;
			});
			const res = await fetch(`/api/orders/${order.id}/lines`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ rows })
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				toast.error(body?.message ?? 'Could not save changes');
				return;
			}
			const result = (await res.json()) as {
				ok: boolean;
				applied: number;
				failed: number;
			};
			if (!result.ok) {
				toast.error(
					result.failed === 1
						? '1 change failed to save.'
						: `${result.failed} changes failed to save.`
				);
				return;
			}
			if (result.applied === 0) {
				editMode = false;
				draftRows = [];
				return;
			}
			toast.success('Order updated');
			editMode = false;
			draftRows = [];
		} finally {
			savingEdits = false;
			invalidateAll();
		}
	}

	// ── Add items via catalog picker ─────────────────────────────────────────
	// The picker seeds its cart with every product already in the order so
	// those cards show dimmed/disabled inside the modal. On Done we only care
	// which NEW products the user selected — their sizes and qtys are set
	// inline in the Line Items table (edit mode auto-opens).
	let catalogPickerOpen = $state(false);
	let catalogPickerItems = $state<CatalogCartItem[]>([]);

	function openCatalogPicker() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient map
		const byProduct = new Map<string, CatalogCartItem>();
		for (const l of activeLines) {
			const pid = (l as { product_id?: string | null }).product_id;
			if (!pid || byProduct.has(pid)) continue;
			byProduct.set(pid, {
				product_id: pid,
				brand_id: order.brand_id,
				season_id: order.season_id ?? null,
				original_season_id: order.season_id ?? null,
				product_year: null,
				style_number: l.style_number ?? '',
				name: l.description ?? l.style_number ?? '',
				unit_price: Number(l.unit_price),
				image_id: null,
				available_colors: [],
				available_sizes: [],
				selected_color: l.color ?? '',
				size_qtys: {}
			});
		}
		catalogPickerItems = [...byProduct.values()];
		catalogPickerOpen = true;
	}

	async function handleCatalogDone(items: CatalogCartItem[]) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient set
		const existingProductIds = new Set<string>();
		for (const l of activeLines) {
			const pid = (l as { product_id?: string | null }).product_id;
			if (pid) existingProductIds.add(pid);
		}

		const fresh = items.filter((it) => !existingProductIds.has(it.product_id));
		if (fresh.length === 0) {
			catalogPickerOpen = false;
			return;
		}

		// Start (or continue) edit mode so the user can type qtys inline.
		const baseDrafts = editMode ? draftRows : snapshotDrafts();
		for (const it of fresh) {
			const color = it.selected_color || null;
			const key = `${it.product_id}|${color ?? ''}|new-${Date.now()}-${Math.random()}`;
			const qty_by_size: Record<string, number> = {};
			for (const s of it.available_sizes) qty_by_size[s] = 0;
			baseDrafts.push({
				key,
				product_id: it.product_id,
				style_number: it.style_number,
				name: it.name,
				season_label: null,
				image_id: it.image_id,
				color,
				color_edit: color,
				unit_price: it.unit_price,
				available_sizes: it.available_sizes,
				available_colors: it.available_colors,
				qty_by_size,
				lines: [],
				to_remove: false,
				added_here: true
			});
		}
		draftRows = baseDrafts;
		editMode = true;
		catalogPickerOpen = false;
	}

	// Cancel order with reason
	let cancelOpen = $state(false);
	let cancelReason = $state('');
	let cancellingOrder = $state(false);

	async function confirmCancel() {
		if (!cancelReason.trim()) return;
		cancellingOrder = true;
		await supabase
			.from('orders')
			.update({
				status: 'cancelled',
				cancelled_at: new Date().toISOString(),
				cancelled_reason: cancelReason.trim(),
				updated_at: new Date().toISOString()
			})
			.eq('id', order.id);
		cancellingOrder = false;
		cancelOpen = false;
		invalidateAll();
	}

	async function saveShippedAmount() {
		const value = parseFloat(shippedAmountInput);
		if (isNaN(value) || value < 0) return;
		savingShipped = true;
		await supabase
			.from('orders')
			.update({ shipped_amount: value, updated_at: new Date().toISOString() })
			.eq('id', order.id);
		savingShipped = false;
		invalidateAll();
	}

	// ── Shipment details (preparing + shipped) ──────────────────────────
	const carrierItems = CARRIERS.map((c) => ({ value: c, label: c }));
	const isPreparingOrLater = $derived(
		order.status === 'preparing' || order.status === 'shipped' || order.status === 'delivered'
	);
	const isPreparing = $derived(order.status === 'preparing');

	let shipCarrier = $state('');
	let shipTracking = $state('');
	let shipCost = $state('');
	let savingShipmentField = $state(false);

	$effect(() => {
		shipCarrier = ((order as unknown as Record<string, unknown>).carrier as string) ?? '';
		shipTracking = ((order as unknown as Record<string, unknown>).tracking_number as string) ?? '';
		const cost = (order as unknown as Record<string, unknown>).shipping_cost;
		shipCost = cost != null ? String(cost) : '';
	});

	async function saveShipmentField(field: string, value: unknown) {
		savingShipmentField = true;
		const { error } = await supabase
			.from('orders')
			.update({ [field]: value, updated_at: new Date().toISOString() })
			.eq('id', order.id);
		savingShipmentField = false;
		if (error) {
			toast.error('Could not save shipment detail');
		}
		invalidateAll();
	}

	// ── Prepare shipment dialog ─────────────────────────────────────────
	let prepareConfirmOpen = $state(false);
	let preparingOrder = $state(false);
	let prepCarrier = $state('');
	let prepServiceLevel = $state('');
	let prepTracking = $state('');
	let prepCost = $state('');

	function openPrepareDialog() {
		prepCarrier = '';
		prepServiceLevel = '';
		prepTracking = '';
		prepCost = '';
		prepareConfirmOpen = true;
	}

	async function confirmPrepare() {
		preparingOrder = true;
		const res = await fetch(`/api/orders/${order.id}/status`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: 'preparing' })
		});
		if (!res.ok) {
			preparingOrder = false;
			prepareConfirmOpen = false;
			const body = await res.json().catch(() => ({}));
			toast.error((body as { error?: string }).error ?? 'Could not prepare shipment');
			return;
		}
		// Save any shipment fields the user entered
		const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
		if (prepCarrier) updates.carrier = prepCarrier;
		if (prepTracking) updates.tracking_number = prepTracking;
		if (prepCost !== '') {
			const v = parseFloat(prepCost);
			if (!isNaN(v)) updates.shipping_cost = v;
		}
		if (Object.keys(updates).length > 1) {
			await supabase.from('orders').update(updates).eq('id', order.id);
		}
		preparingOrder = false;
		prepareConfirmOpen = false;
		toast.success('Order is now being prepared for shipment');
		invalidateAll();
		fetchOrderAttentionCount();
	}

	// ── Ship confirmation dialog ────────────────────────────────────────
	let shipConfirmOpen = $state(false);
	let shipConfirmCarrier = $state('');
	let shipConfirmTracking = $state('');
	let shipConfirmCost = $state('');
	let shippingOrder = $state(false);

	function openShipConfirm() {
		shipConfirmCarrier = shipCarrier;
		shipConfirmTracking = shipTracking;
		shipConfirmCost = shipCost;
		shipConfirmOpen = true;
	}

	async function confirmShip() {
		shippingOrder = true;
		const res = await fetch(`/api/orders/${order.id}/status`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				status: 'shipped',
				tracking_number: shipConfirmTracking !== '' ? shipConfirmTracking : null,
				carrier: shipConfirmCarrier !== '' ? shipConfirmCarrier : null,
				shipping_cost: shipConfirmCost !== '' ? shipConfirmCost : null
			})
		});
		shippingOrder = false;
		shipConfirmOpen = false;
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			toast.error((body as { error?: string }).error ?? 'Could not mark as shipped');
			return;
		}
		toast.success('Order marked as shipped');
		invalidateAll();
		fetchOrderAttentionCount();
	}

	// PDF download
	let downloadingPdf = $state(false);

	async function handleDownloadPdf() {
		downloadingPdf = true;
		try {
			const res = await fetch(`/api/orders/${order.id}/pdf`);
			if (res.ok) {
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `order-${order.order_number}.pdf`;
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch {
			// silent
		} finally {
			downloadingPdf = false;
		}
	}

	// Humanized, aggregated activity entries shaped by the server helper at
	// src/lib/server/orders/activity.ts. Consecutive `line_added` events from
	// the same actor collapse into a single "N lines added" row.
	type ActivityEntry = {
		id: string;
		kind: 'status' | 'content';
		title: string;
		subtitle: string | null;
		actor_name: string | null;
		at: string;
		event_count: number;
	};
	const activity = $derived((data.activity ?? []) as ActivityEntry[]);

	// Comments
	type Comment = {
		id: string;
		author_id: string;
		body: string;
		created_at: string;
		profiles?: { display_name: string } | null;
		source_org?: { id: string; name: string } | null;
	};
	const comments = $derived((data.comments ?? []) as Comment[]);
	let commentBody = $state('');
	let postingComment = $state(false);

	let commentError = $state<string | null>(null);

	async function postComment() {
		if (!commentBody.trim()) return;
		postingComment = true;
		commentError = null;
		const { error: insertErr } = await supabase.from('order_comments').insert({
			order_id: order.id,
			author_id: data.user?.id,
			body: commentBody.trim(),
			source_org_id: data.organization?.id ?? null
		});
		postingComment = false;
		if (insertErr) {
			commentError = insertErr.message;
			return;
		}
		commentBody = '';
		await invalidateAll();
	}

	async function deleteComment(id: string) {
		commentError = null;
		const { error: delErr } = await supabase.from('order_comments').delete().eq('id', id);
		if (delErr) {
			commentError = delErr.message;
			return;
		}
		await invalidateAll();
	}

	// Realtime: re-run the page loader whenever a comment on this order changes
	// (insert/update/delete from rep or brand side). RLS on order_comments still
	// gates which subscribers receive each event.
	$effect(() => {
		const orderId = order?.id;
		if (!orderId) return;
		const channel = supabase
			.channel(`order-comments:${orderId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'order_comments',
					filter: `order_id=eq.${orderId}`
				},
				() => {
					invalidate('data:orders');
				}
			)
			.subscribe();
		return () => {
			supabase.removeChannel(channel);
		};
	});

	// Clone order
	let cloning = $state(false);

	async function handleCloneOrder() {
		cloning = true;
		try {
			const res = await fetch(`/api/orders/${order.id}/clone`, { method: 'POST' });
			if (res.ok) {
				const { id } = await res.json();
				goto(resolve(`/orders/${id}`));
			}
		} finally {
			cloning = false;
		}
	}

	// Send dialog
	let sendOpen = $state(false);
	let sendTo = $state('');
	let sendSubject = $state('');
	let sendBody = $state('');
	let sendLoading = $state(false);
	let sendError = $state('');
	let sendSuccess = $state(false);
	let selectedAssetIds = $state<string[]>([]);

	function openSendDialog() {
		sendTo = (order.accounts as { contact_email?: string } | null | undefined)?.contact_email ?? '';
		sendSubject = `Order ${order.order_number} from ${order.brands?.name ?? 'brand'}`;
		sendBody = `Hi,\n\nPlease find attached order ${order.order_number}.\n\nThank you.`;
		sendError = '';
		sendSuccess = false;
		selectedAssetIds = [];
		sendOpen = true;
	}

	function closeSendDialog() {
		if (!sendLoading) sendOpen = false;
	}

	function toggleAsset(id: string) {
		if (selectedAssetIds.includes(id)) {
			selectedAssetIds = selectedAssetIds.filter((a) => a !== id);
		} else {
			selectedAssetIds = [...selectedAssetIds, id];
		}
	}

	async function handleSendOrder() {
		if (!sendTo.trim() || !sendSubject.trim() || !sendBody.trim()) {
			sendError = 'Please fill in all fields.';
			return;
		}

		sendLoading = true;
		sendError = '';

		try {
			const res = await fetch(`/api/orders/${order.id}/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					to: sendTo.trim(),
					subject: sendSubject.trim(),
					body: sendBody.trim(),
					assetIds: selectedAssetIds
				})
			});

			if (res.ok) {
				sendSuccess = true;
			} else {
				const json = await res.json().catch(() => ({}));
				sendError = json.error ?? 'Failed to send.';
			}
		} catch {
			sendError = 'Failed to send.';
		} finally {
			sendLoading = false;
		}
	}

	function handleSendKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && sendOpen && !sendLoading) {
			closeSendDialog();
		}
	}
</script>

<div class="w-full space-y-6 py-6">
	<!-- ── Top bar ─────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="sm" href="/orders"
			><LongArrow direction="left" /> Back to orders</Button
		>
		<div class="flex gap-2">
			<Button size="sm" onclick={openSendDialog}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
					/>
				</svg>
				<span class="sr-only sm:not-sr-only">Send to Account</span>
			</Button>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="More actions"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
						/>
					</svg>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						align="end"
						sideOffset={4}
						class="z-50 min-w-[10rem] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					>
						<DropdownMenu.Item
							onSelect={handleCloneOrder}
							disabled={cloning}
							class="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z"
								/>
							</svg>
							Clone order
						</DropdownMenu.Item>
						<DropdownMenu.Item
							onSelect={handleDownloadPdf}
							disabled={downloadingPdf}
							class="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-muted"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
								/>
							</svg>
							Download PDF
						</DropdownMenu.Item>
						{#if order.status !== 'shipped' && order.status !== 'delivered' && order.status !== 'cancelled'}
							<DropdownMenu.Separator class="my-1 h-px bg-border" />
							<DropdownMenu.Item
								onSelect={() => (cancelOpen = true)}
								class="flex cursor-pointer items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="1.5"
								>
									<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
								</svg>
								Cancel order
							</DropdownMenu.Item>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
		</div>
	</div>

	<!-- ── Header: account · order# + pill · brand·season ───────────────── -->
	<header>
		{#if order.accounts?.business_name}
			<a
				href={resolve(`/accounts/${order.account_id}`)}
				class="text-sm text-muted-foreground hover:underline">{order.accounts.business_name}</a
			>
		{/if}
		<div class="mt-1 flex flex-wrap items-center gap-3">
			<h1 class="font-mono text-2xl font-medium tracking-tight md:text-3xl lg:text-4xl">
				{order.order_number}
			</h1>
			{#if order.order_type === 'note'}
				<span
					class="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600"
				>
					Note
				</span>
			{:else}
				<span
					class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeColors[
						order.status
					] ?? 'bg-zinc-100 text-zinc-500'}"
				>
					{statusLabels[order.status] ?? order.status}
				</span>
			{/if}
		</div>
		<div class="mt-1 text-sm text-muted-foreground">
			{!isBrandOrg && order.brands?.name ? `${order.brands.name} · ` : ''}{seasonLabel()}
		</div>
	</header>

	<!-- ── Note card (note-only) ─────────────────────────────────────────── -->
	{#if order.order_type === 'note'}
		<section class="rounded-lg border bg-muted/30 px-6 py-5">
			<div class="flex flex-wrap items-center justify-between gap-4">
				<div class="min-w-0">
					<div class="text-sm">This is a Note — nothing has been committed yet.</div>
					<div class="mt-1 text-sm text-muted-foreground/70">
						Created {longDate(
							order.created_at
						)}{#if (order.profiles?.display_name as string | undefined) ?? federation?.repDisplayName}
							· by {(order.profiles?.display_name as string | undefined) ??
								federation?.repDisplayName}{/if}
					</div>
				</div>
				{#if canEdit}
					<Button onclick={openConvertModal} loading={convertSubmitting}>Convert to Order</Button>
				{/if}
			</div>
		</section>
	{:else}
		<!-- ── Status + Ship window card (order-only) ─────────────────────── -->
		<section class="overflow-hidden rounded-lg border bg-muted/30">
			<!-- Band 1: stepper + contextual action + context copy -->
			<div class="px-6 py-5">
				<div class="flex flex-wrap items-center justify-between gap-4">
					<ol class="flex min-w-0 flex-1 items-center gap-3">
						{#each timeline as step, i (step.status)}
							{@const isComplete = step.date !== null}
							{@const isCurrent = step.status === order.status}
							<li class="flex items-center gap-2">
								<span
									aria-hidden="true"
									class="h-2 w-2 rounded-full {isCurrent
										? 'bg-foreground ring-4 ring-foreground/20'
										: isComplete
											? 'bg-foreground'
											: 'border border-muted-foreground/30'}"
								></span>
								<span
									class="text-sm {isCurrent
										? 'font-medium text-foreground'
										: isComplete
											? 'text-foreground'
											: 'text-muted-foreground'}"
								>
									{step.label}
								</span>
							</li>
							{#if i < timeline.length - 1}
								<li
									aria-hidden="true"
									class="h-px w-6 sm:w-10 {isComplete && timeline[i + 1].date !== null
										? 'bg-foreground'
										: 'bg-border'}"
								></li>
							{/if}
						{/each}
					</ol>
					{#if canAdvanceStatus && nextStatuses.length > 0 && order.status !== 'cancelled'}
						<div class="flex items-center gap-2 border-l pl-4">
							{#each nextStatuses.filter((s) => s !== 'cancelled') as nextStatus (nextStatus)}
								<Button
									size="sm"
									onclick={() => {
										if (nextStatus === 'preparing') {
											openPrepareDialog();
										} else if (nextStatus === 'shipped') {
											openShipConfirm();
										} else {
											updateStatus(nextStatus);
										}
									}}
								>
									{advanceActionLabel[nextStatus] ?? statusLabels[nextStatus] ?? nextStatus}
								</Button>
							{/each}
						</div>
					{/if}
				</div>
				{#if statusContext}
					<div class="mt-3 text-sm text-muted-foreground">{statusContext}</div>
				{/if}
			</div>

			<!-- Band 2: Ship window -->
			<div
				class="flex flex-wrap items-center justify-between gap-4 border-t bg-background/40 px-6 py-4"
			>
				<div class="flex flex-wrap gap-10">
					<div>
						<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">
							Ship window{#if shipWindowLength !== null}<span class="normal-case"
									>&nbsp;({shipWindowLength}-day window)</span
								>{/if}
						</div>
						<div class="mt-1.5 flex items-center gap-3">
							<span class="font-mono text-base font-medium sm:text-xl">
								{shortDate(order.start_ship_date)}
							</span>
							<svg
								aria-hidden="true"
								class="h-4 w-4 text-muted-foreground/70"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path d="M5 12h14M13 5l7 7-7 7" />
							</svg>
							<span class="font-mono text-base font-medium sm:text-xl">
								{shortDate(order.expected_ship_date)}
							</span>
						</div>
					</div>
					{#if shipsInDays !== null}
						<div>
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Ships in</div>
							<div class="mt-2.5 text-sm">
								{#if shipsInDays > 0}
									{shipsInDays} day{shipsInDays === 1 ? '' : 's'}
								{:else if shipsInDays === 0}
									Today
								{:else}
									{Math.abs(shipsInDays)} day{Math.abs(shipsInDays) === 1 ? '' : 's'} ago
								{/if}
							</div>
						</div>
					{/if}
					{#if order.shipping_method}
						<div>
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Method</div>
							<div class="mt-1.5 text-sm">{prettify(order.shipping_method)}</div>
						</div>
					{/if}
				</div>
				{#if canEdit}
					<ShipWindowPicker
						variant="button"
						deliveries={[]}
						orderYear={new Date().getFullYear()}
						startShipDate={order.start_ship_date ?? ''}
						completeShipDate={order.expected_ship_date ?? ''}
						onApply={async (range) => {
							savingShipDate = true;
							await supabase
								.from('orders')
								.update({
									start_ship_date: range.startShipDate || null,
									expected_ship_date: range.completeShipDate || null,
									updated_at: new Date().toISOString()
								})
								.eq('id', order.id);
							savingShipDate = false;
							invalidateAll();
						}}
					/>
				{/if}
			</div>
		</section>
	{/if}

	<!-- ── Cancel reason banner (when cancelled) ─────────────────────────── -->
	{#if order.status === 'cancelled' && order.cancelled_reason}
		<div class="rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4">
			<div class="text-sm font-medium text-destructive">Cancellation reason</div>
			<div class="mt-1 text-sm">{order.cancelled_reason}</div>
		</div>
	{/if}

	<!-- ── Main two-column grid ─────────────────────────────────────────── -->
	<div class="grid gap-6 lg:grid-cols-[1fr_340px]">
		<!-- ─── Left column ─── -->
		<div class="space-y-6">
			<!-- ── Shipment Details (preparing + shipped + delivered) ──────── -->
			{#if isPreparingOrLater && order.order_type !== 'note'}
				<section class="rounded-lg border bg-muted/30 px-6 py-5">
					<h2 class="text-sm font-medium">Shipment Details</h2>
					<div class="mt-4 grid gap-4 sm:grid-cols-3">
						<div>
							<Label>Carrier</Label>
							{#if isPreparing}
								<SelectField
									items={carrierItems}
									bind:value={shipCarrier}
									placeholder="Select carrier"
									onValueChange={(v) => saveShipmentField('carrier', v || null)}
								/>
							{:else}
								<p class="mt-1 text-sm">{shipCarrier || '—'}</p>
							{/if}
						</div>
						<div>
							<Label>Tracking number</Label>
							{#if isPreparing}
								<Input
									bind:value={shipTracking}
									placeholder="Enter tracking number"
									onblur={() => saveShipmentField('tracking_number', shipTracking || null)}
								/>
							{:else if shipTracking}
								{@const url = trackingUrl(shipCarrier, shipTracking)}
								{#if url}
									<a
										href={url}
										target="_blank"
										rel="noopener"
										class="mt-1 block text-sm text-blue-600 hover:underline"
									>
										{shipTracking}
									</a>
								{:else}
									<p class="mt-1 text-sm">{shipTracking}</p>
								{/if}
							{:else}
								<p class="mt-1 text-sm text-muted-foreground">—</p>
							{/if}
						</div>
						<div>
							<Label>Shipping cost</Label>
							{#if isPreparing}
								<Input
									type="number"
									bind:value={shipCost}
									placeholder="$0.00"
									class="text-right"
									onblur={() => {
										const v = parseFloat(shipCost);
										saveShipmentField('shipping_cost', isNaN(v) ? null : v);
									}}
								/>
							{:else}
								<p class="mt-1 text-sm">{shipCost ? fmt.format(Number(shipCost)) : '—'}</p>
							{/if}
						</div>
					</div>
				</section>
			{/if}

			<!-- ── Meta strip: Source · Contact · Rep ────────────────────── -->
			<section class="rounded-lg border bg-muted/30 p-5">
				<div class="grid gap-5 sm:grid-cols-3">
					<div>
						<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Source</div>
						{#if sourceDisplay}
							<div class="mt-1.5 text-sm">{sourceDisplay}</div>
							{#if showDateData && showDateData.month}
								<div class="font-mono text-sm text-muted-foreground/70">
									{monthNames[showDateData.month - 1]}{sourceLocation ? ` · ${sourceLocation}` : ''}
								</div>
							{/if}
						{:else}
							<div class="mt-1.5 text-sm text-muted-foreground/50">—</div>
						{/if}
					</div>
					<div class="min-w-0">
						<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Contact</div>
						<div class="mt-1.5 text-sm">
							{#if accountAddress?.contact_first_name || accountAddress?.contact_last_name}
								{[accountAddress.contact_first_name, accountAddress.contact_last_name]
									.filter(Boolean)
									.join(' ')}
							{:else}
								<span class="text-muted-foreground/50">—</span>
							{/if}
						</div>
						{#if accountAddress?.contact_email}
							<a
								href="mailto:{accountAddress.contact_email}"
								class="block truncate text-sm text-muted-foreground/70 hover:underline"
							>
								{accountAddress.contact_email}
							</a>
						{/if}
						{#if accountAddress?.contact_phone || accountAddress?.phone}
							<a
								href="tel:{accountAddress.contact_phone ?? accountAddress.phone}"
								class="text-sm text-muted-foreground/70 hover:underline"
							>
								{accountAddress.contact_phone ?? accountAddress.phone}
							</a>
						{/if}
					</div>
					<div>
						<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Sales Rep</div>
						<div class="mt-1.5 text-sm">
							{#if isFederatedView}
								{federation?.repDisplayName ?? federation?.sourceOrg?.name ?? 'Rep'}
							{:else}
								{repName ?? createdByName ?? '—'}
							{/if}
						</div>
						<div class="text-sm text-muted-foreground/70">
							Created {new Date(order.created_at).toLocaleDateString('en-US', {
								month: 'short',
								day: 'numeric',
								year: 'numeric'
							})}
						</div>
					</div>
				</div>
			</section>

			<!-- ── Ship to / Bill to / Payment (order-only) ────────────── -->
			{#if order.order_type !== 'note'}
				<section class="grid gap-4 md:grid-cols-3">
					<!-- Ship to -->
					<div class="rounded-lg border bg-muted/30 p-5">
						<div class="flex items-center justify-between">
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Ship to</div>
							{#if orderLocation?.label}
								<span class="text-xs text-muted-foreground/70">{orderLocation.label}</span>
							{/if}
						</div>
						{#if orderLocation}
							{#if order.accounts?.business_name}
								<div class="mt-2 text-sm">{order.accounts.business_name}</div>
							{/if}
							<div class="mt-0.5 text-sm leading-relaxed text-muted-foreground">
								{#if orderLocation.address_line1}{orderLocation.address_line1}{/if}
								{#if orderLocation.address_line2}<br />{orderLocation.address_line2}{/if}
								{#if orderLocation.city || orderLocation.state || orderLocation.zip}
									<br />{[orderLocation.city, orderLocation.state]
										.filter(Boolean)
										.join(', ')}{orderLocation.zip ? ` ${orderLocation.zip}` : ''}
								{/if}
							</div>
						{:else}
							<div class="mt-2 text-sm text-muted-foreground/50">—</div>
						{/if}
					</div>
					<!-- Bill to -->
					<div class="rounded-lg border bg-muted/30 p-5">
						<div class="flex items-center justify-between">
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Bill to</div>
							{#if billToLocation?.label}
								<span class="text-xs text-muted-foreground/70">{billToLocation.label}</span>
							{:else if !billToLocation && orderLocation}
								<span class="text-xs text-muted-foreground/70">Same as ship to</span>
							{/if}
						</div>
						{#if billToLocation}
							{#if order.accounts?.business_name}
								<div class="mt-2 text-sm">{order.accounts.business_name}</div>
							{/if}
							<div class="mt-0.5 text-sm leading-relaxed text-muted-foreground">
								{#if billToLocation.address_line1}{billToLocation.address_line1}{/if}
								{#if billToLocation.address_line2}<br />{billToLocation.address_line2}{/if}
								{#if billToLocation.city || billToLocation.state || billToLocation.zip}
									<br />{[billToLocation.city, billToLocation.state]
										.filter(Boolean)
										.join(', ')}{billToLocation.zip ? ` ${billToLocation.zip}` : ''}
								{/if}
							</div>
						{:else if accountAddress?.address_line1}
							{#if order.accounts?.business_name}
								<div class="mt-2 text-sm">{order.accounts.business_name}</div>
							{/if}
							<div class="mt-0.5 text-sm leading-relaxed text-muted-foreground">
								{accountAddress.address_line1}
								{#if accountAddress.address_line2}<br />{accountAddress.address_line2}{/if}
								{#if accountAddress.city || accountAddress.state || accountAddress.zip}
									<br />{[accountAddress.city, accountAddress.state]
										.filter(Boolean)
										.join(', ')}{accountAddress.zip ? ` ${accountAddress.zip}` : ''}
								{/if}
							</div>
						{:else}
							<div class="mt-2 text-sm text-muted-foreground/50">—</div>
						{/if}
					</div>
					<!-- Payment -->
					<div class="rounded-lg border bg-muted/30 p-5">
						<div class="flex items-center justify-between">
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Payment</div>
						</div>
						{#if canEditPayment && paymentItems.length > 0}
							<form
								bind:this={paymentPrefForm}
								method="POST"
								action="?/updatePaymentPreference"
								use:enhance={() => {
									return async ({ result, update }) => {
										if (result.type === 'success') {
											toast.success('Payment preference updated');
										} else if (result.type === 'failure') {
											const msg =
												(result.data as { message?: string } | undefined)?.message ??
												'Could not update payment preference.';
											toast.error(msg);
											paymentPrefValue = order.payment_preference ?? '';
										}
										await update();
									};
								}}
								class="mt-2"
							>
								<input type="hidden" name="code" value={paymentPrefValue} />
								<SelectField
									bind:value={paymentPrefValue}
									items={paymentItems}
									placeholder="Not set"
									class="w-full"
									onValueChange={(v) => {
										paymentPrefValue = v;
										queueMicrotask(() => paymentPrefForm?.requestSubmit());
									}}
								/>
							</form>
						{:else}
							<div class="mt-2 text-sm">{paymentMethodLabel(order.payment_preference)}</div>
						{/if}
						{#if order.payment_terms || order.shipping_method}
							<div class="mt-1 text-sm text-muted-foreground/70">
								{[
									prettify(order.payment_terms),
									order.shipping_method ? `${prettify(order.shipping_method)} shipping` : null
								]
									.filter(Boolean)
									.join(' · ')}
							</div>
						{/if}
					</div>
				</section>
			{/if}

			<!-- ── Commission + Shipped amount (conditional) ───────────── -->
			{#if repCommissionRate > 0 || isShippedOrDelivered}
				<section class="space-y-3 rounded-lg border bg-muted/30 p-5">
					{#if repCommissionRate > 0}
						<div class="flex items-center justify-between">
							<span class="text-sm">
								Commission ({repCommissionRate}%){repName ? ` — ${repName}` : ''}
							</span>
							<span class="font-mono text-sm font-medium">
								{fmt.format(repCommissionOnTotal)}
							</span>
						</div>
					{/if}
					{#if isShippedOrDelivered}
						<div class:border-t={repCommissionRate > 0} class:pt-3={repCommissionRate > 0}>
							<div class="flex items-center justify-between">
								<span class="text-sm">Shipped amount</span>
								{#if canEdit}
									<div class="flex items-center gap-2">
										<input
											type="number"
											step="0.01"
											min="0"
											class="h-8 w-32 rounded-md border border-input bg-background px-2 text-right text-sm"
											value={order.shipped_amount ?? ''}
											oninput={(e) => {
												shippedAmountInput = (e.target as HTMLInputElement).value;
											}}
										/>
										<Button size="sm" onclick={saveShippedAmount} loading={savingShipped}>
											Save
										</Button>
									</div>
								{/if}
							</div>
							{#if order.shipped_amount != null}
								<div class="mt-1 text-sm text-muted-foreground">
									Ordered {fmt.format(Number(order.total_amount))} → Shipped {fmt.format(
										Number(order.shipped_amount)
									)}
								</div>
								{#if repCommissionRate > 0}
									<div class="mt-0.5 text-sm font-medium">
										Commission on shipped: {fmt.format(repCommissionOnShipped ?? 0)}
									</div>
								{/if}
							{/if}
						</div>
					{/if}
				</section>
			{/if}

			<!-- Line items card (existing markup continues below, still inside the left column) -->

			<!-- Line items -->
			<Card>
				<CardHeader>
					<div class="flex items-center justify-between">
						<CardTitle class="text-base">Line Items</CardTitle>
						{#if canModify}
							<div class="flex items-center gap-2">
								{#if editMode}
									<span class="font-mono text-sm text-muted-foreground/70">
										{pendingChanges}
										{pendingChanges === 1 ? 'pending change' : 'pending changes'}
									</span>
									<Button variant="ghost" size="sm" onclick={cancelEdit} disabled={savingEdits}>
										Cancel
									</Button>
									<Button
										size="sm"
										onclick={saveEdits}
										loading={savingEdits}
										disabled={pendingChanges === 0}
									>
										Save Items
									</Button>
								{:else}
									{#if lineRows.length > 0 || customLines.length > 0}
										<Button variant="outline" size="sm" onclick={enterEditMode}>Edit Items</Button>
									{/if}
									<Button variant="outline" size="sm" onclick={openCatalogPicker}>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2.25"
											stroke-linecap="round"
											stroke-linejoin="round"
											class="h-3 w-3"
										>
											<path d="M12 5v14" />
											<path d="M5 12h14" />
										</svg>
										Add Item
									</Button>
								{/if}
							</div>
						{/if}
					</div>
				</CardHeader>
				<CardContent>
					{#if lineRows.length === 0 && customLines.length === 0 && !editMode}
						<p class="text-sm text-muted-foreground">No line items.</p>
					{:else if editMode}
						<!-- ── Edit mode: card stack with editable size cells ── -->
						<div class="overflow-hidden rounded-lg border">
							<div class="divide-y">
								{#each draftRows as draft, idx (draft.key)}
									{@const usedColors = draftRows
										.filter(
											(r, i) => i !== idx && r.product_id === draft.product_id && !r.to_remove
										)
										.map((r) => r.color_edit)
										.filter((c): c is string => !!c)}
									{@const rowUnits = Object.values(draft.qty_by_size).reduce(
										(s, q) => s + (q || 0),
										0
									)}
									{@const rowTotal = rowUnits * draft.unit_price}
									{@const fallbackSizes = Array.from(
										new Set(draft.lines.map((l) => l.size ?? '').filter((s) => s.length > 0))
									)}
									{@const sizesToShow =
										draft.available_sizes.length > 0 ? draft.available_sizes : fallbackSizes}
									<div class={draft.to_remove ? 'bg-destructive/5' : ''}>
										<!-- Mobile: compact card, tap sizes to edit ──────────────────── -->
										<div class="block sm:hidden">
											<div class="flex items-start gap-3 px-4 py-3">
												<div
													class="flex min-w-0 flex-1 items-start gap-3 {draft.to_remove
														? 'opacity-60'
														: ''}"
												>
													<div
														class="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted"
													>
														{#if draft.image_id}
															<img
																src={`/api/products/${draft.product_id}/images/${draft.image_id}`}
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
														<div
															class="font-mono text-sm text-muted-foreground/70 {draft.to_remove
																? 'line-through'
																: ''}"
														>
															{draft.style_number}
														</div>
														<div
															class="truncate text-sm font-semibold {draft.to_remove
																? 'line-through'
																: ''}"
														>
															{draft.name}
														</div>
														{#if draft.season_label}
															<div class="truncate text-sm text-muted-foreground">
																{draft.season_label}
															</div>
														{/if}
													</div>
													<button
														type="button"
														class="shrink-0 self-start pt-1 transition active:scale-95 disabled:pointer-events-none"
														aria-label="Choose color for {draft.name}"
														disabled={draft.to_remove ||
															!draft.available_colors ||
															draft.available_colors.length === 0}
														onclick={() => (colorPickerDraftIdx = idx)}
													>
														<ColorSwatch color={draft.color_edit} size={20} />
													</button>
												</div>
												{#if draft.to_remove}
													<Button size="sm" variant="outline" onclick={() => restoreDraftRow(idx)}>
														Undo
													</Button>
												{:else}
													<button
														type="button"
														aria-label="Remove style"
														class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
														onclick={() => removeDraftRow(idx)}
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
												{/if}
											</div>
											{#if !draft.to_remove && sizesToShow.length > 0}
												<div class="px-4 pb-3">
													<button
														type="button"
														class="grid w-full gap-1.5 transition-opacity active:opacity-60"
														style="grid-template-columns: repeat({sizesToShow.length}, minmax(0, 1fr));"
														aria-label="Edit sizes for {draft.name}"
														onclick={() => (sizingSheetDraftIdx = idx)}
													>
														{#each sizesToShow as size (size)}
															{@const qty = draft.qty_by_size[size] ?? 0}
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
													<div class="mt-3 flex items-center justify-between">
														<div class="text-sm text-muted-foreground">
															{rowUnits}
															{rowUnits === 1 ? 'unit' : 'units'} · {fmt.format(
																draft.unit_price
															)}/ea
														</div>
														<div class="font-mono text-sm font-medium">{fmt.format(rowTotal)}</div>
													</div>
												</div>
											{/if}
										</div>

										<!-- Desktop: full inline editor ───────────────────────────── -->
										<div class="hidden px-6 py-4 sm:block">
											<div class="flex items-start justify-between gap-6">
												<div class="flex min-w-0 items-center gap-4">
													{#if draft.image_id}
														<img
															src={`/api/products/${draft.product_id}/images/${draft.image_id}`}
															alt=""
															class="h-20 w-20 shrink-0 rounded-md border object-cover {draft.to_remove
																? 'opacity-50'
																: ''}"
														/>
													{:else}
														<div
															class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground/50 {draft.to_remove
																? 'opacity-50'
																: ''}"
														>
															<svg
																xmlns="http://www.w3.org/2000/svg"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="1.5"
																class="h-7 w-7"
															>
																<rect x="3" y="3" width="18" height="18" rx="2" />
																<circle cx="8.5" cy="8.5" r="1.5" />
																<path d="M21 15l-5-5L5 21" />
															</svg>
														</div>
													{/if}
													<div class="min-w-0">
														<div
															class="truncate font-mono text-sm text-muted-foreground/70 {draft.to_remove
																? 'line-through'
																: ''}"
														>
															{draft.style_number}
														</div>
														<div
															class="mt-0.5 truncate text-sm font-medium {draft.to_remove
																? 'line-through'
																: ''}"
														>
															{draft.name}
														</div>
														<div class="mt-1 flex items-center gap-2">
															{#if draft.available_colors && draft.available_colors.length > 0 && !draft.to_remove}
																<ColorSwatchPicker
																	value={draft.color_edit}
																	options={draft.available_colors}
																	disabledColors={usedColors}
																	onChange={(c) => (draftRows[idx].color_edit = c)}
																	disabled={draft.to_remove}
																/>
															{:else}
																<ColorSwatch color={draft.color_edit} size={16} />
																<span
																	class="text-sm {draft.color_edit
																		? 'text-muted-foreground'
																		: 'text-muted-foreground/50'}"
																>
																	{draft.color_edit ?? '—'}
																</span>
															{/if}
														</div>
														{#if draft.to_remove}
															<div class="mt-2 text-sm text-destructive">
																Will be removed on save.
															</div>
														{/if}
													</div>
												</div>
												<div class="flex shrink-0 items-start gap-3">
													<div class="pt-1 text-right">
														<div
															class="font-mono text-sm {draft.to_remove
																? 'text-muted-foreground line-through'
																: ''}"
														>
															{fmt.format(rowTotal)}
														</div>
														<div class="font-mono text-sm text-muted-foreground/70">
															{rowUnits}
															{rowUnits === 1 ? 'unit' : 'units'} · {fmt.format(
																draft.unit_price
															)}/ea
														</div>
													</div>
													{#if draft.to_remove}
														<Button
															size="sm"
															variant="outline"
															onclick={() => restoreDraftRow(idx)}
														>
															Undo
														</Button>
													{:else}
														<button
															type="button"
															aria-label="Remove style"
															class="inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
															onclick={() => removeDraftRow(idx)}
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
													{/if}
												</div>
											</div>

											{#if !draft.to_remove}
												{#if sizesToShow.length > 0}
													<div class="mt-3 grid grid-cols-[repeat(6,minmax(0,7rem))] gap-3">
														{#each sizesToShow as size (size)}
															{@const qty = draft.qty_by_size[size] ?? 0}
															<div
																role="group"
																aria-label="{draft.name} size {size} quantity"
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
																		draftRows[idx].qty_by_size[size] = Math.max(0, qty - 1);
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
																			const raw = (
																				e.currentTarget as HTMLInputElement
																			).value.replace(/[^0-9]/g, '');
																			const n = raw === '' ? 0 : parseInt(raw, 10);
																			draftRows[idx].qty_by_size[size] = Number.isNaN(n)
																				? 0
																				: Math.max(0, n);
																		}}
																		onkeydown={(e) => {
																			// Arrow keys step qty up/down; Enter blurs to commit.
																			if (e.key === 'ArrowUp') {
																				e.preventDefault();
																				draftRows[idx].qty_by_size[size] = qty + 1;
																			} else if (e.key === 'ArrowDown') {
																				e.preventDefault();
																				draftRows[idx].qty_by_size[size] = Math.max(0, qty - 1);
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
																		draftRows[idx].qty_by_size[size] = qty + 1;
																	}}
																>
																	+
																</button>
															</div>
														{/each}
													</div>
												{:else}
													<div class="mt-3 flex items-center gap-3">
														<span class="text-sm text-muted-foreground">Qty</span>
														<input
															type="number"
															min="0"
															value={draft.qty_by_size[''] ?? 0}
															oninput={(e) => {
																const n = parseInt((e.currentTarget as HTMLInputElement).value, 10);
																draftRows[idx].qty_by_size[''] = Number.isNaN(n)
																	? 0
																	: Math.max(0, n);
															}}
															class="h-9 w-20 rounded-md border border-input bg-background px-2 text-center font-mono text-sm"
														/>
													</div>
												{/if}
											{/if}
										</div>
									</div>
								{/each}
							</div>
							<div class="flex items-center justify-between border-t bg-muted/20 px-6 py-3">
								<span class="font-mono text-sm text-muted-foreground">
									{draftRows.filter((d) => !d.to_remove).length}
									{draftRows.filter((d) => !d.to_remove).length === 1 ? 'Item' : 'Items'} · {projectedOrderUnits}
									{projectedOrderUnits === 1 ? 'unit' : 'units'}
								</span>
								<span class="font-mono text-lg font-medium">
									{fmt.format(projectedOrderTotal)}
								</span>
							</div>
						</div>
					{:else}
						<!-- ── View mode: grouped size-matrix card stack ── -->
						<div class="overflow-hidden rounded-lg border">
							<div class="divide-y">
								{#each lineRows as row (row.key)}
									{@const visibleLines = row.lines.filter((l) => l.qty > 0)}
									{@const rowUnits = row.lines.reduce((s, l) => s + l.qty, 0)}
									{@const rowTotal = rowUnits * row.unit_price}
									{@const fallbackSizes = Array.from(
										new Set(row.lines.map((l) => l.size ?? '').filter((s) => s.length > 0))
									)}
									{@const sizesToShow =
										row.available_sizes.length > 0 ? row.available_sizes : fallbackSizes}
									<div class="px-6 py-4">
										<div class="flex items-start justify-between gap-6">
											<div class="flex min-w-0 items-center gap-4">
												{#if row.image_id}
													<img
														src={`/api/products/${row.product_id}/images/${row.image_id}`}
														alt=""
														class="h-20 w-20 shrink-0 rounded-md border object-cover"
													/>
												{:else}
													<div
														class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40 text-muted-foreground/50"
													>
														<svg
															xmlns="http://www.w3.org/2000/svg"
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5"
															class="h-7 w-7"
														>
															<rect x="3" y="3" width="18" height="18" rx="2" />
															<circle cx="8.5" cy="8.5" r="1.5" />
															<path d="M21 15l-5-5L5 21" />
														</svg>
													</div>
												{/if}
												<div class="min-w-0">
													<div class="truncate font-mono text-sm text-muted-foreground/70">
														{row.style_number}
													</div>
													<div class="mt-0.5 truncate text-sm font-medium">{row.name}</div>
													<div class="mt-1 flex items-center gap-2">
														<ColorSwatch color={row.color} size={16} />
														<span
															class="text-sm {row.color
																? 'text-muted-foreground'
																: 'text-muted-foreground/50'}"
														>
															{row.color ?? '—'}
														</span>
													</div>
												</div>
											</div>
											<div class="shrink-0 pt-1 text-right">
												<div class="font-mono text-sm">{fmt.format(rowTotal)}</div>
												<div class="font-mono text-sm text-muted-foreground/70">
													{rowUnits}
													{rowUnits === 1 ? 'unit' : 'units'} · {fmt.format(row.unit_price)}/ea
												</div>
											</div>
										</div>
										{#if sizesToShow.length > 0}
											<div class="mt-3 grid grid-cols-6 gap-2">
												{#each sizesToShow as size (size)}
													{@const sizeLine = row.lines.find((l) => (l.size ?? '') === size)}
													{@const qty = sizeLine?.qty ?? 0}
													<div
														class="rounded-md border bg-muted/40 px-2 py-2 text-center {qty === 0
															? 'opacity-40'
															: ''}"
													>
														<div class="text-xs text-muted-foreground">{size}</div>
														<div
															class="mt-0.5 flex h-5 items-center justify-center font-mono text-sm"
														>
															{qty > 0 ? qty : '—'}
														</div>
													</div>
												{/each}
											</div>
										{:else if visibleLines.length === 0}
											<div class="mt-2 text-sm text-muted-foreground">No sizes.</div>
										{/if}
									</div>
								{/each}

								{#each customLines as line (line.id)}
									<div class="flex items-start justify-between gap-6 px-6 py-4">
										<div class="min-w-0">
											<div class="font-mono text-sm">{line.style_number ?? '—'}</div>
											{#if line.description}
												<div class="text-sm text-muted-foreground">{line.description}</div>
											{/if}
											{#if line.color || line.size}
												<div class="text-sm text-muted-foreground">
													{[line.color, line.size].filter(Boolean).join(' · ')}
												</div>
											{/if}
										</div>
										<div class="shrink-0 text-right">
											<div class="font-mono text-sm">{fmt.format(Number(line.line_total))}</div>
											<div class="font-mono text-sm text-muted-foreground/70">
												{line.qty} × {fmt.format(Number(line.unit_price))}
											</div>
										</div>
									</div>
								{/each}
							</div>
							<div class="flex items-center justify-between border-t bg-muted/20 px-6 py-3">
								<span class="font-mono text-sm text-muted-foreground">
									{lineRows.length + customLines.length}
									{lineRows.length + customLines.length === 1 ? 'Item' : 'Items'} · {savedOrderUnits}
									{savedOrderUnits === 1 ? 'unit' : 'units'}
								</span>
								<span class="font-mono text-lg font-medium">
									{fmt.format(Number(order.total_amount))}
								</span>
							</div>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- ── Notes + Activity (side-by-side) ────────────────────── -->
			<section class="grid gap-4 md:grid-cols-2">
				<!-- Notes & comments -->
				<div class="rounded-lg border bg-muted/30 p-5">
					<div class="flex items-center justify-between">
						<div class="text-sm font-medium">Notes & comments</div>
						<div class="text-xs text-muted-foreground/70">Internal only</div>
					</div>

					{#if canEdit}
						{@const viewerName =
							(data.user as { display_name?: string | null } | null | undefined)?.display_name ??
							''}
						{@const viewerInitial = viewerName.trim()
							? viewerName.trim().charAt(0).toUpperCase()
							: '?'}
						<div class="mt-3 flex gap-3">
							<span
								class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-sm"
							>
								{viewerInitial}
							</span>
							<div class="flex-1">
								<textarea
									rows="2"
									placeholder="Add a note…"
									bind:value={commentBody}
									onkeydown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											postComment();
										}
									}}
									class="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
								></textarea>
								<div class="mt-1.5 flex items-center justify-between">
									<span class="text-xs text-muted-foreground/70">Visible to your org only</span>
									<Button
										size="sm"
										onclick={postComment}
										disabled={postingComment || !commentBody.trim()}
									>
										{postingComment ? 'Posting…' : 'Post'}
									</Button>
								</div>
								{#if commentError}
									<p class="mt-1 text-sm text-destructive">{commentError}</p>
								{/if}
							</div>
						</div>
					{/if}

					{#if comments.length > 0}
						<div class="{canEdit ? 'mt-4 border-t pt-4' : 'mt-3'} space-y-4">
							{#each comments as comment (comment.id)}
								<div class="flex gap-3">
									<span
										class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background text-sm"
									>
										{(comment.profiles?.display_name ?? '?')[0].toUpperCase()}
									</span>
									<div class="min-w-0 flex-1">
										<div class="flex items-baseline gap-2">
											<span class="text-sm font-medium">
												{comment.profiles?.display_name ?? 'Unknown'}
											</span>
											<span class="text-xs text-muted-foreground/70">
												{new Date(comment.created_at).toLocaleDateString('en-US', {
													month: 'short',
													day: 'numeric',
													hour: 'numeric',
													minute: '2-digit'
												})}
											</span>
											{#if comment.author_id === data.user?.id}
												<button
													type="button"
													aria-label="Delete comment"
													class="ml-auto text-muted-foreground transition-colors hover:text-destructive"
													onclick={() => deleteComment(comment.id)}
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="h-3.5 w-3.5"
														fill="none"
														viewBox="0 0 24 24"
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
											{/if}
										</div>
										<p class="mt-0.5 text-sm text-muted-foreground">{comment.body}</p>
									</div>
								</div>
							{/each}
						</div>
					{:else if !canEdit}
						<p class="mt-3 text-sm text-muted-foreground">No notes yet.</p>
					{/if}
				</div>

				<!-- Activity timeline -->
				<div class="rounded-lg border bg-muted/30 p-5">
					<div class="flex items-center justify-between">
						<div class="text-sm font-medium">Activity</div>
					</div>

					{#if activity.length === 0}
						<p class="mt-3 text-sm text-muted-foreground">
							No activity yet. Status changes, line edits, and notes will show up here.
						</p>
					{:else}
						<ol class="relative mt-3">
							<span aria-hidden="true" class="absolute top-1 bottom-1 left-[13px] w-px bg-border"
							></span>
							{#each activity as entry, i (entry.id)}
								<li class="relative py-2 pl-9">
									<span class="absolute top-2.5 left-0 flex w-[27px] justify-center">
										<span
											class="h-2 w-2 rounded-full {i === 0
												? 'bg-foreground ring-4 ring-foreground/20'
												: 'bg-muted-foreground/50'}"
										></span>
									</span>
									<div class="flex items-baseline justify-between gap-3">
										<div class="min-w-0 text-sm">
											<span class="font-medium">{entry.title}</span>
											{#if entry.actor_name}
												<span class="text-muted-foreground">
													by {entry.actor_name}
												</span>
											{/if}
										</div>
										<span class="shrink-0 text-xs text-muted-foreground/70">
											{new Date(entry.at).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												hour: 'numeric',
												minute: '2-digit'
											})}
										</span>
									</div>
									{#if entry.subtitle}
										<div class="mt-0.5 text-sm text-muted-foreground">{entry.subtitle}</div>
									{/if}
								</li>
							{/each}
						</ol>
					{/if}
				</div>
			</section>
		</div>
		<!-- ─── Right rail: Totals + Terms record ─── -->
		<aside class="contents lg:sticky lg:top-6 lg:block lg:space-y-4 lg:self-start">
			<div class="order-first overflow-hidden rounded-lg border bg-muted/30 lg:order-none">
				<div class="border-b px-5 py-4">
					<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Total</div>
					<div class="mt-1 font-mono text-2xl font-medium tracking-tight sm:text-3xl">
						{fmt.format(Number(order.total_amount))}
					</div>
					<div class="mt-1 font-mono text-sm text-muted-foreground/70">
						{totalUnits} unit{totalUnits === 1 ? '' : 's'} · {totalStyles} style{totalStyles === 1
							? ''
							: 's'}
					</div>
				</div>
				<dl class="space-y-2 px-5 py-4 text-sm">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Subtotal</dt>
						<dd class="font-mono">{fmt.format(Number(order.total_amount))}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Discount</dt>
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
			</div>

			<!-- Terms panel: always renders. Brand-specific when the order has
				 agreed terms on file, brand-specific-current or generic otherwise. -->
			<div class="order-last rounded-lg border bg-muted/30 p-5 lg:order-none">
				<div class="flex items-center justify-between">
					<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Terms</div>
					<Dialog.Root>
						<Dialog.Trigger
							class="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
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
									{termsAgreedInfo?.brand_terms?.title ?? effectiveTerms.title}
								</Dialog.Title>
								<Dialog.Description class="mt-1 text-sm text-muted-foreground">
									{effectiveTermsIsGeneric && !termsAgreedInfo?.brand_terms
										? 'Generic'
										: (order.brands?.name ?? 'Brand')} · v{termsAgreedInfo?.brand_terms?.version ??
										effectiveTerms.version}
								</Dialog.Description>
								<div class="mt-5 text-sm whitespace-pre-wrap">
									{termsAgreedInfo?.brand_terms?.body ?? effectiveTerms.body}
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
				<div class="mt-2 text-sm">
					{#if effectiveTermsIsGeneric && !termsAgreedInfo?.brand_terms}
						Standard wholesale terms
					{:else}
						{order.brands?.name ?? 'Brand'} · {seasonLabel()} v{termsAgreedInfo?.brand_terms
							?.version ?? effectiveTerms.version}
					{/if}
				</div>
				{#if termsAgreedInfo && (termsAgreedInfo.agreed_by || termsAgreedInfo.agreed_at)}
					<div class="mt-0.5 text-sm text-muted-foreground/70">
						Agreed
						{#if termsAgreedInfo.agreed_by}
							by {termsAgreedInfo.agreed_by}{/if}
						{#if termsAgreedInfo.agreed_at}
							· {longDate(termsAgreedInfo.agreed_at as string)}{/if}
					</div>
				{:else}
					<div class="mt-0.5 text-sm text-muted-foreground/70">
						{order.order_type === 'note'
							? 'Not yet agreed — buyer agrees on convert.'
							: 'Not yet agreed.'}
					</div>
				{/if}
			</div>
		</aside>
	</div>
</div>

<!-- Catalog picker modal for adding items -->
<CatalogPickerModal
	bind:open={catalogPickerOpen}
	bind:items={catalogPickerItems}
	brandIds={[order.brand_id]}
	brands={[
		{ id: order.brand_id, name: (order.brands as { name?: string } | null)?.name ?? 'Brand' }
	]}
	seasons={order.season_id && order.seasons
		? [{ id: order.season_id, name: (order.seasons as { name?: string }).name ?? 'Season' }]
		: []}
	showBrandFilter={false}
	lockedProductIds={catalogPickerItems.map((it) => it.product_id)}
	onclose={() => {
		catalogPickerOpen = false;
	}}
	ondone={handleCatalogDone}
/>

<!-- Mobile per-item size editor (edit mode) -->
<SizeStepperSheet
	open={sizingSheetDraftIdx !== null}
	onClose={() => (sizingSheetDraftIdx = null)}
	styleNumber={sizingSheetDraft?.style_number}
	name={sizingSheetDraft?.name}
	season={sizingSheetDraft?.season_label}
	color={sizingSheetDraft?.color_edit ?? null}
	imageUrl={sizingSheetDraft?.image_id
		? `/api/products/${sizingSheetDraft.product_id}/images/${sizingSheetDraft.image_id}`
		: null}
	unitPrice={sizingSheetDraft?.unit_price}
	sizes={sizingSheetDraft?.available_sizes}
	qtys={sizingSheetDraft?.qty_by_size}
	onChange={(size, qty) => {
		if (sizingSheetDraftIdx !== null && sizingSheetDraftIdx >= 0) {
			draftRows[sizingSheetDraftIdx].qty_by_size[size] = qty;
		}
	}}
	onColorPickerOpen={() => {
		const idx = sizingSheetDraftIdx;
		sizingSheetDraftIdx = null;
		if (idx !== null) colorPickerDraftIdx = idx;
	}}
/>

<ColorPickerSheet
	open={colorPickerDraftIdx !== null}
	onClose={() => (colorPickerDraftIdx = null)}
	styleNumber={colorPickerDraft?.style_number}
	name={colorPickerDraft?.name}
	season={colorPickerDraft?.season_label}
	imageUrl={colorPickerDraft?.image_id
		? `/api/products/${colorPickerDraft.product_id}/images/${colorPickerDraft.image_id}`
		: null}
	colors={colorPickerDraft?.available_colors}
	selected={colorPickerDraft?.color_edit ?? null}
	disabledColors={colorPickerUsedColors}
	onSelect={(color) => {
		if (colorPickerDraftIdx !== null && colorPickerDraftIdx >= 0) {
			draftRows[colorPickerDraftIdx].color_edit = color;
		}
	}}
/>

<!-- ══ Convert-to-Order Modal ════════════════════════════════════════════ -->
<Dialog.Root bind:open={convertOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 max-h-[90vh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-lg border bg-background shadow-lg"
		>
			<form
				method="POST"
				action="?/convert"
				use:enhance={() => {
					convertSubmitting = true;
					return async ({ result, update }) => {
						convertSubmitting = false;
						if (result.type === 'success') {
							toast.success('Note converted to order');
							convertOpen = false;
							await update();
							invalidateAll();
						} else if (result.type === 'failure') {
							const msg =
								(result.data as { message?: string } | undefined)?.message ??
								'Could not convert note.';
							toast.error(msg);
							await update({ reset: false });
						} else if (result.type === 'error') {
							toast.error(result.error?.message ?? 'Something went wrong.');
						}
					};
				}}
			>
				<header class="flex items-start justify-between gap-4 px-6 py-5">
					<div class="min-w-0">
						<Dialog.Title class="text-lg font-medium">Convert to order</Dialog.Title>
						<Dialog.Description class="mt-1 text-sm text-muted-foreground">
							{order.accounts?.business_name ?? '—'}
							{!isBrandOrg && order.brands?.name ? ` · ${order.brands.name}` : ''}
							{#if seasonLabel() !== '—'}
								· {seasonLabel()}{/if} · {fmt.format(Number(order.total_amount))}
						</Dialog.Description>
					</div>
					<Dialog.Close
						type="button"
						class="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Close"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</Dialog.Close>
				</header>

				<div class="max-h-[calc(90vh-11rem)] space-y-5 overflow-y-auto px-6 py-5">
					<!-- Ship window -->
					<div>
						<ShipWindowPicker
							deliveries={[]}
							orderYear={new Date().getFullYear()}
							startShipDate={convertForm.start_ship_date}
							completeShipDate={convertForm.expected_ship_date}
							onApply={(range) => {
								convertForm.start_ship_date = range.startShipDate;
								convertForm.expected_ship_date = range.completeShipDate;
							}}
						/>
						<input type="hidden" name="start_ship_date" value={convertForm.start_ship_date} />
						<input type="hidden" name="expected_ship_date" value={convertForm.expected_ship_date} />
					</div>

					<!-- Ship to / Bill to -->
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Ship to</div>
							{#if convertLocationItems.length > 0}
								<div class="mt-2">
									<SelectField
										value={convertForm.location_id}
										items={convertLocationItems}
										placeholder="Select address"
										class="w-full"
										onValueChange={(v) => (convertForm.location_id = v)}
									/>
								</div>
								<input type="hidden" name="location_id" value={convertForm.location_id} />
							{:else}
								<div class="mt-2 text-sm text-muted-foreground">No addresses on file.</div>
							{/if}
						</div>
						<div>
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Bill to</div>
							<div class="mt-2">
								<SelectField
									value={convertForm.bill_to_location_id}
									items={convertBillToItems}
									placeholder="Same as ship to"
									class="w-full"
									onValueChange={(v) => (convertForm.bill_to_location_id = v)}
								/>
							</div>
							<input
								type="hidden"
								name="bill_to_location_id"
								value={convertForm.bill_to_location_id}
							/>
						</div>
					</div>

					<!-- Payment / Terms / Shipping method -->
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div>
							<div class="text-sm text-muted-foreground">Payment</div>
							<div class="mt-1.5">
								<SelectField
									value={convertForm.payment_preference}
									items={convertMethodItems}
									placeholder="Select"
									class="w-full"
									onValueChange={(v) => (convertForm.payment_preference = v)}
								/>
							</div>
							<input
								type="hidden"
								name="payment_preference"
								value={convertForm.payment_preference}
							/>
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Terms</div>
							<div class="mt-1.5">
								<SelectField
									value={convertForm.payment_terms}
									items={convertTermsItems}
									placeholder="Select"
									class="w-full"
									onValueChange={(v) => (convertForm.payment_terms = v)}
								/>
							</div>
							<input type="hidden" name="payment_terms" value={convertForm.payment_terms} />
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Ship method</div>
							<div class="mt-1.5">
								<SelectField
									value={convertForm.shipping_method}
									items={convertShippingItems}
									placeholder="Select"
									class="w-full"
									onValueChange={(v) => (convertForm.shipping_method = v)}
								/>
							</div>
							<input type="hidden" name="shipping_method" value={convertForm.shipping_method} />
						</div>
					</div>

					<!-- PO -->
					<div>
						<label for="convert-po" class="text-sm text-muted-foreground">
							PO / Customer ref <span class="text-muted-foreground/70">(optional)</span>
						</label>
						<input
							id="convert-po"
							name="po_number"
							type="text"
							maxlength={64}
							placeholder="—"
							bind:value={convertForm.po_number}
							class="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						/>
					</div>

					<!-- Buyer terms gate (always visible — brand-specific when configured,
						 generic wholesale terms otherwise). -->
					<div class="border-t pt-4">
						<div class="flex items-start justify-between gap-4">
							<label class="flex cursor-pointer items-start gap-3">
								<Checkbox
									checked={convertTermsAgreed}
									onCheckedChange={(v) => (convertTermsAgreed = v === true)}
								/>
								<span class="text-sm">
									Buyer has agreed to
									{#if effectiveTermsIsGeneric}
										<strong class="font-medium">standard wholesale terms</strong>.
									{:else}
										<strong class="font-medium">{order.brands?.name ?? 'the brand'}'s</strong> terms.
									{/if}
								</span>
							</label>
							<button
								type="button"
								class="shrink-0 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
								onclick={() => (convertTermsViewOpen = !convertTermsViewOpen)}
							>
								{convertTermsViewOpen ? 'Hide terms' : 'View terms'}
							</button>
						</div>
						<div class="mt-2 pl-7 text-sm text-muted-foreground/70">
							Your name, timestamp, and the terms version are recorded on the order. The buyer
							receives a copy with their confirmation email.
						</div>
						{#if convertTermsViewOpen}
							<div class="mt-3 ml-7 rounded-md border bg-muted/30 p-4">
								<div class="text-sm font-medium">{effectiveTerms.title}</div>
								<div class="mt-0.5 text-sm text-muted-foreground/70">
									{effectiveTermsIsGeneric ? 'Generic' : (order.brands?.name ?? 'Brand')} · v{effectiveTerms.version}
								</div>
								<div class="mt-3 max-h-64 overflow-auto text-sm whitespace-pre-wrap">
									{effectiveTerms.body}
								</div>
							</div>
						{/if}
						<input
							type="hidden"
							name="agreed_terms_id"
							value={convertTermsAgreed ? effectiveTerms.id : ''}
						/>
					</div>
				</div>

				<footer class="flex flex-wrap items-center gap-3 px-6 py-4">
					{#if convertForm.start_ship_date === '' || convertForm.expected_ship_date === ''}
						<span class="mr-auto text-sm text-muted-foreground/70">
							Set the ship window to continue
						</span>
					{:else if !convertTermsAgreed}
						<span class="mr-auto text-sm text-muted-foreground/70">
							Agree to the buyer terms to continue
						</span>
					{:else}
						<span class="mr-auto text-sm text-muted-foreground/70">Ready to convert.</span>
					{/if}
					<Dialog.Close
						type="button"
						class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
					>
						Cancel
					</Dialog.Close>
					<Button type="submit" loading={convertSubmitting} disabled={!convertCanSubmit}>
						Convert to order
					</Button>
				</footer>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Cancel Order Modal -->
{#if cancelOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
		onclick={() => (cancelOpen = false)}
	></div>
	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-md rounded-none border bg-card p-6 shadow-xl"
			onclick={(e: MouseEvent) => e.stopPropagation()}
		>
			<h2 class="text-base font-semibold">Cancel Order</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				This cannot be undone. Please provide a reason for cancellation.
			</p>
			<textarea
				bind:value={cancelReason}
				rows="3"
				placeholder="Reason for cancellation..."
				class="mt-4 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
			></textarea>
			<div class="mt-4 flex justify-end gap-2">
				<Button variant="outline" onclick={() => (cancelOpen = false)}>Keep Order</Button>
				<Button
					variant="destructive"
					onclick={confirmCancel}
					disabled={cancellingOrder || !cancelReason.trim()}
				>
					{cancellingOrder ? 'Cancelling...' : 'Cancel Order'}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- ── Prepare Shipment Dialog ─────────────────────────────────── -->
<Dialog.Root bind:open={prepareConfirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background sm:inset-auto sm:top-[50%] sm:left-[50%] sm:max-h-[90vh] sm:w-full sm:max-w-2xl sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg sm:border sm:shadow-lg"
		>
			<div class="flex-1 overflow-y-auto px-6 pt-6 pb-0">
				<!-- Title -->
				<Dialog.Title class="text-xl font-semibold">Prepare Shipment</Dialog.Title>
				<Dialog.Description class="sr-only">
					Prepare order {order.order_number} for shipment
				</Dialog.Description>

				<!-- Order context -->
				<div class="mt-4 flex items-start justify-between">
					<div>
						<div class="text-sm text-muted-foreground">{order.accounts?.business_name ?? '—'}</div>
						<div class="font-mono text-lg font-semibold">{order.order_number}</div>
					</div>
					<div class="text-right">
						<div class="text-sm text-muted-foreground">
							{savedOrderUnits} Unit{savedOrderUnits === 1 ? '' : 's'}
						</div>
						<div class="text-lg font-semibold">{fmt.format(Number(order.total_amount))}</div>
					</div>
				</div>

				<!-- Ship-to + Ship window -->
				<div class="mt-5 grid grid-cols-2 gap-6">
					<div>
						<div class="text-sm text-muted-foreground">Ship to</div>
						{#if orderLocation}
							<div class="mt-1 text-sm leading-relaxed">
								{orderLocation.address_line1 ?? ''}<br />
								{orderLocation.city ?? ''}{orderLocation.state ? `, ${orderLocation.state}` : ''}
								{orderLocation.zip ?? ''}
							</div>
						{:else if accountAddress}
							<div class="mt-1 text-sm leading-relaxed">
								{accountAddress.address_line1 ?? ''}<br />
								{accountAddress.city ?? ''}{accountAddress.state ? `, ${accountAddress.state}` : ''}
								{accountAddress.zip ?? ''}
							</div>
						{:else}
							<div class="mt-1 text-sm text-muted-foreground">No address on file</div>
						{/if}
					</div>
					<div>
						<div class="text-sm text-muted-foreground">Ship window</div>
						<div class="mt-1 text-sm">
							{#if order.start_ship_date && order.expected_ship_date}
								{shortDate(order.start_ship_date)} → {shortDate(order.expected_ship_date)}
							{:else if order.start_ship_date}
								Ships {shortDate(order.start_ship_date)}
							{:else}
								<span class="text-muted-foreground">Not set</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- Shipment details -->
				<div class="mt-10">
					<div class="text-sm font-semibold">
						Shipment Details <span class="font-normal text-muted-foreground">(optional)</span>
					</div>
					<p class="mt-1 text-sm text-muted-foreground">
						Provide available shipment details that might be helpful.
					</p>

					<!-- Carrier cards -->
					<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
						{#each CARRIERS as c (c)}
							<button
								type="button"
								class="relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 px-3 py-4 text-sm transition-all {prepCarrier ===
								c
									? 'border-foreground'
									: 'border-border grayscale hover:border-foreground/30'}"
								onclick={() => (prepCarrier = prepCarrier === c ? '' : c)}
							>
								<div
									class="absolute top-2.5 right-2.5 h-4 w-4 rounded-full border-2 {prepCarrier === c
										? 'border-foreground bg-foreground'
										: 'border-muted-foreground/40'}"
								>
									{#if prepCarrier === c}
										<div class="flex h-full w-full items-center justify-center">
											<div class="h-1.5 w-1.5 rounded-full bg-background"></div>
										</div>
									{/if}
								</div>
								{#if c === 'Other'}
									<span class="absolute top-2 left-2.5 text-xs text-muted-foreground">Other</span>
								{/if}
								<div class="flex h-10 w-full items-center justify-center">
									{#if c === 'FedEx'}
										<svg viewBox="0 0 2400 800" class="h-5" xmlns="http://www.w3.org/2000/svg"
											><g fill="none" fill-rule="evenodd" transform="translate(0 67)"
												><path
													d="m1978.44411 641.669151-88.84649-99.791357-88.20269 99.791357h-185.41878l181.34129-203.660209-181.34129-203.660209h191.21312l89.70492 98.932936 86.48584-98.932936h184.56036l-180.48286 202.801789 183.05812 204.518629zm-718.49776 0v-641.669151h356.0298v143.14158h-205.16244v91.207153h205.16244v137.561848h-205.16244v126.18778h205.16244v143.57079z"
													fill="#f60"
												/><path
													d="m1109.7228 0v262.676602h-1.71684c-30.88596-35.168048-76.23916-54.164173-122.968702-51.505216-94.013115.826229-175.725783 64.752429-199.153502 155.803279-29.830105-97.859911-107.302534-157.734725-220.399404-157.734725-92.494784 0-165.460507 41.418778-203.660209 109.23398v-84.125187h-191.42772v-91.421758h208.596125v-142.926975h-378.992548v641.669151h170.396423v-269.75857h169.752608c-5.298082 21.045486-7.89423 42.680051-7.725782 64.38152 0 133.913562 102.152012 227.695976 232.846498 227.695976 109.663189 0 181.985097-51.505216 220.184798-145.502235h-145.931445c-14.824918 26.364233-44.305216 40.933771-74.253353 36.697466-47.553622-1.046199-85.620984-39.779552-85.842027-87.344262h297.871833c12.876304 107.302534 95.71386 197.865872 209.23994 197.865872 48.637377.1538 94.135437-24.004292 121.251867-64.38152h1.71684v40.345753h150.22354v-641.669151zm-625.144559 373.842027c7.123458-38.896096 40.934129-67.207154 80.476901-67.385991 40.490611-2.04769 75.818181 27.220864 81.33532 67.385991zm533.722799 170.181818c-55.368104 0-89.704915-51.505216-89.704915-105.585693 0-57.514158 30.04471-112.882265 89.704915-112.882265 59.66021 0 85.84203 55.368107 85.84203 112.882265s-25.10879 105.585693-85.62742 105.585693z"
													fill="#4d148c"
												/></g
											></svg
										>
									{:else if c === 'UPS'}
										<svg viewBox="0 0 52.24 61.98" class="h-7" xmlns="http://www.w3.org/2000/svg"
											><g transform="matrix(1.25 0 0 -1.25 -47.372 728.76)"
												><g transform="translate(.36060 .36060)"
													><path
														d="m38.962 567.66 0.17739-20.134 4.5235-5.5879 13.571-7.1844 16.675 8.1601 3.4592 8.2488-0.35478 26.698-12.595 0.35478-13.127-2.1287-11.974-6.9183z"
														fill-rule="evenodd"
														fill="#301506"
													/><path
														d="m25.619 0c-9.881 0-18.5 1.913-25.619 5.6855v30.16c0 6.3462 2.3845 11.653 6.8945 15.35 4.1875 3.435 17.138 9.0957 18.725 9.7832 1.505-0.655 14.609-6.4032 18.73-9.7832 4.5075-3.695 6.8926-9.0034 6.8926-15.35v-30.16c-7.12-3.773-15.739-5.686-25.624-5.686zm14.631 5.8398c2.9466 0.038525 5.8399 0.22055 8.6367 0.48047v29.525c0 5.6738-2.0588 10.257-6.0312 13.529-3.5488 2.9225-14.25 7.717-17.236 9.0332-3.026-1.334-13.754-6.189-17.239-9.032-3.9489-3.216-6.0275-7.908-6.0275-13.529v-17.252c11.348-10.407 25.128-12.921 37.896-12.754zm-13.963 13.748c-2.4312 0-4.3928 0.54344-6.0078 1.5859v29.049h4.459v-9.3848c0.445 0.13125 1.0909 0.25391 2.0059 0.25391 4.9462 0 7.7891-4.4588 7.7891-10.969 0-6.4975-2.9273-10.535-8.2461-10.535zm15.236 0c-2.9325 0.085-5.9992 2.2093-5.9805 5.8105 0.0075 2.3712 0.66484 4.1445 4.3398 6.3008 1.9612 1.1512 2.7514 1.9098 2.7852 3.3086 0.0375 1.555-1.0369 2.4926-2.6719 2.4863-1.4225-0.01125-3.123-0.8007-4.2617-1.8145v4.1035c1.3962 0.8325 3.1384 1.3828 4.8984 1.3828 4.405 0 6.372-3.1116 6.457-5.9629 0.08375-2.5988-0.63438-4.5652-4.3594-6.7539-1.6625-0.975-2.9754-1.6158-2.9316-3.2383 0.04375-1.5838 1.3586-2.1402 2.6211-2.1289 1.5575 0.01375 3.0641 0.87633 3.9941 1.8301v-3.875c-0.78375-0.60375-2.4431-1.5242-4.8906-1.4492zm-36.893 0.45117v14.012c0 4.7238 2.2345 7.1152 6.6445 7.1152 2.7288 0 5.0143-0.63156 6.7168-1.7891v-19.338h-4.4492v16.801c-0.485 0.3325-1.2044 0.54492-2.1094 0.54492-2.0425 0-2.3477-1.873-2.3477-3.1367v-14.209h-4.4551zm21.687 3.1387c2.5862 0 3.6582 2.0648 3.6582 7.0586 0.000001 4.8725-1.226 7.2266-3.791 7.2266-0.60375 0-1.1285-0.14953-1.4473-0.26953v-13.693c0.36125-0.18 0.97508-0.32227 1.5801-0.32227z"
														transform="matrix(.8 0 0 -.8 37.897 582.21)"
														fill="#fab80a"
													/></g
												></g
											></svg
										>
									{:else if c === 'USPS'}
										<svg viewBox="20 20 165 110" class="h-6" xmlns="http://www.w3.org/2000/svg"
											><g fill-rule="evenodd" clip-rule="evenodd"
												><path
													d="M117.109 46.547c-11.365-1.48-72.746-.947-81.767-.86l-16.284 75.56c24.929-12.545 47.12-23.373 71.807-35.152 31.386-14.974 52.978-18.812 57.457-19.03 3.014-.146 1.305-1.459-.127-1.775-17.531-3.866-60.051 15.849-60.051 15.849l-9.29-28.186 60.533.057c-3.34-4.946-10.004-4.864-22.278-6.463z"
													fill="#004B87"
												/><path
													d="M44.553 23.971a206015 206015 0 0 1 83.037 18.242c13.309 2.934 15.01 7.494 15.01 7.494s14.564-1.76 17.236 3.309c3.426 6.494-5.334 18.833-5.334 18.833L28.603 121.246h130.743l21.441-97.275H44.553z"
													fill="#004B87"
												/><path
													d="M139.932 53.105s-.625 3.505-13.564 4.59c-1.186.099-1.469.857.096.907 1.562.05 23.189-.695 25.598-.459 2.41.236 2.088 1.691 1.779 3.1-.312 1.408-1.932 5.629-2.348 6.62-.414.992.377.969 1.014.322.635-.648 4.521-8.454 4.633-10.3.111-1.846-.549-3.763-3.553-4.425-3.005-.665-13.655-.355-13.655-.355z"
													fill="#004B87"
												/></g
											></svg
										>
									{:else}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-9 w-9 text-muted-foreground"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.5"
											stroke-linecap="round"
											stroke-linejoin="round"
											><path
												d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
											/><path d="M12 22V12" /><polyline points="3.29 7 12 12 20.71 7" /><path
												d="m7.5 4.27 9 5.15"
											/></svg
										>
									{/if}
								</div>
							</button>
						{/each}
					</div>

					<!-- Service level cards -->
					<div class="mt-8 grid grid-cols-3 gap-3 sm:mt-3">
						{#each SERVICE_LEVELS as level (level)}
							<button
								type="button"
								class="relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 px-3 py-3 text-sm transition-all sm:flex-row sm:justify-start sm:gap-3 sm:px-4 {prepServiceLevel ===
								level
									? 'border-foreground'
									: 'border-border grayscale hover:border-foreground/30'}"
								onclick={() => (prepServiceLevel = prepServiceLevel === level ? '' : level)}
							>
								<div
									class="absolute top-2 right-2 h-4 w-4 rounded-full border-2 {prepServiceLevel ===
									level
										? 'border-foreground bg-foreground'
										: 'border-muted-foreground/40'}"
								>
									{#if prepServiceLevel === level}
										<div class="flex h-full w-full items-center justify-center">
											<div class="h-1.5 w-1.5 rounded-full bg-background"></div>
										</div>
									{/if}
								</div>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-6 w-6 text-muted-foreground"
									viewBox="0 0 24 24"
									fill="currentColor"
								>
									{#if level === 'Ground'}
										<path
											d="M8.96456 18C8.72194 19.6961 7.26324 21 5.5 21C3.73676 21 2.27806 19.6961 2.03544 18H1V6C1 5.44772 1.44772 5 2 5H16C16.5523 5 17 5.44772 17 6V8H20L23 12.0557V18H20.9646C20.7219 19.6961 19.2632 21 17.5 21C15.7368 21 14.2781 19.6961 14.0354 18H8.96456ZM15 7H3V15.0505C3.63526 14.4022 4.52066 14 5.5 14C6.8962 14 8.10145 14.8175 8.66318 16H14.3368C14.5045 15.647 14.7296 15.3264 15 15.0505V7ZM17 13H21V12.715L18.9917 10H17V13ZM17.5 19C18.1531 19 18.7087 18.5826 18.9146 18C18.9699 17.8436 19 17.6753 19 17.5C19 16.6716 18.3284 16 17.5 16C16.6716 16 16 16.6716 16 17.5C16 17.6753 16.0301 17.8436 16.0854 18C16.2913 18.5826 16.8469 19 17.5 19ZM7 17.5C7 16.6716 6.32843 16 5.5 16C4.67157 16 4 16.6716 4 17.5C4 17.6753 4.03008 17.8436 4.08535 18C4.29127 18.5826 4.84689 19 5.5 19C6.15311 19 6.70873 18.5826 6.91465 18C6.96992 17.8436 7 17.6753 7 17.5Z"
										/>
									{:else if level === 'Next Day Air'}
										<path
											d="M14 8.94737L22 14V16L14 13.4737V18.8333L17 20.5V22L12.5 21L8 22V20.5L11 18.8333V13.4737L3 16V14L11 8.94737V3.5C11 2.67157 11.6716 2 12.5 2C13.3284 2 14 2.67157 14 3.5V8.94737Z"
										/>
									{:else}
										<path
											d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM13 12H17V14H11V7H13V12Z"
										/>
									{/if}
								</svg>
								<span class="text-xs font-medium">{level}</span>
							</button>
						{/each}
					</div>

					<!-- Tracking + Cost -->
					<div class="mt-8 grid grid-cols-[1fr_auto] gap-3 sm:mt-6">
						<div>
							<div class="text-sm text-muted-foreground">Tracking number</div>
							<div class="mt-1.5">
								<Input bind:value={prepTracking} placeholder="SH-1234567890" />
							</div>
						</div>
						<div class="w-28">
							<div class="text-sm text-muted-foreground">Shipping cost</div>
							<div class="mt-1.5">
								<Input type="number" bind:value={prepCost} placeholder="$0.00" class="text-right" />
							</div>
						</div>
					</div>
				</div>
			</div>

			<footer class="mt-8 grid grid-cols-2 gap-3 px-6 pb-6">
				<Dialog.Close>
					<Button variant="outline" size="lg" class="w-full">Cancel</Button>
				</Dialog.Close>
				<Button size="lg" class="w-full" onclick={confirmPrepare} loading={preparingOrder}>
					Prepare Shipment
				</Button>
			</footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- ── Ship Confirmation Dialog ───────────────────────────────── -->
<Dialog.Root bind:open={shipConfirmOpen}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 max-h-[90vh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] overflow-hidden rounded-lg border bg-background shadow-lg"
		>
			<header class="flex items-start justify-between gap-4 px-6 py-5">
				<div class="min-w-0">
					<Dialog.Title class="text-lg font-medium">Ship Order</Dialog.Title>
					<Dialog.Description class="sr-only">
						Confirm shipment for order {order.order_number}
					</Dialog.Description>
					<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
						<span class="font-mono font-medium">{order.order_number}</span>
						<span class="text-muted-foreground">{order.accounts?.business_name ?? '—'}</span>
						<span class="font-medium">{fmt.format(Number(order.total_amount))}</span>
					</div>
				</div>
				<Dialog.Close
					type="button"
					class="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</Dialog.Close>
			</header>

			<div class="space-y-5 px-6 py-5">
				<!-- Shipment details -->
				<div>
					<div class="text-sm font-medium">Shipment Details</div>
					<p class="mt-1 text-sm text-muted-foreground">
						Review and update before marking as shipped. Empty fields can still be updated after
						shipping.
					</p>
					<div class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div>
							<div class="text-sm text-muted-foreground">Carrier</div>
							<div class="mt-1.5">
								<SelectField
									items={carrierItems}
									bind:value={shipConfirmCarrier}
									placeholder="Select carrier"
									class="w-full"
								/>
							</div>
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Tracking number</div>
							<div class="mt-1.5">
								<Input bind:value={shipConfirmTracking} placeholder="Enter tracking number" />
							</div>
						</div>
						<div>
							<div class="text-sm text-muted-foreground">Shipping cost</div>
							<div class="mt-1.5">
								<Input
									type="number"
									bind:value={shipConfirmCost}
									placeholder="$0.00"
									class="text-right"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<footer class="flex items-center justify-end gap-3 px-6 py-4">
				<Dialog.Close
					type="button"
					class="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
				>
					Cancel
				</Dialog.Close>
				<Button onclick={confirmShip} loading={shippingOrder}>Ship Order</Button>
			</footer>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<!-- Send to Account Modal -->
<svelte:window onkeydown={handleSendKeydown} />

{#if sendOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onclick={closeSendDialog}></div>

	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-lg overflow-hidden rounded-none border bg-card shadow-xl"
			onclick={(e: MouseEvent) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-5 py-4">
				<h2 class="text-base font-semibold">Send Order to Account</h2>
				<button
					class="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					onclick={closeSendDialog}
					disabled={sendLoading}
					aria-label="Close"
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

			{#if sendSuccess}
				<div class="p-8 text-center">
					<div
						class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-6 w-6 text-emerald-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					</div>
					<p class="text-sm font-medium">Order sent successfully!</p>
					<div class="mt-4">
						<Button variant="outline" onclick={closeSendDialog}>Close</Button>
					</div>
				</div>
			{:else}
				<!-- Form -->
				<div class="space-y-4 p-5">
					<div class="space-y-2">
						<Label for="send-to">To</Label>
						<Input
							id="send-to"
							type="email"
							bind:value={sendTo}
							placeholder="recipient@example.com"
						/>
					</div>
					<div class="space-y-2">
						<Label for="send-subject">Subject</Label>
						<Input id="send-subject" bind:value={sendSubject} />
					</div>
					<div class="space-y-2">
						<Label for="send-body">Message</Label>
						<textarea
							id="send-body"
							bind:value={sendBody}
							rows="6"
							class="flex w-full resize-none rounded-none border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
						></textarea>
					</div>

					<!-- Brand assets checkboxes -->
					{#if brandAssets.length > 0}
						<div class="space-y-2">
							<Label>Attach brand resources</Label>
							<div class="max-h-40 space-y-1.5 overflow-y-auto rounded-none border p-3">
								{#each brandAssets as asset (asset.id)}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={selectedAssetIds.includes(asset.id)}
											onchange={() => toggleAsset(asset.id)}
											class="cursor-pointer rounded"
										/>
										<span class="truncate">{asset.name}</span>
										<span class="shrink-0 text-sm text-muted-foreground">({asset.category})</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}

					{#if sendError}
						<p class="text-sm text-destructive">{sendError}</p>
					{/if}
				</div>

				<!-- Footer -->
				<div class="flex items-center justify-end gap-3 border-t px-5 py-4">
					<Button variant="outline" onclick={closeSendDialog} disabled={sendLoading}>Cancel</Button>
					<Button onclick={handleSendOrder} loading={sendLoading}>Send</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}
