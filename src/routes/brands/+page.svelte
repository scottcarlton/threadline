<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { downloadCSV } from '$lib/utils/csv.js';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import type { Brand } from '$lib/types/database.js';

	let { data } = $props();
	let showImport = $state(false);

	const brandColumns = [
		{ key: 'name', label: 'Name', required: true },
		{ key: 'contact_first_name', label: 'Contact First Name' },
		{ key: 'contact_last_name', label: 'Contact Last Name' },
		{ key: 'contact_email', label: 'Contact Email' },
		{ key: 'contact_phone', label: 'Phone' },
		{ key: 'website', label: 'Website' }
	];

	async function handleBrandImport(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row.name?.trim()) {
				errors.push(`Row ${i + 1}: Name is required`);
				continue;
			}
			const { error } = await supabase.from('brands').insert({
				organization_id: data.organization?.id,
				name: row.name.trim(),
				contact_first_name: row.contact_first_name?.trim() || null,
				contact_last_name: row.contact_last_name?.trim() || null,
				contact_email: row.contact_email?.trim() || null,
				contact_phone: row.contact_phone?.trim() || null,
				website: row.website?.trim() || null
			});
			if (error) {
				errors.push(`Row ${i + 1} (${row.name}): ${error.message}`);
			} else {
				success++;
			}
		}

		if (success > 0) invalidateAll();
		return { success, errors };
	}
	const brands = $derived(data.brands as Brand[]);
	const brandTotals = $derived((data.brandTotals ?? {}) as Record<string, number>);
	const canEdit = $derived(
		data.membership?.role === 'admin' ||
			data.membership?.role === 'owner' ||
			data.membership?.role === 'member'
	);
	const isAdmin = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	let search = $state('');
	let showArchived = $state(false);

	const filtered = $derived(
		brands.filter((b) => {
			const matchesSearch =
				b.name.toLowerCase().includes(search.toLowerCase()) ||
				(b.contact_first_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
				(b.contact_last_name?.toLowerCase().includes(search.toLowerCase()) ?? false);
			const matchesArchive = showArchived ? true : !b.archived_at;
			return matchesSearch && matchesArchive;
		})
	);

	const archivedCount = $derived(brands.filter((b) => b.archived_at).length);

	function fmt(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(value);
	}

	function exportBrands() {
		const rows = filtered.map((b) => ({
			name: b.name,
			contact_first_name: b.contact_first_name ?? '',
			contact_last_name: b.contact_last_name ?? '',
			contact_email: b.contact_email ?? '',
			contact_phone: b.contact_phone ?? '',
			website: b.website ?? '',
			status: b.archived_at ? 'Archived' : 'Active'
		}));
		downloadCSV(rows, 'brands.csv');
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl">Brands</h1>
			<p class="mt-1 font-mono text-sm text-muted-foreground">Manage your brand portfolio</p>
		</div>
		<div class="flex items-center gap-2">
			{#if filtered.length > 0}
				<Button variant="outline" size="sm" onclick={exportBrands}>Export</Button>
			{/if}
			{#if canEdit}
				<Button variant="outline" size="sm" onclick={() => (showImport = true)}>Import</Button>
				<Button href="/brands/new">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="-ml-1 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
					>
					Add Brand
				</Button>
			{/if}
		</div>
	</div>

	<div class="flex items-center gap-3">
		<div class="max-w-xs flex-1">
			<Input placeholder="Search brands..." bind:value={search} />
		</div>
		{#if archivedCount > 0}
			<button
				class="text-sm text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (showArchived = !showArchived)}
			>
				{showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
			</button>
		{/if}
	</div>

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search}
				<p class="text-lg font-semibold">No brands match your search</p>
				<p class="mt-2 text-sm text-muted-foreground">Try a different search term</p>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto h-16 w-16 text-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="0.4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Your brands live here</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Add your first brand to start managing your lines
				</p>
			{/if}
		</div>
	{:else}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th
							class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Brand</th
						>
						<th
							class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Contact</th
						>
						<th
							class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Status</th
						>
						{#if isAdmin}
							<th
								class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
								>Rate</th
							>
						{/if}
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>YTD Sales</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as brand}
						<tr class="transition-colors hover:bg-muted/30 {brand.archived_at ? 'opacity-50' : ''}">
							<td class="px-4 py-3">
								<a href="/brands/{brand.id}" class="text-base hover:underline">{brand.name}</a>
								{#if brand.website}
									<a
										href={brand.website}
										target="_blank"
										rel="noopener noreferrer"
										class="block font-mono text-sm text-muted-foreground hover:underline"
										>{brand.website.replace(/^https?:\/\//, '')}</a
									>
								{/if}
							</td>
							<td class="px-4 py-3">
								<div class="text-sm text-foreground">
									{[brand.contact_first_name, brand.contact_last_name].filter(Boolean).join(' ') ||
										'—'}
								</div>
								{#if brand.contact_email}
									<div class="font-mono text-sm text-muted-foreground">{brand.contact_email}</div>
								{/if}
							</td>
							<td class="px-4 py-3">
								{#if brand.archived_at}
									<span
										class="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500"
										>Archived</span
									>
								{:else if brand.is_active}
									<span
										class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
										>Active</span
									>
								{:else}
									<span
										class="inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500"
										>Inactive</span
									>
								{/if}
							</td>
							{#if isAdmin}
								<td class="px-4 py-3 text-right">
									<span class="text-sm">{brand.commission_rate ?? 0}%</span>
								</td>
							{/if}
							<td class="px-4 py-3 text-right font-mono">
								{#if brandTotals[brand.id]}
									<span class="text-sm">{fmt(brandTotals[brand.id])}</span>
								{:else}
									<span class="text-sm text-muted-foreground/50">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<BulkImportModal
	open={showImport}
	ontoggle={() => (showImport = false)}
	entityType="brand"
	columns={brandColumns}
	onimport={handleBrandImport}
/>
