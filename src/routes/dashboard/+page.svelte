<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';

	let { data } = $props();
	const stats = $derived(data.stats);

	const metrics = $derived([
		{
			label: 'Total Revenue',
			value: stats
				? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats.totalRevenue)
				: '$0.00'
		},
		{ label: 'Orders', value: stats?.orderCount ?? 0 },
		{ label: 'Brands', value: stats?.brandCount ?? 0 },
		{ label: 'Accounts', value: stats?.accountCount ?? 0 }
	]);
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
		<p class="text-muted-foreground">
			{#if data.organization}
				Welcome back to {data.organization.name}
			{:else}
				Welcome to ThreadLine
			{/if}
		</p>
	</div>

	<!-- Metrics Grid -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		{#each metrics as metric}
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
				</CardHeader>
				<CardContent>
					<p class="text-2xl font-bold">{metric.value}</p>
				</CardContent>
			</Card>
		{/each}
	</div>

	<!-- Placeholder sections for future content -->
	<div class="grid gap-4 lg:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle class="text-lg">Recent Orders</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="text-sm text-muted-foreground">No orders yet. Create your first order to get started.</p>
			</CardContent>
		</Card>
		<Card>
			<CardHeader>
				<CardTitle class="text-lg">Revenue by Brand</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="text-sm text-muted-foreground">Add brands and orders to see revenue breakdown.</p>
			</CardContent>
		</Card>
	</div>
</div>
