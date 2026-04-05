<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Season } from '$lib/types/database.js';

	let { data } = $props();
	const seasons = $derived(data.seasons as Season[]);

	let name = $state('');
	let venue = $state('');
	let city = $state('');
	let showState = $state('');
	let startDate = $state('');
	let endDate = $state('');
	let seasonId = $state('');
	let year = $state(new Date().getFullYear());
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		error = '';
		loading = true;

		const { error: err } = await supabase.from('shows').insert({
			organization_id: data.organization?.id,
			name,
			venue: venue || null,
			city: city || null,
			state: showState || null,
			start_date: startDate || null,
			end_date: endDate || null,
			season_id: seasonId || null,
			year: year || null,
			notes: notes || null
		});

		loading = false;
		if (err) {
			error = err.message;
		} else {
			goto('/shows');
		}
	}
</script>

<div class="mx-auto max-w-2xl">
	<Card>
		<CardHeader>
			<CardTitle>Add Show</CardTitle>
		</CardHeader>
		<CardContent>
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			<form id="show-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Show name *</Label>
					<Input id="name" bind:value={name} required placeholder="Dallas Market Center" />
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="season">Season</Label>
						<select
							id="season"
							bind:value={seasonId}
							class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						>
							<option value="">No season</option>
							{#each seasons as season}
								<option value={season.id}>{season.name}</option>
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
					<Input id="venue" bind:value={venue} placeholder="Convention Center" />
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" bind:value={city} placeholder="Dallas" />
					</div>
					<div class="space-y-2">
						<Label for="state">State</Label>
						<Input id="state" bind:value={showState} placeholder="TX" />
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
					<textarea
						id="notes"
						bind:value={notes}
						rows="3"
						placeholder="Any additional notes..."
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					></textarea>
				</div>
			</form>
		</CardContent>
		<CardFooter class="justify-between">
			<Button variant="outline" href="/shows">Cancel</Button>
			<Button type="submit" form="show-form" disabled={loading}>
				{loading ? 'Creating...' : 'Create Show'}
			</Button>
		</CardFooter>
	</Card>
</div>
