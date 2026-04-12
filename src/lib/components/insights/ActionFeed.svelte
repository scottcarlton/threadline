<script lang="ts">
	import ActionCard from './ActionCard.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	type InsightAction = {
		id: string;
		insight_type: string;
		priority_score: number;
		title: string;
		description: string;
		metadata: Record<string, unknown>;
		entity_type: string | null;
		entity_id: string | null;
		status: string;
	};

	type Props = {
		insights: InsightAction[];
		isRefreshing?: boolean;
		onRefresh?: () => void;
		onDismiss?: (id: string) => void;
		onAct?: (id: string) => void;
	};

	let {
		insights,
		isRefreshing = false,
		onRefresh,
		onDismiss,
		onAct
	}: Props = $props();

	// Filter state
	let activeFilter = $state<string | null>(null);

	const insightTypes = $derived.by(() => {
		const types = new Map<string, number>();
		for (const insight of insights) {
			types.set(insight.insight_type, (types.get(insight.insight_type) ?? 0) + 1);
		}
		return types;
	});

	const typeLabels: Record<string, string> = {
		revenue_leakage: 'Revenue Leakage',
		order_gap: 'Order Gaps',
		call_queue: 'Call Queue',
		overdue_order: 'Overdue Orders'
	};

	const filteredInsights = $derived(
		activeFilter
			? insights.filter(i => i.insight_type === activeFilter)
			: insights
	);

	// Already sorted by priority_score DESC from the server, but ensure it
	const sortedInsights = $derived(
		[...filteredInsights].sort((a, b) => b.priority_score - a.priority_score)
	);
</script>

<div class="space-y-4">
	<!-- Header with filters and refresh -->
	<div class="flex items-center justify-between gap-4">
		<div class="flex items-center gap-2 flex-wrap">
			<button
				class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors {activeFilter === null ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}"
				onclick={() => (activeFilter = null)}
			>
				All ({insights.length})
			</button>
			{#each insightTypes as [type, count]}
				<button
					class="px-3 py-1.5 rounded-full text-sm font-medium transition-colors {activeFilter === type ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}"
					onclick={() => (activeFilter = activeFilter === type ? null : type)}
				>
					{typeLabels[type] ?? type} ({count})
				</button>
			{/each}
		</div>

		<Button variant="outline" size="sm" onclick={onRefresh} disabled={isRefreshing}>
			{#if isRefreshing}
				<svg class="animate-spin w-4 h-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
				Refreshing...
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
				</svg>
				Refresh
			{/if}
		</Button>
	</div>

	<!-- Insights list -->
	{#if sortedInsights.length === 0}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<div class="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-muted-foreground">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
				</svg>
			</div>
			<h3 class="text-base font-semibold text-foreground mb-1">All caught up</h3>
			<p class="text-sm text-muted-foreground">No action items right now. Check back later or refresh.</p>
		</div>
	{:else}
		<div class="space-y-3">
			{#each sortedInsights as insight (insight.id)}
				<ActionCard
					id={insight.id}
					insightType={insight.insight_type}
					priorityScore={insight.priority_score}
					title={insight.title}
					description={insight.description}
					metadata={insight.metadata}
					entityType={insight.entity_type}
					entityId={insight.entity_id}
					{onDismiss}
					{onAct}
				/>
			{/each}
		</div>
	{/if}
</div>
