<script lang="ts">
	import MinithreadHeader from './MinithreadHeader.svelte';
	import MinithreadSidebar from './MinithreadSidebar.svelte';
	import MinithreadDock from './MinithreadDock.svelte';
	import MinithreadOrders from './MinithreadOrders.svelte';
	import MinithreadProducts from './MinithreadProducts.svelte';

	type Props = {
		orgMode?: 'brand' | 'rep';
	};

	let { orgMode = 'brand' }: Props = $props();

	let activeItem = $state('Insight');

	$effect(() => {
		if (orgMode === 'brand' && activeItem === 'Brands') {
			activeItem = 'Insight';
		}
	});
</script>

<div class="flex h-full flex-col overflow-hidden bg-background">
	<MinithreadHeader />
	<div class="grid min-h-0 flex-1 grid-cols-[160px_1fr]">
		<div class="overflow-y-auto">
			<MinithreadSidebar {activeItem} {orgMode} onselect={(item) => (activeItem = item)} />
		</div>
		<div class="relative min-h-0">
			<div class="h-full overflow-hidden">
				{#if activeItem === 'Orders'}
					<MinithreadOrders />
				{:else if activeItem === 'Products'}
					<MinithreadProducts />
				{:else}
					<div class="flex h-full items-center justify-center">
						<span class="text-xs text-muted-foreground">{activeItem}</span>
					</div>
				{/if}
			</div>
			<div class="pointer-events-none absolute right-0 bottom-0 left-0 z-10">
				<div class="pointer-events-auto w-full">
					<MinithreadDock />
				</div>
			</div>
		</div>
	</div>
</div>
