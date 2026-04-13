<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import type { Territory } from '$lib/types/database.js';

	let { data } = $props();
	const territory = $derived(data.territory as Territory);
	const accounts = $derived(
		data.accounts as Array<{
			id: string;
			business_name: string;
			city: string | null;
			state: string | null;
			contact_first_name: string | null;
			contact_last_name: string | null;
		}>
	);
	const availableAccounts = $derived(
		data.availableAccounts as Array<{
			id: string;
			business_name: string;
			city: string | null;
			state: string | null;
		}>
	);
	const members = $derived(
		data.members as unknown as Array<{ id: string; profiles: { display_name: string } | null }>
	);

	const assignedMember = $derived(members.find((m) => m.id === territory.assigned_to));

	// Edit state
	let editing = $state(false);
	let editName = $state('');
	let editAssignedTo = $state('');
	let editNotes = $state('');
	let loading = $state(false);
	let error = $state('');

	function startEdit() {
		editName = territory.name;
		editAssignedTo = territory.assigned_to ?? '';
		editNotes = territory.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;
		const { error: err } = await supabase
			.from('territories')
			.update({
				name: editName,
				assigned_to: editAssignedTo || null,
				notes: editNotes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', territory.id);
		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	async function addAccount(accountId: string) {
		await supabase
			.from('accounts')
			.update({ territory_id: territory.id, updated_at: new Date().toISOString() })
			.eq('id', accountId);
		invalidateAll();
	}

	async function removeAccount(accountId: string) {
		await supabase
			.from('accounts')
			.update({ territory_id: null, updated_at: new Date().toISOString() })
			.eq('id', accountId);
		invalidateAll();
	}

	async function deleteTerritory() {
		if (!confirm(`Delete "${territory.name}"? Accounts will be unassigned from this territory.`))
			return;
		// Unassign all accounts first
		await supabase
			.from('accounts')
			.update({ territory_id: null, updated_at: new Date().toISOString() })
			.eq('territory_id', territory.id);
		await supabase.from('territories').delete().eq('id', territory.id);
		goto('/organization/territories');
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/organization/territories"><LongArrow direction="left" /> Back</Button>
			<h1 class="text-2xl font-bold">{territory.name}</h1>
		</div>
		{#if !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={deleteTerritory}>Delete</Button>
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<!-- Details -->
	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form
					id="edit-form"
					onsubmit={(e) => {
						e.preventDefault();
						handleSave();
					}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="name">Name *</Label>
						<Input id="name" bind:value={editName} required />
					</div>
					<div class="space-y-2">
						<Label for="assigned-to">Assigned Rep</Label>
						<select
							id="assigned-to"
							bind:value={editAssignedTo}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						>
							<option value="">Unassigned</option>
							{#each members as member}
								<option value={member.id}>{member.profiles?.display_name ?? 'Unknown'}</option>
							{/each}
						</select>
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<Input id="notes" bind:value={editNotes} />
					</div>
				</form>
			{:else}
				<dl class="space-y-3 text-sm">
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Assigned Rep</dt>
						<dd class="font-medium">
							{#if assignedMember}
								<a href="/organization/members?member={assignedMember.id}" class="hover:underline"
									>{assignedMember.profiles?.display_name ?? 'Unknown'}</a
								>
							{:else}
								<span class="text-muted-foreground">Unassigned</span>
							{/if}
						</dd>
					</div>
					{#if territory.notes}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Notes</dt>
							<dd>{territory.notes}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</CardContent>
		{#if editing}
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
				<Button type="submit" form="edit-form" disabled={loading}>
					{loading ? 'Saving...' : 'Save Changes'}
				</Button>
			</CardFooter>
		{/if}
	</Card>

	<!-- Accounts -->
	<Card>
		<CardHeader>
			<div class="flex items-center justify-between">
				<CardTitle class="text-base">Accounts ({accounts.length})</CardTitle>
				{#if availableAccounts.length > 0}
					<select
						class="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						onchange={(e) => {
							const val = (e.target as HTMLSelectElement).value;
							if (val) {
								addAccount(val);
								(e.target as HTMLSelectElement).value = '';
							}
						}}
					>
						<option value="">Add account...</option>
						{#each availableAccounts as account}
							<option value={account.id}
								>{account.business_name}{account.city
									? ` — ${account.city}, ${account.state}`
									: ''}</option
							>
						{/each}
					</select>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			{#if accounts.length === 0}
				<p class="text-sm text-muted-foreground">No accounts in this territory yet.</p>
			{:else}
				<div class="space-y-2">
					{#each accounts as account}
						<div class="flex items-center justify-between rounded-lg border px-4 py-2.5">
							<div>
								<a href="/accounts/{account.id}" class="text-sm font-medium hover:underline"
									>{account.business_name}</a
								>
								{#if account.city || account.state}
									<p class="text-sm text-muted-foreground">
										{[account.city, account.state].filter(Boolean).join(', ')}
									</p>
								{/if}
							</div>
							<button
								class="text-xs text-muted-foreground transition-colors hover:text-destructive"
								onclick={() => removeAccount(account.id)}
							>
								Remove
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
