<script lang="ts">
	import '../../app.css';
	let { children } = $props();
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="w-full max-w-md px-4">
		<div class="mb-8 text-center">
			<h1 class="text-3xl font-bold tracking-tight">ThreadLine</h1>
			<p class="mt-1 text-sm text-muted-foreground">Wholesale contractor portal</p>
		</div>
		{@render children()}
	</div>
</div>
