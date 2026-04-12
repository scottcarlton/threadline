<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { Season, SeasonDelivery } from '$lib/types/database.js';

	let { data } = $props();
	const seasons = $derived(data.seasons as Season[]);
	const deliveries = $derived(data.deliveries as SeasonDelivery[]);
	const canManage = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	let newSeasonName = $state('');
	let addingNew = $state(false);
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let error = $state('');

	// Delivery add state — keyed by season id
	let addingDeliveryForSeason = $state<string | null>(null);
	let newDeliveryMonth = $state(1);
	let newDeliveryDay = $state(1);

	function deliveriesForSeason(seasonId: string): SeasonDelivery[] {
		return deliveries.filter((d) => d.season_id === seasonId);
	}

	function formatDeliveryDate(d: SeasonDelivery): string {
		return `${d.delivery_month}/${d.delivery_day}`;
	}

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

	async function addDelivery(seasonId: string) {
		error = '';
		const existing = deliveriesForSeason(seasonId);
		const maxOrder = existing.length > 0 ? Math.max(...existing.map((d) => d.sort_order)) : 0;

		const { error: err } = await supabase.from('season_deliveries').insert({
			season_id: seasonId,
			organization_id: data.organization?.id,
			label: `${newDeliveryMonth}/${newDeliveryDay}`,
			delivery_month: newDeliveryMonth,
			delivery_day: newDeliveryDay,
			sort_order: maxOrder + 1
		});

		if (err) {
			error = err.message;
		} else {
			addingDeliveryForSeason = null;
			newDeliveryMonth = 1;
			newDeliveryDay = 1;
			invalidateAll();
		}
	}

	async function removeDelivery(deliveryId: string) {
		error = '';
		const { error: err } = await supabase.from('season_deliveries').delete().eq('id', deliveryId);
		if (err) {
			error = err.message;
		} else {
			invalidateAll();
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Seasons</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">Reusable season templates for orders and shows</p>
		</div>
		{#if canManage && !addingNew}
			<Button size="sm" onclick={() => (addingNew = true)}>
				<svg xmlns="http://www.w3.org/2000/svg" class="-ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
				Add Season
			</Button>
		{/if}
	</div>

	{#if error}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
	{/if}

	<div class="overflow-hidden rounded-none border">
		<table class="w-full">
			<thead>
				<tr class="border-b bg-muted/40">
					<th class="px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Season</th>
					<th class="px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Deliveries</th>
					<th class="px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
					{#if canManage}
						<th class="px-4 py-2.5 text-right text-[12px] font-medium uppercase tracking-wider text-muted-foreground"></th>
					{/if}
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each seasons as season}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3">
							{#if editingId === season.id}
								<form
									class="flex items-center gap-2"
									onsubmit={(e) => { e.preventDefault(); saveName(season); }}
								>
									<Input bind:value={editName} class="h-8 max-w-[200px]" />
									<Button size="sm" type="submit">Save</Button>
									<Button size="sm" variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
								</form>
							{:else}
								<span class="text-sm font-medium">{season.name}</span>
							{/if}
						</td>
						<td class="px-4 py-3">
							<div class="flex flex-wrap items-center gap-1.5">
								{#each deliveriesForSeason(season.id) as delivery}
									<span class="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[13px] font-medium">
										{formatDeliveryDate(delivery)}
										{#if canManage}
											<button
												class="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
												onclick={() => removeDelivery(delivery.id)}
												aria-label="Remove delivery {formatDeliveryDate(delivery)}"
											>
												&times;
											</button>
										{/if}
									</span>
								{/each}

								{#if addingDeliveryForSeason === season.id}
									<form
										class="inline-flex items-center gap-1.5"
										onsubmit={(e) => { e.preventDefault(); addDelivery(season.id); }}
									>
										<Input
											type="number"
											bind:value={newDeliveryMonth}
											min={1}
											max={12}
											class="h-7 w-14 text-[13px]"
											placeholder="MM"
										/>
										<span class="text-muted-foreground">/</span>
										<Input
											type="number"
											bind:value={newDeliveryDay}
											min={1}
											max={31}
											class="h-7 w-14 text-[13px]"
											placeholder="DD"
										/>
										<Button size="sm" type="submit" class="h-7 px-2 text-[13px]">Add</Button>
										<Button
											size="sm"
											variant="ghost"
											type="button"
											class="h-7 px-2 text-[13px]"
											onclick={() => (addingDeliveryForSeason = null)}
										>
											Cancel
										</Button>
									</form>
								{:else if canManage}
									<button
										class="inline-flex items-center rounded-full border border-dashed px-2.5 py-0.5 text-[13px] text-muted-foreground hover:bg-muted/50"
										onclick={() => { addingDeliveryForSeason = season.id; newDeliveryMonth = 1; newDeliveryDay = 1; }}
									>
										+ Delivery
									</button>
								{/if}
							</div>
						</td>
						<td class="px-4 py-3">
							<Badge variant={season.is_active ? 'success' : 'secondary'} class="text-xs">
								{season.is_active ? 'Active' : 'Inactive'}
							</Badge>
						</td>
						{#if canManage}
							<td class="px-4 py-3 text-right">
								<div class="flex justify-end gap-1">
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
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if addingNew}
		<form
			class="flex items-center gap-2"
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
	{/if}
</div>
