<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { buttonVariants, type ButtonVariants } from './index.js';

	type Props = {
		variant?: ButtonVariants['variant'];
		size?: ButtonVariants['size'];
		class?: string;
		disabled?: boolean;
		loading?: boolean;
		type?: 'button' | 'submit' | 'reset';
		form?: string;
		onclick?: (e: MouseEvent) => void;
		href?: string;
		children?: import('svelte').Snippet;
	};

	let {
		variant = 'default',
		size = 'default',
		class: className = '',
		disabled = false,
		loading = false,
		type = 'button',
		form,
		onclick,
		href,
		children,
		...restProps
	}: Props = $props();
</script>

{#snippet content()}
	{#if loading}
		<!-- Render label invisibly so the button keeps its width/height. -->
		<span class="invisible inline-flex items-center">
			{@render children?.()}
		</span>
		<span class="absolute inset-0 inline-flex items-center justify-center" aria-hidden="true">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				class="h-4 w-4 animate-spin"
			>
				<path d="M21 12a9 9 0 1 1-6.219-8.56" />
			</svg>
		</span>
	{:else}
		{@render children?.()}
	{/if}
{/snippet}

{#if href}
	<!-- eslint-disable svelte/no-navigation-without-resolve -- generic Button accepts any href; callers resolve() their own paths -->
	<a
		{href}
		class={cn(buttonVariants({ variant, size }), 'relative', className)}
		aria-busy={loading || undefined}
		{...restProps}
	>
		{@render content()}
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<button
		{type}
		disabled={disabled || loading}
		{form}
		{onclick}
		class={cn(buttonVariants({ variant, size }), 'relative', className)}
		aria-busy={loading || undefined}
		{...restProps}
	>
		{@render content()}
	</button>
{/if}
