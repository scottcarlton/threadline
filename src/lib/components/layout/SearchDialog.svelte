<script lang="ts">
	import { goto } from '$app/navigation';
	import { conversation } from '$lib/stores/conversation.js';

	type SearchResult = {
		type: 'brand' | 'account' | 'order' | 'contact';
		id: string;
		title: string;
		subtitle: string;
		parentType?: 'account' | 'brand';
		parentName?: string;
		meta?: {
			seasonName?: string;
			orderYear?: number;
			status?: string;
		};
	};

	type ActionItem = {
		label: string;
		icon: 'plus' | 'sparkle';
		action: () => void;
	};

	type Props = {
		onassistantToggle?: () => void;
	};

	let { onassistantToggle }: Props = $props();

	let open = $state(false);
	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let hasSearched = $state(false);
	let selectedIndex = $state(0);
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let inputEl = $state<HTMLInputElement | undefined>(undefined);

	// Filtered groups
	const contactResults = $derived(results.filter((r) => r.type === 'contact'));
	const brandResults = $derived(results.filter((r) => r.type === 'brand'));
	const accountResults = $derived(results.filter((r) => r.type === 'account'));
	const orderResults = $derived(results.filter((r) => r.type === 'order'));

	type DefaultItem = {
		kind: 'create' | 'navigate';
		label: string;
		icon: string;
		action: () => void;
		keys?: string[];
	};

	const createItems: DefaultItem[] = [
		{ kind: 'create', label: 'New Order', icon: 'M12 4v16m8-8H4', keys: ['⌘', 'O'], action: () => { closeDialog(); goto('/orders/new'); } },
		{ kind: 'create', label: 'New Account', icon: 'M12 4v16m8-8H4', keys: ['⌘', 'A'], action: () => { closeDialog(); goto('/accounts/new'); } },
		{ kind: 'create', label: 'New Brand', icon: 'M12 4v16m8-8H4', keys: ['⌘', 'B'], action: () => { closeDialog(); goto('/brands/new'); } },
		{ kind: 'create', label: 'New Appointment', icon: 'M12 4v16m8-8H4', keys: ['Shift', '⌘', 'A'], action: () => { closeDialog(); goto('/appointments?new=true'); } },
	];

	const navigateItems: DefaultItem[] = [
		{ kind: 'navigate', label: 'Go to Orders', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', keys: ['O'], action: () => { closeDialog(); goto('/orders'); } },
		{ kind: 'navigate', label: 'Go to Accounts', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', keys: ['A'], action: () => { closeDialog(); goto('/accounts'); } },
		{ kind: 'navigate', label: 'Go to Brands', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', keys: ['B'], action: () => { closeDialog(); goto('/brands'); } },
		{ kind: 'navigate', label: 'Go to Inbox', icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75', keys: ['Shift', 'I'], action: () => { closeDialog(); goto('/inbox'); } },
		{ kind: 'navigate', label: 'Go to Appointments', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5', keys: ['Shift', 'A'], action: () => { closeDialog(); goto('/appointments'); } },
		{ kind: 'navigate', label: 'Go to Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', keys: ['R'], action: () => { closeDialog(); goto('/reports'); } },
		{ kind: 'navigate', label: 'Go to Settings', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', action: () => { closeDialog(); goto('/settings'); } },
	];

	const defaultItems = $derived([...createItems, ...navigateItems]);
	const showDefaults = $derived(!hasSearched && !query.trim());

	// Filter default actions that match the current query (shown alongside search results)
	const matchingCreateItems = $derived(
		query.trim() ? createItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())) : []
	);
	const matchingNavigateItems = $derived(
		query.trim() ? navigateItems.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())) : []
	);
	const matchingDefaults = $derived([...matchingCreateItems, ...matchingNavigateItems]);

	// Contextual actions
	const actions: ActionItem[] = $derived.by(() => {
		if (!hasSearched || !query.trim()) return [];
		const items: ActionItem[] = [];

		const firstAccount = accountResults[0];
		if (firstAccount) {
			const year = new Date().getFullYear();
			const accountTitle = firstAccount.title;
			items.push({
				label: `Create order for ${accountTitle}, Fall ${year}`,
				icon: 'plus',
				action: () => {
					closeDialog();
					if (onassistantToggle) {
						onassistantToggle();
						conversation.sendMessage(`Create an order for ${accountTitle}, Fall ${year}`);
					}
				}
			});
		}

		const firstBrand = brandResults[0];
		if (firstBrand) {
			const brandTitle = firstBrand.title;
			const brandId = firstBrand.id;
			items.push({
				label: `View ${brandTitle}'s orders`,
				icon: 'plus',
				action: () => {
					closeDialog();
					goto(`/orders?brand=${brandId}`);
				}
			});
		}

		const currentQuery = query.trim();
		items.push({
			label: `Ask AI about ${currentQuery}`,
			icon: 'sparkle',
			action: () => {
				closeDialog();
				if (onassistantToggle) {
					onassistantToggle();
					conversation.sendMessage(currentQuery);
				}
			}
		});

		return items;
	});

	// Flatten all selectable items for keyboard nav
	const allItems = $derived(
		showDefaults
			? defaultItems.map((d) => ({ kind: 'default' as const, data: d }))
			: [
					...contactResults.map((r) => ({ kind: 'result' as const, data: r })),
					...brandResults.map((r) => ({ kind: 'result' as const, data: r })),
					...accountResults.map((r) => ({ kind: 'result' as const, data: r })),
					...orderResults.map((r) => ({ kind: 'result' as const, data: r })),
					...actions.map((a: ActionItem) => ({ kind: 'action' as const, data: a })),
					...matchingDefaults.map((d) => ({ kind: 'default' as const, data: d }))
				]
	);

	function openDialog() {
		open = true;
		query = '';
		results = [];
		hasSearched = false;
		selectedIndex = 0;
		setTimeout(() => inputEl?.focus(), 10);
	}

	function closeDialog() {
		open = false;
		query = '';
		results = [];
		hasSearched = false;
		selectedIndex = 0;
	}

	async function performSearch(q: string) {
		if (!q.trim()) {
			results = [];
			hasSearched = false;
			return;
		}

		loading = true;
		try {
			const res = await fetch('/api/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: q.trim() })
			});
			const data = await res.json();
			results = data.results ?? [];
			hasSearched = true;
			selectedIndex = 0;
		} catch {
			results = [];
			hasSearched = true;
		} finally {
			loading = false;
		}
	}

	function handleInput() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			performSearch(query);
		}, 300);
	}

	function navigateTo(result: SearchResult) {
		closeDialog();
		if (result.type === 'contact') {
			if (result.parentType) {
				goto(`/organization/contacts/${result.parentType}-${result.id}`);
			} else {
				goto(`/organization/contacts/${result.id}`);
			}
		} else {
			const paths: Record<string, string> = {
				brand: `/brands/${result.id}`,
				account: `/accounts/${result.id}`,
				order: `/orders/${result.id}`
			};
			goto(paths[result.type]);
		}
	}

	function activateSelected() {
		const item = allItems[selectedIndex];
		if (!item) return;
		if (item.kind === 'result') {
			navigateTo(item.data);
		} else if (item.kind === 'default') {
			item.data.action();
		} else {
			item.data.action();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			if (open) closeDialog();
			else openDialog();
			return;
		}

		if (!open) return;

		if (e.key === 'Escape') {
			e.preventDefault();
			closeDialog();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (allItems.length > 0) {
				selectedIndex = (selectedIndex + 1) % allItems.length;
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (allItems.length > 0) {
				selectedIndex = (selectedIndex - 1 + allItems.length) % allItems.length;
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			activateSelected();
		} else if (e.key === 'Tab') {
			e.preventDefault();
			if (query.trim() && onassistantToggle) {
				const q = query.trim();
				closeDialog();
				onassistantToggle();
				conversation.sendMessage(q);
			}
		}
	}

	// Track cumulative index for highlighting
	function getItemIndex(groupOffset: number, itemIdx: number): number {
		return groupOffset + itemIdx;
	}

	const contactOffset = 0;
	const brandOffset = $derived(contactResults.length);
	const accountOffset = $derived(brandOffset + brandResults.length);
	const orderOffset = $derived(accountOffset + accountResults.length);
	const actionOffset = $derived(orderOffset + orderResults.length);
	const defaultMatchOffset = $derived(actionOffset + actions.length);

	function seasonBadgeClass(year?: number): string {
		const currentYear = new Date().getFullYear();
		if (!year) return 'bg-zinc-700 text-zinc-300';
		if (year >= currentYear) return 'bg-emerald-900/80 text-emerald-300';
		return 'bg-amber-900/80 text-amber-300';
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onclick={closeDialog}></div>

	<div class="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-full max-w-2xl overflow-hidden rounded-none bg-zinc-900 shadow-2xl ring-1 ring-white/10"
			onclick={(e: MouseEvent) => e.stopPropagation()}
		>
			<!-- Input bar -->
			<div class="flex items-center gap-3 px-5 py-4">
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
				</svg>
				<input
					bind:this={inputEl}
					bind:value={query}
					oninput={handleInput}
					type="text"
					placeholder="Search or type a command..."
					class="h-6 flex-1 bg-transparent text-base text-zinc-100 outline-none placeholder:text-zinc-500"
				/>
				{#if loading}
					<div class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300"></div>
				{:else}
					<span class="shrink-0 text-xs text-zinc-500">esc to close</span>
				{/if}
			</div>

			<!-- Results -->
			<div class="max-h-[60vh] overflow-y-auto">
				{#if showDefaults}
					<!-- Default actions -->
					<div class="px-5 pb-1 pt-3">
						<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Create</span>
					</div>
					{#each createItems as item, i}
						<button
							class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {i === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
							onclick={item.action}
							onmouseenter={() => (selectedIndex = i)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
							</svg>
							<span class="flex-1 text-sm text-zinc-300">{item.label}</span>
							{#if item.keys}
								<div class="flex items-center gap-0.5 shrink-0">
									{#each item.keys as key}
										<kbd class="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-500">{key}</kbd>
									{/each}
								</div>
							{/if}
						</button>
					{/each}

					<div class="px-5 pb-1 pt-3">
						<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Navigation</span>
					</div>
					{#each navigateItems as item, i}
						{@const idx = createItems.length + i}
						<button
							class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {idx === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
							onclick={item.action}
							onmouseenter={() => (selectedIndex = idx)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
							</svg>
							<span class="flex-1 text-sm text-zinc-300">{item.label}</span>
							{#if item.keys}
								<div class="flex items-center gap-0.5 shrink-0">
									{#each item.keys as key}
										<kbd class="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-500">{key}</kbd>
									{/each}
								</div>
							{/if}
						</button>
					{/each}
				{:else if hasSearched && results.length === 0 && matchingDefaults.length === 0}
					<div class="px-5 py-10 text-center text-sm text-zinc-500">
						No results for "{query}"
					</div>
				{:else if allItems.length > 0}
					<!-- Contacts -->
					{#if contactResults.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Contacts</span>
						</div>
						{#each contactResults as result, i}
							<div
								class="flex w-full items-center gap-3 px-5 py-2.5 transition-colors {getItemIndex(contactOffset, i) === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								role="option"
								tabindex="-1"
								aria-selected={getItemIndex(contactOffset, i) === selectedIndex}
								onmouseenter={() => (selectedIndex = getItemIndex(contactOffset, i))}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
								</svg>
								<div class="min-w-0 flex-1">
									<p class="text-sm font-semibold text-zinc-100">{result.title}</p>
									{#if result.subtitle}
										<p class="text-sm text-zinc-400">{result.subtitle}</p>
									{/if}
								</div>
								<div class="flex shrink-0 items-center gap-2">
									{#if result.subtitle}
										<button
											class="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
											onclick={(e) => { e.stopPropagation(); window.location.href = `mailto:${result.subtitle}`; closeDialog(); }}
										>
											Email
										</button>
									{/if}
									<button
										class="rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
										onclick={() => navigateTo(result)}
									>
										Go to {result.parentType ?? 'account'}
									</button>
								</div>
							</div>
						{/each}
					{/if}

					<!-- Brands -->
					{#if brandResults.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Brands</span>
						</div>
						{#each brandResults as result, i}
							<button
								class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {getItemIndex(brandOffset, i) === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								onclick={() => navigateTo(result)}
								onmouseenter={() => (selectedIndex = getItemIndex(brandOffset, i))}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z M6 6h.008v.008H6V6z" />
								</svg>
								<div class="min-w-0 flex-1">
									<p class="text-sm font-semibold text-zinc-100">{result.title}</p>
									{#if result.subtitle}
										<p class="text-sm text-zinc-400">{result.subtitle}</p>
									{/if}
								</div>
								<span class="shrink-0 text-xs text-zinc-600">Go to brand</span>
							</button>
						{/each}
					{/if}

					<!-- Accounts -->
					{#if accountResults.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Accounts</span>
						</div>
						{#each accountResults as result, i}
							<button
								class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {getItemIndex(accountOffset, i) === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								onclick={() => navigateTo(result)}
								onmouseenter={() => (selectedIndex = getItemIndex(accountOffset, i))}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
								</svg>
								<div class="min-w-0 flex-1">
									<p class="text-sm font-semibold text-zinc-100">{result.title}</p>
									{#if result.subtitle}
										<p class="text-sm text-zinc-400">{result.subtitle}</p>
									{/if}
								</div>
								<span class="shrink-0 text-xs text-zinc-600">Go to account</span>
							</button>
						{/each}
					{/if}

					<!-- Orders -->
					{#if orderResults.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Orders</span>
						</div>
						{#each orderResults as result, i}
							<button
								class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {getItemIndex(orderOffset, i) === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								onclick={() => navigateTo(result)}
								onmouseenter={() => (selectedIndex = getItemIndex(orderOffset, i))}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
								</svg>
								<div class="min-w-0 flex-1 flex items-center gap-3">
									<span class="text-sm font-semibold text-zinc-100">{result.title}</span>
									<span class="text-sm text-zinc-400">{result.subtitle}</span>
									{#if result.meta?.seasonName}
										<span class="inline-flex rounded px-1.5 py-0.5 text-xs font-medium {seasonBadgeClass(result.meta.orderYear)}">
											{result.meta.seasonName}{result.meta.orderYear ? ` ${result.meta.orderYear}` : ''}
										</span>
									{/if}
								</div>
							</button>
						{/each}
					{/if}

					<!-- Actions -->
					{#if actions.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Actions</span>
						</div>
						{#each actions as actionItem, i}
							<button
								class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {getItemIndex(actionOffset, i) === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								onclick={actionItem.action}
								onmouseenter={() => (selectedIndex = getItemIndex(actionOffset, i))}
							>
								{#if actionItem.icon === 'plus'}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
									</svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
									</svg>
								{/if}
								<span class="flex-1 text-sm text-violet-300">{actionItem.label}</span>
								<span class="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">AI</span>
							</button>
						{/each}
					{/if}

					<!-- Matching default actions -->
					{#if matchingCreateItems.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Create</span>
						</div>
						{#each matchingCreateItems as item, i}
							{@const idx = defaultMatchOffset + i}
							<button
								class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {idx === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								onclick={item.action}
								onmouseenter={() => (selectedIndex = idx)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
								</svg>
								<span class="flex-1 text-sm text-zinc-300">{item.label}</span>
							</button>
						{/each}
					{/if}

					{#if matchingNavigateItems.length > 0}
						<div class="px-5 pb-1 pt-3">
							<span class="text-xs font-semibold uppercase tracking-wider text-white/40">Navigation</span>
						</div>
						{#each matchingNavigateItems as item, i}
							{@const idx = defaultMatchOffset + matchingCreateItems.length + i}
							<button
								class="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors {idx === selectedIndex ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'}"
								onclick={item.action}
								onmouseenter={() => (selectedIndex = idx)}
							>
								<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
									<path stroke-linecap="round" stroke-linejoin="round" d={item.icon} />
								</svg>
								<span class="flex-1 text-sm text-zinc-300">{item.label}</span>
							</button>
						{/each}
					{/if}
				{/if}
			</div>

			<!-- Footer -->
			<div class="flex items-center gap-5 px-5 py-2.5">
				<div class="flex items-center gap-1.5">
					<kbd class="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">↑↓</kbd>
					<span class="text-xs text-zinc-500">navigate</span>
				</div>
				<div class="flex items-center gap-1.5">
					<kbd class="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">↵</kbd>
					<span class="text-xs text-zinc-500">select</span>
				</div>
				<div class="flex items-center gap-1.5">
					<kbd class="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] font-mono text-zinc-400">tab</kbd>
					<span class="text-xs text-zinc-500">to ask AI</span>
				</div>
			</div>
		</div>
	</div>
{/if}
