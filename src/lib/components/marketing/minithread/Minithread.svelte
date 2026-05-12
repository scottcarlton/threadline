<script lang="ts">
	import MinithreadHeader from './MinithreadHeader.svelte';
	import MinithreadSidebar from './MinithreadSidebar.svelte';
	import MinithreadDock from './MinithreadDock.svelte';

	let activeItem = $state('Insight');
</script>

<div class="flex h-full flex-col overflow-hidden bg-background">
	<MinithreadHeader />
	<div class="grid min-h-0 flex-1 grid-cols-[160px_1fr]">
		<div class="overflow-y-auto">
			<MinithreadSidebar {activeItem} onselect={(item) => (activeItem = item)} />
		</div>
		<div class="flex flex-col">
			<div class="flex flex-1 items-center justify-center">
				<span class="text-xs text-muted-foreground">{activeItem}</span>
			</div>
			<MinithreadDock />
		</div>
	</div>
</div>
