<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import DialogOverlay from './dialog-overlay.svelte';

	type Props = DialogPrimitive.ContentProps & {
		class?: string;
		overlayClass?: string;
	};

	let { class: className, overlayClass, children, ...restProps }: Props = $props();
</script>

<DialogPrimitive.Portal>
	<DialogOverlay class={overlayClass} />
	<DialogPrimitive.Content
		class={cn(
			'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
			'fixed top-1/2 left-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2',
			'max-h-[90vh] overflow-y-auto rounded-lg border bg-background shadow-lg',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</DialogPrimitive.Content>
</DialogPrimitive.Portal>
