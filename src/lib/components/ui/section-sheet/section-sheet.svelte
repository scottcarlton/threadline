<script lang="ts">
	import { resolve } from '$app/paths';
	import { OverlayPanel } from '$lib/components/ui/overlay-panel/index.js';
	import { cn } from '$lib/utils.js';

	type Item = {
		label: string;
		href: string;
		badge?: number;
	};

	type Group = {
		label: string;
		pill?: 'new';
		items: Item[];
	};

	type Props = {
		open: boolean;
		groups: Group[];
		activeHref: string;
		onclose: () => void;
		onnavigate: () => void;
	};

	let { open, groups, activeHref, onclose, onnavigate }: Props = $props();

	function isActive(href: string): boolean {
		if (href === '/organization') return activeHref === '/organization';
		return activeHref.startsWith(href);
	}
</script>

<OverlayPanel {open} {onclose} ariaLabel="Sections" side="left" width="100vw">
	<div class="flex h-full flex-col overflow-y-auto p-4">
		<div class="mb-4 flex items-center justify-between">
			<span class="text-sm font-semibold">Sections</span>
			<button
				onclick={onclose}
				aria-label="Close sections"
				class="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
		<nav class="space-y-5">
			{#each groups as group (group.label)}
				<div>
					<div class="mb-1.5 flex items-center gap-2 px-3">
						<span class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							{group.label}
						</span>
						{#if group.pill === 'new'}
							<span
								class="inline-flex items-center rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background"
							>
								New
							</span>
						{/if}
					</div>
					<ul class="space-y-0.5">
						{#each group.items as item (item.href)}
							<li>
								<a
									href={resolve(item.href as '/organization')}
									onclick={onnavigate}
									class={cn(
										'flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
										isActive(item.href)
											? 'bg-muted text-foreground'
											: 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
									)}
								>
									{item.label}
									{#if item.badge}
										<span
											class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-medium text-zinc-600"
											>{item.badge}</span
										>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>
	</div>
</OverlayPanel>
