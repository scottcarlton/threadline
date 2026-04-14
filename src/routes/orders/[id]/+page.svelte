<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import type { Order, OrderLine, OrderStatus, BrandAsset } from '$lib/types/database.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { entityContext } from '$lib/stores/entityContext.js';
	import { fetchOrderAttentionCount } from '$lib/stores/orderAttention.js';

	// Refresh the Orders nav badge as soon as this page mounts — the loader
	// just marked the order viewed; status changes below also call this.
	onMount(() => {
		fetchOrderAttentionCount();
	});

	let { data } = $props();
	const order = $derived(data.order as Order);

	// Action: focus the element once when mounted. Avoids the bare `autofocus`
	// attribute (which screen readers handle inconsistently).
	function autofocusOnMount(node: HTMLElement) {
		node.focus();
	}

	$effect(() => {
		const o = order;
		const brandName = (o as any).brands?.name ?? 'Unknown brand';
		const accountName = (o as any).accounts?.business_name ?? 'Unknown account';
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
	const brandAssets = $derived((data.brandAssets ?? []) as BrandAsset[]);
	const canEdit = $derived(
		data.isBuyer
			? order.status === 'draft' && order.created_by === data.user?.id
			: data.membership?.role !== 'guest'
	);
	const commissionOverride = $derived(data.commissionOverride as number | null);
	const repCommissionRate = $derived(data.repCommissionRate as number);
	const repName = $derived(data.repName as string | null);

	const statusLabels: Record<string, string> = {
		draft: 'Draft',
		submitted: 'Submitted',
		confirmed: 'Confirmed',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};

	const statusColors: Record<string, string> = {
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

	// Brand-side federated view only supports confirming a submitted order; cancel/cancel-rep-only
	// transitions stay with the rep side. Ship/deliver are also brand-side actions though.
	const brandAllowedNext: Record<string, OrderStatus[]> = {
		submitted: ['confirmed'],
		confirmed: ['shipped'],
		shipped: ['delivered']
	};
	const nextStatuses = $derived(
		isFederatedView
			? (brandAllowedNext[order.status] ?? [])
			: (statusFlow[order.status] ?? [])
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
		const timestampField: Record<string, string> = {
			submitted: 'submitted_at',
			confirmed: 'confirmed_at',
			shipped: 'shipped_at',
			delivered: 'delivered_at',
			cancelled: 'cancelled_at'
		};

		const updateData: Record<string, unknown> = {
			status: newStatus,
			updated_at: new Date().toISOString()
		};
		if (timestampField[newStatus]) {
			updateData[timestampField[newStatus]] = new Date().toISOString();
		}

		await supabase.from('orders').update(updateData).eq('id', order.id);
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
	const commissionRate = $derived(commissionOverride ?? order.brands?.commission_rate ?? 0);
	const brandCommissionOnTotal = $derived((Number(order.total_amount) * commissionRate) / 100);
	const brandCommissionOnShipped = $derived(
		order.shipped_amount != null ? (Number(order.shipped_amount) * commissionRate) / 100 : null
	);
	const repCommissionOnTotal = $derived((Number(order.total_amount) * repCommissionRate) / 100);
	const repCommissionOnShipped = $derived(
		order.shipped_amount != null ? (Number(order.shipped_amount) * repCommissionRate) / 100 : null
	);

	// Expected ship date
	let editingShipDate = $state(false);
	let shipDateValue = $state('');
	let savingShipDate = $state(false);

	function startEditShipDate() {
		shipDateValue = order.expected_ship_date ?? '';
		editingShipDate = true;
	}

	async function saveShipDate() {
		savingShipDate = true;
		await supabase
			.from('orders')
			.update({ expected_ship_date: shipDateValue || null, updated_at: new Date().toISOString() })
			.eq('id', order.id);
		savingShipDate = false;
		editingShipDate = false;
		invalidateAll();
	}

	// Notes editing
	let editingNotes = $state(false);
	let notesValue = $state('');
	let savingNotes = $state(false);

	function startEditNotes() {
		notesValue = order.notes ?? '';
		editingNotes = true;
	}

	async function saveNotes() {
		savingNotes = true;
		await supabase
			.from('orders')
			.update({ notes: notesValue || null, updated_at: new Date().toISOString() })
			.eq('id', order.id);
		savingNotes = false;
		editingNotes = false;
		invalidateAll();
	}

	// Line item editing — bulk edit mode
	let editMode = $state(false);
	let editedQtys = $state<Record<string, number>>({});
	let savingEdits = $state(false);

	// Inline single-cell edit (double-click)
	let inlineEditId = $state('');
	let inlineEditQty = $state(0);

	function enterEditMode() {
		editedQtys = {};
		for (const line of activeLines) {
			editedQtys[line.id] = line.qty;
		}
		editMode = true;
	}

	async function exitEditMode() {
		savingEdits = true;
		for (const line of activeLines) {
			const newQty = editedQtys[line.id];
			if (newQty != null && newQty >= 1 && newQty !== line.qty) {
				await supabase
					.from('order_lines')
					.update({ qty: newQty, original_qty: line.original_qty ?? line.qty })
					.eq('id', line.id);
			}
		}
		invalidateAll();
		savingEdits = false;
		editMode = false;
		editedQtys = {};
	}

	function handleQtyDblClick(line: OrderLine) {
		if (editMode) return;
		inlineEditId = line.id;
		inlineEditQty = line.qty;
	}

	async function saveInlineEdit(line: OrderLine) {
		if (inlineEditQty < 1 || inlineEditQty === line.qty) {
			inlineEditId = '';
			return;
		}
		await supabase
			.from('order_lines')
			.update({ qty: inlineEditQty, original_qty: line.original_qty ?? line.qty })
			.eq('id', line.id);
		inlineEditId = '';
		invalidateAll();
	}

	function handleInlineKeydown(e: KeyboardEvent, line: OrderLine) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveInlineEdit(line);
		}
		if (e.key === 'Escape') {
			inlineEditId = '';
		}
	}

	// Add new line item
	let addingLine = $state(false);
	let newStyleNumber = $state('');
	let newDescription = $state('');
	let newColor = $state('');
	let newSize = $state('');
	let newQty = $state(1);
	let newUnitPrice = $state('');
	let savingNewLine = $state(false);

	function resetNewLine() {
		newStyleNumber = '';
		newDescription = '';
		newColor = '';
		newSize = '';
		newQty = 1;
		newUnitPrice = '';
		addingLine = false;
	}

	async function saveNewLine() {
		const price = parseFloat(newUnitPrice);
		if (newQty < 1 || isNaN(price) || price < 0) return;
		savingNewLine = true;
		const maxSort = activeLines.reduce((max, l) => Math.max(max, l.sort_order), 0);
		await supabase.from('order_lines').insert({
			order_id: order.id,
			style_number: newStyleNumber || null,
			description: newDescription || null,
			color: newColor || null,
			size: newSize || null,
			qty: newQty,
			unit_price: price,
			sort_order: maxSort + 1
		});
		savingNewLine = false;
		resetNewLine();
		invalidateAll();
	}

	// Remove line
	let removingLineId = $state('');
	let removeReason = $state('');
	let savingRemove = $state(false);

	function startRemoveLine(lineId: string) {
		removingLineId = lineId;
		removeReason = '';
	}

	async function confirmRemoveLine() {
		if (!removeReason.trim()) return;
		savingRemove = true;
		await supabase
			.from('order_lines')
			.update({
				removed_at: new Date().toISOString(),
				removed_reason: removeReason.trim()
			})
			.eq('id', removingLineId);
		savingRemove = false;
		removingLineId = '';
		invalidateAll();
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

	// ── History / audit trail ────────────────────────────────────────────────
	type AuditRow = {
		id: string;
		order_id: string;
		actor_id: string | null;
		event_type:
			| 'order_created'
			| 'status_changed'
			| 'order_cancelled'
			| 'field_changed'
			| 'line_added'
			| 'line_removed'
			| 'line_changed';
		field: string | null;
		before_value: unknown;
		after_value: unknown;
		created_at: string;
		actor?: { display_name: string | null } | null;
	};
	const audits = $derived((data.audits ?? []) as AuditRow[]);

	const fieldLabels: Record<string, string> = {
		status: 'Status',
		expected_ship_date: 'Complete ship',
		start_ship_date: 'Start ship',
		delivery_id: 'Delivery',
		location_id: 'Location',
		account_id: 'Account',
		notes: 'Notes',
		cancelled_reason: 'Cancel reason'
	};

	function formatAuditValue(v: unknown): string {
		if (v === null || v === undefined) return '—';
		if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
		if (typeof v === 'object') {
			const o = v as Record<string, unknown>;
			// Line snapshot
			if ('style_number' in o || 'qty' in o) {
				const parts: string[] = [];
				if (o.style_number) parts.push(String(o.style_number));
				const variant = [o.color, o.size].filter(Boolean).join(' / ');
				if (variant) parts.push(variant);
				if (typeof o.qty === 'number') parts.push(`qty ${o.qty}`);
				if (typeof o.unit_price === 'number' && o.unit_price > 0)
					parts.push(`$${Number(o.unit_price).toFixed(2)}`);
				return parts.join(' · ') || '—';
			}
			return JSON.stringify(o);
		}
		return '—';
	}

	function auditTitle(a: AuditRow): string {
		switch (a.event_type) {
			case 'order_created':
				return 'Order created';
			case 'order_cancelled':
				return 'Order cancelled';
			case 'status_changed':
				return `Status → ${formatAuditValue(a.after_value)}`;
			case 'field_changed': {
				const label = a.field ? (fieldLabels[a.field] ?? a.field) : 'Field';
				return `${label} updated`;
			}
			case 'line_added':
				return 'Line added';
			case 'line_removed':
				return 'Line removed';
			case 'line_changed':
				return 'Line changed';
		}
	}

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

	async function postComment() {
		if (!commentBody.trim()) return;
		postingComment = true;
		await supabase.from('order_comments').insert({
			order_id: order.id,
			author_id: data.user?.id,
			body: commentBody.trim(),
			source_org_id: data.organization?.id ?? null
		});
		commentBody = '';
		postingComment = false;
		invalidateAll();
	}

	async function deleteComment(id: string) {
		await supabase.from('order_comments').delete().eq('id', id);
		invalidateAll();
	}

	// Clone order
	let cloning = $state(false);

	async function handleCloneOrder() {
		cloning = true;
		try {
			const res = await fetch(`/api/orders/${order.id}/clone`, { method: 'POST' });
			if (res.ok) {
				const { id } = await res.json();
				goto(`/orders/${id}`);
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
		sendTo = (order.accounts as any)?.contact_email ?? '';
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

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/orders"><LongArrow direction="left" /> Back</Button>
			<h1 class="font-mono text-3xl">{order.order_number}</h1>
			{#if order.order_type === 'note'}
				<Badge variant="outline">Note</Badge>
			{:else}
				<Badge variant={(statusColors[order.status] as any) ?? 'secondary'}
					>{statusLabels[order.status] ?? order.status}</Badge
				>
			{/if}
		</div>
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
			{#if canEdit && order.order_type !== 'note' && nextStatuses.length > 0}
				{#each nextStatuses as nextStatus}
					{#if nextStatus === 'cancelled'}
						<Button size="sm" variant="destructive" onclick={() => (cancelOpen = true)}>
							Cancel
						</Button>
					{:else}
						<Button size="sm" onclick={() => updateStatus(nextStatus)}>
							{nextStatus === 'submitted'
								? 'Submit'
								: nextStatus === 'confirmed'
									? 'Confirm'
									: nextStatus === 'shipped'
										? 'Ship'
										: 'Mark Delivered'}
						</Button>
					{/if}
				{/each}
			{/if}
		</div>
	</div>

	<!-- Rep info banner (brand-side federated view) -->
	{#if isFederatedView}
		<div class="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
			<div class="flex items-center gap-3">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						class="h-5 w-5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
						/>
					</svg>
				</div>
				<div>
					<div class="text-sm text-muted-foreground">From rep</div>
					<div class="font-semibold">
						{federation?.sourceOrg?.name ?? 'Rep org'}
						{#if federation?.repDisplayName}
							<span class="ml-1 font-normal text-muted-foreground">
								· {federation.repDisplayName}
							</span>
						{/if}
					</div>
				</div>
			</div>
			<div class="text-sm text-muted-foreground">Federated order</div>
		</div>
	{/if}

	<!-- Status timeline -->
	{#if order.order_type !== 'note' && order.status !== 'cancelled'}
		<div class="flex items-center gap-1">
			{#each timeline as step, i}
				{@const isComplete = step.date !== null}
				{@const isCurrent = step.status === order.status}
				<div class="flex items-center gap-1">
					<div class="flex flex-col items-center">
						<div
							class="flex h-6 w-6 items-center justify-center rounded-full text-xs {isComplete
								? 'bg-primary text-primary-foreground'
								: isCurrent
									? 'border-2 border-primary'
									: 'border border-muted-foreground/30'}"
						>
							{#if isComplete}✓{/if}
						</div>
						<span class="mt-1 text-xs text-muted-foreground">{step.label}</span>
					</div>
					{#if i < timeline.length - 1}
						<div
							class="mb-5 h-px w-12 {isComplete ? 'bg-primary' : 'bg-muted-foreground/30'}"
						></div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Order details -->
	<div class="grid gap-4 sm:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Order Details</CardTitle>
			</CardHeader>
			<CardContent>
				{@const monthNames = [
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
				]}
				{@const showDateData = (order as any).show_dates}
				{@const sourceDisplay =
					showDateData?.shows?.name ?? (order as any).source_types?.name ?? null}
				{@const sourceLocation = showDateData
					? [showDateData.city, showDateData.state].filter(Boolean).join(', ')
					: null}
				{@const deliveryData = (order as any).season_deliveries}
				{@const createdByName = (order as any).profiles?.display_name ?? null}
				<dl class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
					<div>
						<dt class="text-xs text-muted-foreground">Account</dt>
						<dd class="mt-0.5">
							<a href="/accounts/{order.account_id}" class="hover:underline"
								>{order.accounts?.business_name}</a
							>
						</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Brand</dt>
						<dd class="mt-0.5">
							<a href="/brands/{order.brand_id}" class="hover:underline">{order.brands?.name}</a>
						</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Season</dt>
						<dd class="mt-0.5">{seasonLabel()}</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Source</dt>
						<dd class="mt-0.5">
							{#if sourceDisplay}
								<span>{sourceDisplay}</span>
								{#if showDateData}
									<p class="font-mono text-xs text-muted-foreground">
										{monthNames[showDateData.month - 1]} · {sourceLocation}
									</p>
								{/if}
							{:else}
								<span class="text-muted-foreground/50">—</span>
							{/if}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Ship Window</dt>
						<dd class="mt-0.5">
							{#if deliveryData?.delivery_month}
								{monthNames[deliveryData.delivery_month - 1]} 1 — {order.expected_ship_date
									? `${monthNames[new Date(order.expected_ship_date + 'T00:00:00').getMonth()]} ${new Date(order.expected_ship_date + 'T00:00:00').getDate()}`
									: '—'}
							{:else if order.expected_ship_date}
								{new Date(order.expected_ship_date + 'T00:00:00').toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							{:else}
								<span class="text-muted-foreground/50">—</span>
							{/if}
							{#if canEdit}
								<button
									class="ml-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
									onclick={startEditShipDate}
								>
									{order.expected_ship_date ? 'Edit' : 'Set'}
								</button>
							{/if}
							{#if editingShipDate}
								<div class="mt-1 flex items-center gap-2">
									<input
										type="date"
										bind:value={shipDateValue}
										class="h-8 rounded-md border border-input bg-background px-2 text-sm"
									/>
									<button
										class="text-xs text-primary hover:underline"
										onclick={saveShipDate}
										disabled={savingShipDate}>{savingShipDate ? '...' : 'Save'}</button
									>
									<button
										class="text-xs text-muted-foreground hover:underline"
										onclick={() => (editingShipDate = false)}>Cancel</button
									>
								</div>
							{/if}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Shipped</dt>
						<dd class="mt-0.5">
							{#if order.shipped_at}
								{new Date(order.shipped_at).toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							{:else}
								<span class="text-muted-foreground/50">—</span>
							{/if}
						</dd>
					</div>
					<div class="col-span-2 border-t pt-3">
						<dt class="text-xs text-muted-foreground">Created</dt>
						<dd class="mt-0.5">
							{#if createdByName}<span>{createdByName}</span>{/if}
							<p class="font-mono text-xs text-muted-foreground">
								{new Date(order.created_at).toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</p>
						</dd>
					</div>
				</dl>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="font-mono text-base">Order Total</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="font-mono text-3xl font-bold">{fmt.format(Number(order.total_amount))}</p>
				<p class="mt-1 text-sm text-muted-foreground">
					{activeLines.length} line item{activeLines.length !== 1 ? 's' : ''}
				</p>

				<!-- Commission -->
				<div class="mt-4 space-y-3">
					{#if repCommissionRate > 0}
						<div class="space-y-2 rounded-md border p-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium text-muted-foreground">
									Commission ({repCommissionRate}%){repName ? ` — ${repName}` : ''}
								</span>
								<span class="text-sm font-medium">{fmt.format(repCommissionOnTotal)}</span>
							</div>
						</div>
					{/if}

					<!-- Shipped amount -->
					{#if isShippedOrDelivered}
						<div class="space-y-2 rounded-md border p-3">
							<div class="flex items-center justify-between">
								<span class="text-sm font-medium text-muted-foreground">Shipped Amount</span>
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
										<button
											type="button"
											class="cursor-pointer rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
											onclick={saveShippedAmount}
											disabled={savingShipped}
										>
											{savingShipped ? 'Saving...' : 'Save'}
										</button>
									</div>
								{/if}
							</div>
							{#if order.shipped_amount != null}
								<p class="text-sm text-muted-foreground">
									Ordered: {fmt.format(Number(order.total_amount))} → Shipped: {fmt.format(
										Number(order.shipped_amount)
									)}
								</p>
								{#if repCommissionRate > 0}
									<p class="text-sm font-medium">
										Commission: {fmt.format(repCommissionOnShipped ?? 0)}
									</p>
								{/if}
							{/if}
						</div>
					{/if}
				</div>

				<!-- Notes -->
				<div class="mt-4">
					{#if editingNotes}
						<div class="space-y-2">
							<textarea
								bind:value={notesValue}
								rows="3"
								class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								placeholder="Add notes..."
							></textarea>
							<div class="flex justify-end gap-2">
								<Button variant="outline" size="sm" onclick={() => (editingNotes = false)}
									>Cancel</Button
								>
								<Button size="sm" onclick={saveNotes} disabled={savingNotes}>
									{savingNotes ? 'Saving...' : 'Save'}
								</Button>
							</div>
						</div>
					{:else}
						<div class="rounded-md bg-muted p-3">
							<div class="flex items-center justify-between">
								<p class="text-xs font-medium text-muted-foreground">Notes</p>
								{#if canEdit}
									<button
										class="text-xs text-muted-foreground transition-colors hover:text-foreground"
										onclick={startEditNotes}
									>
										{order.notes ? 'Edit' : 'Add'}
									</button>
								{/if}
							</div>
							{#if order.notes}
								<p class="mt-1 text-sm whitespace-pre-wrap">{order.notes}</p>
							{:else}
								<p class="mt-1 text-sm text-muted-foreground">No notes</p>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Cancel reason -->
				{#if order.status === 'cancelled' && order.cancelled_reason}
					<div class="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-3">
						<p class="text-xs font-medium text-destructive">Cancellation Reason</p>
						<p class="mt-1 text-sm">{order.cancelled_reason}</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>

	<!-- Line items -->
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle class="text-base">Line Items</CardTitle>
				{#if canEdit && order.status !== 'cancelled' && order.status !== 'delivered'}
					<div class="flex gap-2">
						{#if editMode}
							<Button size="sm" onclick={exitEditMode} disabled={savingEdits}>
								{savingEdits ? 'Saving...' : 'Done'}
							</Button>
						{:else}
							{#if activeLines.length > 0}
								<Button variant="outline" size="sm" onclick={enterEditMode}>Edit Items</Button>
							{/if}
							{#if !addingLine}
								<Button variant="outline" size="sm" onclick={() => (addingLine = true)}
									>Add Item</Button
								>
							{/if}
						{/if}
					</div>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			{#if activeLines.length === 0 && removedLines.length === 0 && !addingLine}
				<p class="text-sm text-muted-foreground">No line items.</p>
			{:else}
				<div class="rounded-md border">
					<table class="w-full">
						<thead>
							<tr class="border-b bg-muted/50">
								<th class="px-3 py-2 text-left text-xs font-medium">Item</th>
								<th class="px-3 py-2 text-left text-xs font-medium">Color</th>
								<th class="px-3 py-2 text-left text-xs font-medium">Size</th>
								<th class="px-3 py-2 text-right text-xs font-medium">Qty</th>
								<th class="px-3 py-2 text-right text-xs font-medium">Unit Price</th>
								<th class="px-3 py-2 text-right text-xs font-medium">Total</th>
								{#if canEdit && order.status !== 'cancelled' && order.status !== 'delivered'}
									<th class="px-3 py-2 text-right text-xs font-medium"></th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each activeLines as line}
								<tr class="group border-b">
									<td class="px-3 py-2">
										<span class="font-mono text-sm">{line.style_number ?? '—'}</span>
										{#if line.description}
											<p class="text-xs text-muted-foreground">{line.description}</p>
										{/if}
									</td>
									<td class="px-3 py-2 text-sm">{line.color ?? '—'}</td>
									<td class="px-3 py-2 text-sm">{line.size ?? '—'}</td>
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<td
										class="px-3 py-2 text-right text-sm {!editMode &&
										canEdit &&
										order.status !== 'cancelled' &&
										order.status !== 'delivered'
											? 'cursor-pointer rounded hover:bg-muted/50'
											: ''}"
										ondblclick={() => {
											if (
												!editMode &&
												canEdit &&
												order.status !== 'cancelled' &&
												order.status !== 'delivered'
											)
												handleQtyDblClick(line);
										}}
									>
										{#if editMode}
											<input
												type="number"
												min="1"
												bind:value={editedQtys[line.id]}
												class="h-7 w-16 rounded-md border border-input bg-background px-2 text-right text-sm"
											/>
										{:else if inlineEditId === line.id}
											<input
												type="number"
												min="1"
												bind:value={inlineEditQty}
												onblur={() => saveInlineEdit(line)}
												onkeydown={(e) => handleInlineKeydown(e, line)}
												class="h-7 w-16 rounded-md border border-input bg-background px-2 text-right text-sm"
												use:autofocusOnMount
											/>
										{:else}
											{#if line.original_qty && line.original_qty !== line.qty}
												<span class="mr-1 text-muted-foreground line-through"
													>{line.original_qty}</span
												>
											{/if}
											{line.qty}
										{/if}
									</td>
									<td class="px-3 py-2 text-right font-mono text-sm"
										>{fmt.format(Number(line.unit_price))}</td
									>
									<td class="px-3 py-2 text-right font-mono text-sm font-medium"
										>{fmt.format(Number(line.line_total))}</td
									>
									{#if canEdit && order.status !== 'cancelled' && order.status !== 'delivered'}
										<td class="px-3 py-2 text-right">
											<button
												class="rounded px-2 py-1 text-xs text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
												onclick={() => startRemoveLine(line.id)}
											>
												Remove
											</button>
										</td>
									{/if}
								</tr>
							{/each}

							<!-- Add new line inline -->
							{#if addingLine}
								<tr class="border-b bg-muted/20">
									<td class="px-3 py-2">
										<input
											type="text"
											bind:value={newStyleNumber}
											placeholder="Style #"
											class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
										/>
									</td>
									<td class="px-3 py-2">
										<input
											type="text"
											bind:value={newDescription}
											placeholder="Description"
											class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
										/>
									</td>
									<td class="px-3 py-2">
										<input
											type="text"
											bind:value={newColor}
											placeholder="Color"
											class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
										/>
									</td>
									<td class="px-3 py-2">
										<input
											type="text"
											bind:value={newSize}
											placeholder="Size"
											class="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
										/>
									</td>
									<td class="px-3 py-2">
										<input
											type="number"
											min="1"
											bind:value={newQty}
											class="h-8 w-full rounded-md border border-input bg-background px-2 text-right text-sm"
										/>
									</td>
									<td class="px-3 py-2">
										<input
											type="number"
											step="0.01"
											min="0"
											bind:value={newUnitPrice}
											placeholder="0.00"
											class="h-8 w-full rounded-md border border-input bg-background px-2 text-right text-sm"
										/>
									</td>
									<td class="px-3 py-2"></td>
									<td class="px-3 py-2 text-right">
										<div class="flex items-center justify-end gap-1">
											<Button
												size="sm"
												onclick={saveNewLine}
												disabled={savingNewLine || newQty < 1 || !newUnitPrice}
											>
												{savingNewLine ? '...' : 'Add'}
											</Button>
											<Button variant="outline" size="sm" onclick={resetNewLine}>Cancel</Button>
										</div>
									</td>
								</tr>
							{/if}
						</tbody>
						<tfoot>
							<tr class="bg-muted/50">
								<td
									colspan={canEdit && order.status !== 'cancelled' && order.status !== 'delivered'
										? 7
										: 6}
									class="px-3 py-2 text-right font-mono text-sm font-medium">Order Total</td
								>
								<td class="px-3 py-2 text-right font-mono text-sm font-bold"
									>{fmt.format(Number(order.total_amount))}</td
								>
							</tr>
						</tfoot>
					</table>
				</div>
			{/if}

			<!-- Removed lines -->
			{#if removedLines.length > 0}
				<div class="mt-4">
					<p class="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
						Removed Items
					</p>
					<div class="rounded-md border border-dashed">
						<table class="w-full">
							<tbody>
								{#each removedLines as line}
									<tr class="border-b opacity-60 last:border-0">
										<td class="px-3 py-2 line-through">
											<span class="font-mono text-sm">{line.style_number ?? '—'}</span>
											{#if line.description}
												<p class="text-xs text-muted-foreground">{line.description}</p>
											{/if}
										</td>
										<td class="px-3 py-2 text-sm">{line.color ?? '—'} / {line.size ?? '—'}</td>
										<td class="px-3 py-2 text-right text-sm"
											>{line.qty} x {fmt.format(Number(line.unit_price))}</td
										>
										<td class="px-3 py-2 text-sm text-muted-foreground">{line.removed_reason}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>

<!-- Remove Line Modal -->
{#if removingLineId}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
		onclick={() => (removingLineId = '')}
	></div>
	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-md rounded-none border bg-card p-6 shadow-xl"
			onclick={(e: MouseEvent) => e.stopPropagation()}
		>
			<h2 class="text-base font-semibold">Remove Line Item</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Please provide a reason for removing this item.
			</p>
			<textarea
				bind:value={removeReason}
				rows="3"
				placeholder="Reason for removal..."
				class="mt-4 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
			></textarea>
			<div class="mt-4 flex justify-end gap-2">
				<Button variant="outline" onclick={() => (removingLineId = '')}>Cancel</Button>
				<Button
					variant="destructive"
					onclick={confirmRemoveLine}
					disabled={savingRemove || !removeReason.trim()}
				>
					{savingRemove ? 'Removing...' : 'Remove Item'}
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Comments -->
<Card>
	<CardHeader>
		<CardTitle class="text-base">Notes & Comments</CardTitle>
	</CardHeader>
	<CardContent>
		{#if comments.length > 0}
			<div class="mb-4 space-y-3">
				{#each comments as comment}
					<div class="flex items-start gap-3">
						<div
							class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
						>
							{(comment.profiles?.display_name ?? '?')[0].toUpperCase()}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium"
									>{comment.profiles?.display_name ?? 'Unknown'}</span
								>
								{#if comment.source_org?.name}
									<span
										class="inline-flex rounded-full bg-muted px-2 py-0.5 text-sm text-muted-foreground"
										>{comment.source_org.name}</span
									>
								{/if}
								<span class="text-sm text-muted-foreground"
									>{new Date(comment.created_at).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit'
									})}</span
								>
								{#if comment.author_id === data.user?.id}
									<button
										type="button"
										aria-label="Delete comment"
										class="text-sm text-muted-foreground hover:text-destructive"
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
							<p class="mt-0.5 text-sm text-foreground">{comment.body}</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if canEdit}
			<div class="flex gap-2">
				<Input
					class="flex-1"
					placeholder="Add a note..."
					bind:value={commentBody}
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault();
							postComment();
						}
					}}
				/>
				<Button size="sm" onclick={postComment} disabled={postingComment || !commentBody.trim()}>
					{postingComment ? 'Posting...' : 'Post'}
				</Button>
			</div>
		{/if}
	</CardContent>
</Card>

<!-- History / audit trail -->
<Card>
	<CardHeader>
		<CardTitle class="text-base">History</CardTitle>
	</CardHeader>
	<CardContent>
		{#if audits.length === 0}
			<p class="text-sm text-muted-foreground">
				No changes recorded yet. Updates to status, line items, and ship windows show up here.
			</p>
		{:else}
			<ul class="space-y-3">
				{#each audits as a (a.id)}
					<li class="flex items-start gap-3">
						<div
							class="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
						>
							{(a.actor?.display_name ?? '?')[0].toUpperCase()}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
								<span class="text-sm font-medium">{auditTitle(a)}</span>
								<span class="text-sm text-muted-foreground">
									{a.actor?.display_name ?? 'Unknown'}
								</span>
								<span class="text-sm text-muted-foreground">
									{new Date(a.created_at).toLocaleString('en-US', {
										month: 'short',
										day: 'numeric',
										hour: 'numeric',
										minute: '2-digit'
									})}
								</span>
							</div>
							{#if a.event_type === 'field_changed' || a.event_type === 'line_changed'}
								<p class="mt-0.5 text-sm text-muted-foreground">
									<span class="line-through">{formatAuditValue(a.before_value)}</span>
									<span class="mx-1">→</span>
									<span>{formatAuditValue(a.after_value)}</span>
								</p>
							{:else if a.event_type === 'line_added'}
								<p class="mt-0.5 text-sm text-muted-foreground">
									{formatAuditValue(a.after_value)}
								</p>
							{:else if a.event_type === 'line_removed'}
								<p class="mt-0.5 text-sm text-muted-foreground">
									{formatAuditValue(a.before_value)}
								</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</CardContent>
</Card>

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
								{#each brandAssets as asset}
									<label class="flex cursor-pointer items-center gap-2 text-sm">
										<input
											type="checkbox"
											checked={selectedAssetIds.includes(asset.id)}
											onchange={() => toggleAsset(asset.id)}
											class="cursor-pointer rounded"
										/>
										<span class="truncate">{asset.name}</span>
										<span class="shrink-0 text-xs text-muted-foreground">({asset.category})</span>
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
