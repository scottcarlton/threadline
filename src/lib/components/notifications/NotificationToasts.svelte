<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { newToasts, markToastSeen } from '$lib/stores/notifications.js';
	import NotificationCard from './NotificationCard.svelte';
	import type { NotificationItem } from '$lib/stores/notifications.js';

	const AUTO_DISMISS_MS = 7000;
	const MAX_VISIBLE = 4;

	const visible = $derived($newToasts.slice(0, MAX_VISIBLE));

	const timers = new SvelteMap<string, ReturnType<typeof setTimeout>>();
	const paused = new SvelteSet<string>();

	function scheduleDismiss(notif: NotificationItem) {
		if (paused.has(notif.id)) return;
		clearTimeout(timers.get(notif.id));
		timers.set(
			notif.id,
			setTimeout(() => markToastSeen(notif.id), AUTO_DISMISS_MS)
		);
	}

	$effect(() => {
		for (const n of visible) {
			if (!timers.has(n.id)) scheduleDismiss(n);
		}
	});

	function pause(id: string) {
		paused.add(id);
		const t = timers.get(id);
		if (t) clearTimeout(t);
		timers.delete(id);
	}

	function resume(id: string) {
		paused.delete(id);
		const notif = visible.find((n) => n.id === id);
		if (notif) scheduleDismiss(notif);
	}

	// Pointer-drag dismiss
	const dragX = new SvelteMap<string, number>();

	function onPointerDown(e: PointerEvent, id: string) {
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		pause(id);

		function move(ev: PointerEvent) {
			const dx = Math.max(0, ev.clientX - startX);
			dragX.set(id, dx);
			target.style.transform = `translateX(${dx}px)`;
			target.style.opacity = String(Math.max(0.2, 1 - dx / 240));
		}

		function up(ev: PointerEvent) {
			target.releasePointerCapture(ev.pointerId);
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', up);
			target.removeEventListener('pointercancel', up);
			const dx = dragX.get(id) ?? 0;
			dragX.delete(id);
			if (dx > 120) {
				markToastSeen(id);
			} else {
				target.style.transition = 'transform 180ms ease, opacity 180ms ease';
				target.style.transform = '';
				target.style.opacity = '';
				setTimeout(() => {
					target.style.transition = '';
					resume(id);
				}, 200);
			}
		}

		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', up);
		target.addEventListener('pointercancel', up);
	}
</script>

{#if visible.length > 0}
	<div
		class="pointer-events-none fixed inset-x-2 top-12 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:top-12 sm:right-3 sm:w-[380px]"
		aria-live="polite"
	>
		{#each visible as notif (notif.id)}
			<div
				class="pointer-events-auto touch-pan-y select-none"
				onpointerdown={(e) => onPointerDown(e, notif.id)}
				onmouseenter={() => pause(notif.id)}
				onmouseleave={() => resume(notif.id)}
				in:fly={{ x: 400, duration: 320, easing: quintOut }}
				out:fly={{ x: 400, duration: 220, easing: quintOut }}
				role="presentation"
			>
				<NotificationCard
					{notif}
					variant="toast"
					onDismissRequest={() => markToastSeen(notif.id)}
				/>
			</div>
		{/each}
	</div>
{/if}
