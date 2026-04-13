<script lang="ts">
	import { Card } from '$lib/components/ui/card/index.js';

	type KPI = {
		label: string;
		value: string;
		change?: number | null; // percentage change YoY
		detail?: string;
	};

	type Props = {
		kpis: KPI[];
	};

	let { kpis }: Props = $props();
</script>

<div class="space-y-3">
	<h3 class="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Scoreboard</h3>
	{#each kpis as kpi}
		<Card class="p-3">
			<div class="mb-1 font-mono text-sm text-muted-foreground">{kpi.label}</div>
			<div class="flex items-end justify-between gap-2">
				<span class="text-xl leading-none font-bold text-foreground">{kpi.value}</span>
				{#if kpi.change != null}
					<span
						class="text-xs leading-none font-medium {kpi.change >= 0
							? 'text-green-600 dark:text-green-400'
							: 'text-red-600 dark:text-red-400'}"
					>
						{kpi.change >= 0 ? '+' : ''}{kpi.change.toFixed(0)}%
					</span>
				{/if}
			</div>
			{#if kpi.detail}
				<div class="mt-1 font-mono text-xs text-muted-foreground/70">{kpi.detail}</div>
			{/if}
		</Card>
	{/each}
</div>
