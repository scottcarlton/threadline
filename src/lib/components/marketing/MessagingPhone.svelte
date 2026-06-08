<script lang="ts">
	import { inView } from 'motion';

	let phoneEl = $state<HTMLElement | null>(null);
	let hasPlayed = $state(false);
	let running = false;

	const messages = [
		{
			type: 'sent' as const,
			id: 'msg1',
			text: 'Create an order for LouLou Bell for NuBrand. Daria Sweeter 1xs, 3s, 2m, and 1l with a 9/1 - 9/30 delivery'
		},
		{ type: 'typing' as const, id: 'typing1' },
		{
			type: 'received' as const,
			id: 'msg2',
			text: 'I created an order for LouLou Bell with 9/1-9/30 delivery. Would you like to view it or confirm it?'
		},
		{ type: 'sent' as const, id: 'msg3', text: 'Confirm it.' },
		{ type: 'typing' as const, id: 'typing2' },
		{
			type: 'received' as const,
			id: 'msg4',
			text: 'Order NU-080987 Confirmed. LouLou Bell sent a copy of the order.'
		}
	];

	const sequence = [
		{ type: 'msg', id: 'msg1', delay: 600 },
		{ type: 'typing', id: 'typing1', delay: 800, duration: 1600 },
		{ type: 'msg', id: 'msg2', delay: 200 },
		{ type: 'msg', id: 'msg3', delay: 1400 },
		{ type: 'typing', id: 'typing2', delay: 600, duration: 1200 },
		{ type: 'msg', id: 'msg4', delay: 200 }
	];

	function sleep(ms: number) {
		return new Promise((r) => setTimeout(r, ms));
	}

	function reset() {
		if (!phoneEl) return;
		phoneEl.querySelectorAll<HTMLElement>('.bubble').forEach((el) => {
			el.classList.remove('visible');
		});
		phoneEl.querySelectorAll<HTMLElement>('.typing-indicator').forEach((el) => {
			el.classList.remove('visible');
			el.classList.remove('hidden');
		});
	}

	async function play() {
		if (running || !phoneEl) return;
		running = true;
		hasPlayed = false;
		reset();
		await sleep(400);

		for (const step of sequence) {
			await sleep(step.delay);
			const el = phoneEl.querySelector<HTMLElement>(`#${step.id}`);
			if (!el) continue;

			if (step.type === 'typing') {
				el.classList.add('visible');
				await sleep(step.duration!);
				el.classList.remove('visible');
				el.classList.add('hidden');
			} else {
				el.classList.add('visible');
			}
		}

		await sleep(600);
		hasPlayed = true;
		running = false;
	}

	$effect(() => {
		if (!phoneEl) return;
		const stop = inView(
			phoneEl,
			() => {
				play();
			},
			{ amount: 0.3 }
		);
		return stop;
	});
</script>

<div class="flex justify-center pt-4">
	<div
		bind:this={phoneEl}
		class="relative flex h-[400px] w-[280px] flex-col overflow-hidden rounded-t-[28px] border-t border-r border-l border-neutral-300 bg-white"
	>
		<!-- Status bar -->
		<div
			class="flex shrink-0 items-center justify-between px-6 pt-2 pb-0.5 text-[11px] font-semibold text-neutral-900"
		>
			<span>9:40</span>
			<div class="flex items-center gap-1">
				<svg width="13" height="10" viewBox="0 0 16 12" fill="none"
					><rect x="0" y="5" width="3" height="7" rx="0.5" fill="currentColor" /><rect
						x="4.5"
						y="3"
						width="3"
						height="9"
						rx="0.5"
						fill="currentColor"
					/><rect x="9" y="1" width="3" height="11" rx="0.5" fill="currentColor" /><rect
						x="13.5"
						y="0"
						width="2.5"
						height="12"
						rx="0.5"
						fill="#d0d0d0"
					/></svg
				>
				<svg width="16" height="10" viewBox="0 0 20 12" fill="none"
					><rect
						x="0.5"
						y="0.5"
						width="17"
						height="11"
						rx="2"
						stroke="currentColor"
						stroke-width="1"
					/><rect x="2" y="2" width="12" height="8" rx="1" fill="currentColor" /><rect
						x="18.5"
						y="4"
						width="1.5"
						height="4"
						rx="0.5"
						fill="currentColor"
					/></svg
				>
			</div>
		</div>

		<!-- Nav + Contact -->
		<div class="relative flex shrink-0 flex-col items-center px-4 pt-4 pb-2">
			<span class="absolute top-3 left-4 text-[22px] leading-none text-neutral-900">‹</span>
			<div class="mb-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-300">
				<span class="text-sm font-semibold text-neutral-500 italic">/</span>
			</div>
			<span class="text-[11px] font-medium text-neutral-900">@Stitch</span>
		</div>

		<!-- Chat -->
		<div class="flex flex-col gap-1 px-3.5 pt-0.5 pb-5">
			{#each messages as msg (msg.id)}
				{#if msg.type === 'typing'}
					<div id={msg.id} class="typing-indicator">
						<div class="typing-dot"></div>
						<div class="typing-dot"></div>
						<div class="typing-dot"></div>
					</div>
				{:else}
					<div
						id={msg.id}
						class="bubble"
						class:sent={msg.type === 'sent'}
						class:received={msg.type === 'received'}
					>
						{msg.text}
					</div>
				{/if}
			{/each}
		</div>

		<!-- Replay -->
		{#if hasPlayed}
			<button
				onclick={play}
				aria-label="Replay"
				class="absolute right-3 bottom-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white transition-transform hover:bg-indigo-600"
			>
				<svg
					class="h-3.5 w-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
				</svg>
			</button>
		{/if}
	</div>
</div>

<style>
	.bubble {
		max-width: 80%;
		padding: 8px 12px;
		border-radius: 16px;
		font-size: 12px;
		line-height: 1.4;
		opacity: 0;
		transform: translateY(12px) scale(0.96);
		transition:
			opacity 0.35s ease,
			transform 0.35s ease;
	}

	.bubble:global(.visible) {
		opacity: 1;
		transform: translateY(0) scale(1);
	}

	.sent {
		align-self: flex-end;
		background: #6366f1;
		color: #fff;
		border-bottom-right-radius: 6px;
	}

	.received {
		align-self: flex-start;
		background: #737380;
		color: #fff;
		border-bottom-left-radius: 6px;
	}

	.typing-indicator {
		align-self: flex-start;
		display: flex;
		gap: 4px;
		padding: 10px 14px;
		background: #737380;
		border-radius: 16px;
		border-bottom-left-radius: 6px;
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity 0.25s ease,
			transform 0.25s ease;
	}

	.typing-indicator:global(.visible) {
		opacity: 1;
		transform: translateY(0);
	}

	.typing-indicator:global(.hidden) {
		display: none;
	}

	.typing-dot {
		width: 6px;
		height: 6px;
		background: rgba(255, 255, 255, 0.5);
		border-radius: 50%;
		animation: typingBounce 1.2s infinite ease-in-out;
	}

	.typing-dot:nth-child(2) {
		animation-delay: 0.15s;
	}
	.typing-dot:nth-child(3) {
		animation-delay: 0.3s;
	}

	@keyframes typingBounce {
		0%,
		60%,
		100% {
			transform: translateY(0);
			opacity: 0.4;
		}
		30% {
			transform: translateY(-4px);
			opacity: 1;
		}
	}
</style>
