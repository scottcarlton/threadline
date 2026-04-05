<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import type { Season } from '$lib/types/database.js';

	let { data } = $props();
	const seasons = $derived(data.seasons as Season[]);
	const canManage = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	let newSeasonName = $state('');
	let addingNew = $state(false);
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let error = $state('');

	async function addSeason() {
		if (!newSeasonName.trim()) return;
		error = '';

		const maxOrder = seasons.length > 0 ? Math.max(...seasons.map((s) => s.sort_order)) : 0;

		const { error: err } = await supabase.from('seasons').insert({
			organization_id: data.organization?.id,
			name: newSeasonName.trim(),
			sort_order: maxOrder + 1
		});

		if (err) {
			error = err.message;
		} else {
			newSeasonName = '';
			addingNew = false;
			invalidateAll();
		}
	}

	async function saveName(season: Season) {
		if (!editName.trim()) return;

		const { error: err } = await supabase
			.from('seasons')
			.update({ name: editName.trim(), updated_at: new Date().toISOString() })
			.eq('id', season.id);

		if (err) {
			error = err.message;
		} else {
			editingId = null;
			invalidateAll();
		}
	}

	async function toggleActive(season: Season) {
		await supabase
			.from('seasons')
			.update({ is_active: !season.is_active, updated_at: new Date().toISOString() })
			.eq('id', season.id);
		invalidateAll();
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Seasons</h1>
		<p class="text-muted-foreground">Reusable season templates for orders and shows</p>
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle class="text-lg">Season Templates</CardTitle>
			<CardDescription>These are reused each year. The year is set on orders and shows, not here.</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="space-y-2">
				{#each seasons as season}
					<div class="flex items-center justify-between rounded-md border px-4 py-3">
						{#if editingId === season.id}
							<form
								class="flex flex-1 items-center gap-2"
								onsubmit={(e) => { e.preventDefault(); saveName(season); }}
							>
								<Input bind:value={editName} class="h-8 max-w-[200px]" />
								<Button size="sm" type="submit">Save</Button>
								<Button size="sm" variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
							</form>
						{:else}
							<div class="flex items-center gap-3">
								<span class="text-sm font-medium text-muted-foreground w-6">{season.sort_order}</span>
								<span class="font-medium">{season.name}</span>
								<Badge variant={season.is_active ? 'success' : 'secondary'} class="text-xs">
									{season.is_active ? 'Active' : 'Inactive'}
								</Badge>
							</div>
							{#if canManage}
								<div class="flex gap-1">
									<Button
										size="sm"
										variant="ghost"
										onclick={() => { editingId = season.id; editName = season.name; }}
									>
										Rename
									</Button>
									<Button size="sm" variant="ghost" onclick={() => toggleActive(season)}>
										{season.is_active ? 'Deactivate' : 'Activate'}
									</Button>
								</div>
							{/if}
						{/if}
					</div>
				{/each}

				{#if addingNew}
					<form
						class="flex items-center gap-2 rounded-md border border-dashed px-4 py-3"
						onsubmit={(e) => { e.preventDefault(); addSeason(); }}
					>
						<Input
							bind:value={newSeasonName}
							placeholder="Season name, e.g. Pre-Fall"
							class="h-8 max-w-[200px]"
						/>
						<Button size="sm" type="submit">Add</Button>
						<Button size="sm" variant="ghost" type="button" onclick={() => (addingNew = false)}>Cancel</Button>
					</form>
				{:else if canManage}
					<button
						class="flex w-full items-center justify-center rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/50"
						onclick={() => (addingNew = true)}
					>
						+ Add season
					</button>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
