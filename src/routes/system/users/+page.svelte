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
			goto(resolve(`/system/users?q=${encodeURIComponent(trimmed)}`), options);
		} else {
			goto(resolve('/system/users'), options);
		}
	}, 250);

	const dateFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	function lastSeen(iso: string | null): string {
		return iso ? `last seen ${dateFormat.format(new Date(iso))}` : 'never signed in';
	}
</script>

<div class="mx-auto max-w-5xl px-4 py-10">
	<SystemHeader
		title="Users"
		subtitle="Every account on Threadline. Open one to see their orgs and what they have done."
	/>

	<label class="block">
		<span class="sr-only">Search users</span>
		<input
			type="search"
			bind:value={search}
			oninput={() => runSearch(search)}
			placeholder="Search by name or email"
			class="w-full rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors focus:border-foreground focus:outline-none"
		/>
	</label>

	{#if data.users.length === 0}
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
					d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">
				{data.q ? 'No users match that search' : 'No users yet'}
			</p>
			<p class="mt-2 text-sm text-muted-foreground">
				{data.q
					? 'Try a different name or email address.'
					: 'Accounts appear here as soon as someone signs up.'}
			</p>
		</div>
	{:else}
		<ul class="mt-6 divide-y divide-border">
			{#each data.users as user (user.id)}
				<li>
					<a
						href={resolve(`/system/users/${user.id}`)}
						class="flex items-baseline justify-between gap-4 py-3 transition-colors hover:bg-muted/50"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium">{user.displayName ?? 'No profile name'}</p>
							<p class="mt-0.5 truncate font-mono text-sm text-muted-foreground">
								{user.email ?? 'No email'}
							</p>
						</div>
						<div class="shrink-0 text-right">
							<p class="text-sm">
								{user.isSystemAdmin
									? 'System User'
									: user.organizations.length === 0
										? 'No organization'
										: user.organizations.join(', ')}
							</p>
							<p class="mt-0.5 text-sm text-muted-foreground">{lastSeen(user.lastSignInAt)}</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>

		{#if data.truncated}
			<p class="mt-4 text-sm text-muted-foreground">
				Showing the first 1,000 accounts. Narrow the search to find someone outside that set.
			</p>
		{/if}
	{/if}
</div>
