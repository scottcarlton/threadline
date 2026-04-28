<script lang="ts">
	import { type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { fly, fade } from 'svelte/transition';

	type Props = {
		open: boolean;
		side?: 'left' | 'right';
		ariaLabel: string;
		onclose: () => void;
		width?: string;
		children: Snippet;
	};

	let { open, side = 'left', ariaLabel, onclose, width = '320px', children }: Props = $props();

	let panelEl = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	$effect(() => {
		if (!browser) return;
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement | null;
			// iOS Safari ignores body { overflow: hidden } for touch scroll. The
			// fix-position pattern locks the page by pinning body to the current
			// scroll offset and restoring on close. Without this, swiping over the
			// panel scrolls the page underneath.
			const scrollY = window.scrollY;
			const body = document.body;
			body.style.position = 'fixed';
			body.style.top = `-${scrollY}px`;
			body.style.left = '0';
			body.style.right = '0';
			body.style.overflow = 'hidden';
			// Focus the panel on open for screen readers / keyboard nav.
			queueMicrotask(() => panelEl?.focus());
			return () => {
				body.style.position = '';
				body.style.top = '';
				body.style.left = '';
				body.style.right = '';
				body.style.overflow = '';
				window.scrollTo(0, scrollY);
				previouslyFocused?.focus();
			};
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
			return;
		}
		if (e.key === 'Tab' && panelEl) {
			const focusables = panelEl.querySelectorAll<HTMLElement>(
				'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/40"
		onclick={onclose}
		transition:fade={{ duration: 150 }}
	></div>
	<div
		bind:this={panelEl}
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
		tabindex="-1"
		class="fixed top-0 z-50 h-full bg-background shadow-xl outline-none"
		class:left-0={side === 'left'}
		class:right-0={side === 'right'}
		style:width
		transition:fly={{ x: side === 'left' ? -300 : 300, duration: 200 }}
	>
		{@render children()}
	</div>
{/if}
