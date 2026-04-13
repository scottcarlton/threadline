<script lang="ts">
	import { cn } from '$lib/utils.js';
	type Props = { class?: string; children?: import('svelte').Snippet };
	let { class: className = '', children, ...restProps }: Props = $props();
</script>

<span
	class={cn('flex h-full w-full items-center justify-center rounded-full bg-muted', className)}
	{...restProps}
>
	{@render children?.()}
</span>
