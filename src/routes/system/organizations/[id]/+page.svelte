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

	const orgTypeLabel: Record<string, string> = {
		rep: 'Rep agency',
		brand: 'Brand',
		retailer: 'Retailer'
	};

	const subtitle = $derived(
		[
			orgTypeLabel[data.organization.orgType] ?? data.organization.orgType,
			data.organization.location,
			`joined ${dateFormat.format(new Date(data.organization.createdAt))}`
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="mx-auto max-w-5xl px-4 py-10">
	<SystemHeader eyebrow="System / Organizations" title={data.organization.name} {subtitle} />

	<section class="mb-10">
		<h2 class="text-lg font-semibold">Members</h2>
		{#if data.members.length === 0}
			<p class="mt-2 text-sm text-muted-foreground">This organization has no members.</p>
		{:else}
			<ul class="mt-3 divide-y divide-border">
				{#each data.members as member (member.id)}
					<li class="flex items-baseline justify-between gap-4 py-2">
						<a
							href={resolve(`/system/users/${member.profileId}`)}
							class="text-sm underline decoration-transparent transition-colors hover:decoration-current"
						>
							{member.displayName}
						</a>
						<p class="text-sm text-muted-foreground">
							{member.role} · joined {dateFormat.format(new Date(member.joinedAt))}
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
					? resolve(`/system/organizations/${data.organization.id}`)
					: resolve(`/system/organizations/${data.organization.id}?status=failure`)}
				class="text-sm underline decoration-transparent transition-colors hover:decoration-current"
			>
				{data.statusFilter ? 'Show everything' : 'Only failures'}
			</a>
		</div>

		<div class="mt-3">
			<ActivityTimeline
				rows={data.activity}
				showOrganization={false}
				emptyTitle={data.statusFilter ? 'Nothing has failed here' : 'No activity recorded yet'}
				emptySubtitle={data.statusFilter
					? 'Every recorded action in this organization succeeded.'
					: 'Actions taken inside this organization will appear here as they happen.'}
			/>
		</div>

		{#if data.hasMore}
			<p class="mt-4 text-sm text-muted-foreground">Showing the 100 most recent events.</p>
		{/if}
	</section>
</div>
