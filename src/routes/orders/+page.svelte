<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { Order, Season } from '$lib/types/database.js';

	let { data } = $props();
	const orders = $derived(data.orders as Order[]);
	const seasons = $derived(data.seasons as Season[]);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const canCreate = $derived(data.membership?.role !== 'guest');

	const statusTabs = ['all', 'draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled'] as const;
	const activeStatus = $derived($page.url.searchParams.get('status') ?? 'all');

	let search = $state('');
	const filtered = $derived(
		orders.filter((o) =>
			o.order_number.toLowerCase().includes(search.toLowerCase()) ||
			(o.accounts?.business_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
			(o.brands?.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
		)
	);

	const statusColors: Record<string, string> = {
		draft: 'secondary',
		submitted: 'warning',
		confirmed: 'default',
		shipped: 'default',
		delivered: 'success',
		cancelled: 'destructive'
	};

	function seasonLabel(order: Order): string {
		const name = order.seasons?.name;
		if (name && order.order_year) return `${name} ${order.order_year}`;
		if (name) return name;
		if (order.order_year) return String(order.order_year);
		return '—';
	}

	function setFilter(key: string, value: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (!value || value === 'all') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		goto(`/orders?${params.toString()}`, { replaceState: true });
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Orders</h1>
			<p class="text-muted-foreground">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
		</div>
		{#if canCreate}
			<Button href="/orders/new">New Order</Button>
		{/if}
	</div>

	<!-- Status tabs -->
	<div class="flex gap-1 overflow-x-auto border-b">
		{#each statusTabs as tab}
			<button
				class="whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeStatus === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}"
				onclick={() => setFilter('status', tab)}
			>
				{tab.charAt(0).toUpperCase() + tab.slice(1)}
			</button>
		{/each}
	</div>

	<!-- Filters -->
	<div class="flex flex-wrap gap-3">
		<Input placeholder="Search orders..." bind:value={search} class="max-w-[250px]" />
		<select
			class="h-10 rounded-md border border-input bg-background px-3 text-sm"
			onchange={(e) => setFilter('season', (e.target as HTMLSelectElement).value)}
		>
			<option value="">All Seasons</option>
			{#each seasons as season}
				<option value={season.id}>{season.name}</option>
			{/each}
		</select>
		<select
			class="h-10 rounded-md border border-input bg-background px-3 text-sm"
			onchange={(e) => setFilter('brand', (e.target as HTMLSelectElement).value)}
		>
			<option value="">All Brands</option>
			{#each brands as brand}
				<option value={brand.id}>{brand.name}</option>
			{/each}
		</select>
	</div>

	{#if filtered.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground">
				{search ? 'No orders match your search.' : 'No orders yet. Create your first order to get started.'}
			</p>
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/50">
						<th class="px-4 py-3 text-left text-sm font-medium">Order #</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Account</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Brand</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Season</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Status</th>
						<th class="px-4 py-3 text-right text-sm font-medium">Total</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as order}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3">
								<a href="/orders/{order.id}" class="font-medium hover:underline">{order.order_number}</a>
							</td>
							<td class="px-4 py-3 text-sm">{order.accounts?.business_name ?? '—'}</td>
							<td class="px-4 py-3 text-sm">{order.brands?.name ?? '—'}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{seasonLabel(order)}</td>
							<td class="px-4 py-3">
								<Badge variant={statusColors[order.status] as any ?? 'secondary'}>
									{order.status}
								</Badge>
							</td>
							<td class="px-4 py-3 text-right text-sm font-medium">
								{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(order.total_amount))}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
