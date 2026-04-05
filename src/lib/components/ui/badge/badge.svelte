<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { badgeVariants, type BadgeVariants } from './index.js';

	type Props = {
		variant?: BadgeVariants['variant'];
		class?: string;
		children?: import('svelte').Snippet;
	};

	let { variant = 'default', class: className = '', children, ...restProps }: Props = $props();
</script>

<div class={cn(badgeVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>
