<script lang="ts">
	import { levelToBarHeight } from '$lib/utils/voice-capture';

	interface Props {
		/** Loudness samples (0–1), oldest first. The newest renders at the right edge. */
		levels: number[];
		class?: string;
	}

	let { levels, class: className = '' }: Props = $props();

	// 2px bar + 3px gap per slot.
	const SLOT_PX = 5;

	let width = $state(0);
	const slots = $derived(Math.max(0, Math.floor(width / SLOT_PX)));
	const visible = $derived(levels.slice(-slots));
	const empty = $derived(Math.max(0, slots - visible.length));
</script>

<div
	bind:clientWidth={width}
	class="flex h-7 items-center justify-end gap-[3px] overflow-hidden {className}"
	aria-hidden="true"
>
	{#each { length: empty }, i (i)}
		<span class="h-0.5 w-0.5 shrink-0 rounded-full bg-zinc-700"></span>
	{/each}
	{#each visible as level, i (i)}
		<span
			class="w-0.5 shrink-0 rounded-full bg-zinc-400"
			style="height: {levelToBarHeight(level)}px"
		></span>
	{/each}
</div>
