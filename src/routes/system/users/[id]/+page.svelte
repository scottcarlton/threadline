<script lang="ts">
	import { resolve } from '$app/paths';
	import SystemHeader from '$lib/components/system/SystemHeader.svelte';
	import ActivityTimeline from '$lib/components/system/ActivityTimeline.svelte';

	let { data } = $props();

	const dateFormat = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	const subtitle = $derived(
		[
			data.profile.email,
			data.profile.lastSignInAt
				? `last seen ${dateFormat.format(new Date(data.profile.lastSignInAt))}`
				: 'never signed in'
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="mx-auto max-w-5xl px-4 py-10">
	<SystemHeader
		eyebrow="System / Users"
		title={data.profile.displayName ?? data.profile.email ?? 'Unknown user'}
		{subtitle}
	/>

	<section class="mb-10">
		<h2 class="text-lg font-semibold">Organizations</h2>
		{#if data.memberships.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">
				This account does not belong to an organization. If they are stuck, onboarding is the likely
				place to look.
			</p>
		{:else}
			<ul class="mt-3 divide-y divide-border">
				{#each data.memberships as membership (membership.id)}
					<li class="flex items-baseline justify-between gap-4 py-2">
						<a
							href={resolve(`/system/organizations/${membership.organizationId}`)}
							class="text-sm underline decoration-transparent transition-colors hover:decoration-current"
						>
							{membership.organizationName}
						</a>
						<p class="text-sm text-muted-foreground">
							{membership.role} · joined {dateFormat.format(new Date(membership.joinedAt))}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<div class="flex items-baseline justify-between gap-4">
			<h2 class="text-lg font-semibold">Activity</h2>
			<a
				href={data.statusFilter
					? resolve(`/system/users/${data.profile.id}`)
					: resolve(`/system/users/${data.profile.id}?status=failure`)}
				class="text-sm underline decoration-transparent transition-colors hover:decoration-current"
			>
				{data.statusFilter ? 'Show everything' : 'Only failures'}
			</a>
		</div>

		<div class="mt-3">
			<ActivityTimeline
				rows={data.activity}
				emptyTitle={data.statusFilter ? 'Nothing has failed for them' : 'No activity recorded yet'}
				emptySubtitle={data.statusFilter
					? 'Every recorded action by this user succeeded.'
					: 'Anything this user does will appear here as it happens.'}
			/>
		</div>

		{#if data.hasMore}
			<p class="mt-4 text-sm text-muted-foreground">Showing the 100 most recent events.</p>
		{/if}
	</section>
</div>
