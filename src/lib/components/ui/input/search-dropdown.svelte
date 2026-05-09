<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import {
		getRecent,
		addRecent,
		removeRecent,
		type SearchContext
	} from '$lib/stores/recent-searches.js';
	import { debounce } from '$lib/utils/debounce.js';

	type Suggestion = { id: string; name: string };

	type Props = {
		value?: string;
		oninput?: (e: Event) => void;
		oncommit?: (term: string) => void;
		placeholder?: string;
		class?: string;
		context: SearchContext;
		suggestionType: 'accounts' | 'products';
	};

	let {
		value = $bindable(''),
		oninput,
		oncommit,
		placeholder = 'Search...',
		class: className,
		context,
		suggestionType
	}: Props = $props();

	let open = $state(false);
	let recentItems = $state<string[]>([]);
	let suggestions = $state<Suggestion[]>([]);
	let activeIndex = $state(-1);
	let wrapperEl = $state<HTMLDivElement | null>(null);
	let blurTimeout: ReturnType<typeof setTimeout>;

	function refreshRecent() {
		recentItems = getRecent(context);
	}

	const filteredRecent = $derived(() => {
		if (!value.trim()) return recentItems;
		const q = value.trim().toLowerCase();
		return recentItems.filter((t) => t.toLowerCase().includes(q));
	});

	const allItems = $derived(() => {
		const recent = filteredRecent().map((t) => ({ type: 'recent' as const, label: t }));
		const suggest = suggestions.map((s) => ({ type: 'suggestion' as const, label: s.name }));
		return [...recent, ...suggest];
	});

	const fetchSuggestions = debounce(async (q: string) => {
		if (q.trim().length < 2) {
			suggestions = [];
			return;
		}
		try {
			const res = await fetch(
				`/api/suggestions?q=${encodeURIComponent(q.trim())}&type=${suggestionType}&limit=6`
			);
			if (res.ok) {
				const data = await res.json();
				suggestions = data.suggestions ?? [];
			}
		} catch {
			suggestions = [];
		}
	}, 200);

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		value = target.value;
		activeIndex = -1;
		open = true;
		fetchSuggestions(value);
		oninput?.(e);
	}

	function handleFocus() {
		refreshRecent();
		open = true;
		if (value.trim().length >= 2) {
			fetchSuggestions(value);
		}
	}

	function handleBlur() {
		blurTimeout = setTimeout(() => {
			open = false;
			activeIndex = -1;
		}, 200);
	}

	function selectItem(label: string) {
		clearTimeout(blurTimeout);
		value = label;
		addRecent(context, label);
		open = false;
		activeIndex = -1;
		oncommit?.(label);
	}

	function handleRemoveRecent(term: string, e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		clearTimeout(blurTimeout);
		recentItems = removeRecent(context, term);
	}

	function handleKeydown(e: KeyboardEvent) {
		const items = allItems();
		if (!open || items.length === 0) {
			if (e.key === 'Enter' && value.trim()) {
				addRecent(context, value.trim());
				oncommit?.(value.trim());
			}
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			activeIndex = activeIndex < items.length - 1 ? activeIndex + 1 : 0;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			activeIndex = activeIndex > 0 ? activeIndex - 1 : items.length - 1;
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (activeIndex >= 0 && activeIndex < items.length) {
				selectItem(items[activeIndex].label);
			} else if (value.trim()) {
				addRecent(context, value.trim());
				open = false;
				oncommit?.(value.trim());
			}
		} else if (e.key === 'Escape') {
			open = false;
			activeIndex = -1;
		}
	}

	function boldMatch(
		text: string,
		query: string
	): { before: string; match: string; after: string } | null {
		if (!query.trim()) return null;
		const lower = text.toLowerCase();
		const idx = lower.indexOf(query.trim().toLowerCase());
		if (idx === -1) return null;
		return {
			before: text.slice(0, idx),
			match: text.slice(idx, idx + query.trim().length),
			after: text.slice(idx + query.trim().length)
		};
	}
</script>

<div class={cn('relative', className)} bind:this={wrapperEl}>
	<SearchInput
		{value}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		{placeholder}
		class="w-full"
	/>

	{#if open && allItems().length > 0}
		<div
			class="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
			role="listbox"
		>
			{#each allItems() as item, i (item.type + item.label)}
				<button
					type="button"
					role="option"
					aria-selected={activeIndex === i}
					class="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors {activeIndex ===
					i
						? 'bg-muted'
						: 'hover:bg-muted/50'}"
					onmousedown={() => selectItem(item.label)}
					onmouseenter={() => (activeIndex = i)}
				>
					{#if item.type === 'recent'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0 text-muted-foreground"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
							/>
						</svg>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 shrink-0 text-muted-foreground"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
							/>
						</svg>
					{/if}

					<span class="min-w-0 flex-1 truncate">
						{#if value.trim()}
							{@const parts = boldMatch(item.label, value)}
							{#if parts}
								{parts.before}<span class="font-semibold">{parts.match}</span>{parts.after}
							{:else}
								{item.label}
							{/if}
						{:else}
							{item.label}
						{/if}
					</span>

					{#if item.type === 'recent'}
						<span
							role="button"
							tabindex="0"
							class="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
							aria-label="Remove from recent searches"
							onmousedown={(e: MouseEvent) => handleRemoveRecent(item.label, e)}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									handleRemoveRecent(item.label, e as unknown as MouseEvent);
								}
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
								/>
							</svg>
						</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
