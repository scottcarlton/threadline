<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card/index.js';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';

	let { data } = $props();

	let showImport = $state(false);

	const territoryColumns = [
		{ key: 'name', label: 'Territory Name', required: true },
		{ key: 'notes', label: 'Notes' }
	];

	async function handleTerritoryImport(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row.name?.trim()) {
				errors.push(`Row ${i + 1}: Territory Name is required`);
				continue;
			}
			const { error } = await supabase.from('territories').insert({
				organization_id: data.organization?.id,
				name: row.name.trim(),
				notes: row.notes?.trim() || null
			});
			if (error) errors.push(`Row ${i + 1} (${row.name}): ${error.message}`);
			else success++;
		}
		if (success > 0) invalidateAll();
		return { success, errors };
	}

	const territories = $derived(
		data.territories as Array<{
			id: string;
			name: string;
			assigned_to: string | null;
			notes: string | null;
			organization_members: { profiles: { display_name: string } | null } | null;
		}>
	);
	const members = $derived(
		data.members as Array<{
			id: string;
			profiles: { display_name: string } | null;
		}>
	);
	const accountCounts = $derived(data.accountCounts as Record<string, number>);

	let adding = $state(false);
	let newName = $state('');
	let newAssignedTo = $state('');
	let newNotes = $state('');
	let loading = $state(false);
	let error = $state('');

	async function createTerritory() {
		if (!newName.trim()) return;
		error = '';
		loading = true;
		const { error: err } = await supabase.from('territories').insert({
			organization_id: data.organization?.id,
			name: newName.trim(),
			assigned_to: newAssignedTo || null,
			notes: newNotes.trim() || null
		});
		loading = false;
		if (err) {
			error = err.message;
		} else {
			newName = '';
			newAssignedTo = '';
			newNotes = '';
			adding = false;
			invalidateAll();
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Territories</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Geographic regions with assigned accounts and reps
			</p>
		</div>
		{#if !adding}
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" onclick={() => (showImport = true)}>Import</Button>
				<Button size="sm" onclick={() => (adding = true)}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="-ml-1 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
					>
					Add Territory
				</Button>
			</div>
		{/if}
	</div>

	<!-- Create form -->
	{#if adding}
		<Card>
			<CardHeader>
				<CardTitle>New Territory</CardTitle>
			</CardHeader>
			<CardContent>
				{#if error}
					<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
				{/if}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						createTerritory();
					}}
					class="space-y-4"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="name">Name *</Label>
							<Input id="name" bind:value={newName} required placeholder="e.g. West Coast" />
						</div>
						<div class="space-y-2">
							<Label for="assigned-to">Assigned Rep</Label>
							<select
								id="assigned-to"
								bind:value={newAssignedTo}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								<option value="">Unassigned</option>
								{#each members as member (member.id)}
									<option value={member.id}>{member.profiles?.display_name ?? 'Unknown'}</option>
								{/each}
							</select>
						</div>
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<Input id="notes" bind:value={newNotes} placeholder="Optional notes" />
					</div>
					<div class="flex gap-2">
						<Button type="submit" size="sm" disabled={loading || !newName.trim()}>
							{loading ? 'Creating...' : 'Create Territory'}
						</Button>
						<Button variant="outline" size="sm" onclick={() => (adding = false)}>Cancel</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}

	<!-- List -->
	{#if territories.length === 0 && !adding}
		<div class="rounded-none p-12 text-center">
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
					d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">Organize by territory</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Create territories to group accounts by region
			</p>
		</div>
	{:else if territories.length > 0}
		<div class="overflow-hidden rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th
							class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
							>Territory</th
						>
						<th
							class="px-4 py-2.5 text-left text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
							>Assigned Rep</th
						>
						<th
							class="px-4 py-2.5 text-right text-[12px] font-medium tracking-wider text-muted-foreground uppercase"
							>Accounts</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each territories as territory (territory.id)}
						<tr class="transition-colors hover:bg-muted/30">
							<td class="px-4 py-3">
								<a
									href="/organization/territories/{territory.id}"
									class="text-sm font-medium hover:underline">{territory.name}</a
								>
								{#if territory.notes}
									<p class="text-sm text-muted-foreground">{territory.notes}</p>
								{/if}
							</td>
							<td class="px-4 py-3">
								<span class="text-sm text-muted-foreground">
									{territory.organization_members?.profiles?.display_name ?? '—'}
								</span>
							</td>
							<td class="px-4 py-3 text-right">
								<span class="text-sm">{accountCounts[territory.id] ?? 0}</span>
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
	entityType="territory"
	columns={territoryColumns}
	onimport={handleTerritoryImport}
/>
