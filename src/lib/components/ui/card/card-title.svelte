<script lang="ts">
	import { cn } from '$lib/utils.js';
	type Props = { class?: string; children?: import('svelte').Snippet };
	let { class: className = '', children, ...restProps }: Props = $props();
</script>

<h3 class={cn('text-2xl leading-none font-semibold tracking-tight', className)} {...restProps}>
	{@render children?.()}
</h3>
