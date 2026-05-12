<script lang="ts">
	let inputEl: HTMLElement | undefined = $state();
	let hasInput = $state(false);

	function getInput(): string {
		return inputEl?.innerText?.trim() ?? '';
	}

	function handleInput() {
		const text = getInput();
		hasInput = !!text;
		if (!text && inputEl) inputEl.innerHTML = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
		}
	}
</script>

<div class="flex justify-center p-3">
	<div class="w-full max-w-[380px] rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10">
		<div class="px-4 pt-3 pb-2">
			<!-- Text input row -->
			<div class="flex items-center gap-3">
				<div
					bind:this={inputEl}
					contenteditable="true"
					role="textbox"
					tabindex="0"
					aria-label="Ask anything about your business"
					aria-multiline="true"
					oninput={handleInput}
					onkeydown={handleKeydown}
					class="ai-input max-h-20 min-h-4 flex-1 overflow-y-auto bg-transparent text-xs leading-5 break-words text-zinc-100 outline-none"
					data-placeholder="Ask anything about your business..."
				></div>
			</div>

			<!-- Toolbar row -->
			<div class="mt-1.5 flex items-center justify-between">
				<div class="flex items-center gap-0.5">
					<!-- Add file button -->
					<button
						type="button"
						class="cursor-pointer rounded-lg p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
						aria-label="Attach file"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3.5 w-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
						</svg>
					</button>
				</div>

				<div class="shrink-0">
					{#if hasInput}
						<button
							type="button"
							class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200"
							aria-label="Send message"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-3 w-3"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2.5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
								/>
							</svg>
						</button>
					{:else}
						<button
							type="button"
							class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200"
							aria-label="Voice input"
						>
							<div class="flex items-center gap-[1.5px]">
								<span class="h-[5px] w-[2px] rounded-full bg-current"></span>
								<span class="h-[10px] w-[2px] rounded-full bg-current"></span>
								<span class="h-[7px] w-[2px] rounded-full bg-current"></span>
								<span class="h-[4px] w-[2px] rounded-full bg-current"></span>
							</div>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.ai-input:empty::before {
		content: attr(data-placeholder);
		color: rgb(113 113 122);
		pointer-events: none;
	}

	.ai-input:focus {
		outline: none;
	}

	:global(.ai-input *) {
		font: inherit;
		color: inherit;
	}
</style>
