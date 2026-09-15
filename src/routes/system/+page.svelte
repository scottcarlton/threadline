<script lang="ts">
	import { resolve } from '$app/paths';
	import SystemHeader from '$lib/components/system/SystemHeader.svelte';
	import ActivityTimeline from '$lib/components/system/ActivityTimeline.svelte';

	let { data } = $props();

	// Not split on the first word: the console account is named "System User",
	// and "Welcome back, System." reads like a truncation.
	const greetingName = $derived(data.user?.display_name ?? 'there');

	const numberFormat = new Intl.NumberFormat('en-US');
</script>

<div class="mx-auto max-w-5xl px-4 py-10">
	<SystemHeader
		title="Welcome back, {greetingName}."
		subtitle="Operate Threadline from above the org line."
	/>

	<div class="grid gap-4 sm:grid-cols-3">
		<a
			href={resolve('/system/organizations')}
			class="rounded-lg border border-border bg-card p-6 transition-colors hover:border-foreground"
		>
			<p class="text-3xl font-semibold">{numberFormat.format(data.stats.organizations)}</p>
			<p class="mt-1 text-sm text-muted-foreground">Organizations</p>
		</a>
		<a
			href={resolve('/system/users')}
			class="rounded-lg border border-border bg-card p-6 transition-colors hover:border-foreground"
		>
			<p class="text-3xl font-semibold">{numberFormat.format(data.stats.users)}</p>
			<p class="mt-1 text-sm text-muted-foreground">Users</p>
		</a>
		<div class="rounded-lg border border-border bg-card p-6">
			<p class="text-3xl font-semibold" class:text-destructive={data.stats.failuresToday > 0}>
				{numberFormat.format(data.stats.failuresToday)}
			</p>
			<p class="mt-1 text-sm text-muted-foreground">Failures in the last 24 hours</p>
		</div>
	</div>

	<section class="mt-10">
		<h2 class="text-lg font-semibold">Recent activity</h2>
		<div class="mt-3">
			<ActivityTimeline
				rows={data.activity}
				emptyTitle="Nothing has happened yet"
				emptySubtitle="Actions taken across every organization will appear here as they happen."
			/>
		</div>
	</section>
</div>
