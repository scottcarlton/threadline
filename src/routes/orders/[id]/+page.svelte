<script lang="ts">
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { Order, OrderLine, OrderStatus, BrandAsset } from '$lib/types/database.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import DateSelect from '$lib/components/ui/date-select.svelte';
	import { entityContext } from '$lib/stores/entityContext.js';
	import { fetchOrderAttentionCount } from '$lib/stores/orderAttention.js';
	import CatalogPickerModal from '$lib/components/shared/CatalogPickerModal.svelte';
	import type { CatalogCartItem } from '$lib/components/shared/catalog-picker-types.js';
	import ColorSwatch from '$lib/components/shared/ColorSwatch.svelte';
	import ColorSwatchPicker from '$lib/components/shared/ColorSwatchPicker.svelte';
	import { diffLineEdits, type DraftRowInput } from '$lib/utils/order-line-diff.js';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Dialog } from 'bits-ui';
	import { acceptedPaymentMethods, paymentMethodLabel } from '$lib/payment-methods';

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
	const removedLines = $derived(allLines.filter((l) => l.removed_at));

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
			: data.membership?.role !== 'guest'
	);
	const canModify = $derived(
		canEdit && order.status !== 'cancelled' && order.status !== 'delivered'
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
		paymentPrefValue = order.payment_preference ?? '';
	});

	const statusLabels: Record<string, string> = {
		draft: 'Draft',
		submitted: 'Submitted',
		confirmed: 'Confirmed',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};

	const statusColors: Record<
		string,
		'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'
	> = {
		draft: 'secondary',
		submitted: 'warning',
		confirmed: 'default',
		shipped: 'default',
		delivered: 'success',
		cancelled: 'destructive'
	};

	const statusFlow: Record<string, OrderStatus[]> = {
		draft: ['submitted', 'cancelled'],
		submitted: ['confirmed', 'cancelled'],
		confirmed: ['shipped', 'cancelled'],
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
		confirmed: ['shipped', 'cancelled'],
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

	let converting = $state(false);
	async function convertNoteToOrder() {
		if (!confirm('Convert this note to a draft order? You can submit it afterward.')) return;
		converting = true;
		try {
			await supabase
				.from('orders')
				.update({
					order_type: 'order',
					status: 'draft',
					updated_at: new Date().toISOString()
				})
				.eq('id', order.id);
			invalidateAll();
		} finally {
			converting = false;
		}
	}

	async function updateStatus(newStatus: OrderStatus) {
		const res = await fetch(`/api/orders/${order.id}/status`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status: newStatus })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			console.error('Status update failed:', body.error);
		}
		invalidateAll();
		fetchOrderAttentionCount();
	}

	const timeline = $derived([
		{ status: 'draft', label: 'Draft', date: order.created_at },
		{ status: 'submitted', label: 'Submitted', date: order.submitted_at },
		{ status: 'confirmed', label: 'Confirmed', date: order.confirmed_at },
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
					? 'Move to Shipped when the order leaves your warehouse.'
					: 'Move to Shipped when the order leaves the brand.';
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
	let editingShipDate = $state(false);
	let startShipValue = $state('');
	let shipDateValue = $state('');
	let savingShipDate = $state(false);

	function startEditShipDate() {
		startShipValue = order.start_ship_date ?? '';
		shipDateValue = order.expected_ship_date ?? '';
		editingShipDate = true;
	}

	async function saveShipDate() {
		savingShipDate = true;
		await supabase
			.from('orders')
			.update({
				start_ship_date: startShipValue || null,
				expected_ship_date: shipDateValue || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', order.id);
		savingShipDate = false;
		editingShipDate = false;
		invalidateAll();
	}

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

	function addColorFor(idx: number, color: string) {
		const row = draftRows[idx];
		const qty_by_size: Record<string, number> = {};
		for (const s of row.available_sizes) qty_by_size[s] = 0;
		draftRows.push({
			key: `${row.product_id}|${color}|new-${Date.now()}`,
			product_id: row.product_id,
			style_number: row.style_number,
			name: row.name,
			season_label: row.season_label,
			image_id: row.image_id,
			color,
			color_edit: color,
			unit_price: row.unit_price,
			available_sizes: row.available_sizes,
			available_colors: row.available_colors,
			qty_by_size,
			lines: [],
			to_remove: false,
			added_here: true
		});
	}

	// Soft-remove every line in a (product, color) row without entering edit
	// mode. Mirrors the saveEdits soft_remove op path. Used by the trash icon
	// on read-only rows.
	let removingRowKey = $state<string | null>(null);
	async function removeLineRow(row: LineRow) {
		if (row.lines.length === 0) return;
		removingRowKey = row.key;
		const now = new Date().toISOString();
		let failures = 0;
		for (const l of row.lines) {
			const { error } = await supabase
				.from('order_lines')
				.update({ removed_at: now, removed_reason: null })
				.eq('id', l.id);
			if (error) {
				console.error('[orders/[id] removeLineRow]', error);
				failures++;
			}
		}
		removingRowKey = null;
		if (failures > 0) {
			toast.error(`${failures} line${failures === 1 ? '' : 's'} failed to remove.`);
		} else {
			toast.success(row.lines.length === 1 ? 'Line removed' : 'Lines removed');
		}
		invalidateAll();
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

<div class="w-full space-y-6 p-6">
	<!-- ── Top bar ─────────────────────────────────────────────────────── -->
	<div class="flex items-center justify-between">
		<Button variant="ghost" size="sm" href="/orders"
			><LongArrow direction="left" /> Back to orders</Button
		>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={handleCloneOrder} disabled={cloning}>
				{#if cloning}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
					></div>
				{:else}
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
							d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
						/>
					</svg>
				{/if}
				Clone
			</Button>
			<Button variant="outline" size="sm" onclick={handleDownloadPdf} disabled={downloadingPdf}>
				{#if downloadingPdf}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground"
					></div>
				{:else}
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
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
				{/if}
				Download PDF
			</Button>
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
				Send to Account
			</Button>
			{#if canEdit && order.order_type === 'note'}
				<Button size="sm" onclick={convertNoteToOrder} disabled={converting}>
					{converting ? 'Converting…' : 'Convert to Order'}
				</Button>
			{/if}
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
			<h1 class="font-mono text-4xl font-medium tracking-tight">{order.order_number}</h1>
			{#if order.order_type === 'note'}
				<Badge variant="outline">Note</Badge>
			{:else}
				<Badge variant={statusColors[order.status] ?? 'secondary'}
					>{statusLabels[order.status] ?? order.status}</Badge
				>
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
						Created {longDate(order.created_at)}
						{#if (order.profiles?.display_name as string | undefined) ?? null}
							· by {order.profiles?.display_name}
						{/if}
					</div>
				</div>
				{#if canEdit}
					<Button onclick={convertNoteToOrder} disabled={converting}>
						{converting ? 'Converting…' : 'Convert to Order'}
					</Button>
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
					{#if canEdit && nextStatuses.length > 0 && order.status !== 'cancelled'}
						<div class="flex items-center gap-2 border-l pl-4">
							{#each nextStatuses.filter((s) => s !== 'cancelled') as nextStatus (nextStatus)}
								<Button size="sm" onclick={() => updateStatus(nextStatus)}>
									{advanceActionLabel[nextStatus] ?? statusLabels[nextStatus] ?? nextStatus}
								</Button>
							{/each}
							{#if nextStatuses.includes('cancelled')}
								<button
									type="button"
									class="px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
									onclick={() => (cancelOpen = true)}
								>
									Cancel order
								</button>
							{/if}
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
				<div class="flex flex-wrap items-center gap-10">
					<div>
						<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Ship window</div>
						<div class="mt-1.5 flex items-center gap-3">
							<span class="font-mono text-xl font-medium">
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
							<span class="font-mono text-xl font-medium">
								{shortDate(order.expected_ship_date)}
							</span>
							{#if shipWindowLength !== null}
								<span class="ml-1 text-sm text-muted-foreground/70">
									{shipWindowLength}-day window
								</span>
							{/if}
						</div>
					</div>
					{#if shipsInDays !== null}
						<div>
							<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Ships in</div>
							<div class="mt-1.5 text-sm">
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
				{#if canEdit && !editingShipDate}
					<button
						type="button"
						class="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
						onclick={startEditShipDate}
					>
						Edit window
					</button>
				{/if}
			</div>

			<!-- Inline ship-window editor (when editingShipDate) -->
			{#if editingShipDate}
				<div class="border-t bg-muted/30 px-6 py-4">
					<div class="grid gap-3 sm:grid-cols-2">
						<div>
							<div class="mb-1 text-sm text-muted-foreground">Start ship</div>
							<DateSelect value={startShipValue} onchange={(v) => (startShipValue = v)} />
						</div>
						<div>
							<div class="mb-1 text-sm text-muted-foreground">Complete ship</div>
							<DateSelect value={shipDateValue} onchange={(v) => (shipDateValue = v)} />
						</div>
					</div>
					<div class="mt-3 flex justify-end gap-2">
						<Button variant="outline" size="sm" onclick={() => (editingShipDate = false)}>
							Cancel
						</Button>
						<Button size="sm" onclick={saveShipDate} disabled={savingShipDate}>
							{savingShipDate ? 'Saving…' : 'Save'}
						</Button>
					</div>
				</div>
			{/if}
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
										<Button size="sm" onclick={saveShippedAmount} disabled={savingShipped}>
											{savingShipped ? 'Saving…' : 'Save'}
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
										disabled={savingEdits || pendingChanges === 0}
									>
										{savingEdits ? 'Saving…' : 'Save Items'}
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
									{@const unusedColors =
										draft.available_colors && draft.available_colors.length > 1
											? draft.available_colors.filter(
													(c) =>
														!draftRows.some(
															(r) =>
																!r.to_remove &&
																r.product_id === draft.product_id &&
																r.color_edit === c
														)
												)
											: []}
									<div class="px-6 py-4 {draft.to_remove ? 'bg-destructive/5' : ''}">
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
															{#if draft.color_edit}
																<span class="text-sm text-muted-foreground">
																	{draft.color_edit}
																</span>
															{/if}
														{:else}
															<ColorSwatch color={draft.color_edit} size={12} />
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
														{rowUnits === 1 ? 'unit' : 'units'} · {fmt.format(draft.unit_price)}/ea
													</div>
												</div>
												{#if draft.to_remove}
													<Button size="sm" variant="outline" onclick={() => restoreDraftRow(idx)}>
														Undo
													</Button>
												{:else}
													{#if unusedColors.length > 0}
														<ColorSwatchPicker
															value={null}
															options={unusedColors}
															onChange={(c) => c && addColorFor(idx, c)}
															triggerLabel="+ color"
														/>
													{/if}
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
												<div class="mt-3 grid grid-cols-6 gap-2">
													{#each sizesToShow as size (size)}
														{@const qty = draft.qty_by_size[size] ?? 0}
														<div
															role="group"
															aria-label="{draft.name} size {size} quantity"
															class="rounded-md border bg-muted/40 px-2 py-2 text-center transition focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground/20 hover:border-foreground/20 {qty ===
															0
																? 'border-dashed opacity-60'
																: ''}"
														>
															<div class="text-xs text-muted-foreground">{size}</div>
															<div class="mt-0.5 flex h-5 items-center justify-center gap-1">
																<button
																	type="button"
																	aria-label="Decrease {size}"
																	class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
																	disabled={qty === 0}
																	onclick={() => {
																		draftRows[idx].qty_by_size[size] = Math.max(0, qty - 1);
																	}}
																>
																	−
																</button>
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
																	class="w-8 bg-transparent text-center font-mono text-sm outline-none"
																/>
																<button
																	type="button"
																	aria-label="Increase {size}"
																	class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none"
																	onclick={() => {
																		draftRows[idx].qty_by_size[size] = qty + 1;
																	}}
																>
																	+
																</button>
															</div>
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
															draftRows[idx].qty_by_size[''] = Number.isNaN(n) ? 0 : Math.max(0, n);
														}}
														class="h-9 w-20 rounded-md border border-input bg-background px-2 text-center font-mono text-sm"
													/>
												</div>
											{/if}
										{/if}
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
														<ColorSwatch color={row.color} size={12} />
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
						{@const viewerEmail =
							(data.user as { email?: string | null } | null | undefined)?.email ?? ''}
						{@const viewerInitial = viewerEmail ? viewerEmail.charAt(0).toUpperCase() : '?'}
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
											{#if comment.source_org?.name}
												<span
													class="rounded-full border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
												>
													{comment.source_org.name}
												</span>
											{/if}
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
							{#each activity as entry (entry.id)}
								<li class="relative py-2 pl-9">
									<span class="absolute top-2.5 left-0 flex w-[27px] justify-center">
										<span
											class="h-2 w-2 rounded-full {entry.kind === 'status'
												? 'bg-emerald-500 ring-4 ring-emerald-500/20'
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
		<aside class="space-y-4 self-start lg:sticky lg:top-6">
			<div class="overflow-hidden rounded-lg border bg-muted/30">
				<div class="border-b px-5 py-4">
					<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Total</div>
					<div class="mt-1 font-mono text-3xl font-medium tracking-tight">
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

			{#if order.order_type !== 'note' && termsAgreedInfo}
				<div class="rounded-lg border bg-muted/30 p-5">
					<div class="flex items-center justify-between">
						<div class="text-xs tracking-wider text-muted-foreground/70 uppercase">Terms</div>
						{#if termsAgreedInfo.brand_terms}
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
											{termsAgreedInfo.brand_terms.title}
										</Dialog.Title>
										<Dialog.Description class="mt-1 text-sm text-muted-foreground">
											{order.brands?.name ?? 'Brand'} · v{termsAgreedInfo.brand_terms.version}
										</Dialog.Description>
										<div class="mt-5 text-sm whitespace-pre-wrap">
											{termsAgreedInfo.brand_terms.body}
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
						{/if}
					</div>
					<div class="mt-2 text-sm">
						{order.brands?.name ?? 'Brand'} · {seasonLabel()}{termsAgreedInfo.brand_terms
							? ` v${termsAgreedInfo.brand_terms.version}`
							: ''}
					</div>
					{#if termsAgreedInfo.agreed_by || termsAgreedInfo.agreed_at}
						<div class="mt-0.5 text-sm text-muted-foreground/70">
							Agreed
							{#if termsAgreedInfo.agreed_by}
								by {termsAgreedInfo.agreed_by}{/if}
							{#if termsAgreedInfo.agreed_at}
								· {longDate(termsAgreedInfo.agreed_at as string)}{/if}
						</div>
					{/if}
				</div>
			{/if}
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
					<Button onclick={handleSendOrder} disabled={sendLoading}>
						{#if sendLoading}
							<div
								class="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground"
							></div>
							Sending...
						{:else}
							Send
						{/if}
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}
