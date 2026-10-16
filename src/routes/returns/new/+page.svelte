<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import {
		createReturnSchema,
		RETURN_REASON_CODES,
		RETURN_REASON_LABELS
	} from '$lib/schemas/return-authorization.js';
	import OrderPickerModal, { type PickerOrder } from './OrderPickerModal.svelte';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const formInitial = data.form;

	const { form, errors, enhance, submitting } = superForm(formInitial, {
		validators: zod4Client(createReturnSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		resetForm: false,
		onUpdated: ({ form: f }) => {
			const msg = f.message as { type: 'success'; returnId: string; status: string } | undefined;
			if (msg?.type === 'success') {
				toast.success(msg.status === 'approved' ? 'Return logged.' : 'Return requested.');
				// The detail route arrives with SCO-185; until then the list is
				// where a new return is visible.
				goto(resolve('/returns'));
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Could not create the return.');
		}
	});

	const reasonItems = RETURN_REASON_CODES.map((c) => ({
		value: c,
		label: RETURN_REASON_LABELS[c]
	}));
	const brandItems = $derived(data.brands.map((b) => ({ value: b.id, label: b.name })));
	const accountItems = $derived(
		data.accounts.map((a) => ({ value: a.id, label: a.business_name }))
	);

	let pickerOpen = $state(false);
	let selectedOrder = $state<PickerOrder | null>(null);
	let loadingLines = $state(false);

	type OrderLineOption = {
		orderLineId: string;
		variantId: string | null;
		styleNumber: string;
		description: string;
		color: string;
		size: string;
		orderedQty: number;
		remainingQty: number;
		unitPrice: number;
	};
	let orderLines = $state<OrderLineOption[]>([]);
	let picked = $state<Record<string, number>>({});

	const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	// Only a brand user sees more than one brand's orders in the picker, so for
	// everyone else the brand column is the thing they already own.
	const showBrandColumn = $derived(new Set(data.orders.map((o) => o.brandId)).size > 1);

	async function chooseOrder(order: PickerOrder) {
		selectedOrder = order;
		$form.orderId = order.id;
		picked = {};
		orderLines = [];
		$form.lines = [];
		loadingLines = true;
		try {
			const res = await fetch(`/returns/new/lines?order=${order.id}`);
			if (!res.ok) throw new Error(await res.text());
			orderLines = (await res.json()).lines as OrderLineOption[];
		} catch {
			toast.error('Could not load the items on that order.');
		} finally {
			loadingLines = false;
		}
	}

	/**
	 * Mirror the picked quantities into the form's `lines`.
	 *
	 * Called from the handlers rather than an `$effect`. An effect here reads
	 * `$form` and writes `$form.lines`, which re-triggers itself:
	 * `effect_update_depth_exceeded`, and the whole page stops responding.
	 */
	function syncOrderLines() {
		$form.lines = orderLines
			.filter((l) => (picked[l.orderLineId] ?? 0) > 0)
			.map((l) => ({
				orderLineId: l.orderLineId,
				variantId: l.variantId,
				styleNumber: l.styleNumber,
				description: l.description,
				color: l.color,
				size: l.size,
				qty: picked[l.orderLineId],
				unitPrice: l.unitPrice,
				reasonCode: null
			}));
	}

	function setQty(line: OrderLineOption, raw: string) {
		const n = Math.floor(Number(raw));
		if (!Number.isFinite(n) || n <= 0) {
			const rest = { ...picked };
			delete rest[line.orderLineId];
			picked = rest;
		} else {
			picked = { ...picked, [line.orderLineId]: Math.min(n, line.remainingQty) };
		}
		syncOrderLines();
	}

	// Deep link from order detail (/returns/new?order=…). The server puts the id
	// on the form, but the picker's own state lives on the client, so without
	// this the page arrives claiming no order is chosen while the form says
	// otherwise -- and submitting would post lines that were never shown.
	onMount(() => {
		const preselected = $form.orderId;
		if (!preselected) return;
		const match = data.orders.find((o) => o.id === preselected);
		if (match) chooseOrder(match);
	});

	function addFreeLine() {
		$form.lines = [
			...$form.lines,
			{
				orderLineId: null,
				variantId: null,
				styleNumber: '',
				description: '',
				color: '',
				size: '',
				qty: 1,
				unitPrice: 0,
				reasonCode: null
			}
		];
	}

	function removeFreeLine(index: number) {
		$form.lines = $form.lines.filter((_, i) => i !== index);
	}

	function switchMode(mode: 'order' | 'free') {
		$form.mode = mode;
		$form.lines = [];
		picked = {};
		orderLines = [];
		selectedOrder = null;
		$form.orderId = null;
		if (mode === 'free') addFreeLine();
	}

	const selectedTotal = $derived(
		$form.lines.reduce((sum, l) => sum + (l.qty || 0) * (l.unitPrice || 0), 0)
	);

	function lineError(index: number, field: 'qty' | 'styleNumber' | 'unitPrice'): string | null {
		const all = $errors.lines as unknown as
			| Record<number, Record<string, string[] | undefined>>
			| undefined;
		return all?.[index]?.[field]?.[0] ?? null;
	}
</script>

<svelte:head><title>New return · Threadline</title></svelte:head>

<div class="mx-auto w-full max-w-3xl px-4 py-8">
	<h1 class="text-lg font-semibold">New return</h1>
	<p class="mt-1 text-sm text-muted-foreground">Log what is coming back, and why.</p>

	<form method="POST" use:enhance class="mt-8 space-y-8">
		<!-- Mode -->
		<div class="flex gap-2">
			<Button
				type="button"
				variant={$form.mode === 'order' ? 'default' : 'outline'}
				onclick={() => switchMode('order')}
			>
				From an order
			</Button>
			<Button
				type="button"
				variant={$form.mode === 'free' ? 'default' : 'outline'}
				onclick={() => switchMode('free')}
			>
				Enter items by hand
			</Button>
		</div>

		{#if $form.mode === 'order'}
			<section class="space-y-3">
				<h2 class="text-sm font-semibold">Order</h2>
				{#if selectedOrder}
					<div class="flex items-center justify-between gap-4 rounded-lg border p-4">
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{selectedOrder.orderNumber}</p>
							<p class="mt-0.5 truncate text-sm text-muted-foreground">
								{[selectedOrder.accountName, showBrandColumn ? selectedOrder.brandName : null]
									.filter(Boolean)
									.join(' · ')}
							</p>
						</div>
						<Button type="button" variant="outline" onclick={() => (pickerOpen = true)}>
							Change
						</Button>
					</div>
				{:else}
					<Button type="button" variant="outline" onclick={() => (pickerOpen = true)}>
						Choose an order
					</Button>
				{/if}
				{#if $errors.orderId}
					<p class="text-sm text-destructive">{$errors.orderId[0]}</p>
				{/if}
			</section>

			{#if selectedOrder}
				<section class="space-y-3">
					<h2 class="text-sm font-semibold">Items</h2>
					{#if loadingLines}
						<p class="text-sm text-muted-foreground">Loading items…</p>
					{:else if orderLines.length === 0}
						<p class="text-sm text-muted-foreground">This order has no items.</p>
					{:else}
						<div class="space-y-2 rounded-lg border p-2">
							{#each orderLines as line, i (line.orderLineId)}
								<div class="flex items-center gap-4 rounded-lg px-3 py-2.5">
									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium">
											{line.styleNumber || line.description || 'Item'}
										</p>
										<p class="mt-0.5 truncate text-sm text-muted-foreground">
											{[line.color, line.size].filter(Boolean).join(' · ')}
											{#if line.remainingQty < line.orderedQty}
												· {line.remainingQty} of {line.orderedQty} left to return
											{/if}
										</p>
									</div>
									<p class="shrink-0 text-right text-sm tabular-nums">
										{money.format(line.unitPrice)}
									</p>
									<div class="w-24 shrink-0">
										<Input
											type="number"
											min="0"
											max={line.remainingQty}
											disabled={line.remainingQty === 0}
											placeholder="0"
											value={picked[line.orderLineId] ?? ''}
											oninput={(e) => setQty(line, e.currentTarget.value)}
										/>
									</div>
								</div>
								{#if lineError(i, 'qty')}
									<p class="px-3 text-sm text-destructive">{lineError(i, 'qty')}</p>
								{/if}
							{/each}
						</div>
					{/if}
					{#if $errors.lines && typeof $errors.lines === 'object' && '_errors' in $errors.lines}
						<p class="text-sm text-destructive">
							{($errors.lines as { _errors?: string[] })._errors?.[0]}
						</p>
					{/if}
				</section>
			{/if}
		{:else}
			<section class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for="brand">Brand</Label>
					<SelectField
						items={brandItems}
						placeholder="Choose a brand"
						bind:value={() => $form.brandId ?? '', (v) => ($form.brandId = v || null)}
					/>
					{#if $errors.brandId}
						<p class="text-sm text-destructive">{$errors.brandId[0]}</p>
					{/if}
				</div>
				<div class="space-y-2">
					<Label for="account">Account</Label>
					<SelectField
						items={accountItems}
						placeholder="Choose an account"
						bind:value={() => $form.accountId ?? '', (v) => ($form.accountId = v || null)}
					/>
					{#if $errors.accountId}
						<p class="text-sm text-destructive">{$errors.accountId[0]}</p>
					{/if}
				</div>
			</section>

			<section class="space-y-3">
				<div class="flex items-center justify-between">
					<h2 class="text-sm font-semibold">Items</h2>
					<Button type="button" variant="outline" onclick={addFreeLine}>Add item</Button>
				</div>
				<div class="space-y-2 rounded-lg border p-2">
					{#each $form.lines, i}
						<div class="rounded-lg px-3 py-2.5">
							<div class="grid gap-3 sm:grid-cols-[1fr_100px_100px_90px_110px_auto]">
								<Input placeholder="Style number" bind:value={$form.lines[i].styleNumber} />
								<Input placeholder="Colour" bind:value={$form.lines[i].color} />
								<Input placeholder="Size" bind:value={$form.lines[i].size} />
								<Input type="number" min="1" placeholder="Qty" bind:value={$form.lines[i].qty} />
								<Input
									type="number"
									min="0"
									step="0.01"
									placeholder="Unit price"
									bind:value={$form.lines[i].unitPrice}
								/>
								<Button type="button" variant="ghost" onclick={() => removeFreeLine(i)}>
									Remove
								</Button>
							</div>
							<Input
								class="mt-3"
								placeholder="Description"
								bind:value={$form.lines[i].description}
							/>
							{#if lineError(i, 'styleNumber')}
								<p class="mt-2 text-sm text-destructive">{lineError(i, 'styleNumber')}</p>
							{/if}
							{#if lineError(i, 'qty')}
								<p class="mt-2 text-sm text-destructive">{lineError(i, 'qty')}</p>
							{/if}
							{#if lineError(i, 'unitPrice')}
								<p class="mt-2 text-sm text-destructive">{lineError(i, 'unitPrice')}</p>
							{/if}
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Reason -->
		<section class="space-y-4">
			<h2 class="text-sm font-semibold">Reason</h2>
			<div class="space-y-2">
				<Label for="reasonCode">Category</Label>
				<SelectField
					items={reasonItems}
					placeholder="Choose a reason"
					bind:value={
						() => $form.reasonCode ?? '',
						(v) => ($form.reasonCode = (v || null) as typeof $form.reasonCode)
					}
				/>
			</div>
			<div class="space-y-2">
				<Label for="reason">Notes</Label>
				<Input id="reason" placeholder="Anything the brand should know" bind:value={$form.reason} />
				{#if $errors.reason}
					<p class="text-sm text-destructive">{$errors.reason[0]}</p>
				{/if}
			</div>
		</section>

		<div class="flex items-center justify-between border-t pt-6">
			<p class="text-sm text-muted-foreground">
				{$form.lines.length}
				{$form.lines.length === 1 ? 'item' : 'items'} · {money.format(selectedTotal)}
			</p>
			<Button type="submit" disabled={$submitting || $form.lines.length === 0}>
				{$submitting ? 'Saving…' : 'Create return'}
			</Button>
		</div>
	</form>
</div>

<OrderPickerModal
	bind:open={pickerOpen}
	orders={data.orders}
	showBrand={showBrandColumn}
	onSelect={chooseOrder}
/>
