<script lang="ts">
	import { onMount } from 'svelte';

	type Props = {
		visible?: boolean;
	};

	let { visible = false }: Props = $props();

	type DemoNotification = {
		initials: string;
		title: string;
		body: string;
		time: string;
	};

	const notifications: DemoNotification[] = [
		{
			initials: 'TL',
			title: 'New order from Nordstrom',
			body: '12 units of Fall Collection submitted',
			time: '2min ago'
		},
		{
			initials: 'JR',
			title: 'James Rivera commented',
			body: 'Updated the shipping timeline for Saks',
			time: '5min ago'
		},
		{
			initials: 'MV',
			title: 'Mercer & Vine hit quarterly target',
			body: '$142K in confirmed orders this quarter',
			time: '12min ago'
		}
	];

	let shown = $state<number[]>([]);
	let animatedEls: HTMLElement[] = [];

	onMount(() => {
		let cleanupScroll: (() => void) | undefined;

		(async () => {
			const { animate } = await import('motion');

			if (!visible) return;

			// Slide in staggered
			notifications.forEach((_, i) => {
				setTimeout(
					() => {
						shown = [...shown, i];

						requestAnimationFrame(() => {
							const el = animatedEls[i];
							if (el) {
								animate(el, { opacity: [0, 1], x: [80, 0] } as Parameters<typeof animate>[1], {
									duration: 0.5,
									ease: [0.16, 1, 0.3, 1]
								});
							}
						});
					},
					300 + i * 250
				);
			});

			// Slide out on scroll
			let isOut = false;
			let animating = false;

			function onScroll() {
				if (animating) return;

				if (window.scrollY > 150 && !isOut) {
					animating = true;
					isOut = true;
					notifications.forEach((_, i) => {
						setTimeout(() => {
							const el = animatedEls[i];
							if (el) {
								animate(el, { opacity: [1, 0], x: [0, 120] } as Parameters<typeof animate>[1], {
									duration: 0.4,
									ease: [0.16, 1, 0.3, 1]
								});
							}
							if (i === notifications.length - 1) animating = false;
						}, i * 200);
					});
				} else if (window.scrollY <= 50 && isOut) {
					animating = true;
					isOut = false;
					notifications.forEach((_, i) => {
						setTimeout(() => {
							const el = animatedEls[i];
							if (el) {
								animate(el, { opacity: [0, 1], x: [120, 0] } as Parameters<typeof animate>[1], {
									duration: 0.5,
									ease: [0.16, 1, 0.3, 1]
								});
							}
							if (i === notifications.length - 1) animating = false;
						}, i * 200);
					});
				}
			}

			window.addEventListener('scroll', onScroll, { passive: true });
			cleanupScroll = () => window.removeEventListener('scroll', onScroll);
		})();

		return () => cleanupScroll?.();
	});
</script>

<div
	class="pointer-events-none absolute top-12 right-6 bottom-12 z-10 flex w-64 flex-col justify-start gap-2 sm:right-10 md:right-14"
>
	{#each notifications as notif, i (i)}
		{#if shown.includes(i)}
			<div
				bind:this={animatedEls[i]}
				class="pointer-events-auto flex items-start gap-2.5 rounded-2xl bg-foreground/80 p-3 text-background shadow-[0_8px_24px_rgba(0,0,0,0.18)] backdrop-blur-md"
				style="opacity: 0;"
			>
				<div
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/15 text-[8px] font-semibold text-background"
				>
					{notif.initials}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-xs font-semibold">{notif.title}</p>
					<p class="mt-0.5 truncate text-[10px] text-background/70">{notif.body}</p>
				</div>
				<span class="shrink-0 text-[9px] whitespace-nowrap text-background/60">{notif.time}</span>
			</div>
		{/if}
	{/each}
</div>
