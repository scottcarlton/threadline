<script lang="ts">
	import { cn } from '$lib/utils.js';
	type Props = { class?: string; src?: string; alt?: string };
	let { class: className = '', src, alt = '', ...restProps }: Props = $props();
	let hasError = $state(false);
</script>

{#if src && !hasError}
	<img
		{src}
		{alt}
		class={cn('aspect-square h-full w-full', className)}
		onerror={() => (hasError = true)}
		{...restProps}
	/>
{/if}
