<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { cart } from '$lib/stores/cart.js';

	const items = $derived($cart);
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
	const totalPrice = $derived(items.reduce((sum, i) => sum + i.price, 0));
	const brandCount = $derived(new Set(items.map((i) => i.brandName)).size);
</script>

<div class="mx-auto max-w-5xl space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl">Cart</h1>
			<p class="mt-1 text-base text-muted-foreground">
				{items.length} item{items.length !== 1 ? 's' : ''}
			</p>
		</div>
		{#if items.length > 0}
			<Button variant="outline" size="sm" onclick={() => cart.clearCart()}>Clear All</Button>
		{/if}
	</div>

	{#if items.length === 0}
		<div class="rounded-none p-12 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mx-auto h-16 w-16 text-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="0.4"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">Your cart is empty</p>
			<p class="mt-2 text-base text-muted-foreground">Browse the shop to add items</p>
			<Button href="/shop" variant="outline" class="mt-4">Browse Shop</Button>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
			<!-- Items list -->
			<div class="space-y-3">
				{#each items as item}
					<div class="flex items-center gap-4 rounded-none border bg-card p-4">
						<a href="/shop/{item.productId}" class="shrink-0">
							{#if item.imageUrl}
								<img
									src={item.imageUrl}
									alt={item.productName}
									class="h-16 w-16 rounded-lg object-cover"
								/>
							{:else}
								<div class="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-6 w-6 text-muted-foreground"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="1"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
										/>
									</svg>
								</div>
							{/if}
						</a>
						<div class="min-w-0 flex-1">
							<a href="/shop/{item.productId}" class="text-base font-normal hover:underline"
								>{item.productName}</a
							>
							<p class="text-base text-muted-foreground">
								{item.brandName} &middot; {item.styleNumber}
							</p>
						</div>
						<div class="text-base font-normal">{fmt.format(item.price)}</div>
						<button
							class="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							onclick={() => cart.removeItem(item.productId)}
							aria-label="Remove from cart"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</button>
					</div>
				{/each}
			</div>

			<!-- Summary -->
			<div class="h-fit lg:sticky lg:top-6">
				<div class="space-y-4 rounded-none border bg-card p-5">
					<h2 class="text-base font-semibold">Summary</h2>
					<dl class="space-y-2 text-base">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Items</dt>
							<dd class="font-normal">{items.length}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Brands</dt>
							<dd class="font-normal">{brandCount}</dd>
						</div>
						<div class="h-px bg-border"></div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Estimated Total</dt>
							<dd class="font-semibold">{fmt.format(totalPrice)}</dd>
						</div>
					</dl>
					<p class="text-sm text-muted-foreground">
						Select quantities and delivery windows at checkout.
					</p>
					<Button href="/shop/checkout" class="w-full">Proceed to Checkout</Button>
					<Button href="/shop" variant="outline" class="w-full">Continue Shopping</Button>
				</div>
			</div>
		</div>
	{/if}
</div>
