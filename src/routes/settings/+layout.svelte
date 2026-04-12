<script lang="ts">
	let { children } = $props();
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-3xl">Settings</h1>
		<p class="mt-1 text-sm font-mono text-muted-foreground">Manage your profile and preferences</p>
	</div>

	{@render children?.()}
</div>
