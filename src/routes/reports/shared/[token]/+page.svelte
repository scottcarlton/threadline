<script lang="ts">
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import ReportSnapshotTable from '$lib/components/reports/ReportSnapshotTable.svelte';
	import { buildReportChart } from '$lib/utils/report-chart.js';
	import { reportTable } from '$lib/utils/report-columns.js';

	let { data } = $props();

	const chart = $derived(buildReportChart(data.report, data.variant, data.rows));
	const table = $derived(reportTable(data.report, data.variant));

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{data.title} · Threadline</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-8">
		<p class="text-sm font-medium">/Threadline</p>

		<div>
			<h1 class="text-2xl font-medium">{data.title}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{[data.orgName, data.filterLabel, `As of ${formatDate(data.sharedAt)}`]
					.filter(Boolean)
					.join(' · ')}
			</p>
		</div>

		{#if chart}
			<BarChart {chart} />
		{/if}

		{#if table}
			<ReportSnapshotTable {table} rows={data.rows} />
		{/if}

		<p class="text-sm text-muted-foreground">
			Shared from Threadline. This link expires {formatDate(data.expiresAt)}.
		</p>
	</div>
</div>
