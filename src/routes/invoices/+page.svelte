<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import {
		invoiceDisplayStatus,
		invoiceBalance,
		type InvoiceMetrics
	} from '$lib/utils/invoice-status.js';
	import type { InvoiceListRow } from '$lib/utils/invoice-status.js';

	let { data } = $props();
	const invoices = $derived(data.invoices as InvoiceListRow[]);
	const metrics = $derived(data.metrics as InvoiceMetrics);
	const today = $derived(data.today as string);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	const statusOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'draft', label: 'Draft' },
		{ value: 'sent', label: 'Sent' },
		{ value: 'overdue', label: 'Overdue' },
		{ value: 'partial', label: 'Part paid' },
		{ value: 'paid', label: 'Paid' },
		{ value: 'void', label: 'Void' }
	];
	const activeStatus = $derived($page.url.searchParams.get('status') ?? 'all');

	const statusLabels: Record<string, string> = {
		draft: 'Draft',
		sent: 'Sent',
		partial: 'Part paid',
		paid: 'Paid',
		void: 'Void',
		overdue: 'Overdue'
	};

	// Overdue is the only one that should pull the eye across a full screen of
	// rows, so it is the only red.
	const statusBadgeColors: Record<string, string> = {
		draft: 'bg-zinc-100 text-zinc-600',
		sent: 'bg-blue-50 text-blue-700',
		partial: 'bg-amber-50 text-amber-700',
		paid: 'bg-emerald-50 text-emerald-700',
		void: 'bg-zinc-100 text-zinc-500',
		overdue: 'bg-red-50 text-red-700'
	};

	let search = $state('');
	const filtered = $derived(
		invoices.filter((i) => {
			const q = search.toLowerCase();
			if (!q) return true;
			return (
				(i.invoice_number?.toLowerCase().includes(q) ?? false) ||
				(i.orders?.order_number?.toLowerCase().includes(q) ?? false) ||
				(i.accounts?.business_name?.toLowerCase().includes(q) ?? false)
			);
		})
	);

	function formatDate(value: string | null): string {
		if (!value) return '—';
		return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});
	}

	function setFilter(key: string, value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (!value || value === 'all') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		goto(resolve(`/invoices?${params.toString()}`), { replaceState: true });
	}
</script>

<div class="space-y-6">
	<PageHeader
		title="Invoices"
		subtitle="{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}"
	/>

	<!--
		Three numbers, not six: what is owed, what is late, and what has landed.
		These describe the whole book and deliberately do not react to the status
		filter, or "outstanding" would change meaning when someone clicks a tab.
	-->
	<div
		class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0"
	>
		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Outstanding</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.outstanding)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.outstandingCount} invoice{metrics.outstandingCount !== 1 ? 's' : ''}
				</p>
			</CardContent>
		</Card>

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Overdue</p>
				<p class="mt-1 text-2xl font-semibold {metrics.overdue > 0 ? 'text-red-600' : ''}">
					{fmt.format(metrics.overdue)}
				</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.overdueCount} invoice{metrics.overdueCount !== 1 ? 's' : ''}
				</p>
			</CardContent>
		</Card>

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Paid</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.paidThisPeriod)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					{metrics.draftCount} draft{metrics.draftCount !== 1 ? 's' : ''} waiting
				</p>
			</CardContent>
		</Card>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<SearchInput placeholder="Search invoices..." bind:value={search} class="w-64" />
		<SelectField
			value={activeStatus}
			items={statusOptions}
			placeholder="Status"
			class="min-w-[120px]"
			onValueChange={(v) => setFilter('status', v)}
		/>
	</div>

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search || activeStatus !== 'all'}
				<p class="text-lg font-semibold">No invoices match your filters</p>
				<p class="mt-2 text-sm text-muted-foreground">Try a different status or search term</p>
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
						d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v7.5m2.25-6.466a9.016 9.016 0 0 0-3.461-.203c-.536.072-.974.478-1.021 1.017a4.559 4.559 0 0 0-.018.402c0 .464.336.844.775.994l2.95 1.012c.44.15.775.53.775.994 0 .136-.006.27-.018.402-.047.539-.485.945-1.021 1.017a9.077 9.077 0 0 1-3.461-.203M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
					/>
				</svg>
				<!--
					The empty state teaches where invoices come from, because there
					is no "New invoice" button to press: they are created by the act
					of preparing an order.
				-->
				<p class="mt-4 text-lg font-semibold">Ready to bill</p>
				<p class="mt-2 max-w-md text-sm text-muted-foreground">
					Mark an order as preparing and its draft invoice appears here, ready to send.
				</p>
			{/if}
		</div>
	{:else}
		<div class="overflow-x-auto border-b">
			<table class="w-full">
				<thead>
					<tr class="border-b">
						<th
							class="w-48 px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Invoice</th
						>
						<th
							class="px-4 py-2.5 text-center text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Status</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
							>Account</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Due</th
						>
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Balance</th
						>
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Total</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as invoice (invoice.id)}
						{@const display = invoiceDisplayStatus(invoice, today)}
						{@const balance = invoiceBalance(invoice)}
						<tr
							role="link"
							tabindex="0"
							aria-label={invoice.invoice_number ??
								`Draft for order ${invoice.orders?.order_number ?? ''}`}
							onclick={() => goto(resolve(`/invoices/${invoice.id}`))}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									goto(resolve(`/invoices/${invoice.id}`));
								}
							}}
							class="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
						>
							<td class="w-48 px-4 py-3 whitespace-nowrap">
								<a
									href={resolve(`/invoices/${invoice.id}`)}
									onclick={(e) => e.stopPropagation()}
									class="font-mono text-base font-medium hover:underline"
								>
									<!--
										A draft has no number until it is sent, so it is named by
										the order it came from rather than by a placeholder.
									-->
									{invoice.invoice_number ?? 'Draft'}
								</a>
								<p class="font-mono text-sm text-muted-foreground">
									{invoice.orders?.order_number ?? '—'}
								</p>
							</td>
							<td class="px-4 py-3 text-center">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusBadgeColors[
										display
									] ?? 'bg-zinc-100 text-zinc-500'}"
								>
									{statusLabels[display] ?? display}
								</span>
							</td>
							<td class="hidden px-4 py-3 sm:table-cell">
								<span class="text-sm">{invoice.accounts?.business_name ?? '—'}</span>
							</td>
							<td class="hidden px-4 py-3 lg:table-cell">
								<span class="text-sm {display === 'overdue' ? 'text-red-600' : ''}">
									{formatDate(invoice.due_date)}
								</span>
								<p class="font-mono text-sm text-muted-foreground">
									{invoice.issue_date ? `Issued ${formatDate(invoice.issue_date)}` : 'Not issued'}
								</p>
							</td>
							<td class="px-4 py-3 text-right font-mono">
								<span class="text-sm {display === 'overdue' ? 'text-red-600' : ''}">
									{balance > 0 ? fmt.format(balance) : '—'}
								</span>
							</td>
							<td class="px-4 py-3 text-right font-mono">
								<span class="text-sm">{fmt.format(Number(invoice.total))}</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
