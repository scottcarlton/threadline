<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SystemHeader from '$lib/components/system/SystemHeader.svelte';
	import { debounce } from '$lib/utils/debounce.js';
	import { untrack } from 'svelte';

	let { data } = $props();

	// Seeded once on purpose: the box is the source of truth while typing, and
	// re-syncing from `data` would clobber keystrokes that land mid-navigation.
	let search = $state(untrack(() => data.q));

	const runSearch = debounce((value: string) => {
		const trimmed = value.trim();
		const options = { keepFocus: true, replaceState: true, noScroll: true };
		if (trimmed) {
			goto(resolve(`/system/organizations?q=${encodeURIComponent(trimmed)}`), options);
		} else {
			goto(resolve('/system/organizations'), options);
		}
	}, 250);

	const dateFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	const orgTypeLabel: Record<string, string> = {
		rep: 'Rep agency',
		brand: 'Brand',
		retailer: 'Retailer'
	};
</script>

<div class="mx-auto max-w-5xl px-4 py-10">
	<SystemHeader
		title="Organizations"
		subtitle="Every org on Threadline. Open one to see its members and what has happened inside it."
	/>

	<label class="block">
		<span class="sr-only">Search organizations</span>
		<input
			type="search"
			bind:value={search}
			oninput={() => runSearch(search)}
			placeholder="Search by name or slug"
			class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-foreground focus:outline-none"
		/>
	</label>

	{#if data.organizations.length === 0}
		<div class="py-16 text-center">
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
					d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">
				{data.q ? 'No organizations match that search' : 'No organizations yet'}
			</p>
			<p class="mt-2 text-sm text-muted-foreground">
				{data.q
					? 'Try a different name or slug.'
					: 'Organizations appear here as soon as someone completes onboarding.'}
			</p>
		</div>
	{:else}
		<ul class="mt-6 divide-y divide-border">
			{#each data.organizations as org (org.id)}
				<li>
					<a
						href={resolve(`/system/organizations/${org.id}`)}
						class="flex items-baseline justify-between gap-4 py-3 transition-colors hover:bg-muted/50"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{org.name}</p>
							<p class="mt-0.5 truncate font-mono text-sm text-muted-foreground">{org.slug}</p>
						</div>
						<div class="shrink-0 text-right">
							<p class="text-sm">{orgTypeLabel[org.orgType] ?? org.orgType}</p>
							<p class="mt-0.5 text-sm text-muted-foreground">
								{org.memberCount}
								{org.memberCount === 1 ? 'member' : 'members'} · joined {dateFormat.format(
									new Date(org.createdAt)
								)}
							</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
