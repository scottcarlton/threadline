<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	type Props = DialogPrimitive.TitleProps & {
		class?: string;
	};

	let { class: className, children, ...restProps }: Props = $props();
</script>

<DialogPrimitive.Title class={cn('text-lg font-semibold tracking-tight', className)} {...restProps}>
	{@render children?.()}
</DialogPrimitive.Title>
