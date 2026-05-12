<script lang="ts">
	type DemoProduct = {
		styleNumber: string;
		name: string;
		brand: string;
		season: string;
		price: string;
		color: string;
	};

	const products: DemoProduct[] = [
		{
			styleNumber: 'RB-4421',
			name: 'Wool Blend Blazer',
			brand: 'Rag & Bone',
			season: 'Fall 2026',
			price: '$495',
			color: 'bg-stone-300'
		},
		{
			styleNumber: 'VN-1187',
			name: 'Cashmere Crew Sweater',
			brand: 'Vince',
			season: 'Fall 2026',
			price: '$365',
			color: 'bg-amber-100'
		},
		{
			styleNumber: 'TH-3302',
			name: 'Stretch Trouser',
			brand: 'Theory',
			season: 'Resort 2027',
			price: '$295',
			color: 'bg-zinc-200'
		},
		{
			styleNumber: 'RB-4455',
			name: 'Leather Moto Jacket',
			brand: 'Rag & Bone',
			season: 'Fall 2026',
			price: '$895',
			color: 'bg-stone-400'
		},
		{
			styleNumber: 'VN-1203',
			name: 'Silk Cami',
			brand: 'Vince',
			season: 'Resort 2027',
			price: '$225',
			color: 'bg-rose-100'
		},
		{
			styleNumber: 'TH-3318',
			name: 'Linen Blazer',
			brand: 'Theory',
			season: 'Resort 2027',
			price: '$425',
			color: 'bg-sky-100'
		},
		{
			styleNumber: 'RB-4470',
			name: 'Cotton Henley',
			brand: 'Rag & Bone',
			season: 'Fall 2026',
			price: '$165',
			color: 'bg-neutral-200'
		},
		{
			styleNumber: 'VN-1220',
			name: 'Pleated Midi Skirt',
			brand: 'Vince',
			season: 'Resort 2027',
			price: '$315',
			color: 'bg-neutral-200'
		}
	];
</script>

<div class="flex flex-col">
	<!-- PageHeader -->
	<div class="flex items-center justify-between px-3 pt-3 pb-2">
		<div>
			<h2 class="text-base">Products</h2>
			<p class="text-[10px] text-muted-foreground">
				{products.length} product{products.length !== 1 ? 's' : ''}
			</p>
		</div>
		<div class="flex items-center gap-1.5">
			<button
				type="button"
				class="cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted/50"
			>
				Import
			</button>
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
				Add Product
			</button>
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
				placeholder="Search products..."
				class="w-full rounded-sm border border-input bg-background py-1 pr-2 pl-6 text-[10px] transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/20 focus-visible:outline-none"
			/>
		</div>
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
			Category
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
			Price
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

	<!-- Product grid -->
	<div class="grid grid-cols-4 gap-2 px-3">
		{#each products as product (product.styleNumber)}
			<div class="group cursor-pointer transition-all duration-200">
				<!-- Image placeholder -->
				<div class="flex aspect-square w-full items-center justify-center bg-muted">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-muted-foreground/30"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a2.25 2.25 0 002.25-2.25V5.25a2.25 2.25 0 00-2.25-2.25H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
						/>
					</svg>
				</div>
				<!-- Card info -->
				<div class="py-2">
					<p class="text-[8px] text-muted-foreground">{product.styleNumber}</p>
					<div class="mt-0.5 flex items-start justify-between gap-1">
						<div class="min-w-0">
							<p class="truncate text-[10px] font-medium">{product.name}</p>
							<p class="mt-0.5 text-[9px] text-muted-foreground">
								{product.brand} · {product.season}
							</p>
						</div>
						<p class="shrink-0 text-[10px] font-medium">{product.price}</p>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
