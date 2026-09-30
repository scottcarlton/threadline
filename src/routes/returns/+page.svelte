<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import {
		RETURN_STATUS_LABELS,
		type ReturnListRow,
		type ReturnMetrics
	} from '$lib/utils/return-status.js';

	let { data } = $props();
	const returns = $derived(data.returns as ReturnListRow[]);
	const metrics = $derived(data.metrics as ReturnMetrics);

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	});

	const statusOptions = [
		{ value: 'all', label: 'All' },
		{ value: 'open', label: 'Open' },
		{ value: 'requested', label: RETURN_STATUS_LABELS.requested },
		{ value: 'approved', label: RETURN_STATUS_LABELS.approved },
		{ value: 'received', label: RETURN_STATUS_LABELS.received },
		{ value: 'closed', label: RETURN_STATUS_LABELS.closed },
		{ value: 'declined', label: RETURN_STATUS_LABELS.declined },
		{ value: 'cancelled', label: RETURN_STATUS_LABELS.cancelled }
	];
	const activeStatus = $derived($page.url.searchParams.get('status') ?? 'all');

	// Same palette as /invoices. Requested is the only warm colour: it is the one
	// state where somebody is waiting on an answer, so it is the one that should
	// pull the eye across a full screen of rows.
	const statusBadgeColors: Record<string, string> = {
		requested: 'bg-amber-50 text-amber-700',
		approved: 'bg-blue-50 text-blue-700',
		received: 'bg-blue-50 text-blue-700',
		closed: 'bg-emerald-50 text-emerald-700',
		declined: 'bg-zinc-100 text-zinc-500',
		cancelled: 'bg-zinc-100 text-zinc-500'
	};

	// Strip the column the viewer already owns. The account is the counterparty
	// for a brand or a rep, so they always get it; a buyer owns the account, so
	// they only get it when they buy under more than one. Brand goes the other
	// way: it only earns a column when the rows actually span brands, which is
	// never the case for a brand reading its own returns.
	const showAccount = $derived(
		data.viewerKind !== 'buyer' || new Set(returns.map((r) => r.account_id ?? '')).size > 1
	);
	const showBrand = $derived(new Set(returns.map((r) => r.brand_id)).size > 1);

	let search = $state('');
	const filtered = $derived(
		returns.filter((r) => {
			const q = search.toLowerCase();
			if (!q) return true;
			return (
				(r.ra_number?.toLowerCase().includes(q) ?? false) ||
				(r.orders?.order_number?.toLowerCase().includes(q) ?? false) ||
				(r.accounts?.business_name?.toLowerCase().includes(q) ?? false) ||
				(r.brands?.name?.toLowerCase().includes(q) ?? false)
			);
		})
	);

	function formatDate(value: string | null): string {
		if (!value) return '—';
		return new Date(value).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
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
		goto(resolve(`/returns?${params.toString()}`), { replaceState: true });
	}
</script>

<svelte:head><title>Returns · Threadline</title></svelte:head>

<div class="space-y-6">
	<PageHeader title="Returns" subtitle="{data.totalCount} return{data.totalCount !== 1 ? 's' : ''}">
		<Button href={resolve('/returns/new')}>New return</Button>
	</PageHeader>

	<!--
		Three numbers: what is still moving, what is waiting on an answer, and
		what has been credited. They describe the whole book and deliberately do
		not react to the status filter, the same as /invoices.
	-->
	<div
		class="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 lg:mx-0 lg:grid lg:grid-cols-3 lg:px-0"
	>
		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Open</p>
				<p class="mt-1 text-2xl font-semibold">{metrics.openCount}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">
					Requested, approved, or received
				</p>
			</CardContent>
		</Card>

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Awaiting approval</p>
				<p class="mt-1 text-2xl font-semibold">{metrics.requestedCount}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">Not yet decided</p>
			</CardContent>
		</Card>

		<Card class="w-[min(80%,18rem)] shrink-0 snap-start lg:w-auto">
			<CardContent class="pt-4 pb-4">
				<p class="font-mono text-sm font-medium text-muted-foreground">Credited</p>
				<p class="mt-1 text-2xl font-semibold">{fmt.format(metrics.creditedTotal)}</p>
				<p class="mt-0.5 font-mono text-sm text-muted-foreground">Issued credit memos</p>
			</CardContent>
		</Card>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<SearchInput placeholder="Search returns..." bind:value={search} class="w-64" />
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
				<p class="text-lg font-semibold">No returns match your filters</p>
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
						d="M12.0049 2C17.5277 2 22.0049 6.47715 22.0049 12C22.0049 17.5228 17.5277 22 12.0049 22C9.57847 22 7.3539 21.1358 5.62216 19.6985L5.37815 19.4892L6.27949 17.5875C7.73229 19.0759 9.76067 20 12.0049 20C16.4232 20 20.0049 16.4183 20.0049 12C20.0049 7.58172 16.4232 4 12.0049 4C7.66997 4 4.14034 7.44784 4.00869 11.7508L4.00488 12H6.50488L3.79854 17.7161C2.66796 16.096 2.00488 14.1254 2.00488 12C2.00488 6.47715 6.48204 2 12.0049 2ZM13.0049 6V8H15.5049V10H10.0049C9.72874 10 9.50488 10.2239 9.50488 10.5C9.50488 10.7455 9.68176 10.9496 9.91501 10.9919L10.0049 11H14.0049C15.3856 11 16.5049 12.1193 16.5049 13.5C16.5049 14.8807 15.3856 16 14.0049 16H13.0049V18H11.0049V16H8.50488V14H14.0049C14.281 14 14.5049 13.7761 14.5049 13.5C14.5049 13.2545 14.328 13.0504 14.0948 13.0081L14.0049 13H10.0049C8.62417 13 7.50488 11.8807 7.50488 10.5C7.50488 9.11929 8.62417 8 10.0049 8H11.0049V6H13.0049Z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Nothing has come back yet</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Log a return from a delivered order, or enter the items by hand.
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
							>Return</th
						>
						<th
							class="px-4 py-2.5 text-center text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Status</th
						>
						{#if showAccount}
							<th
								class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
								>Account</th
							>
						{/if}
						{#if showBrand}
							<th
								class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:table-cell"
								>Brand</th
							>
						{/if}
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase lg:table-cell"
							>Requested</th
						>
						<th
							class="px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Credit</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as ra (ra.id)}
						<tr
							role="link"
							tabindex="0"
							aria-label={ra.ra_number ?? `Return on order ${ra.orders?.order_number ?? ''}`}
							onclick={() => goto(resolve(`/returns/${ra.id}`))}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									goto(resolve(`/returns/${ra.id}`));
								}
							}}
							class="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none"
						>
							<td class="w-48 px-4 py-3 whitespace-nowrap">
								<a
									href={resolve(`/returns/${ra.id}`)}
									onclick={(e) => e.stopPropagation()}
									class="font-mono text-base font-medium hover:underline"
								>
									<!--
										A return has no number until it is approved, the same way a
										draft invoice has none until it is sent. Not labelled with a
										status word, since the badge beside it already says one.
									-->
									{ra.ra_number ?? 'No number yet'}
								</a>
								<p class="font-mono text-sm text-muted-foreground">
									{ra.orders?.order_number ?? 'Entered by hand'}
								</p>
							</td>
							<td class="px-4 py-3 text-center">
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusBadgeColors[
										ra.status
									] ?? 'bg-zinc-100 text-zinc-500'}"
								>
									{RETURN_STATUS_LABELS[ra.status]}
								</span>
							</td>
							{#if showAccount}
								<td class="hidden px-4 py-3 sm:table-cell">
									<span class="text-sm">{ra.accounts?.business_name ?? '—'}</span>
								</td>
							{/if}
							{#if showBrand}
								<td class="hidden px-4 py-3 md:table-cell">
									<span class="text-sm">{ra.brands?.name ?? '—'}</span>
								</td>
							{/if}
							<td class="hidden px-4 py-3 lg:table-cell">
								<span class="text-sm">{formatDate(ra.requested_at)}</span>
							</td>
							<td class="px-4 py-3 text-right font-mono">
								<!--
									Blank until a memo is issued. credit_total is zero from the
									moment the row is created, so printing it early would state a
									$0 credit nobody has decided on as though it were the answer.
								-->
								<span class="text-sm">
									{ra.credit_memo_number ? fmt.format(Number(ra.credit_total)) : '—'}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
