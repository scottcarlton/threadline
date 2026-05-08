<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchDropdown } from '$lib/components/ui/input/index.js';
	import ListPageToolbar from '$lib/components/shared/ListPageToolbar.svelte';
	import AccountImportModal from '$lib/components/accounts/AccountImportModal.svelte';
	import { toast } from 'svelte-sonner';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import type { Account } from '$lib/types/database.js';
	import { addRecent } from '$lib/stores/recent-searches.js';

	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { debounce } from '$lib/utils/debounce.js';

	const PAGE_SIZE = 50;

	let { data } = $props();
	let showImport = $state(false);

	// Account import is handled by <AccountImportModal>, which wraps
	// <AccountImportFlow> and POSTs to /api/accounts/import on commit.
	import type { AccountHealth } from '$lib/server/account-health.js';

	// Mutable list — initial page from server, appended via infinite scroll
	let accountList = $state<Account[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		accountList = data.accounts as Account[];
		hasMore = Boolean(data.hasMore);
	});

	const accountTotals = $derived((data.accountTotals ?? {}) as Record<string, number>);
	const accountHealth = $derived((data.accountHealth ?? {}) as Record<string, AccountHealth>);
	const accountTags = $derived(
		(data.accountTags ?? {}) as Record<string, { id: string; name: string; color: string }[]>
	);
	const canEdit = $derived(data.membership?.role !== 'guest');

	const tagColorMap: Record<string, string> = {
		amber: 'bg-amber-50 text-amber-700',
		red: 'bg-red-50 text-red-700',
		violet: 'bg-violet-50 text-violet-700',
		blue: 'bg-blue-50 text-blue-700',
		zinc: 'bg-zinc-100 text-zinc-600',
		emerald: 'bg-emerald-50 text-emerald-700'
	};

	const healthBadge: Record<string, { class: string; label: string }> = {
		excellent: { class: 'bg-emerald-50 text-emerald-700', label: 'Excellent' },
		good: { class: 'bg-blue-50 text-blue-700', label: 'Good' },
		fair: { class: 'bg-amber-50 text-amber-700', label: 'Fair' },
		at_risk: { class: 'bg-red-50 text-red-700', label: 'At Risk' },
		inactive: { class: 'bg-zinc-100 text-zinc-500', label: 'Inactive' },
		new: { class: 'bg-violet-50 text-violet-700', label: 'New' }
	};

	function fmt(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(value);
	}

	let search = $state($page.url.searchParams.get('search') ?? '');
	let showArchived = $state(false);

	const filtered = $derived(
		accountList.filter((a) => {
			const matchesArchive = showArchived ? true : !a.archived_at;
			return matchesArchive;
		})
	);

	const archivedCount = $derived(accountList.filter((a) => a.archived_at).length);

	// Debounced server-side search
	function applySearch(value: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const params = new URLSearchParams($page.url.searchParams);
		if (value) params.set('search', value);
		else params.delete('search');
		goto(resolve(`/accounts?${params.toString()}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	const debouncedSearch = debounce((value: string) => {
		applySearch(value);
	}, 300);

	function onSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		search = value;
		debouncedSearch(value);
	}

	function onSearchCommit(term: string) {
		search = term;
		addRecent('accounts', term);
		applySearch(term);
	}

	// Infinite scroll
	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
			const params = new URLSearchParams();
			params.set('offset', String(accountList.length));
			params.set('limit', String(PAGE_SIZE));
			if (search) params.set('search', search);
			if (showArchived) params.set('archived', 'true');
			const res = await fetch(`/api/accounts/list?${params.toString()}`);
			if (res.ok) {
				const json = await res.json();
				accountList = [...accountList, ...(json.accounts as Account[])];
				hasMore = Boolean(json.hasMore);
			}
		} finally {
			loadingMore = false;
		}
	}

	$effect(() => {
		if (!sentinelEl) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !loadingMore) {
					loadMore();
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(sentinelEl);
		return () => observer.disconnect();
	});
</script>

<div class="space-y-6">
	<PageHeader
		title="Accounts"
		subtitle="{data.totalCount ?? accountList.length} account{(data.totalCount ??
			accountList.length) !== 1
			? 's'
			: ''}"
	>
		{#if canEdit}
			<Button href="/accounts/new" class="min-w-[100px]">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="-ml-1 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
					><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
				>
				Add<span class="hidden sm:inline"> Account</span>
			</Button>
		{/if}
	</PageHeader>

	<ListPageToolbar
		{search}
		{onSearchInput}
		searchPlaceholder="Search accounts..."
		searchClass="max-w-xs flex-1"
	>
		{#snippet searchSlot()}
			<SearchDropdown
				bind:value={search}
				oninput={onSearchInput}
				oncommit={onSearchCommit}
				placeholder="Search accounts..."
				context="accounts"
				suggestionType="accounts"
				class="max-w-xs flex-1"
			/>
		{/snippet}
		{#if archivedCount > 0}
			<button
				class="text-sm text-muted-foreground transition-colors hover:text-foreground"
				onclick={() => (showArchived = !showArchived)}
			>
				{showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
			</button>
		{/if}
	</ListPageToolbar>

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search}
				<p class="text-lg font-semibold">No accounts match your search</p>
				<p class="mt-2 text-sm text-muted-foreground">Try adjusting your search terms</p>
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
						d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-1.997M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Your accounts live here</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Add your first buyer account to start building relationships
				</p>
			{/if}
		</div>
	{:else}
		<div class="overflow-hidden border-b">
			<table class="w-full">
				<thead>
					<tr class="border-b">
						<th
							class="px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase"
							>Account</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
							>Contact</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
							>Territory</th
						>
						<th
							class="hidden px-4 py-2.5 text-left text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
							>Health</th
						>
						<th
							class="hidden px-4 py-2.5 text-right text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase sm:table-cell"
							>YTD Total</th
						>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filtered as account (account.id)}
						<tr
							role="link"
							tabindex="0"
							aria-label={account.business_name}
							onclick={() => goto(resolve(`/accounts/${account.id}`))}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									goto(resolve(`/accounts/${account.id}`));
								}
							}}
							class="cursor-pointer transition-colors hover:bg-muted/30 focus-visible:bg-muted/30 focus-visible:outline-none {account.archived_at
								? 'opacity-50'
								: ''}"
						>
							<td class="px-4 py-3">
								<a
									href={resolve(`/accounts/${account.id}`)}
									onclick={(e) => e.stopPropagation()}
									class="text-base hover:underline">{account.business_name}</a
								>
								<div class="mt-0.5 flex items-center gap-1.5">
									{#if account.city || account.state}
										<span class="font-mono text-sm text-muted-foreground"
											>{[account.city, account.state].filter(Boolean).join(', ')}</span
										>
									{/if}
									{#each accountTags[account.id] ?? [] as tag (tag.name)}
										<span
											class="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium {tagColorMap[
												tag.color
											] ?? tagColorMap.zinc}">{tag.name}</span
										>
									{/each}
								</div>
							</td>
							<td class="hidden px-4 py-3 sm:table-cell">
								<div class="text-sm text-foreground">
									{[account.contact_first_name, account.contact_last_name]
										.filter(Boolean)
										.join(' ') || '—'}
								</div>
								{#if account.contact_email}
									<div class="font-mono text-sm text-muted-foreground">{account.contact_email}</div>
								{/if}
							</td>
							<td class="hidden px-4 py-3 sm:table-cell">
								<span class="text-sm text-muted-foreground"
									>{(account as Account & { territories?: { name?: string } | null }).territories
										?.name ?? '—'}</span
								>
							</td>
							<td class="hidden px-4 py-3 sm:table-cell">
								{#if account.archived_at}
									<span
										class="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500"
										>Archived</span
									>
								{:else}
									{@const health = accountHealth[account.id]}
									{@const badge = healthBadge[health?.label ?? 'inactive']}
									<div>
										<span
											class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {badge.class}"
											>{badge.label}</span
										>
									</div>
								{/if}
							</td>
							<td class="hidden px-4 py-3 text-right font-mono sm:table-cell">
								{#if accountTotals[account.id]}
									<span class="text-sm">{fmt(accountTotals[account.id])}</span>
								{:else}
									<span class="text-sm text-muted-foreground/50">—</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if hasMore || loadingMore}
			<div bind:this={sentinelEl} class="flex items-center justify-center py-6">
				{#if loadingMore}
					<span class="text-sm text-muted-foreground">Loading more accounts…</span>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<AccountImportModal
	bind:open={showImport}
	onOpenChange={(v) => (showImport = v)}
	onImported={(result) => {
		const created = result.created;
		const skipped = result.skipped.length;
		if (created > 0) invalidateAll();
		if (created === 0 && skipped > 0) {
			toast.info(`No new accounts — all ${skipped} already existed.`);
		} else if (skipped > 0) {
			toast.success(
				`${created} account${created === 1 ? '' : 's'} imported · ${skipped} already existed`
			);
		} else {
			toast.success(`${created} account${created === 1 ? '' : 's'} imported`);
		}
	}}
/>
