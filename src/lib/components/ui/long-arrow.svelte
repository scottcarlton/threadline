<script lang="ts">
	type Props = {
		direction?: 'left' | 'right';
		class?: string;
	};
	let { direction = 'right', class: className = 'h-4 w-4' }: Props = $props();
</script>

{#if direction === 'left'}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="currentColor"
		class={className}
		aria-hidden="true"
	>
		<path
			d="M22.0003 13.0001L22.0004 11.0002L5.82845 11.0002L9.77817 7.05044L8.36396 5.63623L2 12.0002L8.36396 18.3642L9.77817 16.9499L5.8284 13.0002L22.0003 13.0001Z"
		/>
	</svg>
{:else}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="currentColor"
		class={className}
		aria-hidden="true"
	>
		<path
			d="M1.99974 13.0001L1.9996 11.0002L18.1715 11.0002L14.2218 7.05044L15.636 5.63623L22 12.0002L15.636 18.3642L14.2218 16.9499L18.1716 13.0002L1.99974 13.0001Z"
		/>
	</svg>
{/if}
