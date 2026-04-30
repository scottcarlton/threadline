<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';

	let { data } = $props();

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const dateFmt = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	const timeFmt = new Intl.DateTimeFormat('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short'
	});

	const isOrder = $derived(data.order_type === 'order');
	const isSingle = $derived(data.count === 1);
	const listType = $derived(isOrder ? 'order' : 'note');

	const createdLabel = $derived.by(() => {
		if (!data.createdAt) return null;
		const d = new Date(data.createdAt);
		return `${dateFmt.format(d)} · ${timeFmt.format(d)}`;
	});

	const headline = $derived.by(() => {
		if (isOrder) return isSingle ? 'Order submitted.' : `${data.count} orders submitted.`;
		return isSingle ? 'Note saved.' : `${data.count} notes saved.`;
	});

	const eyebrow = $derived.by(() => {
		if (isOrder) return 'Submitted';
		return isSingle ? 'Saved as note' : 'Saved as notes';
	});

	const firstOrderNumber = $derived(data.rows[0]?.order_number ?? '');
</script>

<svelte:head>
	<title>{isOrder ? 'Order submitted' : 'Note saved'} · Threadline</title>
</svelte:head>

<div class="mx-auto max-w-[720px] space-y-10 px-6 py-16">
	<!-- Header -->
	<div class="space-y-4">
		<div class="flex items-center gap-2">
			<span
				class="inline-flex h-2.5 w-2.5 rounded-full {isOrder
					? 'bg-emerald-500 ring-4 ring-emerald-500/15'
					: 'bg-amber-500 ring-4 ring-amber-500/15'}"
				aria-hidden="true"
			></span>
			<span class="text-sm font-medium tracking-wider text-muted-foreground uppercase">
				{eyebrow}
			</span>
		</div>
		<h1 class="text-4xl font-medium tracking-tight">{headline}</h1>
		<p class="text-sm text-muted-foreground">
			{#if data.accountName}{data.accountName}{/if}
			{#if data.accountName && createdLabel}
				·
			{/if}
			{#if createdLabel}{createdLabel}{/if}
			{#if !isSingle}
				· {data.brandCount} {data.brandCount === 1 ? 'brand' : 'brands'} · {data.unitCount} units
			{/if}
			{#if !isOrder}
				· Draft
			{/if}
		</p>
	</div>

	<!-- Draft banner (note variants only) -->
	{#if !isOrder}
		{@const notesHref = `${resolve('/orders')}?type=note`}
		<div class="rounded-lg border bg-muted/40 px-5 py-4 text-sm text-muted-foreground">
			Nothing has been sent to the buyer. You can edit, submit, or delete from
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href built from resolve() + query string -->
			<a href={notesHref} class="font-medium text-foreground underline-offset-2 hover:underline"
				>Orders → Notes</a
			>.
		</div>
	{/if}

	<!-- Body: single vs multi -->
	{#if isSingle}
		{@const row = data.rows[0]}
		<div class="rounded-lg border">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<span class="font-mono text-base">{row.order_number}</span>
				<div class="text-right">
					<div class="font-mono text-base">{fmt.format(row.total)}</div>
					<div class="text-sm text-muted-foreground">
						{row.units}
						{row.units === 1 ? 'unit' : 'units'}
					</div>
				</div>
			</div>
			<dl class="divide-y">
				<div class="flex items-center justify-between px-5 py-3 text-sm">
					<dt class="text-muted-foreground">Brand · Season</dt>
					<dd>{row.brand_name} · {row.season_label}</dd>
				</div>
				<div class="flex items-center justify-between px-5 py-3 text-sm">
					<dt class="text-muted-foreground">Ship window</dt>
					<dd>{row.ship_window}</dd>
				</div>
				<div class="flex items-center justify-between px-5 py-3 text-sm">
					<dt class="text-muted-foreground">Ship to</dt>
					<dd>{row.location_summary}</dd>
				</div>
				{#if isOrder}
					<div class="flex items-center justify-between px-5 py-3 text-sm">
						<dt class="text-muted-foreground">Payment</dt>
						<dd>{row.payment_summary}</dd>
					</div>
				{/if}
			</dl>
			{#if isOrder && data.buyerEmail}
				<div class="border-t bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
					Buyer receives a copy at <span class="font-mono">{data.buyerEmail}</span> with
					{row.brand_name}'s terms attached. Fulfillment has been notified.
				</div>
			{/if}
		</div>
	{:else}
		<div class="rounded-lg border">
			<div class="flex items-center justify-between border-b px-5 py-4">
				<span class="text-sm text-muted-foreground">
					Total {isOrder ? 'submitted' : 'saved'}
				</span>
				<span class="font-mono text-3xl font-medium">{fmt.format(data.total)}</span>
			</div>
			<ol class="divide-y">
				{#each data.rows as row, i (row.order_number)}
					<li class="flex items-center justify-between gap-4 px-5 py-4">
						<div class="flex items-start gap-3">
							<span class="font-mono text-sm text-muted-foreground">{i + 1}</span>
							<div>
								<div class="font-mono text-sm">{row.order_number}</div>
								<div class="text-sm text-muted-foreground">
									{row.brand_name} · {row.season_label} · {row.units}
									{row.units === 1 ? 'unit' : 'units'}
								</div>
							</div>
						</div>
						<div class="flex items-center gap-4">
							<span class="font-mono text-sm">{fmt.format(row.total)}</span>
							<a
								href={resolve(`/orders/${row.order_number}`)}
								class="text-sm underline-offset-2 hover:underline">View →</a
							>
						</div>
					</li>
				{/each}
			</ol>
			{#if isOrder && data.buyerEmail}
				<div class="border-t bg-muted/30 px-5 py-3 text-sm text-muted-foreground">
					Buyer receives a copy of each order at <span class="font-mono">{data.buyerEmail}</span>.
					Each brand's terms are attached to its own orders.
				</div>
			{/if}
		</div>
	{/if}

	<!-- Action bar -->
	<div
		class="flex flex-col items-stretch gap-4 min-[756px]:grid min-[756px]:grid-cols-2 min-[756px]:items-start"
	>
		{#if isSingle}
			<Button
				size="lg"
				variant="outline"
				class="order-last w-full min-[756px]:order-none"
				href={`${resolve('/orders')}?type=${listType}`}
			>
				Back to {listType === 'order' ? 'orders' : 'notes'}
			</Button>
			<Button
				size="lg"
				class="order-first w-full min-[756px]:order-none"
				href={resolve(`/orders/${firstOrderNumber}`)}
			>
				View {listType === 'order' ? 'order' : 'note'}
			</Button>
		{:else}
			<Button
				size="lg"
				variant="outline"
				class="w-full"
				href={resolve(`/orders/${firstOrderNumber}`)}
			>
				View first {listType === 'order' ? 'order' : 'note'}
			</Button>
			<Button size="lg" class="w-full" href={`${resolve('/orders')}?type=${listType}`}>
				Back to {listType === 'order' ? 'orders' : 'notes'}
			</Button>
		{/if}
	</div>
</div>
