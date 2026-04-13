<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { downloadCSV } from '$lib/utils/csv.js';
	import type { BrandExpense } from '$lib/types/database.js';

	let { data } = $props();
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
		const rows = filtered.map((e: any) => ({
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
		const params = new URLSearchParams($page.url.searchParams);
		if (!value || value === 'all') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		goto(`/expenses?${params.toString()}`, { replaceState: true });
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl">Expenses</h1>
			<p class="mt-1 font-mono text-sm text-muted-foreground">
				{expenses.length} expense{expenses.length !== 1 ? 's' : ''}
			</p>
		</div>
		<div class="flex items-center gap-2">
			{#if filtered.length > 0}
				<Button variant="outline" size="sm" onclick={exportExpenses}>Export CSV</Button>
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
		</div>
	</div>

	<!-- Status tabs -->
	<div class="flex gap-1 border-b">
		{#each statusTabs as tab}
			<button
				class="-mb-px px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-colors {activeStatus ===
				tab
					? 'text-foreground'
					: 'text-muted-foreground hover:text-foreground'}"
				style="border-bottom: 1px solid {activeStatus === tab ? 'currentColor' : 'transparent'}"
				onclick={() => setFilter('status', tab)}
			>
				{statusLabels[tab] ?? tab}
			</button>
		{/each}
	</div>

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

	<!-- Filters -->
	<div class="flex flex-wrap gap-3">
		<div class="max-w-xs">
			<Input placeholder="Search expenses..." bind:value={search} />
		</div>
		<select
			class="h-10 rounded-md border border-input bg-background px-3 text-[13px]"
			onchange={(e) => setFilter('brand', (e.target as HTMLSelectElement).value)}
		>
			<option value="">All Brands</option>
			{#each brands as brand}
				<option value={brand.id} selected={$page.url.searchParams.get('brand') === brand.id}
					>{brand.name}</option
				>
			{/each}
		</select>
		<select
			class="h-10 rounded-md border border-input bg-background px-3 text-[13px]"
			onchange={(e) => setFilter('category', (e.target as HTMLSelectElement).value)}
		>
			<option value="">All Categories</option>
			{#each Object.entries(categoryLabels) as [value, label]}
				<option {value}>{label}</option>
			{/each}
		</select>
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
							class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Expense</th
						>
						<th
							class="px-4 py-2.5 text-center text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Status</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
							>Brand</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:table-cell"
							>Category</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:table-cell"
							>Date</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Submitted By</th
						>
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Amount</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as expense}
						<tr class="transition-colors hover:bg-muted/30">
							<td class="px-4 py-3">
								<a
									href="/expenses/{expense.id}"
									class="font-mono text-base font-medium hover:underline"
									>{expense.expense_number}</a
								>
								<p class="line-clamp-1 text-sm text-muted-foreground">{expense.description}</p>
							</td>
							<td class="px-4 py-3 text-center">
								<span
									class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium {statusBadgeColors[
										expense.status
									] ?? 'bg-zinc-100 text-zinc-500'}"
								>
									{statusLabels[expense.status] ?? expense.status}
								</span>
							</td>
							<td class="hidden px-4 py-3 sm:table-cell">
								<span class="text-sm">{expense.brands?.name ?? '—'}</span>
							</td>
							<td class="hidden px-4 py-3 md:table-cell">
								<span class="text-sm">{categoryLabels[expense.category] ?? expense.category}</span>
							</td>
							<td class="hidden px-4 py-3 md:table-cell">
								<span class="text-sm"
									>{new Date(expense.expense_date + 'T00:00:00').toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}</span
								>
							</td>
							<td class="hidden px-4 py-3 lg:table-cell">
								<span class="text-sm">{expense.profiles?.display_name ?? '—'}</span>
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
