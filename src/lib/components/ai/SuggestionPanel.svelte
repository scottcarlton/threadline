<script lang="ts">
	import type { SuggestionMatch } from '$lib/utils/ai-suggest.js';

	type Props = {
		/** Best match first. Rendered bottom-up so the best sits nearest the input. */
		suggestions: SuggestionMatch[];
		/** Index into `suggestions`, or -1 for nothing highlighted. */
		activeIndex: number;
		onselect: (text: string) => void;
		onhover: (index: number) => void;
	};

	let { suggestions, activeIndex, onselect, onhover }: Props = $props();

	// The panel sits above the input, so the strongest match belongs at the
	// bottom of the list, closest to the cursor.
	const rows = $derived(suggestions.map((suggestion, index) => ({ suggestion, index })).reverse());
</script>

<div class="animate-in rounded-2xl bg-zinc-900 py-2 shadow-2xl ring-1 ring-white/10">
	<ul role="listbox" aria-label="Prompt suggestions">
		{#each rows as { suggestion, index } (suggestion.text)}
			<li>
				<button
					type="button"
					role="option"
					aria-selected={index === activeIndex}
					tabindex="-1"
					onmouseenter={() => onhover(index)}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => onselect(suggestion.text)}
					class="flex w-full items-center gap-4 px-5 py-2.5 text-left text-base transition-colors {index ===
					activeIndex
						? 'bg-zinc-800'
						: 'hover:bg-zinc-800/60'}"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 shrink-0 text-zinc-500"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
						aria-hidden="true"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
						/>
					</svg>
					<span class="truncate text-zinc-100">
						<!-- What the user already typed is dimmed, so the eye lands on
						     the part that is new. A keyword-only match has an empty run
						     and renders undimmed. -->
						{#if suggestion.matchEnd > suggestion.matchStart}
							<span>{suggestion.text.slice(0, suggestion.matchStart)}</span><span
								class="text-zinc-500"
								>{suggestion.text.slice(suggestion.matchStart, suggestion.matchEnd)}</span
							><span>{suggestion.text.slice(suggestion.matchEnd)}</span>
						{:else}
							{suggestion.text}
						{/if}
					</span>
				</button>
			</li>
		{/each}
	</ul>
</div>
