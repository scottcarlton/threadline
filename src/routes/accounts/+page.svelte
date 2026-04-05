<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { Account } from '$lib/types/database.js';

	let { data } = $props();
	const accounts = $derived(data.accounts as Account[]);
	const canEdit = $derived(data.membership?.role !== 'guest');

	let search = $state('');
	const filtered = $derived(
		accounts.filter((a) =>
			a.business_name.toLowerCase().includes(search.toLowerCase()) ||
			(a.contact_name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
			(a.city?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
			(a.state?.toLowerCase().includes(search.toLowerCase()) ?? false)
		)
	);
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Accounts</h1>
			<p class="text-muted-foreground">Manage buyer accounts</p>
		</div>
		{#if canEdit}
			<Button href="/accounts/new">Add Account</Button>
		{/if}
	</div>

	<div class="max-w-sm">
		<Input placeholder="Search accounts..." bind:value={search} />
	</div>

	{#if filtered.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground">
				{search ? 'No accounts match your search.' : 'No accounts yet. Add your first buyer account to get started.'}
			</p>
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/50">
						<th class="px-4 py-3 text-left text-sm font-medium">Business Name</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Contact</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Location</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Status</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as account}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3">
								<a href="/accounts/{account.id}" class="font-medium hover:underline">{account.business_name}</a>
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{account.contact_name ?? '—'}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{[account.city, account.state].filter(Boolean).join(', ') || '—'}
							</td>
							<td class="px-4 py-3">
								<Badge variant={account.is_active ? 'success' : 'secondary'}>
									{account.is_active ? 'Active' : 'Inactive'}
								</Badge>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
