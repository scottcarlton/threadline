<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { installPromptEvent, isStandalone } from '$lib/stores/pwa.js';
	import { detectIosBrowser } from '$lib/utils/install-eligibility.js';
	import { browser } from '$app/environment';

	let iosInstructionsOpen = $state(false);
	// All iOS browsers (Safari, Chrome iOS, etc.) — Apple WebKit blocks
	// beforeinstallprompt across the board, so all iOS users get the same
	// Add-to-Home-Screen instructions modal.
	const isIos = $derived(browser ? detectIosBrowser() : false);
	const canShow = $derived(!$isStandalone && ($installPromptEvent !== null || isIos));

	async function handleClick() {
		if ($installPromptEvent) {
			await $installPromptEvent.prompt();
			installPromptEvent.set(null);
			return;
		}
		if (isIos) {
			iosInstructionsOpen = true;
		}
	}
</script>

{#if canShow}
	<Button onclick={handleClick} variant="default" size="default">Install Threadline</Button>

	<Dialog.Root bind:open={iosInstructionsOpen}>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
			<Dialog.Content
				class="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl"
			>
				<Dialog.Title class="text-lg font-semibold">Install on iOS</Dialog.Title>
				<Dialog.Description class="mt-1 text-sm text-muted-foreground">
					Add Threadline to your home screen in three steps. Safari produces a true standalone app;
					other iOS browsers create a home-screen shortcut.
				</Dialog.Description>
				<ol class="mt-4 space-y-3 text-sm">
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
							>1</span
						>
						<span
							>Open the <strong>Share</strong> menu (Safari: bottom toolbar; Chrome: top right).</span
						>
					</li>
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
							>2</span
						>
						<span>Scroll and tap <strong>Add to Home Screen</strong>.</span>
					</li>
					<li class="flex gap-3">
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
							>3</span
						>
						<span>Tap <strong>Add</strong> to confirm.</span>
					</li>
				</ol>
				<div class="mt-6 flex justify-end">
					<Button variant="outline" onclick={() => (iosInstructionsOpen = false)}>Got it</Button>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
