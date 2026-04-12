<script lang="ts">
	import { cn } from '$lib/utils.js';

	type Props = {
		class?: string;
		for?: string;
		children?: import('svelte').Snippet;
	};

	let { class: className = '', for: htmlFor, children, ...restProps }: Props = $props();
</script>

<label
	for={htmlFor}
	class={cn(
		'mb-1 text-sm font-normal leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</label>
