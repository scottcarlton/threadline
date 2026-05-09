<script lang="ts">
	import { type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { fly, fade } from 'svelte/transition';

	type Props = {
		open: boolean;
		side?: 'left' | 'right' | 'bottom';
		ariaLabel: string;
		onclose: () => void;
		width?: string;
		maxHeight?: string;
		closeOnEscape?: boolean;
		showDragHandle?: boolean;
		rounded?: boolean;
		children: Snippet;
	};

	let {
		open,
		side = 'left',
		ariaLabel,
		onclose,
		width = '320px',
		maxHeight = '85dvh',
		closeOnEscape = true,
		showDragHandle = true,
		rounded = true,
		children
	}: Props = $props();

	const isBottom = $derived(side === 'bottom');

	let panelEl = $state<HTMLDivElement | null>(null);
	let backdropEl = $state<HTMLDivElement | null>(null);
	let previouslyFocused: HTMLElement | null = null;

	// Bottom-sheet uses Motion with spring physics. We keep `mounted` independent
	// from `open` so the exit animation can play to completion before the DOM is
	// removed — Svelte's {#if} would otherwise destroy the node mid-outro.
	let bottomMounted = $state(false);
	let bottomAnimating = $state(false);

	$effect(() => {
		if (!isBottom || !browser) return;
		if (open && !bottomMounted) {
			bottomMounted = true;
			queueMicrotask(() => animateBottomIn());
		} else if (!open && bottomMounted && !bottomAnimating) {
			animateBottomOut();
		}
	});

	async function animateBottomIn() {
		if (!panelEl) return;
		previouslyFocused = document.activeElement as HTMLElement | null;
		lockBodyScroll();
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const { animate } = await import('motion');
		bottomAnimating = true;
		const panel = panelEl;
		const backdrop = backdropEl;
		const distance = panel.getBoundingClientRect().height || window.innerHeight;
		if (reduced) {
			panel.style.transform = 'translateY(0px)';
			if (backdrop) backdrop.style.opacity = '1';
			bottomAnimating = false;
			panel.focus();
			return;
		}
		panel.style.transform = `translateY(${distance}px)`;
		if (backdrop) backdrop.style.opacity = '0';
		await new Promise((r) => requestAnimationFrame(r));
		const panelAnim = animate(panel, { y: [distance, 0] } as Parameters<typeof animate>[1], {
			type: 'spring',
			stiffness: 360,
			damping: 36,
			mass: 1
		});
		if (backdrop) {
			animate(backdrop, { opacity: [0, 1] } as Parameters<typeof animate>[1], {
				duration: 0.32,
				ease: [0.16, 1, 0.3, 1]
			});
		}
		await panelAnim.finished?.catch(() => {});
		bottomAnimating = false;
		panel.focus();
	}

	async function animateBottomOut() {
		if (!panelEl) {
			bottomMounted = false;
			return;
		}
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const { animate } = await import('motion');
		bottomAnimating = true;
		const panel = panelEl;
		const backdrop = backdropEl;
		const distance = panel.getBoundingClientRect().height || window.innerHeight;
		if (reduced) {
			bottomAnimating = false;
			bottomMounted = false;
			unlockBodyScroll();
			previouslyFocused?.focus();
			return;
		}
		const panelAnim = animate(panel, { y: [0, distance] } as Parameters<typeof animate>[1], {
			duration: 0.34,
			ease: [0.32, 0, 0.67, 0]
		});
		if (backdrop) {
			animate(backdrop, { opacity: [1, 0] } as Parameters<typeof animate>[1], {
				duration: 0.28,
				ease: [0.32, 0, 0.67, 0]
			});
		}
		await panelAnim.finished?.catch(() => {});
		bottomAnimating = false;
		bottomMounted = false;
		unlockBodyScroll();
		previouslyFocused?.focus();
	}

	let savedScrollY = 0;
	function lockBodyScroll() {
		savedScrollY = window.scrollY;
		const body = document.body;
		body.style.position = 'fixed';
		body.style.top = `-${savedScrollY}px`;
		body.style.left = '0';
		body.style.right = '0';
		body.style.overflow = 'hidden';
	}
	function unlockBodyScroll() {
		const body = document.body;
		body.style.position = '';
		body.style.top = '';
		body.style.left = '';
		body.style.right = '';
		body.style.overflow = '';
		window.scrollTo(0, savedScrollY);
	}

	// Side panels (left/right) keep their original behavior with svelte transitions.
	$effect(() => {
		if (isBottom || !browser) return;
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement | null;
			lockBodyScroll();
			queueMicrotask(() => panelEl?.focus());
			return () => {
				unlockBodyScroll();
				previouslyFocused?.focus();
			};
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && closeOnEscape) {
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

	const isVisible = $derived(isBottom ? bottomMounted : open);
</script>

<svelte:window onkeydown={isVisible ? handleKeydown : undefined} />

{#if isBottom}
	{#if bottomMounted}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={backdropEl}
			class="fixed inset-0 z-40 bg-black/40"
			style:opacity="0"
			onclick={onclose}
		></div>
		<div
			bind:this={panelEl}
			role="dialog"
			aria-modal="true"
			aria-label={ariaLabel}
			tabindex="-1"
			class="fixed right-0 bottom-0 left-0 z-50 flex flex-col bg-background shadow-xl outline-none {rounded
				? 'rounded-t-2xl'
				: ''}"
			style:max-height={maxHeight}
			style:transform="translateY(100%)"
			style:will-change="transform"
		>
			{#if showDragHandle}
				<div class="flex shrink-0 items-center justify-center pt-2 pb-1">
					<div class="h-1 w-10 rounded-full bg-muted-foreground/30"></div>
				</div>
			{/if}
			{@render children()}
		</div>
	{/if}
{:else if open}
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
