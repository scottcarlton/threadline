<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { buttonVariants, type ButtonVariants } from './index.js';

	type Props = {
		variant?: ButtonVariants['variant'];
		size?: ButtonVariants['size'];
		class?: string;
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (e: MouseEvent) => void;
		href?: string;
		children?: import('svelte').Snippet;
	};

	let {
		variant = 'default',
		size = 'default',
		class: className = '',
		disabled = false,
		type = 'button',
		onclick,
		href,
		children,
		...restProps
	}: Props = $props();
</script>

{#if href}
	<a {href} class={cn(buttonVariants({ variant, size }), className)} {...restProps}>
		{@render children?.()}
	</a>
{:else}
	<button
		{type}
		{disabled}
		{onclick}
		class={cn(buttonVariants({ variant, size }), className)}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
