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
	<h3 class="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Scoreboard</h3>
	{#each kpis as kpi}
		<Card class="p-3">
			<div class="text-sm font-mono text-muted-foreground mb-1">{kpi.label}</div>
			<div class="flex items-end justify-between gap-2">
				<span class="text-xl font-bold text-foreground leading-none">{kpi.value}</span>
				{#if kpi.change != null}
					<span class="text-xs font-medium leading-none {kpi.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
						{kpi.change >= 0 ? '+' : ''}{kpi.change.toFixed(0)}%
					</span>
				{/if}
			</div>
			{#if kpi.detail}
				<div class="text-xs font-mono text-muted-foreground/70 mt-1">{kpi.detail}</div>
			{/if}
		</Card>
	{/each}
</div>
