<script lang="ts">
	import { writable } from 'svelte/store';

	let briefing = $state<string | null>(null);
	let loading = $state(true);
	let error = $state(false);

	// Simple session cache
	const cachedBriefing = writable<string | null>(null);

	async function fetchBriefing() {
		loading = true;
		error = false;

		try {
			const res = await fetch('/api/ai/briefing', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const data = await res.json();
			briefing = data.briefing;
			cachedBriefing.set(data.briefing);
		} catch {
			error = true;
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		const unsub = cachedBriefing.subscribe((cached) => {
			if (cached) {
				briefing = cached;
				loading = false;
			}
		});

		if (!briefing) {
			fetchBriefing();
		}

		return unsub;
	});

	function refresh() {
		cachedBriefing.set(null);
		briefing = null;
		fetchBriefing();
	}

	function formatBriefing(text: string): string {
		return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
	}
</script>

<div class="rounded-none border bg-card p-5">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4 text-muted-foreground"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
				/>
			</svg>
			<h3 class="text-[14px] font-semibold">Your Briefing</h3>
		</div>
		{#if !loading}
			<button
				onclick={refresh}
				class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				aria-label="Refresh briefing"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-3.5 w-3.5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</button>
		{/if}
	</div>

	<div class="mt-4">
		{#if loading}
			<div class="space-y-3">
				<div class="h-4 w-3/4 animate-pulse rounded bg-muted"></div>
				<div class="h-4 w-full animate-pulse rounded bg-muted"></div>
				<div class="h-4 w-2/3 animate-pulse rounded bg-muted"></div>
				<div class="h-4 w-5/6 animate-pulse rounded bg-muted"></div>
			</div>
		{:else if error || !briefing}
			<p class="text-[13px] text-muted-foreground">
				Unable to generate briefing. Check your API key in .env.
			</p>
		{:else}
			<div class="space-y-2 text-[13px] leading-relaxed text-foreground/90">
				{#each briefing.split('\n').filter((l) => l.trim()) as line}
					<p>{@html formatBriefing(line)}</p>
				{/each}
			</div>
		{/if}
	</div>
</div>
