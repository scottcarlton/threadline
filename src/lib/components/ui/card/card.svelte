<script lang="ts">
	import { cn } from '$lib/utils.js';
	type Props = { class?: string; children?: import('svelte').Snippet };
	let { class: className = '', children, ...restProps }: Props = $props();
</script>

<div class={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...restProps}>
	{@render children?.()}
</div>
