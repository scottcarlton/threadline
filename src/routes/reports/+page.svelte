<script lang="ts">
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const repReports = [
		{
			id: 'sales-by-brand',
			title: 'Sales by Brand',
			description: 'Total sales broken down by brand for a given period'
		},
		{
			id: 'sales-by-account',
			title: 'Sales by Account',
			description: 'Revenue per account with YTD comparisons'
		},
		{
			id: 'sales-by-territory',
			title: 'Sales by Territory',
			description: 'Territory performance with account and rep breakdown'
		},
		{
			id: 'sales-by-rep',
			title: 'Sales by Rep',
			description: 'Individual rep performance across all brands'
		},
		{
			id: 'commission',
			title: 'Commission Report',
			description: 'Brand and rep commissions by order, with shipped amounts'
		},
		{
			id: 'pipeline',
			title: 'Order Pipeline',
			description: 'Orders grouped by status with totals'
		},
		{
			id: 'season-comparison',
			title: 'Season Comparison',
			description: 'Compare order volume and revenue across seasons'
		},
		{
			id: 'show-performance',
			title: 'Show Performance',
			description: 'ROI per show — orders, new accounts, and appointments'
		}
	];

	const brandReports = [
		{
			id: 'sales-by-rep',
			title: 'Sales by Rep',
			description: 'Revenue per rep across in-house sellers and connected agencies'
		},
		{
			id: 'product-performance',
			title: 'Product Performance',
			description: 'Style-level velocity — which products are moving across reps'
		},
		{
			id: 'territory-coverage',
			title: 'Territory Coverage',
			description: 'Accounts by territory across in-house and connected rep agencies'
		},
		{
			id: 'account-penetration',
			title: 'Account Penetration',
			description: 'Which accounts are ordering, which are dormant, and year-over-year trend'
		}
	];

	const reports = $derived(data.orgType === 'brand' ? brandReports : repReports);
</script>

<div class="space-y-6">
	<PageHeader title="Reports" subtitle="Select a report to view detailed data" />

	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
		{#each reports as report (report.id)}
			<a
				href={resolve(`/reports/${report.id}`)}
				class="group flex items-start gap-4 rounded-none border bg-card p-5 transition-all duration-200 hover:border-foreground/20 hover:shadow-md"
			>
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-accent"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5 text-muted-foreground"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
				</div>
				<div>
					<p class="text-sm font-medium">{report.title}</p>
					<p class="mt-0.5 text-sm text-muted-foreground">{report.description}</p>
				</div>
			</a>
		{/each}
	</div>

	<!-- Custom Reports Placeholder -->
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
				d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
			/>
		</svg>
		<p class="mt-4 text-lg font-semibold">Custom reports coming soon</p>
		<p class="mt-2 text-sm text-muted-foreground">
			Build reports by selecting metrics, filters, and groupings
		</p>
	</div>
</div>
