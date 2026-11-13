<script lang="ts">
	/**
	 * Monthly trend line with a prior-year comparison (SCO-148).
	 *
	 * One measure at a time, on one axis: the recent 12 months as a solid line
	 * and the same months a year earlier as a muted dashed line. Hand-rolled SVG
	 * like BarChart, so it renders on the server and prints.
	 *
	 * Each month has an HTML column laid over the plot as its hover and focus
	 * target. It carries the exact values in a tooltip and in its accessible
	 * name, and a visually hidden table holds the same numbers.
	 */
	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip/index.js';
	import {
		changeFromPrior,
		niceTicks,
		type TrendMeasure,
		type TrendMonth
	} from '$lib/utils/sales-trend.js';

	let {
		months,
		measure,
		class: className = ''
	}: { months: TrendMonth[]; measure: TrendMeasure; class?: string } = $props();

	const HEIGHT = 220;
	const PAD = { top: 12, right: 8, bottom: 28, left: 52 };

	// Measured on the client; the server renders at a sensible default width.
	let width = $state(640);
	const plotW = $derived(Math.max(width - PAD.left - PAD.right, 1));
	const plotH = HEIGHT - PAD.top - PAD.bottom;

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
	const compactCurrency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		notation: 'compact',
		maximumFractionDigits: 1
	});
	const count = new Intl.NumberFormat('en-US');

	function value(m: TrendMonth, which: 'current' | 'prior'): number {
		return m[which][measure];
	}

	function format(v: number): string {
		return measure === 'revenue' ? currency.format(v) : count.format(v);
	}

	function axisLabel(v: number): string {
		return measure === 'revenue' ? compactCurrency.format(v) : count.format(v);
	}

	const max = $derived(
		Math.max(0, ...months.flatMap((m) => [value(m, 'current'), value(m, 'prior')]))
	);
	const ticks = $derived(niceTicks(max));
	const top = $derived(ticks[ticks.length - 1] || 1);

	const colW = $derived(plotW / Math.max(months.length, 1));
	function x(i: number): number {
		return PAD.left + (i + 0.5) * colW;
	}
	function y(v: number): number {
		return PAD.top + plotH - (v / top) * plotH;
	}

	function path(which: 'current' | 'prior'): string {
		return months
			.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(value(m, which)).toFixed(1)}`)
			.join(' ');
	}

	// Below ~480px, twelve month labels collide; label every other month.
	const labelEvery = $derived(width < 480 ? 2 : 1);

	function changeText(m: TrendMonth): string | null {
		const c = changeFromPrior(value(m, 'current'), value(m, 'prior'));
		if (c === null) return null;
		const pct = Math.round(c * 100);
		return `${pct > 0 ? '+' : ''}${pct}% vs ${m.label} ${m.year - 1}`;
	}

	const isLast = (i: number) => i === months.length - 1;

	function columnLabel(m: TrendMonth, i: number): string {
		const change = changeText(m);
		return [
			`${m.label} ${m.year}${isLast(i) ? ' to date' : ''}: ${format(value(m, 'current'))}`,
			`${m.label} ${m.year - 1}: ${format(value(m, 'prior'))}`,
			change
		]
			.filter(Boolean)
			.join('. ');
	}

	function triggerProps(props: Record<string, unknown>): Record<string, unknown> {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { type, ...rest } = props;
		return rest;
	}
</script>

<div class={className}>
	<div class="relative" bind:clientWidth={width}>
		<svg {width} height={HEIGHT} class="block" aria-hidden="true">
			{#each ticks as t (t)}
				<line
					x1={PAD.left}
					x2={width - PAD.right}
					y1={y(t)}
					y2={y(t)}
					class="stroke-border"
					stroke-width="1"
				/>
				<text
					x={PAD.left - 8}
					y={y(t)}
					text-anchor="end"
					dominant-baseline="middle"
					class="fill-muted-foreground font-mono text-sm">{axisLabel(t)}</text
				>
			{/each}

			{#each months as m, i (m.key)}
				{#if i % labelEvery === (months.length - 1) % labelEvery}
					<text x={x(i)} y={HEIGHT - 8} text-anchor="middle" class="fill-muted-foreground text-sm"
						>{m.label}</text
					>
				{/if}
			{/each}

			<path
				d={path('prior')}
				fill="none"
				class="stroke-muted-foreground"
				stroke-width="2"
				stroke-dasharray="5 4"
				stroke-linejoin="round"
			/>
			<path
				d={path('current')}
				fill="none"
				class="stroke-foreground"
				stroke-width="2"
				stroke-linejoin="round"
			/>
			{#each months as m, i (m.key)}
				<circle
					cx={x(i)}
					cy={y(value(m, 'current'))}
					r="4"
					class="fill-foreground stroke-background"
					stroke-width="2"
				/>
			{/each}
		</svg>

		<TooltipProvider delayDuration={100}>
			<div
				role="list"
				aria-label="Monthly {measure === 'revenue' ? 'revenue' : 'orders'}"
				class="absolute flex"
				style="left:{PAD.left}px;right:{PAD.right}px;top:{PAD.top}px;bottom:{PAD.bottom}px"
			>
				{#each months as m, i (m.key)}
					<Tooltip>
						<TooltipTrigger>
							{#snippet child({ props })}
								<div
									{...triggerProps(props)}
									role="listitem"
									aria-label={columnLabel(m, i)}
									class="group relative h-full flex-1 focus-visible:outline-none"
								>
									<span
										class="absolute inset-y-0 left-1/2 w-px bg-foreground/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
									></span>
								</div>
							{/snippet}
						</TooltipTrigger>
						<TooltipContent side="top" sideOffset={4}>
							<p class="font-medium">{m.label} {m.year}{isLast(i) ? ' to date' : ''}</p>
							<p class="font-mono">{format(value(m, 'current'))}</p>
							<p class="text-muted-foreground">
								{m.label}
								{m.year - 1}: <span class="font-mono">{format(value(m, 'prior'))}</span>
							</p>
							{#if changeText(m)}
								<p class="text-muted-foreground">{changeText(m)}</p>
							{/if}
						</TooltipContent>
					</Tooltip>
				{/each}
			</div>
		</TooltipProvider>
	</div>

	<div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
		<span class="inline-flex items-center gap-2">
			<svg width="20" height="8" aria-hidden="true"
				><line x1="0" x2="20" y1="4" y2="4" class="stroke-foreground" stroke-width="2" /></svg
			>
			Last 12 months
		</span>
		<span class="inline-flex items-center gap-2">
			<svg width="20" height="8" aria-hidden="true"
				><line
					x1="0"
					x2="20"
					y1="4"
					y2="4"
					class="stroke-muted-foreground"
					stroke-width="2"
					stroke-dasharray="5 4"
				/></svg
			>
			Year before
		</span>
	</div>

	<table class="sr-only">
		<caption>Monthly {measure === 'revenue' ? 'revenue' : 'orders'}, with the year before</caption>
		<thead>
			<tr
				><th scope="col">Month</th><th scope="col">This period</th><th scope="col">Year before</th
				></tr
			>
		</thead>
		<tbody>
			{#each months as m (m.key)}
				<tr>
					<th scope="row">{m.label} {m.year}</th>
					<td>{format(value(m, 'current'))}</td>
					<td>{format(value(m, 'prior'))}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
