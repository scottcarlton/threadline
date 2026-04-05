<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Show, Season } from '$lib/types/database.js';

	let { data } = $props();
	const show = $derived(data.show as Show);
	const seasons = $derived(data.seasons as Season[]);
	const canEdit = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	let editing = $state(false);
	let name = $state('');
	let venue = $state('');
	let city = $state('');
	let showState = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let seasonId = $state('');
	let year = $state<number>(new Date().getFullYear());
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	function seasonLabel(): string {
		const sName = show.seasons?.name;
		if (sName && show.year) return `${sName} ${show.year}`;
		if (sName) return sName;
		if (show.year) return String(show.year);
		return '—';
	}

	function startEdit() {
		name = show.name;
		venue = show.venue ?? '';
		city = show.city ?? '';
		showState = show.state ?? '';
		startDate = show.start_date ?? '';
		endDate = show.end_date ?? '';
		seasonId = show.season_id ?? '';
		year = show.year ?? new Date().getFullYear();
		notes = show.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('shows')
			.update({
				name, venue: venue || null, city: city || null, state: showState || null,
				start_date: startDate || null, end_date: endDate || null,
				season_id: seasonId || null, year: year || null,
				notes: notes || null, updated_at: new Date().toISOString()
			})
			.eq('id', show.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/shows">← Back</Button>
			<h1 class="text-2xl font-bold">{show.name}</h1>
		</div>
		{#if canEdit && !editing}
			<Button size="sm" onclick={startEdit}>Edit</Button>
		{/if}
	</div>

	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form id="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Show name *</Label>
						<Input id="name" bind:value={name} required />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="season">Season</Label>
							<select id="season" bind:value={seasonId} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
								<option value="">No season</option>
								{#each seasons as s}
									<option value={s.id}>{s.name}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-2">
							<Label for="year">Year</Label>
							<Input id="year" type="number" bind:value={year} min={2020} max={2040} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="venue">Venue</Label>
						<Input id="venue" bind:value={venue} />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="city">City</Label>
							<Input id="city" bind:value={city} />
						</div>
						<div class="space-y-2">
							<Label for="state">State</Label>
							<Input id="state" bind:value={showState} />
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="start-date">Start date</Label>
							<Input id="start-date" type="date" bind:value={startDate} />
						</div>
						<div class="space-y-2">
							<Label for="end-date">End date</Label>
							<Input id="end-date" type="date" bind:value={endDate} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<textarea id="notes" bind:value={notes} rows="3" class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Season</dt>
							<dd class="mt-1">{seasonLabel()}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Venue</dt>
							<dd class="mt-1">{show.venue ?? '—'}</dd>
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Location</dt>
							<dd class="mt-1">{[show.city, show.state].filter(Boolean).join(', ') || '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Dates</dt>
							<dd class="mt-1">
								{#if show.start_date}
									{new Date(show.start_date).toLocaleDateString()}
									{#if show.end_date} – {new Date(show.end_date).toLocaleDateString()}{/if}
								{:else}
									—
								{/if}
							</dd>
						</div>
					</div>
					{#if show.notes}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
							<dd class="mt-1 whitespace-pre-wrap">{show.notes}</dd>
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
</div>
