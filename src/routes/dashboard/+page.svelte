<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const buyerData = $derived(data.buyerData as { recentOrders: any[]; brands: any[] } | undefined);
	const accountName = $derived(data.buyerAccounts?.[0]?.accounts?.business_name ?? 'your account');
</script>

<div class="mx-auto max-w-5xl space-y-8">
	<div>
		<h1 class="text-2xl font-bold">Welcome back</h1>
		<p class="mt-1 text-base text-muted-foreground">{accountName}</p>
	</div>

	<!-- Stats -->
	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-none border bg-card p-5">
			<p class="text-sm text-muted-foreground">Brands</p>
			<p class="mt-1 text-2xl font-bold">{data.metrics?.brandCount ?? 0}</p>
		</div>
		<div class="rounded-none border bg-card p-5">
			<p class="text-sm text-muted-foreground">Active Orders</p>
			<p class="mt-1 text-2xl font-bold">{data.metrics?.openOrders ?? 0}</p>
		</div>
		<div class="rounded-none border bg-card p-5">
			<p class="text-sm text-muted-foreground">Total Orders</p>
			<p class="mt-1 text-2xl font-bold">{data.metrics?.orderCount ?? 0}</p>
		</div>
	</div>

	<!-- Quick actions -->
	<div class="flex gap-3">
		<a
			href={resolve('/shop')}
			class="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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
					d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
				/>
			</svg>
			Shop Now
		</a>
		<a
			href={resolve('/orders/new')}
			class="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			New Order
		</a>
	</div>

	<!-- Recent orders -->
	{#if buyerData?.recentOrders?.length}
		<div>
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">Recent Orders</h2>
				<a href={resolve('/orders')} class="text-sm text-muted-foreground hover:text-foreground"
					>View all</a
				>
			</div>
			<div class="mt-4 space-y-2">
				{#each buyerData.recentOrders as order (order.id)}
					<a
						href={resolve(`/orders/${order.id}`)}
						class="flex items-center justify-between rounded-none border bg-card px-5 py-4 transition-colors hover:bg-accent/50"
					>
						<div>
							<p class="text-sm font-medium">{order.order_number}</p>
							<p class="text-sm text-muted-foreground">
								{order.brands?.name} &middot; {new Date(order.created_at).toLocaleDateString(
									'en-US',
									{ month: 'short', day: 'numeric', year: 'numeric' }
								)}
							</p>
						</div>
						<div class="flex items-center gap-3">
							<span class="text-sm font-medium"
								>{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
									order.total_amount
								)}</span
							>
							<span class="rounded-full bg-zinc-500/10 px-2 py-0.5 text-sm text-zinc-400 capitalize"
								>{order.status}</span
							>
						</div>
					</a>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Brands -->
	{#if buyerData?.brands?.length}
		<div>
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">Your Brands</h2>
				<a href={resolve('/shop')} class="text-sm text-muted-foreground hover:text-foreground"
					>View all</a
				>
			</div>
			<div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each buyerData.brands as brand (brand.id)}
					<a
						href={resolve(`/shop?brand=${brand.id}`)}
						class="flex items-center gap-3 rounded-none border bg-card px-5 py-4 transition-colors hover:bg-accent/50"
					>
						{#if brand.logo_url}
							<img
								src={brand.logo_url}
								alt={brand.name}
								class="h-10 w-10 rounded-lg object-contain"
							/>
						{:else}
							<div
								class="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-sm font-bold"
							>
								{brand.name.charAt(0)}
							</div>
						{/if}
						<span class="text-sm font-medium">{brand.name}</span>
					</a>
				{/each}
			</div>
		</div>
	{/if}
</div>
