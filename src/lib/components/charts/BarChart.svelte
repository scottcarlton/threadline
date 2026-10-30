<script lang="ts">
	/**
	 * Horizontal single-series bar chart (SCO-150).
	 *
	 * Rendered on the server like the rest of the page, so it appears with the
	 * table and prints. Bars are SVG rects rather than CSS backgrounds because
	 * browsers drop background colors when printing but keep SVG fills.
	 *
	 * Only the largest few values are labelled. Every bar carries the exact value
	 * in a tooltip (on hover or focus) and in its accessible name, and the table
	 * below the chart remains the full view of the same rows.
	 */
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip/index.js';
	import type { ReportChart } from '$lib/utils/report-chart.js';

	let {
		chart,
		labelled = 3,
		class: className = ''
	}: { chart: ReportChart; labelled?: number; class?: string } = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	function format(value: number): string {
		return chart.format === 'percent' ? `${Math.round(value)}%` : currency.format(value);
	}

	// A percent is drawn against 100, so 40% sell-through looks like 40%; a
	// currency is drawn against the largest bar.
	const max = $derived(
		chart.format === 'percent' ? 100 : Math.max(...chart.bars.map((b) => b.value), 0)
	);
	const total = $derived(chart.bars.reduce((s, b) => s + b.value, 0));

	// Indexes of the largest values, which get a visible label wherever they
	// sit in the order.
	const labelledIndexes = $derived(
		new Set(
			chart.bars
				.map((b, i) => ({ v: b.value, i }))
				.sort((a, b) => b.v - a.v)
				.slice(0, labelled)
				.map((x) => x.i)
		)
	);

	function width(value: number): number {
		if (max <= 0 || value <= 0) return 0;
		// Keep a sliver for a value too small to see, so it still reads as data.
		return Math.max((Math.min(value, max) / max) * 100, 0.5);
	}

	// The trigger props are written for a <button>; `type` means nothing on the
	// row's <div>. Its tabindex stays, so the tooltip also opens on focus.
	function rowProps(props: Record<string, unknown>): Record<string, unknown> {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { type, ...rest } = props;
		return rest;
	}

	function share(value: number): string | null {
		if (chart.format === 'percent' || total <= 0) return null;
		return `${Math.round((value / total) * 100)}% of total`;
	}
</script>

<figure class="rounded-none border p-4 {className}">
	<figcaption class="mb-3 text-sm font-medium">{chart.title}</figcaption>
	<TooltipProvider delayDuration={150}>
		<div role="list">
			{#each chart.bars as bar, i (`${i}:${bar.label}`)}
				<Tooltip>
					<TooltipTrigger>
						{#snippet child({ props })}
							<div
								{...rowProps(props)}
								role="listitem"
								aria-label="{bar.label}: {format(bar.value)}"
								class="grid grid-cols-[minmax(0,8rem)_1fr_5rem] items-center gap-3 px-1 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:grid-cols-[minmax(0,14rem)_1fr_6rem]"
							>
								<span class="truncate py-1.5 text-sm {bar.isOther ? 'text-muted-foreground' : ''}"
									>{bar.label}</span
								>
								<span class="flex h-full items-center border-l">
									<svg
										class="h-2.5 w-full"
										viewBox="0 0 100 10"
										preserveAspectRatio="none"
										aria-hidden="true"
									>
										<rect
											x="0"
											y="0"
											width={width(bar.value)}
											height="10"
											class={bar.isOther ? 'fill-muted-foreground' : 'fill-foreground'}
										/>
									</svg>
								</span>
								<span class="text-right font-mono text-sm text-muted-foreground"
									>{labelledIndexes.has(i) ? format(bar.value) : ''}</span
								>
							</div>
						{/snippet}
					</TooltipTrigger>
					<TooltipContent side="top" sideOffset={4}>
						<p class="font-medium">
							{bar.isOther ? `Other (${bar.count} more)` : bar.label}
						</p>
						<p class="font-mono">{format(bar.value)}</p>
						{#if share(bar.value)}
							<p class="text-muted-foreground">{share(bar.value)}</p>
						{/if}
					</TooltipContent>
				</Tooltip>
			{/each}
		</div>
	</TooltipProvider>
</figure>
