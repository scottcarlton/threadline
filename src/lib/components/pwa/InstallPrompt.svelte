<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { Button } from '$lib/components/ui/button/index.js';
	import { installPromptEvent, isStandalone } from '$lib/stores/pwa.js';
	import { isLgUp, isTabletPortrait } from '$lib/utils/viewport.js';
	import {
		shouldShowInstallPrompt,
		loadDismissedUserIds,
		persistDismissedUserId,
		detectIosBrowser
	} from '$lib/utils/install-eligibility.js';
	import { browser } from '$app/environment';

	type Props = { userId: string };
	let { userId }: Props = $props();

	let open = $state(false);
	let dismissed = $state<Set<string>>(new Set());

	$effect(() => {
		if (!browser) return;
		dismissed = loadDismissedUserIds();
	});

	// All iOS browsers (Safari, Chrome iOS, etc.) — Apple WebKit blocks
	// beforeinstallprompt across the board, so all iOS users see this prompt.
	const isIos = $derived(browser ? detectIosBrowser() : false);

	$effect(() => {
		if (!browser) return;
		const eligible = shouldShowInstallPrompt({
			userId,
			isStandalone: $isStandalone,
			installAvailable: $installPromptEvent !== null,
			isLgUp: $isLgUp,
			isTabletPortrait: $isTabletPortrait,
			isIosBrowser: isIos,
			dismissedUserIds: dismissed
		});
		if (eligible && !open) {
			open = true;
		}
	});

	async function handleInstall() {
		if ($installPromptEvent) {
			await $installPromptEvent.prompt();
			installPromptEvent.set(null);
		}
		persistDismissedUserId(userId);
		dismissed = loadDismissedUserIds();
		open = false;
	}

	function handleDismiss() {
		persistDismissedUserId(userId);
		dismissed = loadDismissedUserIds();
		open = false;
	}
</script>

<Dialog.Root bind:open onOpenChange={(v) => !v && handleDismiss()}>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50" />
		<Dialog.Content
			class="fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl"
		>
			<Dialog.Title class="text-lg font-semibold">Install Threadline</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Get Threadline on your home screen for the fastest experience and a dedicated app window.
			</Dialog.Description>
			{#if isIos}
				<ol class="mt-4 space-y-2 text-sm">
					<li>
						1. Open the <strong>Share</strong> menu (Safari: bottom toolbar; Chrome: top right).
					</li>
					<li>2. Tap <strong>Add to Home Screen</strong>.</li>
					<li>3. Tap <strong>Add</strong> to confirm.</li>
				</ol>
				<p class="mt-3 text-sm text-muted-foreground">
					Safari produces a true standalone app; other iOS browsers create a home-screen shortcut.
				</p>
				<div class="mt-6 flex justify-end gap-2">
					<Button variant="outline" onclick={handleDismiss}>Don't show again</Button>
				</div>
			{:else}
				<div class="mt-6 flex justify-end gap-2">
					<Button variant="outline" onclick={handleDismiss}>Not now</Button>
					<Button onclick={handleInstall}>Install</Button>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
