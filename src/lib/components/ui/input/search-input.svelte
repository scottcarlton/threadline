<script lang="ts">
	import { cn } from '$lib/utils.js';
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'class' | 'value' | 'type'> & {
		class?: string;
		value?: string;
	};

	let { class: className = '', value = $bindable(''), ...restProps }: Props = $props();

	let inputEl: HTMLInputElement;

	function clear() {
		const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
		nativeSetter.call(inputEl, '');
		inputEl.dispatchEvent(new Event('input', { bubbles: true }));
		inputEl.focus();
	}
</script>

<div class={cn('relative', className)}>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="2"
	>
		<path
			stroke-linecap="round"
			stroke-linejoin="round"
			d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
		/>
	</svg>
	<input
		type="text"
		bind:this={inputEl}
		bind:value
		class={cn(
			'flex min-h-[44px] w-full rounded-sm border border-input bg-background py-2 pl-9 text-base transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
			value ? 'pr-9' : 'pr-3.5'
		)}
		{...restProps}
	/>
	{#if value}
		<button
			type="button"
			class="absolute top-1/2 right-2.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
			onclick={clear}
			aria-label="Clear search"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				viewBox="0 0 24 24"
				fill="currentColor"
			>
				<path
					d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 10.5858L9.17157 7.75736L7.75736 9.17157L10.5858 12L7.75736 14.8284L9.17157 16.2426L12 13.4142L14.8284 16.2426L16.2426 14.8284L13.4142 12L16.2426 9.17157L14.8284 7.75736L12 10.5858Z"
				/>
			</svg>
		</button>
	{/if}
</div>
