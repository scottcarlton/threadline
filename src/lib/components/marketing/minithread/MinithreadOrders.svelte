<script lang="ts">
	type DemoOrder = {
		account: string;
		orderNumber: string;
		season: string;
		status: string;
		brand: string;
		source: string;
		created: string;
		total: string;
		spotlight?: string[];
	};

	const orders: DemoOrder[] = [
		{
			account: 'Nordstrom',
			orderNumber: 'ORD-1042',
			season: 'Fall 2026',
			status: 'confirmed',
			brand: 'Rag & Bone',
			source: 'CALA',
			created: 'May 2, 2026',
			total: '$14,200',
			spotlight: ['in_window']
		},
		{
			account: 'Saks Fifth Avenue',
			orderNumber: 'ORD-1038',
			season: 'Fall 2026',
			status: 'submitted',
			brand: 'Vince',
			source: 'Road',
			created: 'Apr 28, 2026',
			total: '$8,750',
			spotlight: ['approaching_complete']
		},
		{
			account: 'Neiman Marcus',
			orderNumber: 'ORD-1035',
			season: 'Resort 2027',
			status: 'confirmed',
			brand: 'Theory',
			source: 'Coterie',
			created: 'Apr 22, 2026',
			total: '$22,400',
			spotlight: ['overdue']
		},
		{
			account: 'Bergdorf Goodman',
			orderNumber: 'ORD-1029',
			season: 'Fall 2026',
			status: 'shipped',
			brand: 'Rag & Bone',
			source: 'Road',
			created: 'Apr 15, 2026',
			total: '$11,600'
		},
		{
			account: 'Bloomingdales',
			orderNumber: 'ORD-1024',
			season: 'Fall 2026',
			status: 'draft',
			brand: 'Vince',
			source: 'Road',
			created: 'Mar 30, 2026',
			total: '$6,300',
			spotlight: ['stale_draft']
		},
		{
			account: 'Shopbop',
			orderNumber: 'ORD-1019',
			season: 'Resort 2027',
			status: 'delivered',
			brand: 'Theory',
			source: 'CALA',
			created: 'Mar 18, 2026',
			total: '$19,100'
		}
	];

	const statusBadgeColors: Record<string, string> = {
		draft: 'bg-zinc-100 text-zinc-600',
		submitted: 'bg-amber-50 text-amber-700',
		confirmed: 'bg-blue-50 text-blue-700',
		preparing: 'bg-violet-50 text-violet-700',
		shipped: 'bg-indigo-50 text-indigo-700',
		delivered: 'bg-emerald-50 text-emerald-700',
		cancelled: 'bg-red-50 text-red-700'
	};

	const statusLabels: Record<string, string> = {
		draft: 'Draft',
		submitted: 'Submitted',
		confirmed: 'Confirmed',
		preparing: 'Preparing',
		shipped: 'Shipped',
		delivered: 'Delivered',
		cancelled: 'Cancelled'
	};

	const SPOTLIGHT_LABELS: Record<string, string> = {
		overdue: 'Overdue',
		approaching_start: 'Starts soon (<7d)',
		in_window: 'Needs shipped (within window)',
		approaching_complete: 'Closing soon (<7d)',
		stale_draft: 'Stale (>21d)'
	};

	const SPOTLIGHT_BUCKETS = [
		'overdue',
		'approaching_start',
		'in_window',
		'approaching_complete',
		'stale_draft'
	];

	let spotlightActive = $state<string | null>(null);
	let spotlightMenuOpen = $state(false);

	const spotlightOn = $derived(spotlightActive != null);

	const spotlightCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		counts.total = orders.filter((o) => o.spotlight && o.spotlight.length > 0).length;
		for (const b of SPOTLIGHT_BUCKETS) {
			counts[b] = orders.filter((o) => o.spotlight?.includes(b)).length;
		}
		return counts;
	});

	const filtered = $derived.by(() => {
		if (!spotlightActive) return orders;
		if (spotlightActive === 'all')
			return orders.filter((o) => o.spotlight && o.spotlight.length > 0);
		return orders.filter((o) => o.spotlight?.includes(spotlightActive!));
	});

	function toggleSpotlight() {
		spotlightActive = spotlightActive ? null : 'all';
	}

	function setSpotlight(bucket: string | null) {
		spotlightActive = bucket;
		spotlightMenuOpen = false;
	}
</script>

<div class="flex flex-col">
	<!-- PageHeader -->
	<div class="flex items-center justify-between px-3 pt-3 pb-2">
		<div>
			<h2 class="text-base">{filtered.length === orders.length ? 'Orders' : 'Orders'}</h2>
			<p class="text-[10px] text-muted-foreground">
				{filtered.length} Order{filtered.length !== 1 ? 's' : ''}
			</p>
		</div>
		<button
			type="button"
			class="flex cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="-ml-0.5 h-3 w-3"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			New Order
		</button>
	</div>

	<!-- Type tabs: Orders / Notes + Spotlight -->
	<div class="flex items-end justify-between border-b px-3">
		<div class="flex gap-0.5">
			<button
				type="button"
				class="-mb-px cursor-pointer px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap text-foreground"
				style="border-bottom: 1px solid currentColor"
			>
				Orders
			</button>
			<button
				type="button"
				class="-mb-px cursor-pointer px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap text-muted-foreground"
				style="border-bottom: 1px solid transparent"
			>
				Notes
			</button>
		</div>

		<div class="flex items-center pb-0.5">
			<button
				type="button"
				class="inline-flex cursor-pointer items-center gap-1.5 rounded-l-md py-0.5 pr-1.5 pl-1.5 text-[10px] font-medium transition-colors hover:bg-muted/50"
				onclick={toggleSpotlight}
			>
				<span class="relative flex h-1.5 w-1.5 items-center justify-center">
					{#if spotlightOn && spotlightCounts.total > 0}
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500/60"
						></span>
					{/if}
					<span
						class="relative inline-flex h-1.5 w-1.5 rounded-full {spotlightCounts.total === 0
							? 'bg-muted-foreground/40'
							: spotlightOn
								? 'bg-amber-500'
								: 'bg-amber-500/60'}"
					></span>
				</span>
				<span>Spotlight</span>
				<span
					class="inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-md bg-muted px-1 text-[8px] tabular-nums {spotlightOn
						? 'text-foreground'
						: 'text-muted-foreground'}"
				>
					{spotlightCounts.total}
				</span>
			</button>

			<div class="relative">
				<button
					type="button"
					class="inline-flex h-5 w-4 cursor-pointer items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					onclick={() => (spotlightMenuOpen = !spotlightMenuOpen)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-3 w-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
					</svg>
				</button>

				{#if spotlightMenuOpen}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="fixed inset-0 z-40" onclick={() => (spotlightMenuOpen = false)}></div>
					<div
						class="absolute top-full right-0 z-50 mt-1 w-48 rounded-md border bg-background p-0.5 shadow-lg"
					>
						<button
							type="button"
							class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[10px] hover:bg-muted/60 {spotlightActive ===
							'all'
								? 'bg-muted/40 font-medium'
								: ''}"
							onclick={() => setSpotlight('all')}
						>
							<span class="flex items-center gap-1.5">
								{#if spotlightActive === 'all'}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-3 w-3"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
										stroke-width="2"
									>
										<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
									</svg>
								{:else}
									<span class="inline-block h-3 w-3"></span>
								{/if}
								All issues
							</span>
							<span class="text-muted-foreground tabular-nums">{spotlightCounts.total}</span>
						</button>
						<div class="my-0.5 h-px bg-border"></div>
						{#each SPOTLIGHT_BUCKETS as bucket (bucket)}
							{@const fullLabel = SPOTLIGHT_LABELS[bucket]}
							{@const hintIdx = fullLabel.indexOf(' (')}
							{@const labelName = hintIdx >= 0 ? fullLabel.slice(0, hintIdx) : fullLabel}
							{@const labelHint = hintIdx >= 0 ? fullLabel.slice(hintIdx + 1) : ''}
							<button
								type="button"
								class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-[10px] hover:bg-muted/60 {spotlightActive ===
								bucket
									? 'bg-muted/40 font-medium'
									: ''}"
								onclick={() => setSpotlight(bucket)}
							>
								<span class="flex items-center gap-1.5">
									{#if spotlightActive === bucket}
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{:else}
										<span class="inline-block h-3 w-3"></span>
									{/if}
									{labelName}
									{#if labelHint}
										<span class="text-[8px] text-muted-foreground">{labelHint}</span>
									{/if}
								</span>
								<span class="text-muted-foreground tabular-nums">{spotlightCounts[bucket]}</span>
							</button>
						{/each}
						{#if spotlightOn}
							<div class="my-0.5 h-px bg-border"></div>
							<button
								type="button"
								class="flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-[10px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
								onclick={() => setSpotlight(null)}
							>
								<span class="inline-block h-3 w-3"></span>
								Clear spotlight
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Analytics Cards -->
	<div class="grid grid-cols-4 gap-2 px-3 py-2.5">
		<div class="rounded-lg border px-2 pt-2 pb-2">
			<p class="font-mono text-[8px] font-medium text-muted-foreground">Pipeline Value</p>
			<p class="mt-0.5 text-sm font-semibold">$82K</p>
			<p class="mt-0.5 font-mono text-[8px] text-muted-foreground">$13.7K avg</p>
		</div>
		<div class="rounded-lg border px-2 pt-2 pb-2">
			<p class="font-mono text-[8px] font-medium text-muted-foreground">Delivered Revenue</p>
			<p class="mt-0.5 text-sm font-semibold">$34K</p>
			<p class="mt-0.5 font-mono text-[8px] text-muted-foreground">2 shipped</p>
		</div>
		<div class="rounded-lg border px-2 pt-2 pb-2">
			<p class="font-mono text-[8px] font-medium text-muted-foreground">Needs Attention</p>
			<p class="mt-0.5 text-sm font-semibold">2</p>
			<p class="mt-0.5 font-mono text-[8px] text-muted-foreground">1 stale, 1 overdue</p>
		</div>
		<div class="rounded-lg border px-2 pt-2 pb-2">
			<p class="font-mono text-[8px] font-medium text-muted-foreground">Conversion Rate</p>
			<p class="mt-0.5 text-sm font-semibold">67%</p>
			<p class="mt-0.5 font-mono text-[8px] text-muted-foreground">4 of 6 submitted</p>
		</div>
	</div>

	<!-- Toolbar -->
	<div class="flex items-center gap-1.5 px-3 pb-2">
		<div class="relative flex-1">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
			<input
				type="text"
				placeholder="Search orders..."
				class="w-full rounded-sm border border-input bg-background py-1 pr-2 pl-6 text-[10px] transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:outline-none"
			/>
		</div>
		<button
			type="button"
			class="flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-input bg-background px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50"
		>
			Status
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-2.5 w-2.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
			</svg>
		</button>
		<button
			type="button"
			class="flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-input bg-background px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50"
		>
			Season
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-2.5 w-2.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
			</svg>
		</button>
		<button
			type="button"
			class="flex shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-input bg-background px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50"
		>
			Brand
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-2.5 w-2.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
			</svg>
		</button>
	</div>

	<!-- Table -->
	<div>
		<table class="w-full">
			<thead>
				<tr class="border-b">
					<th class="w-5 py-1.5 pr-0.5 pl-2">
						<div class="flex h-3.5 items-center justify-center">
							<span class="block h-1.5 w-1.5"></span>
						</div>
					</th>
					<th
						class="px-2 py-1.5 text-left text-[8px] font-medium tracking-widest text-muted-foreground/70 uppercase"
						>Order</th
					>
					<th
						class="px-2 py-1.5 text-center text-[8px] font-medium tracking-widest text-muted-foreground/70 uppercase"
						>Status</th
					>
					<th
						class="px-2 py-1.5 text-left text-[8px] font-medium tracking-widest text-muted-foreground/70 uppercase"
						>Brand</th
					>
					<th
						class="px-2 py-1.5 text-left text-[8px] font-medium tracking-widest text-muted-foreground/70 uppercase"
						>Source</th
					>
					<th
						class="px-2 py-1.5 text-left text-[8px] font-medium tracking-widest text-muted-foreground/70 uppercase"
						>Created</th
					>
					<th
						class="px-2 py-1.5 text-right text-[8px] font-medium tracking-widest text-muted-foreground/70 uppercase"
						>Total</th
					>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each filtered as order (order.orderNumber)}
					<tr class="group cursor-pointer transition-colors hover:bg-muted/30">
						<td class="w-5 py-2 pr-0.5 pl-2 align-top">
							<div class="flex h-3.5 items-center justify-center">
								{#if order.spotlight && order.spotlight.length > 0}
									<span
										class="block h-1.5 w-1.5 rounded-full {order.spotlight.includes('overdue')
											? 'bg-red-500'
											: 'bg-amber-500'}"
									></span>
								{/if}
							</div>
						</td>
						<td class="px-2 py-2">
							<p class="text-[10px] text-muted-foreground">{order.account}</p>
							<p class="font-mono text-xs font-medium">{order.orderNumber}</p>
							<p class="font-mono text-[10px] text-muted-foreground">{order.season}</p>
						</td>
						<td class="px-2 py-2 text-center">
							<span
								class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-medium {statusBadgeColors[
									order.status
								] ?? 'bg-zinc-100 text-zinc-500'}"
							>
								{statusLabels[order.status] ?? order.status}
							</span>
						</td>
						<td class="px-2 py-2">
							<span class="text-[10px]">{order.brand}</span>
						</td>
						<td class="px-2 py-2">
							<span class="text-[10px]">{order.source}</span>
						</td>
						<td class="px-2 py-2">
							<p class="font-mono text-[9px] text-muted-foreground">{order.created}</p>
						</td>
						<td class="px-2 py-2 text-right font-mono text-[10px]">
							{order.total}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
