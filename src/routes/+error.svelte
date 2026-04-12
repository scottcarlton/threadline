<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
</script>

<div class="flex min-h-[60vh] items-center justify-center px-4">
	<div class="text-center">
		<p class="text-6xl font-bold text-muted-foreground/30">
			{$page.status}
		</p>
		<h1 class="mt-4 text-xl font-semibold">
			{$page.error?.message ?? 'Something went wrong'}
		</h1>
		<p class="mt-2 text-[13px] text-muted-foreground">
			The page you were looking for could not be loaded.
		</p>
		<div class="mt-8">
			<Button href="/insight">Go home</Button>
		</div>
	</div>
</div>
