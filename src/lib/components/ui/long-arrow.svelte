<script lang="ts">
	type Props = {
		direction?: 'left' | 'right';
		class?: string;
	};
	let { direction = 'right', class: className = 'h-3.5 w-7' }: Props = $props();
</script>

{#if direction === 'left'}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 28 12"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="M27 6H1m0 0l5-5m-5 5l5 5" />
	</svg>
{:else}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 28 12"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		class={className}
		aria-hidden="true"
	>
		<path d="M1 6h26m0 0l-5-5m5 5l-5 5" />
	</svg>
{/if}
