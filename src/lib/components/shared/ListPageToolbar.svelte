<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';
	import { SearchInput } from '$lib/components/ui/input/index.js';
	import FilterBadge from '$lib/components/shared/FilterBadge.svelte';
	import { fly } from 'svelte/transition';

	type Props = {
		search?: string;
		onSearchInput?: (e: Event) => void;
		searchPlaceholder?: string;
		searchClass?: string;
		hasActiveFilters?: boolean;
		onFilterToggle?: () => void;
		showFilterToggle?: boolean;
		children?: Snippet;
		class?: string;
	};

	let {
		search = '',
		onSearchInput,
		searchPlaceholder = 'Search...',
		searchClass = 'w-64 shrink-0',
		hasActiveFilters = false,
		onFilterToggle,
		showFilterToggle = false,
		children,
		class: className
	}: Props = $props();
</script>

<div
	class={cn(
		'-mx-4 flex min-h-[44px] items-center gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0 lg:pb-0',
		className
	)}
	in:fly={{ y: 6, duration: 250, delay: 100 }}
>
	<SearchInput
		value={search}
		oninput={onSearchInput}
		placeholder={searchPlaceholder}
		class={searchClass}
	/>

	{#if showFilterToggle}
		<button
			onclick={onFilterToggle}
			class="relative flex min-h-[44px] items-center justify-center rounded-sm border border-input bg-background px-3 transition-colors hover:bg-muted/50"
			aria-label="Toggle filters"
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
					d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
				/>
			</svg>
			<FilterBadge active={hasActiveFilters} />
		</button>
	{/if}

	{#if children}
		{@render children()}
	{/if}
</div>
