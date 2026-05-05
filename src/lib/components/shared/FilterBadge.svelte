<script lang="ts">
	import { scale } from 'svelte/transition';

	type Props = {
		active: boolean;
	};

	let { active }: Props = $props();
</script>

{#if active}
	<span
		class="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-orange-500"
		in:scale={{ duration: 200, start: 0 }}
		out:scale={{ duration: 150 }}
	></span>
{/if}
