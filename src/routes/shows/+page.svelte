<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { Show } from '$lib/types/database.js';

	let { data } = $props();
	const shows = $derived(data.shows as Show[]);
	const canEdit = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	let search = $state('');
	const filtered = $derived(
		shows.filter((s) =>
			s.name.toLowerCase().includes(search.toLowerCase()) ||
			(s.venue?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
			(s.city?.toLowerCase().includes(search.toLowerCase()) ?? false)
		)
	);

	function seasonLabel(show: Show): string {
		const name = show.seasons?.name;
		if (name && show.year) return `${name} ${show.year}`;
		if (name) return name;
		if (show.year) return String(show.year);
		return '—';
	}

	function dateRange(show: Show): string {
		if (!show.start_date) return '—';
		const start = new Date(show.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		if (!show.end_date) return start;
		const end = new Date(show.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
		return `${start} – ${end}`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Shows</h1>
			<p class="text-muted-foreground">Trade shows and market events</p>
		</div>
		{#if canEdit}
			<Button href="/shows/new">Add Show</Button>
		{/if}
	</div>

	<div class="max-w-sm">
		<Input placeholder="Search shows..." bind:value={search} />
	</div>

	{#if filtered.length === 0}
		<div class="rounded-lg border border-dashed p-8 text-center">
			<p class="text-muted-foreground">
				{search ? 'No shows match your search.' : 'No shows yet. Add your first show to get started.'}
			</p>
		</div>
	{:else}
		<div class="rounded-md border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/50">
						<th class="px-4 py-3 text-left text-sm font-medium">Name</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Season</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Dates</th>
						<th class="px-4 py-3 text-left text-sm font-medium">Location</th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as show}
						<tr class="border-b transition-colors hover:bg-muted/50">
							<td class="px-4 py-3">
								<a href="/shows/{show.id}" class="font-medium hover:underline">{show.name}</a>
							</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{seasonLabel(show)}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">{dateRange(show)}</td>
							<td class="px-4 py-3 text-sm text-muted-foreground">
								{[show.venue, show.city, show.state].filter(Boolean).join(', ') || '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
