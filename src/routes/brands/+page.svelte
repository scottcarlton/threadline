<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { Brand } from '$lib/types/database.js';

	let { data } = $props();
	const brands = $derived(data.brands as Brand[]);
	const canEdit = $derived(
		data.membership?.role === 'admin' ||
		data.membership?.role === 'owner' ||
		data.membership?.role === 'member'
	);

	let search = $state('');
	const filtered = $derived(
		brands.filter((b) =>
			b.name.toLowerCase().includes(search.toLowerCase()) ||
			(b.contact_name?.toLowerCase().includes(search.toLowerCase()) ?? false)
		)
	);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Brands</h1>
			<p class="text-muted-foreground">Manage your brand portfolio</p>
		</div>
		{#if canEdit}
			<Button href="/brands/new">Add Brand</Button>
		{/if}
	</div>

	<div class="max-w-sm">
		<Input placeholder="Search brands..." bind:value={search} />
	</div>

	{#if filtered.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground">
				{search ? 'No brands match your search.' : 'No brands yet. Add your first brand to get started.'}
			</p>
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/50">
						<th class="px-4 py-3 text-left text-sm font-medium">Name</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Contact</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Email</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as brand}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3">
								<a href="/brands/{brand.id}" class="font-medium hover:underline">{brand.name}</a>
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{brand.contact_name ?? '—'}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{brand.contact_email ?? '—'}</td>
							<td class="px-4 py-3">
								<Badge variant={brand.is_active ? 'success' : 'secondary'}>
									{brand.is_active ? 'Active' : 'Inactive'}
								</Badge>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
