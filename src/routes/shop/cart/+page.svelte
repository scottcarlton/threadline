<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cart } from '$lib/stores/cart.js';
	import SizeStepperSheet from '$lib/components/shared/SizeStepperSheet.svelte';
	import ColorSwatch from '$lib/components/shared/ColorSwatch.svelte';
	import ColorSwatchPicker from '$lib/components/shared/ColorSwatchPicker.svelte';
	import ColorPickerSheet from '$lib/components/shared/ColorPickerSheet.svelte';

	const items = $derived($cart);
	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	function getItemUnits(productId: string): number {
		const item = items.find((i) => i.productId === productId);
		if (!item) return 0;
		return Object.values(item.sizeQtys).reduce((s, q) => s + (q || 0), 0);
	}

	function getItemTotal(productId: string): number {
		const item = items.find((i) => i.productId === productId);
		if (!item) return 0;
		return getItemUnits(productId) * item.price;
	}

	const totalUnits = $derived(items.reduce((s, i) => s + getItemUnits(i.productId), 0));
	const grandTotal = $derived(items.reduce((s, i) => s + getItemTotal(i.productId), 0));

	function setQty(productId: string, size: string, value: number) {
		const item = items.find((i) => i.productId === productId);
		if (!item) return;
		const qty = Math.max(0, Math.floor(value) || 0);
		cart.updateItem(productId, {
			sizeQtys: { ...item.sizeQtys, [size]: qty }
		});
	}

	function setColor(productId: string, color: string) {
		cart.updateItem(productId, { selectedColor: color });
	}

	const canCheckout = $derived(
		items.length > 0 && items.every((i) => getItemUnits(i.productId) > 0)
	);

	function swipeToDelete(node: HTMLElement, opts: { onCommit: () => void }) {
		const MIN_REVEAL = 88;
		const COMMIT_RATIO = 0.45;
		const SLOP = 8;
		let startX = 0;
		let startY = 0;
		let currentDx = 0;
		let pointerId: number | null = null;
		let isSwiping = false;
		let revealed = false;
		let prevUserSelect = '';

		function setOffset(px: number) {
			node.style.transform = px === 0 ? '' : `translateX(${px}px)`;
		}

		function isInteractive(target: EventTarget | null) {
			if (!(target instanceof HTMLElement)) return false;
			return !!target.closest('button, input, select, textarea, a, [role="button"]');
		}

		function onPointerDown(e: PointerEvent) {
			if (e.pointerType === 'mouse' && e.button !== 0) return;
			if (isInteractive(e.target)) return;
			startX = e.clientX;
			startY = e.clientY;
			currentDx = revealed ? -MIN_REVEAL : 0;
			pointerId = e.pointerId;
			isSwiping = false;
			node.style.transition = 'none';
		}

		function onPointerMove(e: PointerEvent) {
			if (pointerId !== e.pointerId) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			if (!isSwiping) {
				if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
				if (Math.abs(dx) <= Math.abs(dy)) {
					pointerId = null;
					return;
				}
				isSwiping = true;
				prevUserSelect = node.style.userSelect;
				node.style.userSelect = 'none';
				try {
					node.setPointerCapture(e.pointerId);
				} catch {
					/* noop */
				}
			}
			const base = revealed ? -MIN_REVEAL : 0;
			currentDx = Math.min(0, base + dx);
			setOffset(currentDx);
			e.preventDefault();
		}

		function onPointerUp(e: PointerEvent) {
			if (pointerId !== e.pointerId) return;
			pointerId = null;
			if (!isSwiping) return;
			isSwiping = false;
			node.style.userSelect = prevUserSelect;
			node.style.transition = 'transform 180ms ease-out';
			const commitAt = node.clientWidth * COMMIT_RATIO;
			if (Math.abs(currentDx) >= commitAt) {
				setOffset(-node.clientWidth);
				revealed = false;
				setTimeout(() => opts.onCommit(), 170);
			} else if (Math.abs(currentDx) >= MIN_REVEAL) {
				revealed = true;
				setOffset(-MIN_REVEAL);
			} else {
				revealed = false;
				setOffset(0);
			}
		}

		function onPointerCancel(e: PointerEvent) {
			if (pointerId !== e.pointerId) return;
			pointerId = null;
			if (!isSwiping) return;
			isSwiping = false;
			node.style.userSelect = prevUserSelect;
			node.style.transition = 'transform 180ms ease-out';
			setOffset(revealed ? -MIN_REVEAL : 0);
		}

		node.style.touchAction = 'pan-y';
		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		node.addEventListener('pointerup', onPointerUp);
		node.addEventListener('pointercancel', onPointerCancel);

		return {
			destroy() {
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('pointermove', onPointerMove);
				node.removeEventListener('pointerup', onPointerUp);
				node.removeEventListener('pointercancel', onPointerCancel);
			}
		};
	}

	// Mobile sheets
	let sizingSheetProductId = $state<string | null>(null);
	const sizingSheetItem = $derived(
		sizingSheetProductId ? (items.find((i) => i.productId === sizingSheetProductId) ?? null) : null
	);

	let colorPickerProductId = $state<string | null>(null);
	const colorPickerItem = $derived(
		colorPickerProductId ? (items.find((i) => i.productId === colorPickerProductId) ?? null) : null
	);
</script>

<div class="space-y-6">
	<!-- Top nav -->
	<div class="flex items-center justify-between">
		<a
			href={resolve('/shop')}
			class="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
			</svg>
			Back to Shop
		</a>
		{#if items.length > 0}
			<Button variant="outline" size="sm" onclick={() => cart.clearCart()}>Clear All</Button>
		{/if}
	</div>

	<!-- Header / progress -->
	<div>
		<h1 class="text-2xl font-semibold">Cart</h1>
		<p class="text-sm text-muted-foreground">
			Step 1 of 3 — Cart
			{#if items.length > 0}
				· {items.length} item{items.length !== 1 ? 's' : ''}
				{#if totalUnits > 0}
					· {totalUnits} unit{totalUnits !== 1 ? 's' : ''}
				{/if}
			{/if}
		</p>
	</div>

	<div class="flex gap-1">
		<div class="h-1.5 flex-1 rounded-full bg-foreground" aria-label="Cart"></div>
		<div class="h-1.5 flex-1 rounded-full bg-border" aria-label="Delivery"></div>
		<div class="h-1.5 flex-1 rounded-full bg-border" aria-label="Finalize"></div>
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
			<p class="mt-2 text-sm text-muted-foreground">Browse the shop to add items</p>
			<Button href="/shop" variant="outline" class="mt-4">Browse Shop</Button>
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[1fr_320px]">
			<!-- Items list with sizing -->
			<div class="space-y-3">
				{#each items as item (item.productId)}
					{@const colors = item.colors ?? []}
					{@const sizes = item.sizes ?? []}
					{@const color = item.selectedColor || colors[0] || ''}
					{@const units = getItemUnits(item.productId)}
					{@const rowTotal = getItemTotal(item.productId)}

					<div class="group/item relative overflow-hidden rounded-lg border">
						<!-- Swipe-reveal delete button (behind the card) -->
						<div
							class="pointer-events-none absolute inset-y-0 right-0 flex w-22 items-center justify-center"
						>
							<button
								type="button"
								aria-label="Delete {item.productName}"
								class="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90"
								onclick={() => cart.removeItem(item.productId)}
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="currentColor"
									class="h-5 w-5"
								>
									<path
										d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
									/>
								</svg>
							</button>
						</div>

						<div
							class="relative bg-background"
							use:swipeToDelete={{
								onCommit: () => cart.removeItem(item.productId)
							}}
						>
							<!-- Mobile card — tap size grid to open sheet -->
							<div class="block sm:hidden">
								<div class="px-4 py-3">
									<div class="flex items-start gap-3">
										<a href={resolve(`/shop/${item.productId}`)} class="shrink-0">
											{#if item.imageUrl}
												<img
													src={item.imageUrl}
													alt={item.productName}
													class="h-12 w-12 rounded-md object-cover"
												/>
											{:else}
												<div
													class="flex h-12 w-12 items-center justify-center rounded-md bg-muted text-muted-foreground/40"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="1.5"
														class="h-5 w-5"
													>
														<rect x="3" y="3" width="18" height="18" rx="2" />
														<circle cx="8.5" cy="8.5" r="1.5" />
														<path d="M21 15l-5-5L5 21" />
													</svg>
												</div>
											{/if}
										</a>
										<div class="min-w-0 flex-1">
											<div class="font-mono text-sm text-muted-foreground/70">
												{item.styleNumber}
											</div>
											<div class="truncate text-sm font-semibold">{item.productName}</div>
											<div class="truncate text-sm text-muted-foreground">
												{item.brandName}{item.seasonName ? ` · ${item.seasonName}` : ''}
											</div>
										</div>
										<button
											type="button"
											class="shrink-0 self-start pt-1 transition active:scale-95 disabled:pointer-events-none"
											aria-label="Choose color for {item.productName}"
											disabled={colors.length === 0}
											onclick={() => (colorPickerProductId = item.productId)}
										>
											<ColorSwatch color={color || null} size={20} />
										</button>
									</div>

									<!-- Compact size grid — tap to open sheet -->
									{#if sizes.length > 0}
										<button
											type="button"
											class="mt-3 grid w-full gap-1.5 transition-opacity active:opacity-60"
											style="grid-template-columns: repeat({sizes.length}, minmax(0, 1fr));"
											aria-label="Edit sizes for {item.productName}"
											onclick={() => (sizingSheetProductId = item.productId)}
										>
											{#each sizes as size (size)}
												{@const qty = item.sizeQtys[size] ?? 0}
												<div
													class="flex flex-col items-center justify-center rounded-md border bg-muted/40 py-1.5 {qty ===
													0
														? 'border-dashed opacity-60'
														: ''}"
												>
													<div class="text-sm text-muted-foreground">{size}</div>
													<div class="font-mono text-sm">{qty}</div>
												</div>
											{/each}
										</button>
									{/if}

									<div class="mt-3 flex items-center justify-between">
										<div class="text-sm text-muted-foreground">
											{units}
											{units === 1 ? 'unit' : 'units'} · {fmt.format(item.price)}/ea
										</div>
										<div class="font-mono text-sm font-medium">{fmt.format(rowTotal)}</div>
									</div>
								</div>
							</div>

							<!-- Desktop row — full inline stepper -->
							<div class="hidden px-6 py-4 sm:block">
								<div class="flex items-center justify-between gap-6">
									<div class="flex min-w-0 flex-1 items-center gap-4">
										<a href={resolve(`/shop/${item.productId}`)} class="shrink-0">
											{#if item.imageUrl}
												<img
													src={item.imageUrl}
													alt={item.productName}
													class="h-16 w-16 rounded-md object-cover"
												/>
											{:else}
												<div
													class="flex h-16 w-16 items-center justify-center rounded-md bg-muted text-muted-foreground/40"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														viewBox="0 0 24 24"
														fill="none"
														stroke="currentColor"
														stroke-width="1.5"
														class="h-6 w-6"
													>
														<rect x="3" y="3" width="18" height="18" rx="2" />
														<circle cx="8.5" cy="8.5" r="1.5" />
														<path d="M21 15l-5-5L5 21" />
													</svg>
												</div>
											{/if}
										</a>
										<div class="min-w-0">
											<div class="text-sm text-muted-foreground">{item.styleNumber}</div>
											<div class="text-sm font-medium">{item.productName}</div>
											<div class="text-sm text-muted-foreground">
												{item.brandName}{item.seasonName ? ` · ${item.seasonName}` : ''}
											</div>
										</div>

										<!-- Color selector (desktop) -->
										{#if colors.length > 1}
											<div class="ml-4">
												<ColorSwatchPicker
													value={color || null}
													options={colors}
													onChange={(c) => {
														if (c) setColor(item.productId, c);
													}}
												/>
											</div>
										{:else}
											<div class="ml-4 flex items-center gap-2 text-sm">
												<ColorSwatch color={color || null} size={28} />
												{#if color}
													<span>{color}</span>
												{/if}
											</div>
										{/if}

										<div class="flex-1"></div>
									</div>

									<div class="shrink-0 text-right">
										<div class="font-mono text-sm font-medium">{fmt.format(rowTotal)}</div>
										<div class="text-sm text-muted-foreground">
											{units}
											{units === 1 ? 'unit' : 'units'} · {fmt.format(item.price)}/ea
										</div>
									</div>
								</div>

								<!-- Size grid (desktop) -->
								{#if sizes.length > 0}
									<div class="mt-3 flex flex-wrap items-start gap-3">
										<div
											class="grid gap-3"
											style="grid-template-columns: repeat({sizes.length}, minmax(0, 7rem));"
										>
											{#each sizes as size (size)}
												{@const qty = item.sizeQtys[size] ?? 0}
												<div
													role="group"
													aria-label="{item.productName} size {size} quantity"
													class="grid min-h-14 grid-cols-[2.5rem_1fr_2.5rem] overflow-hidden rounded-md border bg-muted/40 transition focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground/20 hover:border-foreground/20 {qty ===
													0
														? 'border-dashed opacity-60'
														: ''}"
												>
													<button
														type="button"
														aria-label="Decrease {size}"
														class="flex h-full w-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-30"
														disabled={qty === 0}
														onclick={() => setQty(item.productId, size, qty - 1)}
													>
														−
													</button>
													<div class="flex flex-col items-center justify-center px-1 text-center">
														<div class="text-sm text-muted-foreground">{size}</div>
														<input
															type="text"
															inputmode="numeric"
															pattern="[0-9]*"
															aria-label="{size} quantity"
															value={qty}
															oninput={(e) => {
																const raw = (e.currentTarget as HTMLInputElement).value.replace(
																	/[^0-9]/g,
																	''
																);
																setQty(item.productId, size, raw === '' ? 0 : parseInt(raw, 10));
															}}
															onkeydown={(e) => {
																if (e.key === 'ArrowUp') {
																	e.preventDefault();
																	setQty(item.productId, size, qty + 1);
																} else if (e.key === 'ArrowDown') {
																	e.preventDefault();
																	setQty(item.productId, size, qty - 1);
																} else if (e.key === 'Enter') {
																	e.preventDefault();
																	(e.currentTarget as HTMLInputElement).blur();
																}
															}}
															class="w-full bg-transparent text-center font-mono text-sm outline-none"
														/>
													</div>
													<button
														type="button"
														aria-label="Increase {size}"
														class="flex h-full w-full items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:outline-none focus-visible:ring-inset"
														onclick={() => setQty(item.productId, size, qty + 1)}
													>
														+
													</button>
												</div>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Desktop delete button — shows on hover -->
								<button
									type="button"
									aria-label="Remove {item.productName}"
									class="absolute right-3 bottom-3 hidden h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive opacity-0 transition-all group-hover/item:opacity-100 hover:bg-destructive/20 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-destructive/40 focus-visible:outline-none sm:inline-flex"
									onclick={() => cart.removeItem(item.productId)}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 24 24"
										fill="currentColor"
										class="h-4 w-4"
									>
										<path
											d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
										/>
									</svg>
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Summary -->
			<div class="h-fit lg:sticky lg:top-6">
				<div class="space-y-4 rounded-none border bg-card p-5">
					<h2 class="text-base font-semibold">Summary</h2>
					<dl class="space-y-2 text-sm">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Items</dt>
							<dd>{items.length}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Total Units</dt>
							<dd>{totalUnits}</dd>
						</div>
						<div class="h-px bg-border"></div>
						<div class="flex justify-between text-base">
							<dt>Estimated Total</dt>
							<dd class="font-semibold">{fmt.format(grandTotal)}</dd>
						</div>
					</dl>
					<Button
						href={canCheckout ? '/shop/checkout' : undefined}
						class="w-full"
						disabled={!canCheckout}
					>
						Proceed to Checkout
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Mobile sizing sheet -->
<SizeStepperSheet
	open={sizingSheetProductId !== null}
	onClose={() => (sizingSheetProductId = null)}
	styleNumber={sizingSheetItem?.styleNumber}
	name={sizingSheetItem?.productName}
	brand={sizingSheetItem?.brandName}
	season={sizingSheetItem?.seasonName}
	color={sizingSheetItem?.selectedColor || null}
	imageUrl={sizingSheetItem?.imageUrl}
	unitPrice={sizingSheetItem?.price}
	sizes={sizingSheetItem?.sizes}
	qtys={sizingSheetItem?.sizeQtys}
	onChange={(size, qty) => {
		if (sizingSheetProductId) setQty(sizingSheetProductId, size, qty);
	}}
	onColorPickerOpen={() => {
		const id = sizingSheetProductId;
		sizingSheetProductId = null;
		if (id) colorPickerProductId = id;
	}}
/>

<!-- Mobile color picker sheet -->
<ColorPickerSheet
	open={colorPickerProductId !== null}
	onClose={() => (colorPickerProductId = null)}
	styleNumber={colorPickerItem?.styleNumber}
	name={colorPickerItem?.productName}
	brand={colorPickerItem?.brandName}
	season={colorPickerItem?.seasonName}
	imageUrl={colorPickerItem?.imageUrl}
	colors={colorPickerItem?.colors}
	selected={colorPickerItem?.selectedColor || null}
	onSelect={(c) => {
		if (colorPickerProductId) setColor(colorPickerProductId, c);
		colorPickerProductId = null;
	}}
/>
