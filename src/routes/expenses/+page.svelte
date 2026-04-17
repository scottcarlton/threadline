<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { downloadCSV } from '$lib/utils/csv.js';
	import type { BrandExpense } from '$lib/types/database.js';

	let { data } = $props();
	const isBrandOrg = $derived(data.orgType === 'brand');
	const expenses = $derived(data.expenses as BrandExpense[]);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const canCreate = $derived(
		data.membership?.role === 'admin' ||
			data.membership?.role === 'owner' ||
			data.membership?.role === 'member' ||
			data.membership?.role === 'sales'
	);
	const metrics = $derived(
		data.metrics as {
			totalPending: number;
			totalApproved: number;
			totalRejected: number;
			avgExpense: number;
			pendingCount: number;
			approvedCount: number;
			rejectedCount: number;
		}
	);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	const statusTabs = ['all', 'draft', 'submitted', 'approved', 'rejected'] as const;
	const statusLabels: Record<string, string> = {
		all: 'All',
		draft: 'Draft',
		submitted: 'Submitted',
		approved: 'Approved',
		rejected: 'Rejected'
	};
	const activeStatus = $derived($page.url.searchParams.get('status') ?? 'all');

	const categoryLabels: Record<string, string> = {
		trade_show: 'Trade Show',
		samples: 'Samples',
		marketing: 'Marketing',
		travel: 'Travel',
		meals: 'Meals',
		shipping: 'Shipping',
		photography: 'Photography',
		office: 'Office',
		other: 'Other'
	};

	let search = $state('');
	const filtered = $derived(
		expenses.filter(
			(e) =>
				e.expense_number.toLowerCase().includes(search.toLowerCase()) ||
				e.description.toLowerCase().includes(search.toLowerCase()) ||
				(e.brands?.name?.toLowerCase().includes(search.toLowerCase()) ?? false)
		)
	);

	const statusBadgeColors: Record<string, string> = {
		draft: 'bg-zinc-100 text-zinc-600',
		submitted: 'bg-amber-50 text-amber-700',
		approved: 'bg-emerald-50 text-emerald-700',
		rejected: 'bg-red-50 text-red-700'
	};

	function exportExpenses() {
		const rows = filtered.map((e) => ({
			expense_number: e.expense_number,
			brand: e.brands?.name ?? '',
			category: categoryLabels[e.category] ?? e.category,
			description: e.description,
			amount: e.amount,
			expense_date: e.expense_date,
			status: e.status,
			submitted_by: e.profiles?.display_name ?? '',
			created_at: e.created_at
		}));
		downloadCSV(rows, 'expenses.csv');
	}

	function setFilter(key: string, value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (!value || value === 'all') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		goto(resolve(`/expenses?${params.toString()}`), { replaceState: true });
	}
</script>

<div class="space-y-6">
	<PageHeader
		title="Expenses"
		subtitle="{expenses.length} expense{expenses.length !== 1 ? 's' : ''}"
	>
		{#if filtered.length > 0}
			<Button variant="outline" onclick={exportExpenses}>Export CSV</Button>
		{/if}
		{#if canCreate}
			<Button href="/expenses/new">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
				>
				New Expense
			</Button>
		{/if}
	</PageHeader>

	<!-- Analytics Cards -->
	<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Pending Review</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.totalPending)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.pendingCount} submitted
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Approved</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.totalApproved)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.approvedCount} expense{metrics.approvedCount !== 1 ? 's' : ''}
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Rejected</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.totalRejected)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.rejectedCount} expense{metrics.rejectedCount !== 1 ? 's' : ''}
				</p>
			</CardContent>
		</Card>

		<Card>
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Average Expense</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.avgExpense)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">{expenses.length} total</p>
			</CardContent>
		</Card>
	</div>

	<!-- Filters: Search + Status + Category | spacer | Brand -->
	<div class="flex flex-wrap items-center gap-3">
		<SearchInput placeholder="Search expenses..." bind:value={search} class="w-64" />
		<SelectField
			value={activeStatus}
			items={statusTabs.map((s) => ({ value: s, label: statusLabels[s] ?? s }))}
			placeholder="Status"
			class="min-w-[120px]"
			onValueChange={(v) => setFilter('status', v)}
		/>
		<SelectField
			value={$page.url.searchParams.get('category') ?? ''}
			items={[
				{ value: '', label: 'All Categories' },
				...Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))
			]}
			placeholder="All Categories"
			onValueChange={(v) => setFilter('category', v)}
		/>
		{#if !isBrandOrg}
			<SelectField
				value={$page.url.searchParams.get('brand') ?? ''}
				items={[
					{ value: '', label: 'All Brands' },
					...brands.map((b) => ({ value: b.id, label: b.name }))
				]}
				placeholder="All Brands"
				onValueChange={(v) => setFilter('brand', v)}
			/>
		{/if}
	</div>

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search}
				<p class="text-lg font-semibold">No expenses match your search</p>
				<p class="mt-2 text-sm text-muted-foreground">Try adjusting your filters</p>
			{:else}
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
						d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Ready to track expenses</p>
				<p class="mt-2 text-sm text-muted-foreground">Submit your first expense to get started</p>
			{/if}
		</div>
	{:else}
		<div class="overflow-x-auto rounded-none border">
			<table class="w-full">
				<thead>
					<tr class="border-b bg-muted/40">
						<th
							class="w-48 px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Expense</th
						>
						<th
							class="px-4 py-2.5 text-center text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Status</th
						>
						{#if !isBrandOrg}
							<th
								class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
								>Brand</th
							>
						{/if}
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Submitted By</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Approved</th
						>
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Amount</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as expense (expense.id)}
						<tr class="transition-colors hover:bg-muted/30">
							<td class="w-48 px-4 py-3 whitespace-nowrap">
								<a
									href={resolve(`/expenses/${expense.id}`)}
									class="font-mono text-base font-medium hover:underline"
									>{expense.expense_number}</a
								>
								<p class="font-mono text-sm text-muted-foreground">
									{categoryLabels[expense.category] ?? expense.category}
								</p>
							</td>
							<td class="px-4 py-3 text-center">
								<span
									class="inline-flex items-center rounded-md px-2 py-0.5 text-sm font-medium {statusBadgeColors[
										expense.status
									] ?? 'bg-zinc-100 text-zinc-500'}"
								>
									{statusLabels[expense.status] ?? expense.status}
								</span>
							</td>
							{#if !isBrandOrg}
								<td class="hidden px-4 py-3 sm:table-cell">
									<span class="text-sm">{expense.brands?.name ?? '—'}</span>
								</td>
							{/if}
							<td class="hidden px-4 py-3 lg:table-cell">
								<span class="text-sm">{expense.profiles?.display_name ?? '—'}</span>
								<p class="font-mono text-sm text-muted-foreground">
									{new Date(expense.expense_date + 'T00:00:00').toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}
								</p>
							</td>
							<td class="hidden px-4 py-3 lg:table-cell">
								{#if expense.status === 'approved' || expense.status === 'rejected'}
									{@const reviewer = (
										expense as { reviewer?: { display_name: string | null } | null }
									).reviewer}
									{@const when =
										expense.status === 'approved' ? expense.approved_at : expense.rejected_at}
									<span class="text-sm">{reviewer?.display_name ?? '—'}</span>
									{#if when}
										<p class="font-mono text-sm text-muted-foreground">
											{new Date(when).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}
										</p>
									{/if}
								{:else}
									<span class="text-sm text-muted-foreground/50">—</span>
								{/if}
							</td>
							<td class="px-4 py-3 text-right font-mono">
								<span class="text-sm">{fmt.format(Number(expense.amount))}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
