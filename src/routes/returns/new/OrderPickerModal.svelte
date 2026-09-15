<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';

	export type PickerOrder = {
		id: string;
		orderNumber: string | null;
		total: number;
		deliveredAt: string | null;
		brandId: string;
		brandName: string | null;
		accountName: string | null;
	};

	type Props = {
		open: boolean;
		orders: PickerOrder[];
		/** Hidden when the viewer already owns every row, per the role-aware audit. */
		showBrand?: boolean;
		onSelect: (order: PickerOrder) => void;
	};

	let { open = $bindable(false), orders, showBrand = true, onSelect }: Props = $props();

	let query = $state('');

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return orders;
		return orders.filter((o) =>
			[o.orderNumber, o.brandName, o.accountName].some((v) => v?.toLowerCase().includes(q))
		);
	});

	const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function formatDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function choose(order: PickerOrder) {
		onSelect(order);
		open = false;
		query = '';
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
		/>
		<Dialog.Content
			class="fixed top-[50%] left-[50%] z-50 flex max-h-[80dvh] w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] flex-col rounded-lg border bg-background shadow-lg"
		>
			<div class="border-b p-6 pb-4">
				<Dialog.Title class="text-lg font-semibold">Choose an order</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted-foreground">
					Delivered orders only. The return window runs from the delivery date.
				</Dialog.Description>
				<Input
					class="mt-4"
					placeholder="Search by order number, account, or brand"
					bind:value={query}
				/>
			</div>

			<div class="min-h-0 flex-1 overflow-y-auto p-2">
				{#if filtered.length === 0}
					<div class="px-4 py-12 text-center">
						<p class="text-sm text-muted-foreground">
							{orders.length === 0 ? 'No delivered orders yet.' : 'No orders match that search.'}
						</p>
					</div>
				{:else}
					{#each filtered as order (order.id)}
						<button
							type="button"
							class="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60"
							onclick={() => choose(order)}
						>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium">
									{order.orderNumber ?? 'Order'}
								</span>
								<span class="mt-0.5 block truncate text-sm text-muted-foreground">
									{[order.accountName, showBrand ? order.brandName : null]
										.filter(Boolean)
										.join(' · ')}
								</span>
							</span>
							<span class="shrink-0 text-right">
								<span class="block text-sm tabular-nums">{money.format(order.total)}</span>
								<span class="mt-0.5 block text-sm text-muted-foreground">
									{formatDate(order.deliveredAt)}
								</span>
							</span>
						</button>
					{/each}
				{/if}
			</div>

			<div class="flex justify-end border-t p-4">
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} variant="ghost">Cancel</Button>
					{/snippet}
				</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
