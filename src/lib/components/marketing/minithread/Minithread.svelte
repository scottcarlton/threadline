<script lang="ts">
	import MinithreadHeader from './MinithreadHeader.svelte';
	import MinithreadSidebar from './MinithreadSidebar.svelte';
	import MinithreadDock from './MinithreadDock.svelte';
</script>

<div class="flex h-full flex-col overflow-hidden bg-background">
	<MinithreadHeader />
	<div class="grid min-h-0 flex-1 grid-cols-[160px_1fr]">
		<div class="overflow-y-auto">
			<MinithreadSidebar />
		</div>
		<div class="flex flex-col">
			<div class="flex-1"></div>
			<MinithreadDock />
		</div>
	</div>
</div>
