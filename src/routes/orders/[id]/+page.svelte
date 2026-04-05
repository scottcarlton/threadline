<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import type { Order, OrderLine, OrderStatus } from '$lib/types/database.js';

	let { data } = $props();
	const order = $derived(data.order as Order);
	const lines = $derived(data.lines as OrderLine[]);
	const canEdit = $derived(data.membership?.role !== 'guest');

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

	const nextStatuses = $derived(statusFlow[order.status] ?? []);

	function seasonLabel(): string {
		const name = order.seasons?.name;
		if (name && order.order_year) return `${name} ${order.order_year}`;
		if (name) return name;
		if (order.order_year) return String(order.order_year);
		return '—';
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
	}

	const timeline = $derived([
		{ status: 'draft', label: 'Draft', date: order.created_at },
		{ status: 'submitted', label: 'Submitted', date: order.submitted_at },
		{ status: 'confirmed', label: 'Confirmed', date: order.confirmed_at },
		{ status: 'shipped', label: 'Shipped', date: order.shipped_at },
		{ status: 'delivered', label: 'Delivered', date: order.delivered_at }
	]);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/orders">← Back</Button>
			<h1 class="text-2xl font-bold">{order.order_number}</h1>
			<Badge variant={statusColors[order.status] as any ?? 'secondary'}>{order.status}</Badge>
		</div>
		{#if canEdit && nextStatuses.length > 0}
			<div class="flex gap-2">
				{#each nextStatuses as nextStatus}
					<Button
						size="sm"
						variant={nextStatus === 'cancelled' ? 'destructive' : 'default'}
						onclick={() => updateStatus(nextStatus)}
					>
						{nextStatus === 'submitted' ? 'Submit' : nextStatus === 'confirmed' ? 'Confirm' : nextStatus === 'shipped' ? 'Ship' : nextStatus === 'delivered' ? 'Mark Delivered' : 'Cancel'}
					</Button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Status timeline -->
	{#if order.status !== 'cancelled'}
		<div class="flex items-center gap-1">
			{#each timeline as step, i}
				{@const isComplete = step.date !== null}
				{@const isCurrent = step.status === order.status}
				<div class="flex items-center gap-1">
					<div class="flex flex-col items-center">
						<div
							class="flex h-6 w-6 items-center justify-center rounded-full text-xs {isComplete ? 'bg-primary text-primary-foreground' : isCurrent ? 'border-2 border-primary' : 'border border-muted-foreground/30'}"
						>
							{#if isComplete}✓{/if}
						</div>
						<span class="mt-1 text-xs text-muted-foreground">{step.label}</span>
					</div>
					{#if i < timeline.length - 1}
						<div class="mb-5 h-px w-12 {isComplete ? 'bg-primary' : 'bg-muted-foreground/30'}"></div>
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
				<dl class="space-y-2 text-sm">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Account</dt>
						<dd class="font-medium">
							<a href="/accounts/{order.account_id}" class="hover:underline">{order.accounts?.business_name}</a>
						</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Brand</dt>
						<dd class="font-medium">
							<a href="/brands/{order.brand_id}" class="hover:underline">{order.brands?.name}</a>
						</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Season</dt>
						<dd>{seasonLabel()}</dd>
					</div>
					{#if order.shows}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Show</dt>
							<dd>
								<a href="/shows/{order.show_id}" class="hover:underline">{order.shows.name}</a>
							</dd>
						</div>
					{/if}
					<div class="flex justify-between border-t pt-2">
						<dt class="text-muted-foreground">Created</dt>
						<dd>{new Date(order.created_at).toLocaleDateString()}</dd>
					</div>
				</dl>
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Order Total</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="text-3xl font-bold">{fmt.format(Number(order.total_amount))}</p>
				<p class="mt-1 text-sm text-muted-foreground">{lines.length} line item{lines.length !== 1 ? 's' : ''}</p>
				{#if order.notes}
					<div class="mt-4 rounded-md bg-muted p-3">
						<p class="text-xs font-medium text-muted-foreground">Notes</p>
						<p class="mt-1 text-sm whitespace-pre-wrap">{order.notes}</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>

	<!-- Line items -->
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Line Items</CardTitle>
		</CardHeader>
		<CardContent>
			{#if lines.length === 0}
				<p class="text-sm text-muted-foreground">No line items.</p>
			{:else}
				<div class="rounded-md border">
					<table class="w-full">
						<thead>
							<tr class="border-b bg-muted/50">
								<th class="px-3 py-2 text-left text-xs font-medium">Style #</th>
								<th class="px-3 py-2 text-left text-xs font-medium">Description</th>
								<th class="px-3 py-2 text-left text-xs font-medium">Color</th>
								<th class="px-3 py-2 text-left text-xs font-medium">Size</th>
								<th class="px-3 py-2 text-right text-xs font-medium">Qty</th>
								<th class="px-3 py-2 text-right text-xs font-medium">Unit Price</th>
								<th class="px-3 py-2 text-right text-xs font-medium">Total</th>
							</tr>
						</thead>
						<tbody>
							{#each lines as line}
								<tr class="border-b">
									<td class="px-3 py-2 text-sm">{line.style_number ?? '—'}</td>
									<td class="px-3 py-2 text-sm">{line.description ?? '—'}</td>
									<td class="px-3 py-2 text-sm">{line.color ?? '—'}</td>
									<td class="px-3 py-2 text-sm">{line.size ?? '—'}</td>
									<td class="px-3 py-2 text-right text-sm">{line.qty}</td>
									<td class="px-3 py-2 text-right text-sm">{fmt.format(Number(line.unit_price))}</td>
									<td class="px-3 py-2 text-right text-sm font-medium">{fmt.format(Number(line.line_total))}</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="bg-muted/50">
								<td colspan={6} class="px-3 py-2 text-right text-sm font-medium">Order Total</td>
								<td class="px-3 py-2 text-right text-sm font-bold">{fmt.format(Number(order.total_amount))}</td>
							</tr>
						</tfoot>
					</table>
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
