<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { navigating } from '$app/stores';
	import { goto, afterNavigate, onNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import Sidebar from '$lib/components/layout/sidebar.svelte';
	import Navbar from '$lib/components/layout/navbar.svelte';
	import SearchDialog from '$lib/components/layout/SearchDialog.svelte';
	import NotificationToasts from '$lib/components/notifications/NotificationToasts.svelte';
	import NotificationCenter from '$lib/components/notifications/NotificationCenter.svelte';
	import Markdown from '$lib/components/ai/Markdown.svelte';
	import { startUnreadPolling } from '$lib/stores/unread.js';
	import { startNotificationPolling } from '$lib/stores/notifications.js';
	import { startAppointmentPolling } from '$lib/stores/appointments.js';
	import { startOrderAttentionPolling } from '$lib/stores/orderAttention.js';
	import { registerServiceWorker, isOnline } from '$lib/stores/pwa.js';
	import OfflineBanner from '$lib/components/pwa/OfflineBanner.svelte';
	import InstallPrompt from '$lib/components/pwa/InstallPrompt.svelte';
	import { conversation } from '$lib/stores/conversation.js';
	import type { FileAttachment } from '$lib/stores/conversation.js';
	import { preferences } from '$lib/stores/preferences.js';
	import { isLgUp } from '$lib/utils/viewport.js';
	import { cart } from '$lib/stores/cart.js';
	import MobileBottomNav from '$lib/components/layout/MobileBottomNav.svelte';
	import { selectedProductIds } from '$lib/stores/productSelection.js';

	const { messages, loading } = conversation;

	let { children, data } = $props();

	$effect(() => {
		if (data.isBuyer) cart.hydrate(data.cartItems ?? []);
	});

	// Apply appearance preference
	$effect(() => {
		const pref = $preferences.appearance;
		const html = document.documentElement;

		if (pref === 'dark') {
			html.classList.add('dark');
		} else if (pref === 'light') {
			html.classList.remove('dark');
		} else {
			// auto: follow system
			const mq = window.matchMedia('(prefers-color-scheme: dark)');
			const apply = () => html.classList.toggle('dark', mq.matches);
			apply();
			mq.addEventListener('change', apply);
			return () => mq.removeEventListener('change', apply);
		}
	});

	// Apply animations preference
	$effect(() => {
		const pref = $preferences.animations;
		const html = document.documentElement;

		if (pref === 'disabled') {
			html.classList.add('reduce-motion');
		} else if (pref === 'enabled') {
			html.classList.remove('reduce-motion');
		} else {
			// auto: follow system
			const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
			const apply = () => html.classList.toggle('reduce-motion', mq.matches);
			apply();
			mq.addEventListener('change', apply);
			return () => mq.removeEventListener('change', apply);
		}
	});

	// New SW versions take over silently via clients.claim(); users pick up
	// fresh code on the next navigation. A "Reload" toast on every deploy is
	// noise on a continuously-deployed environment.

	let mainEl = $state<HTMLElement | null>(null);
	afterNavigate(({ from, to, type }) => {
		if (!mainEl) return;
		if (type === 'popstate') return;
		if (from?.url.pathname === to?.url.pathname) return;
		mainEl.scrollTop = 0;
	});

	onNavigate((nav) => {
		if (typeof document === 'undefined') return;
		const startViewTransition = (
			document as Document & {
				startViewTransition?: (cb: () => Promise<void>) => unknown;
			}
		).startViewTransition;
		if (!startViewTransition) return;
		if (nav.from?.url.pathname === nav.to?.url.pathname) return;
		return new Promise((resolve) => {
			startViewTransition.call(document, async () => {
				resolve();
				await nav.complete;
			});
		});
	});

	onMount(() => {
		if (data.session) {
			const stopUnread = startUnreadPolling(60000);
			const stopAppointments = startAppointmentPolling(60000);
			const stopAttention = startOrderAttentionPolling(60000);
			const stopNotifications = startNotificationPolling(30000);
			registerServiceWorker();
			return () => {
				stopUnread?.();
				stopAppointments?.();
				stopAttention?.();
				stopNotifications?.();
			};
		}
	});

	const chatFontStyle = $derived(
		$preferences.chatFont === 'sans'
			? 'font-family: Georgia, "Times New Roman", serif; font-size: 16px'
			: $preferences.chatFont === 'system'
				? 'font-family: system-ui, sans-serif; font-size: 16px'
				: 'font-family: var(--font-sans); font-size: 16px'
	);

	const isAuthRoute = $derived(
		$page.url.pathname === '/' ||
			$page.url.pathname.startsWith('/login') ||
			$page.url.pathname.startsWith('/signup') ||
			$page.url.pathname.startsWith('/invite') ||
			$page.url.pathname.startsWith('/buyer-invite') ||
			$page.url.pathname.startsWith('/connect') ||
			$page.url.pathname.startsWith('/upload') ||
			$page.url.pathname.startsWith('/onboarding') ||
			$page.url.pathname.startsWith('/features') ||
			$page.url.pathname.startsWith('/intelligence') ||
			$page.url.pathname.startsWith('/solutions') ||
			$page.url.pathname.startsWith('/resources') ||
			$page.url.pathname.startsWith('/pricing')
	);

	const hideAiDock = $derived(
		$preferences.autoHideDock ||
			$page.url.pathname.endsWith('/new') ||
			$page.url.pathname === '/inbox'
	);

	let dockPeeking = $state(false);
	let dockFocused = $state(false);
	let peekTimeout: ReturnType<typeof setTimeout> | undefined;

	function handleMouseMove(e: MouseEvent) {
		if (!hideAiDock) return;
		const distFromBottom = window.innerHeight - e.clientY;
		if (distFromBottom < 15) {
			if (!dockPeeking) {
				clearTimeout(peekTimeout);
				dockPeeking = true;
			}
		} else if (distFromBottom > 60 && dockPeeking && !dockFocused) {
			clearTimeout(peekTimeout);
			peekTimeout = setTimeout(() => {
				if (!dockFocused) dockPeeking = false;
			}, 150);
		}
	}

	function handleDockFocusIn() {
		dockFocused = true;
		clearTimeout(peekTimeout);
	}

	function handleDockFocusOut() {
		dockFocused = false;
		// Hide after losing focus if cursor is far from bottom
		peekTimeout = setTimeout(() => {
			if (!dockFocused) dockPeeking = false;
		}, 300);
	}

	let notificationsOpen = $state(false);

	// Mobile-first: default closed everywhere, including SSR. On the desktop
	// client, the matchMedia check + saved preference open it back up. This
	// avoids an SSR=open / mobile-client=closed mismatch that flashes the
	// sidebar in-then-out on every initial render and route transition.
	let sidebarOpen = $state<boolean>(
		browser && matchMedia('(min-width: 1024px)').matches
			? ($preferences.sidebarOpen ?? true)
			: false
	);

	$effect(() => {
		preferences.setSidebarOpen(sidebarOpen);
	});
	let showHelp = $state(false);
	let aiPanelOpen = $state(false);
	let mobileAiDockOpen = $state(false);
	let messagesContainer = $state<HTMLDivElement | null>(null);
	let aiInputEl = $state<HTMLDivElement | null>(null);

	let hasAiInput = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	const availableAgents = $derived(data.agents ?? []);
	let showAgentPicker = $state(false);

	const { activeAgent } = conversation;
	let attachedFiles = $state<{ file: File; preview?: string }[]>([]);
	let voiceMode = $state(false);
	let voiceState = $state<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
	let currentAudio = $state<HTMLAudioElement | null>(null);
	// Persistent <audio> element pre-unlocked by an initial user gesture
	// (the voice-mode toggle tap). Required on iOS Safari so subsequent
	// playVoiceResponse() calls can play() after an awaited fetch.
	let unlockedAudio: HTMLAudioElement | null = null;
	const UNLOCK_AUDIO_SRC =
		'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABDgD///////////////////////////////////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+xDEAAPAAAGkAAAAIAAANIAAAARMQU1FMy4xMDBVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMQpg8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEUgPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxHsDwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMSkA8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQxM2DwAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7EMT2A8AAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
	const hasAttachments = $derived(attachedFiles.length > 0);

	function getAiInput(): string {
		return aiInputEl?.innerText?.trim() ?? '';
	}

	function clearAiInput() {
		// eslint-disable-next-line svelte/no-dom-manipulating -- contenteditable element managed outside Svelte's reactive graph
		if (aiInputEl) aiInputEl.innerHTML = '';
		hasAiInput = false;
	}

	function handleAiInput() {
		hasAiInput = !!getAiInput();
	}

	function focusAiInput() {
		if (aiInputEl) {
			aiInputEl.focus();
			// Move cursor to end
			const sel = window.getSelection();
			if (sel && aiInputEl.childNodes.length > 0) {
				sel.selectAllChildren(aiInputEl);
				sel.collapseToEnd();
			}
		}
	}

	function scrollToBottom() {
		if (messagesContainer) {
			requestAnimationFrame(() => {
				messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
			});
		}
	}

	// Auto-open panel and scroll on new messages
	let prevMessageCount = 0;
	$effect(() => {
		const count = $messages.length;
		if (count > prevMessageCount) {
			aiPanelOpen = true;
			scrollToBottom();
		}
		prevMessageCount = count;
	});

	$effect(() => {
		if ($page.url.pathname && !$isLgUp) {
			sidebarOpen = false;
		}
	});

	// Org display name
	const isBrandScoped = $derived(
		data.brandScope !== null &&
			(data.brandScope?.length ?? 0) > 0 &&
			(data.membership?.role === 'member' ||
				data.membership?.role === 'sales' ||
				data.membership?.role === 'guest')
	);

	// Nx-BLSR: user is a sales-role member in 2+ brand orgs. Acts as one unified
	// portal across those brand orgs — no per-org switcher, no per-brand dropdown.
	const isNxBlsr = $derived(
		(data.allMemberships?.filter((m) => m.organizations?.org_type === 'brand' && m.role === 'sales')
			.length ?? 0) > 1
	);

	const buyerAccountName = $derived(data.buyerAccounts?.[0]?.accounts?.business_name ?? null);

	const orgDisplayName = $derived(
		data.isSystemAdmin
			? 'System'
			: data.isBuyer && buyerAccountName
				? buyerAccountName
				: isNxBlsr
					? 'Threadline'
					: isBrandScoped && data.scopedBrandNames?.length
						? data.scopedBrandNames.join(', ')
						: (data.organization?.name ?? 'Threadline')
	);

	function handleAiKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			sendAiMessage();
		}
		// Shift+Enter is default behavior (line break in contenteditable)
	}

	let lastNonShortcutKey = 0;
	let lastKeyWasSlash = 0;
	const KEY_CHORD_WINDOW = 500;

	function isEditableTarget(): boolean {
		const el = document.activeElement;
		if (!el) return false;
		if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
		if ((el as HTMLElement).isContentEditable) return true;
		return false;
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		// Escape closes overlays regardless of focus
		if (e.key === 'Escape') {
			if (aiPanelOpen) {
				aiPanelOpen = false;
				return;
			}
			if (showHelp) {
				showHelp = false;
				return;
			}
		}

		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			focusAiInput();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === '/') {
			e.preventDefault();
			sidebarOpen = !sidebarOpen;
			return;
		}

		// Skip all other shortcuts when inside editable fields
		if (isEditableTarget()) return;

		// "/" + "k" chord → focus AI input
		if (
			e.key === 'k' &&
			!e.metaKey &&
			!e.ctrlKey &&
			Date.now() - lastKeyWasSlash < KEY_CHORD_WINDOW
		) {
			e.preventDefault();
			lastKeyWasSlash = 0;
			focusAiInput();
			return;
		}
		if (e.key === '/') {
			lastKeyWasSlash = Date.now();
		}

		const cmd = e.metaKey || e.ctrlKey;

		// Cmd+Shift shortcuts
		if (cmd && e.shiftKey) {
			if (e.code === 'KeyA') {
				e.preventDefault();
				goto(resolve('/appointments?new=true'));
				return;
			}
		}

		// Cmd shortcuts (new entities)
		if (cmd && !e.shiftKey) {
			if (e.key === 'o') {
				e.preventDefault();
				goto(resolve('/orders/new'));
				return;
			}
			if (e.key === 'a') {
				e.preventDefault();
				goto(resolve('/accounts/new'));
				return;
			}
			if (e.key === 'b') {
				e.preventDefault();
				goto(resolve('/brands/new'));
				return;
			}
		}

		// Shift shortcuts (secondary navigation)
		if (e.shiftKey && !cmd) {
			if (e.key === 'I') {
				e.preventDefault();
				goto(resolve('/inbox'));
				return;
			}
			if (e.key === 'A') {
				e.preventDefault();
				goto(resolve('/appointments'));
				return;
			}
			if (e.key === 'O') {
				e.preventDefault();
				goto(resolve('/organization'));
				return;
			}
			if (e.key === 'H') {
				e.preventDefault();
				showHelp = true;
				return;
			}
		}

		// Plain key shortcuts (navigation) — only if no other key was pressed recently
		if (!cmd && !e.shiftKey && !e.altKey) {
			const now = Date.now();
			const singleKeys: Record<string, string> = {
				o: '/orders',
				a: '/accounts',
				b: '/brands',
				r: '/reports',
				i: '/insight'
			};
			if (singleKeys[e.key] && now - lastNonShortcutKey > KEY_CHORD_WINDOW) {
				goto(resolve(singleKeys[e.key] as '/orders'));
				return;
			}
			// Track non-shortcut keypresses to prevent chords like "/a" from triggering
			if (!singleKeys[e.key]) {
				lastNonShortcutKey = now;
			}
		}
	}

	async function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result as string;
				resolve(result.split(',')[1]);
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		for (const file of input.files) {
			const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
			attachedFiles = [...attachedFiles, { file, preview }];
		}
		input.value = '';
	}

	function removeFile(index: number) {
		const removed = attachedFiles[index];
		if (removed.preview) URL.revokeObjectURL(removed.preview);
		attachedFiles = attachedFiles.filter((_, i) => i !== index);
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
	}

	function toggleVoice() {
		if (voiceMode) {
			exitVoiceMode();
		} else {
			enterVoiceMode();
		}
	}

	function enterVoiceMode() {
		voiceMode = true;
		// We're inside a user-gesture handler here. Pre-unlock the audio
		// element so iOS Safari accepts later play() calls that occur
		// after awaited fetches (see playVoiceResponse).
		if (!unlockedAudio) {
			unlockedAudio = new Audio(UNLOCK_AUDIO_SRC);
			unlockedAudio.preload = 'auto';
		}
		unlockedAudio.play().catch(() => {});
		startListening();
	}

	function exitVoiceMode() {
		voiceMode = false;
		voiceState = 'idle';
		stopMicStream();
		clearTimeout(silenceTimer);
		if (currentAudio) {
			currentAudio.pause();
			currentAudio = null;
		}
		if (unlockedAudio) {
			unlockedAudio.pause();
		}
	}

	let mediaRecorder = $state<MediaRecorder | null>(null);
	let audioChunks: Blob[] = [];
	let silenceTimer: ReturnType<typeof setTimeout> | undefined;
	let audioContext: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let micStream: MediaStream | null = null;

	async function startListening() {
		if (!voiceMode) return;
		voiceState = 'listening';

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			micStream = stream;

			// Set up silence detection
			audioContext = new AudioContext();
			const source = audioContext.createMediaStreamSource(stream);
			analyser = audioContext.createAnalyser();
			analyser.fftSize = 512;
			source.connect(analyser);

			// Pick a supported mime type
			let mimeType = 'audio/webm;codecs=opus';
			if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
				mimeType = 'audio/webm';
				if (!MediaRecorder.isTypeSupported(mimeType)) {
					mimeType = 'audio/mp4';
					if (!MediaRecorder.isTypeSupported(mimeType)) {
						mimeType = ''; // let browser pick default
					}
				}
			}
			const recorder = mimeType
				? new MediaRecorder(stream, { mimeType })
				: new MediaRecorder(stream);
			mediaRecorder = recorder;
			audioChunks = [];
			let speechDetected = false;

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) audioChunks.push(e.data);
			};

			recorder.onstop = async () => {
				clearTimeout(silenceTimer);
				if (!voiceMode) return;
				if (audioChunks.length === 0 || !speechDetected) {
					startListening();
					return;
				}
				const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
				voiceState = 'processing';
				await transcribeAndSend(audioBlob);
			};

			recorder.start(250); // collect in 250ms chunks

			// Monitor audio levels for silence detection
			const dataArray = new Uint8Array(analyser.frequencyBinCount);
			let silentFrames = 0;
			const SILENCE_THRESHOLD = 15;
			const SILENCE_FRAMES_TO_STOP = 12; // ~1.5s at 125ms intervals

			function checkAudio() {
				if (!voiceMode || !analyser || recorder.state !== 'recording') return;

				analyser.getByteFrequencyData(dataArray);
				const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

				if (avg > SILENCE_THRESHOLD) {
					speechDetected = true;
					silentFrames = 0;
				} else if (speechDetected) {
					silentFrames++;
					if (silentFrames >= SILENCE_FRAMES_TO_STOP) {
						recorder.stop();
						return;
					}
				}

				silenceTimer = setTimeout(checkAudio, 125);
			}
			checkAudio();
		} catch (err) {
			console.error('Mic access failed:', err);
			exitVoiceMode();
		}
	}

	function stopMicStream() {
		if (micStream) {
			micStream.getTracks().forEach((t) => t.stop());
			micStream = null;
		}
		if (audioContext) {
			audioContext.close();
			audioContext = null;
			analyser = null;
		}
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.stop();
		}
		mediaRecorder = null;
	}

	async function transcribeAndSend(audioBlob: Blob) {
		stopMicStream();
		try {
			const res = await fetch('/api/voice/stt', {
				method: 'POST',
				headers: { 'Content-Type': 'audio/webm' },
				body: audioBlob
			});
			const data = await res.json();
			// Strip non-speech artifacts like [music playing], (background noise), etc.
			const text = data.text?.replace(/\[.*?\]|\(.*?\)/g, '').trim();
			if (!text || !voiceMode) {
				if (voiceMode) startListening();
				return;
			}
			await sendVoiceMessage(text);
		} catch {
			if (voiceMode) startListening();
		}
	}

	async function sendVoiceMessage(text: string) {
		await conversation.sendMessage(text);
		if (!voiceMode) return;

		const allMsgs = $messages;
		const lastMsg = allMsgs[allMsgs.length - 1];
		if (lastMsg?.role === 'assistant') {
			await playVoiceResponse(lastMsg.content);
		} else {
			startListening();
		}
	}

	async function playVoiceResponse(text: string) {
		if (!voiceMode) return;
		voiceState = 'speaking';
		try {
			const res = await fetch('/api/voice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: text.slice(0, 1000), voiceId: $preferences.voiceId })
			});
			if (!res.ok) {
				startListening();
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			// Reuse the persistent unlocked element on iOS so play() can
			// succeed outside the original user-gesture window. Falls back
			// to a fresh element if voice mode was somehow entered without
			// the unlock running.
			const audio = unlockedAudio ?? new Audio();
			audio.src = url;
			currentAudio = audio;
			audio.onended = () => {
				currentAudio = null;
				URL.revokeObjectURL(url);
				// Resume listening after TTS finishes
				if (voiceMode) startListening();
				else voiceState = 'idle';
			};
			audio.play().catch(() => {
				// Browsers reject play() when called outside a user-gesture
				// context (e.g. iOS Safari after an awaited fetch). Treat as
				// end-of-playback and continue the voice loop.
				currentAudio = null;
				URL.revokeObjectURL(url);
				if (voiceMode) startListening();
				else voiceState = 'idle';
			});
		} catch {
			if (voiceMode) startListening();
			else voiceState = 'idle';
		}
	}

	async function sendAiMessage(text?: string) {
		const msg = text ?? getAiInput();
		if ((!msg && !hasAttachments) || $loading) return;
		if (!text) clearAiInput();
		focusAiInput();

		let files: FileAttachment[] | undefined;
		if (attachedFiles.length > 0) {
			files = await Promise.all(
				attachedFiles.map(async ({ file }) => ({
					name: file.name,
					type: file.type,
					data: await fileToBase64(file),
					size: file.size
				}))
			);
			attachedFiles = [];
		}

		await conversation.sendMessage(msg || 'What is this file?', files);
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} onmousemove={handleMouseMove} />

{#if browser}
	<!-- Toaster is client-only — svelte-sonner calls setContext during child
	     render, which throws `lifecycle_outside_component` during SvelteKit SSR. -->
	<Toaster richColors position="top-center" />
	{#if data.session && !isAuthRoute}
		<NotificationToasts />
		<NotificationCenter open={notificationsOpen} onclose={() => (notificationsOpen = false)} />
	{/if}
{/if}

{#if $navigating}
	<div class="fixed inset-x-0 top-0 z-[100] h-1">
		<div class="nav-progress h-full bg-accent"></div>
	</div>
{/if}

{#if isAuthRoute}
	{@render children()}
{:else}
	<div class="flex h-dvh flex-col overflow-hidden">
		<OfflineBanner />
		<!-- Full-width header -->
		<Navbar
			user={data.user}
			organization={data.organization}
			{orgDisplayName}
			{sidebarOpen}
			role={data.membership?.role ?? null}
			isBuyer={data.isBuyer === true}
			{isNxBlsr}
			{notificationsOpen}
			onsidebarToggle={() => (sidebarOpen = !sidebarOpen)}
			onNotificationsToggle={() => (notificationsOpen = !notificationsOpen)}
		/>

		<!-- Sidebar + Content below header. Both desktop (push) and mobile
		     (overlay) sidebars render in the DOM; Tailwind's `hidden lg:block`
		     / `lg:hidden` pick the right one based on actual viewport, so the
		     server-rendered HTML matches the client and there's no first-paint
		     flash from the media-query store seeding to false on SSR. -->
		<div class="flex flex-1 overflow-hidden">
			<div
				class="hidden h-full shrink-0 overflow-hidden transition-all duration-300 ease-in-out lg:block"
				style="width: {sidebarOpen ? '240px' : '0px'}; opacity: {sidebarOpen ? '1' : '0'}"
			>
				<div class="h-full w-60">
					<Sidebar
						mode="push"
						role={data.membership?.role ?? 'guest'}
						orgType={data.orgType}
						brandScope={data.brandScope}
						isBuyer={data.isBuyer}
						{isNxBlsr}
						bind:showHelp
					/>
				</div>
			</div>
			<!-- Mobile sidebar removed — bottom nav replaces it on mobile -->

			<!-- Main content -->
			<main
				bind:this={mainEl}
				class="flex-1 overflow-y-auto bg-background p-4 pb-32 sm:p-6 sm:pb-36"
			>
				{@render children()}
			</main>
		</div>

		<!-- Fixed AI dock at bottom — desktop always, mobile only when toggled -->
		{#if ($isLgUp && (!hideAiDock || dockPeeking)) || (!$isLgUp && mobileAiDockOpen)}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="pointer-events-none fixed right-0 bottom-0 left-0 z-30 flex flex-col items-center pb-6 transition-[left] duration-300 ease-in-out {sidebarOpen
					? 'lg:left-60'
					: 'lg:left-0'}"
				transition:fly={{ y: 100, duration: 300 }}
				onmouseenter={() => {
					if (dockPeeking) clearTimeout(peekTimeout);
				}}
				onmouseleave={() => {
					if (dockPeeking && !dockFocused)
						peekTimeout = setTimeout(() => {
							if (!dockFocused) dockPeeking = false;
						}, 200);
				}}
				onfocusin={handleDockFocusIn}
				onfocusout={handleDockFocusOut}
			>
				<div class="pointer-events-auto w-full max-w-[754px] space-y-3 px-4">
					<!-- Conversation panel (separate floating panel above input) -->
					{#if aiPanelOpen && $messages.length > 0}
						<div class="animate-in rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10">
							<div class="flex items-center justify-between px-5 pt-4 pb-2">
								<span class="text-xs font-medium text-zinc-500">Conversation</span>
								<div class="flex items-center gap-1">
									<button
										class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 lg:p-1"
										onclick={() => {
											aiPanelOpen = false;
										}}
										aria-label="Minimize chat"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" />
										</svg>
									</button>
									<button
										class="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 lg:p-1"
										onclick={() => {
											aiPanelOpen = false;
											conversation.clear();
										}}
										aria-label="Close conversation"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-4 w-4"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M6 18L18 6M6 6l12 12"
											/>
										</svg>
									</button>
								</div>
							</div>
							<div
								bind:this={messagesContainer}
								class="max-h-[50dvh] space-y-3 overflow-y-auto px-5 pb-5"
								style={chatFontStyle}
							>
								{#each $messages as msg, i (i)}
									<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
										<div
											class="max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed {msg.role === 'user'
												? 'bg-zinc-700 text-zinc-100'
												: 'bg-zinc-800 text-zinc-100'}"
											style={chatFontStyle}
										>
											{#if msg.role === 'assistant'}
												<Markdown content={msg.content} />
											{:else}
												<p class="whitespace-pre-wrap">{msg.content}</p>
											{/if}
										</div>
									</div>
									{#if msg.role === 'assistant' && i === $messages.length - 1 && msg.suggestions?.length && !$loading}
										<div class="flex flex-wrap gap-2 pl-1">
											{#each msg.suggestions as suggestion (suggestion)}
												<button
													onclick={() => sendAiMessage(suggestion)}
													class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
												>
													{suggestion}
												</button>
											{/each}
										</div>
									{/if}
								{/each}
								{#if $loading}
									<div class="flex justify-start">
										<div class="flex items-center gap-1.5 rounded-2xl bg-zinc-800 px-4 py-3">
											<div class="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"></div>
											<div
												class="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
												style="animation-delay: 0.15s"
											></div>
											<div
												class="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-500"
												style="animation-delay: 0.3s"
											></div>
										</div>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Hidden file input -->
					<input
						bind:this={fileInput}
						type="file"
						multiple
						accept="image/*,.pdf,.csv,.txt,.json,.xlsx,.xls,.doc,.docx"
						onchange={handleFileSelect}
						class="hidden"
					/>

					<!-- Product selection bar -->
					{#if $selectedProductIds.length > 0}
						<div
							class="flex items-center justify-between rounded-2xl bg-zinc-900 px-5 py-3 shadow-2xl ring-1 ring-white/10"
						>
							<div class="flex items-center gap-3">
								<span class="text-sm text-zinc-300"
									>{$selectedProductIds.length} Items selected</span
								>
								<button
									class="flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
									onclick={() => selectedProductIds.set([])}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
									>
										<circle cx="12" cy="12" r="10" />
										<path stroke-linecap="round" d="m15 9-6 6m0-6 6 6" />
									</svg>
									Clear
								</button>
							</div>
							<button
								class="rounded-xl bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
								onclick={() => goto(resolve('/products/order'))}
							>
								Start Order
							</button>
						</div>
					{/if}

					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="cursor-text rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10"
						onclick={(e) => {
							if (!(e.target as HTMLElement).closest('button')) focusAiInput();
						}}
					>
						<!-- Mobile drag handle to close -->
						{#if !$isLgUp}
							<button
								class="flex w-full items-center justify-center pt-2 pb-0"
								onclick={(e) => {
									e.stopPropagation();
									mobileAiDockOpen = false;
								}}
								aria-label="Close AI dock"
							>
								<div class="h-1 w-10 rounded-full bg-zinc-600"></div>
							</button>
						{/if}
						<div class="px-5 pt-4 pb-3">
							<!-- Agent indicator -->
							{#if $activeAgent}
								<div class="mb-2 flex items-center gap-2">
									<span
										class="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-1 text-sm text-blue-400"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="2"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
											/>
										</svg>
										{$activeAgent.name}
										<button
											onclick={() => conversation.setAgent(null)}
											aria-label="Clear agent"
											class="ml-0.5 hover:text-blue-200"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="2"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M6 18L18 6M6 6l12 12"
												/>
											</svg>
										</button>
									</span>
								</div>
							{/if}

							<!-- Text input row -->
							<div class="flex items-center gap-4">
								<div
									bind:this={aiInputEl}
									id="ai-dock-input"
									contenteditable="true"
									role="textbox"
									tabindex="0"
									aria-label="Ask anything about your business"
									aria-multiline="true"
									onkeydown={handleAiKeydown}
									oninput={handleAiInput}
									class="ai-input max-h-40 min-h-6 flex-1 overflow-y-auto bg-transparent text-base leading-6 break-words text-zinc-100 outline-none"
									data-placeholder="Ask anything about your business..."
									style={chatFontStyle}
								></div>
							</div>

							<!-- Attached files -->
							{#if hasAttachments}
								<div class="mt-3 ml-10 flex flex-wrap gap-2">
									{#each attachedFiles as { file, preview }, i (i)}
										<div
											class="flex items-center gap-1.5 rounded-lg bg-zinc-800 px-2 py-1 ring-1 ring-white/5"
										>
											{#if preview}
												<img src={preview} alt={file.name} class="h-8 w-8 rounded object-cover" />
											{:else}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-4 w-4 text-zinc-400"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
													/>
												</svg>
											{/if}
											<div class="flex flex-col">
												<span class="max-w-[120px] truncate text-[11px] font-medium text-zinc-300"
													>{file.name}</span
												>
												<span class="text-[10px] text-zinc-500">{formatFileSize(file.size)}</span>
											</div>
											<button
												onclick={() => removeFile(i)}
												class="ml-1 rounded-full p-0.5 text-zinc-500 transition-colors hover:text-red-400"
												aria-label="Remove file"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M6 18L18 6M6 6l12 12"
													/>
												</svg>
											</button>
										</div>
									{/each}
								</div>
							{/if}

							<!-- Toolbar row: +file & agent on left, mic/send on right -->
							<div class="mt-2 flex items-center justify-between">
								<div class="flex items-center gap-1">
									<button
										onclick={() => fileInput?.click()}
										disabled={$loading}
										class="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-50 lg:p-1.5"
										aria-label="Attach file"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-5 w-5"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
											stroke-width="1.5"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M12 4.5v15m7.5-7.5h-15"
											/>
										</svg>
									</button>

									{#if availableAgents.length > 0}
										<div class="relative">
											<button
												onclick={() => (showAgentPicker = !showAgentPicker)}
												class="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 lg:p-1.5 {$activeAgent
													? 'text-blue-400'
													: ''}"
												aria-label="Select agent"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-5 w-5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="1.5"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
													/>
												</svg>
											</button>

											{#if showAgentPicker}
												<div
													class="absolute bottom-full left-0 mb-2 w-56 rounded-xl bg-zinc-800 p-2 shadow-xl ring-1 ring-white/10"
												>
													<button
														class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors {!$activeAgent
															? 'bg-zinc-700 text-zinc-100'
															: 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}"
														onclick={() => {
															conversation.setAgent(null);
															showAgentPicker = false;
														}}
													>
														<span class="text-sm">Default Assistant</span>
													</button>
													{#each availableAgents as agent (agent.id)}
														<button
															class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors {$activeAgent?.id ===
															agent.id
																? 'bg-zinc-700 text-zinc-100'
																: 'text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'}"
															onclick={() => {
																conversation.setAgent({
																	id: agent.id,
																	name: agent.name,
																	slug: agent.slug
																});
																showAgentPicker = false;
															}}
														>
															<div>
																<span class="text-sm font-medium">{agent.name}</span>
																{#if agent.description}
																	<p class="line-clamp-1 text-[11px] text-zinc-500">
																		{agent.description}
																	</p>
																{/if}
															</div>
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								</div>

								<div class="shrink-0">
									{#if voiceMode}
										<!-- Voice mode active — always show voice button regardless of $loading -->
										<button
											onclick={toggleVoice}
											class="flex h-11 w-11 items-center justify-center rounded-full lg:h-9 lg:w-9 {voiceState ===
											'listening'
												? 'bg-blue-500 text-white'
												: voiceState === 'speaking'
													? 'bg-white text-zinc-900'
													: 'bg-zinc-600 text-white'}"
											aria-label="Stop voice mode"
										>
											{#if voiceState === 'processing'}
												<div
													class="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
												></div>
											{:else}
												<div class="flex items-center gap-[2px]">
													<span
														class="{voiceState === 'listening' || voiceState === 'speaking'
															? 'voice-bar'
															: ''} h-[8px] w-[3px] rounded-full bg-current"
													></span>
													<span
														class="{voiceState === 'listening' || voiceState === 'speaking'
															? 'voice-bar'
															: ''} h-[18px] w-[3px] rounded-full bg-current"
														style="animation-delay: 0.15s"
													></span>
													<span
														class="{voiceState === 'listening' || voiceState === 'speaking'
															? 'voice-bar'
															: ''} h-[12px] w-[3px] rounded-full bg-current"
														style="animation-delay: 0.3s"
													></span>
													<span
														class="{voiceState === 'listening' || voiceState === 'speaking'
															? 'voice-bar'
															: ''} h-[6px] w-[3px] rounded-full bg-current"
														style="animation-delay: 0.45s"
													></span>
												</div>
											{/if}
										</button>
									{:else if $loading}
										<div class="flex h-11 w-11 items-center justify-center lg:h-9 lg:w-9">
											<div
												class="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300"
											></div>
										</div>
									{:else if hasAiInput || hasAttachments}
										<!-- Send button -->
										<button
											onclick={() => sendAiMessage()}
											disabled={!$isOnline}
											class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:w-9"
											aria-label={$isOnline ? 'Send message' : 'Offline — cannot send'}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
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
										<!-- Voice idle: static wave icon -->
										<button
											onclick={toggleVoice}
											disabled={!$isOnline}
											class="flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 lg:h-9 lg:w-9"
											aria-label={$isOnline ? 'Voice input' : 'Offline — voice unavailable'}
										>
											<div class="flex items-center gap-[2px]">
												<span class="h-[8px] w-[3px] rounded-full bg-current"></span>
												<span class="h-[18px] w-[3px] rounded-full bg-current"></span>
												<span class="h-[12px] w-[3px] rounded-full bg-current"></span>
												<span class="h-[6px] w-[3px] rounded-full bg-current"></span>
											</div>
										</button>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Mobile bottom nav — hidden when AI dock is open -->
		{#if !$isLgUp && !mobileAiDockOpen}
			<MobileBottomNav onAiToggle={() => (mobileAiDockOpen = true)} />
		{/if}

		{#if data.user?.id}
			<InstallPrompt userId={data.user.id} />
		{/if}
	</div>

	<SearchDialog
		isBrandOrg={data.orgType === 'brand'}
		isBuyer={data.isBuyer === true}
		onassistantToggle={() => {
			const input = document.getElementById('ai-dock-input');
			if (input) input.focus();
		}}
	/>
{/if}

<style>
	@keyframes nav-progress-anim {
		0% {
			width: 0%;
		}
		50% {
			width: 70%;
		}
		100% {
			width: 95%;
		}
	}
	.nav-progress {
		animation: nav-progress-anim 2s ease-in-out infinite;
	}

	/* Contenteditable placeholder */
	.ai-input:empty::before {
		content: attr(data-placeholder);
		color: rgb(113 113 122); /* zinc-500 */
		pointer-events: none;
	}

	.ai-input:focus {
		outline: none;
	}

	/* Prevent pasting styled content */
	:global(.ai-input *) {
		font: inherit;
		color: inherit;
	}

	.voice-bar {
		animation: voice-wave 0.6s ease-in-out infinite alternate;
		will-change: transform;
	}

	@keyframes voice-wave {
		0% {
			transform: scaleY(0.4);
		}
		100% {
			transform: scaleY(1);
		}
	}

	/* Instant reset when animation class is removed */
	span:not(.voice-bar) {
		animation: none !important;
		transform: scaleY(1) !important;
	}
</style>
