<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const firstName = $derived(data.user?.display_name?.split(' ')[0] ?? 'there');
</script>

<div class="mx-auto max-w-3xl px-4 py-10">
	<header class="mb-8">
		<p class="font-mono text-sm text-muted-foreground">System</p>
		<h1 class="mt-1 text-3xl font-semibold">Welcome back, {firstName}.</h1>
		<p class="mt-2 text-sm text-muted-foreground">
			Operate Threadline from above the org line. Manage organizations, users, feature flags, and
			invites for the beta from here.
		</p>
	</header>

	<div class="rounded-lg border border-border bg-card p-6">
		<p class="text-sm font-semibold">Beta operations</p>
		<p class="mt-2 text-sm text-muted-foreground">
			This area is the role and nav shell. Each section ships in a follow-up.
		</p>
	</div>
</div>
