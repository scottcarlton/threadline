<script lang="ts">
	// Onboarding — conversational shell with orchestrated entrance.
	// P0: shell + mock state machine. P1: General Information wired to
	// create-org / create-retailer with resume. Import/Settings/Integrations
	// (P2+) still advance via the mock. Copy is provisional and NOT final — run
	// it against docs/brand/guidelines.md §1.5 before ship.
	//
	// Entrance choreography (mount):
	//   t0     greeting types in  +  AI prompt springs up
	//   ~560ms stepper assembles (progress, then roadmap staggered)
	//   ~1080ms conversation panel opens → first question types → flow begins
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut, backOut } from 'svelte/easing';
	import {
		resumePhaseIndex,
		nextCursor,
		phaseStatus,
		canGoPrev,
		canGoNext,
		isSkippable
	} from '$lib/components/onboarding/machine';
	import { parseCSV } from '$lib/utils/csv-parse';
	import { buildAccountPreviewFromCsv } from '$lib/components/accounts/account-import-helpers';
	import { suggestColumnMapping } from '$lib/utils/csv-column-suggest';
	import { startVoiceCapture, type VoiceCaptureHandle } from '$lib/utils/voice-capture';

	let { data } = $props();

	type SubKind = 'text' | 'upload' | 'choice' | 'multi' | 'address' | 'connect';
	interface ChoiceOption {
		value: string;
		label: string;
		description?: string;
		/** OAuth connect endpoint, for `connect` steps. */
		url?: string;
		/** Inline SVG path, carried over from the previous onboarding cards. */
		icon?: string;
	}
	interface SubStep {
		id: string;
		question: string;
		placeholder: string;
		required?: boolean;
		kind: SubKind;
		dropTitle?: string;
		dropHint?: string;
		options?: ChoiceOption[];
	}
	interface Phase {
		id: string;
		title: string;
		subtitle: string;
		subs: SubStep[];
	}

	// Brand-flavored set for the P0 mock. The org-type-aware matrix (rep/brand)
	// is P2 — this is representative, not final.
	const phases: Phase[] = [
		{
			id: 'general',
			title: 'General Information',
			subtitle: 'Name, Organization Type and Organization Name',
			subs: [
				{
					id: 'name',
					question: "Hello. Let's get you set up — first, what should I call you?",
					placeholder: 'First and last name',
					required: true,
					kind: 'text'
				},
				{
					id: 'orgType',
					question: 'What kind of organization are you setting up?',
					placeholder: 'Choose your organization type',
					required: true,
					kind: 'choice',
					options: [
						{
							value: 'brand',
							label: 'Brand',
							description:
								'I manage my product catalog, track orders across all sales channels, and work with reps.',
							icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
						},
						{
							value: 'rep',
							label: 'Independent Sales Rep',
							description:
								'I represent multiple brands and manage accounts, orders, and commissions.',
							icon: 'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z'
						},
						{
							value: 'retailer',
							label: 'Retailer',
							description:
								'I buy wholesale from brands and want my orders and account details in one place.',
							icon: 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z'
						}
					]
				},
				{
					id: 'orgName',
					question: 'And what should we call your organization?',
					placeholder: 'Organization name',
					required: true,
					kind: 'text'
				}
			]
		},
		{
			id: 'import',
			title: 'Import Files',
			subtitle: 'Upload members, accounts, products, and orders',
			subs: [
				{
					id: 'members',
					question: 'Who else is on your team? Drop a list or invite them by email.',
					placeholder: 'name@company.com',
					kind: 'upload',
					dropTitle: 'Drop your team list',
					dropHint: "Add a CSV of names and emails and I'll send the invites."
				},
				{
					id: 'accounts',
					question: "Add the accounts you sell to. Drop a file and I'll bring them in.",
					placeholder: 'You can paste your data here too…',
					kind: 'upload',
					dropTitle: 'Drop your account list',
					dropHint: "Add a CSV and I'll get to work on it."
				},
				{
					id: 'products',
					question: "Add your product catalog. Drop your line sheet and I'll read it.",
					placeholder: 'You can paste your data here too…',
					kind: 'upload',
					dropTitle: 'Drop your product list',
					dropHint: "Add a CSV or PDF line sheet and I'll read it."
				},
				{
					id: 'orders',
					question: "Have existing orders? Drop them in and I'll match them up.",
					placeholder: 'You can paste your data here too…',
					kind: 'upload',
					dropTitle: 'Drop your orders',
					dropHint: "Add a CSV and I'll match them up."
				}
			]
		},
		{
			id: 'settings',
			title: 'Settings',
			subtitle: 'Add details about your organization',
			subs: [
				{
					id: 'address',
					question: "Where's your business based?",
					placeholder: 'Business address',
					kind: 'address'
				},
				{
					id: 'payment-terms',
					question: 'What payment terms do you offer by default?',
					placeholder: 'Choose your default terms',
					kind: 'choice',
					options: [
						{ value: 'net_30', label: 'Net 30', description: 'Payment due 30 days after invoice.' },
						{ value: 'net_60', label: 'Net 60', description: 'Payment due 60 days after invoice.' },
						{ value: 'net_15', label: 'Net 15', description: 'Payment due 15 days after invoice.' },
						{ value: 'prepaid', label: 'Prepaid', description: 'Payment before the order ships.' }
					]
				},
				{
					id: 'payment-methods',
					question: 'How do your buyers pay you?',
					placeholder: 'Choose all that apply',
					kind: 'multi',
					options: [
						{ value: 'credit_card', label: 'Credit card' },
						{ value: 'ach', label: 'ACH transfer' },
						{ value: 'check', label: 'Check' },
						{ value: 'wire', label: 'Wire transfer' }
					]
				}
			]
		},
		{
			id: 'integrations',
			title: 'Integrations',
			subtitle: 'Connect external resources for your organization.',
			subs: [
				{
					id: 'connect',
					// Only providers with a live connect flow are listed here — see
					// src/routes/organization/integrations. QuickBooks/Xero are still
					// coming-soon, so onboarding must not promise them.
					question: 'Last thing — want to connect the tools you already use?',
					placeholder: 'You can always connect these later',
					kind: 'connect',
					options: [
						{
							value: 'slack',
							label: 'Slack',
							description: 'Notifications for new orders and status changes.',
							url: '/api/integrations/slack/connect'
						},
						{
							value: 'microsoft',
							label: 'Microsoft 365',
							description: 'Outlook email, Teams notifications, and Excel exports.',
							url: '/api/integrations/microsoft/connect'
						},
						{
							value: 'google_sheets',
							label: 'Google Sheets',
							description: 'Export orders, accounts, and reports to spreadsheets.',
							url: '/api/integrations/google-sheets/connect'
						},
						{
							value: 'notion',
							label: 'Notion',
							description: 'Two-way sync for orders, brands, lookbooks, and docs.',
							url: '/api/integrations/notion/connect'
						}
					]
				}
			]
		}
	];

	const WELCOME = 'Welcome to Threadline';
	const SUBTITLE =
		"Let's set up your organization — a few quick questions and we'll build out your catalog and accounts.";

	// Resume: the org row only exists once General Information is done, and its
	// onboarding_step (1-based phase) tells us which phase to resume at. Reading
	// `data` once at init is intentional (SSR provides the current value).
	// Resume. onboarding_state (JSONB) carries the exact cursor, which sub-steps
	// are done/skipped, and the import counts, so a refresh doesn't drop you back
	// to the top of a phase and re-run work you already finished. Falls back to
	// the phase-only onboarding_step for orgs written before that column existed.
	// svelte-ignore state_referenced_locally
	const saved = (data.organization?.onboarding_state ?? null) as {
		phase?: number;
		sub?: number;
		subStates?: Record<string, 'done' | 'skipped'>;
		stats?: { n: string; label: string }[];
	} | null;

	// svelte-ignore state_referenced_locally
	let phaseIndex = $state(
		typeof saved?.phase === 'number'
			? Math.min(Math.max(saved.phase, 0), phases.length - 1)
			: resumePhaseIndex(data.organization?.onboarding_step, phases.length)
	);
	// svelte-ignore state_referenced_locally
	let subIndex = $state(
		typeof saved?.sub === 'number'
			? Math.min(Math.max(saved.sub, 0), (phases[phaseIndex]?.subs.length ?? 1) - 1)
			: 0
	);
	let draft = $state('');
	let completed = $state(false);
	// svelte-ignore state_referenced_locally
	let subStates = $state<Record<string, 'done' | 'skipped'>>({ ...(saved?.subStates ?? {}) });
	// svelte-ignore state_referenced_locally
	let stats = $state<{ n: string; label: string; display: number }[]>(
		(saved?.stats ?? []).map((s) => ({ ...s, display: Number(s.n) || 0 }))
	);

	// General Information answers — held in memory until create-org. Not resumable
	// pre-org by design (plan §0 decision 2).
	let values = $state<{
		name: string;
		orgType: 'brand' | 'rep' | 'retailer' | null;
		orgName: string;
	}>({ name: '', orgType: null, orgName: '' });
	let loading = $state(false);
	let errorMsg = $state('');

	// Completion
	let finishing = $state(false);
	let landingPath = $state('/insight');
	let redirectTimer: ReturnType<typeof setTimeout> | null = null;

	// File upload (dock-native: + button, dropzone click, drag-and-drop)
	let fileInput = $state<HTMLInputElement>();
	let dragActive = $state(false);

	// Conversation panel collapse — shrinks to its header behind the prompt bar.
	let panelCollapsed = $state(false);

	// Voice dictation. Uses the same capture/STT module as the app's prompt bar;
	// here the transcript fills the current answer rather than starting a chat.
	let voiceState = $state<'idle' | 'listening' | 'processing'>('idle');
	let voiceCapture: VoiceCaptureHandle | null = null;

	async function toggleVoice() {
		if (voiceState !== 'idle') {
			voiceCapture?.stop();
			voiceCapture = null;
			return;
		}
		errorMsg = '';
		voiceCapture = await startVoiceCapture({
			onState: (s) => (voiceState = s),
			onResult: (text) => {
				voiceState = 'idle';
				voiceCapture = null;
				// Dictation appends, so speaking twice builds one answer.
				draft = draft.trim() ? `${draft.trim()} ${text}` : text;
			},
			onError: (message) => {
				voiceState = 'idle';
				voiceCapture = null;
				errorMsg = message;
			}
		});
		if (!voiceCapture) voiceState = 'idle';
	}

	// Settings answers
	let address = $state({ line1: '', line2: '', city: '', state: '', zip: '', country: 'US' });
	let selectedMethods = $state<string[]>([]);
	// Integrations the user opened. OAuth completes in a new tab, so we can't
	// confirm the connection from here — this only tracks what they started.
	let startedConnections = $state<string[]>([]);
	const addressComplete = $derived(
		address.line1.trim() !== '' &&
			address.city.trim() !== '' &&
			address.state.trim() !== '' &&
			address.zip.trim() !== ''
	);

	// Entrance orchestration state
	let prefersReduced = $state(false);
	let welcomeTyped = $state('');
	let welcomeTyping = $state(false);
	let subtitleTyped = $state('');
	let subtitleTyping = $state(false);
	let showPrompt = $state(false);
	let showStepper = $state(false);
	let showConversation = $state(false);

	// Question typewriter state
	let typed = $state('');
	let typing = $state(false);
	let inputRevealed = $state(false);

	const phase = $derived(phases[phaseIndex]);
	const sub = $derived(phase.subs[subIndex]);
	const questionCount = $derived(phase.subs.length);
	const canPrev = $derived(canGoPrev({ phaseIndex, subIndex }));
	const canNext = $derived(canGoNext({ phaseIndex, subIndex }, phases));
	const hasDraft = $derived(draft.trim().length > 0);
	const revealMs = $derived(prefersReduced ? 0 : 320);

	const cursorKey = (p: number, s: number) => `${p}.${s}`;
	const currentSubState = $derived(subStates[cursorKey(phaseIndex, subIndex)]);

	const phaseState = (i: number) => phaseStatus(i, { phaseIndex, subIndex }, completed);

	// Stat cards are driven by real import counts only — never placeholder numbers.
	function addStat(demo: { n: string; label: string }) {
		const idx = stats.length;
		const target = Number(demo.n);
		stats = [...stats, { n: demo.n, label: demo.label, display: prefersReduced ? target : 0 }];
		if (prefersReduced) return;
		// Count-up micro-interaction.
		const start = performance.now();
		const dur = 700;
		const step = (t: number) => {
			const p = Math.min(1, (t - start) / dur);
			const eased = 1 - Math.pow(1 - p, 3);
			const row = stats[idx];
			if (row) row.display = Math.round(target * eased);
			if (p < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}

	function advanceGlobal() {
		// Every path out of a sub-step funnels through here, so record completion
		// once. `complete('skipped')` sets its own state first and is preserved.
		const key = cursorKey(phaseIndex, subIndex);
		if (!subStates[key]) subStates[key] = 'done';

		const { cursor, completed: done } = nextCursor({ phaseIndex, subIndex }, phases);
		phaseIndex = cursor.phaseIndex;
		subIndex = cursor.subIndex;
		if (done) {
			completed = true;
			void finishOnboarding();
		} else {
			void persistCursor();
		}
	}

	// Terminal step: mark the org complete, let the summary land, then hand off
	// to the app. The button is always there so a slow/failed write never traps
	// anyone on this screen.
	async function finishOnboarding() {
		finishing = true;
		try {
			const res = await fetch('/api/onboarding/progress', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ complete: true })
			});
			const body = await res.json().catch(() => ({}));
			if (body?.landing) landingPath = body.landing;
		} catch {
			// Fall through — the manual button still works.
		}
		finishing = false;
		if (!prefersReduced) {
			redirectTimer = setTimeout(() => goToApp(), 2600);
		}
	}

	function goToApp() {
		if (redirectTimer) clearTimeout(redirectTimer);
		window.location.href = landingPath;
	}

	function complete(state: 'done' | 'skipped') {
		subStates[cursorKey(phaseIndex, subIndex)] = state;
		draft = '';
		advanceGlobal();
	}

	const skip = () => complete('skipped');
	const prevSub = () => canPrev && subIndex--;
	const nextSub = () => canNext && subIndex++;

	// Persist the resume cursor (1-based phase) once the org exists. Server-side
	// via supabaseAdmin — browser writes through @supabase/ssr don't land reliably.
	async function persistCursor() {
		// No org yet during General Information — nothing to write to.
		if (!data.organization?.id) return;
		await fetch('/api/onboarding/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				onboardingStep: phaseIndex + 1,
				onboardingState: {
					phase: phaseIndex,
					sub: subIndex,
					subStates: { ...subStates },
					stats: stats.map((s) => ({ n: s.n, label: s.label }))
				}
			})
		}).catch(() => {});
	}

	function chooseOrgType(value: 'brand' | 'rep' | 'retailer') {
		values.orgType = value;
		errorMsg = '';
		advanceGlobal();
	}

	// Settings steps post structured payloads to api/setup/save.
	async function saveSetupStep(step: string, value: unknown): Promise<boolean> {
		const res = await fetch('/api/setup/save', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ step, value })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			errorMsg = body.error || "That didn't save. Please try again.";
			return false;
		}
		return true;
	}

	// A single-select choice. Org type is local-only (it feeds create-org);
	// everything else writes through setup/save.
	async function chooseOption(value: string) {
		errorMsg = '';
		if (sub.id === 'orgType') {
			chooseOrgType(value as 'brand' | 'rep' | 'retailer');
			return;
		}
		loading = true;
		const ok = await saveSetupStep(sub.id, value);
		loading = false;
		if (ok) advanceGlobal();
	}

	function toggleMethod(value: string) {
		selectedMethods = selectedMethods.includes(value)
			? selectedMethods.filter((v) => v !== value)
			: [...selectedMethods, value];
	}

	async function submitMethods() {
		if (selectedMethods.length === 0) return;
		errorMsg = '';
		loading = true;
		const ok = await saveSetupStep('payment-methods', selectedMethods);
		loading = false;
		if (ok) advanceGlobal();
	}

	async function submitAddress() {
		if (!addressComplete) return;
		errorMsg = '';
		loading = true;
		const ok = await saveSetupStep('address', {
			line1: address.line1.trim(),
			line2: address.line2.trim(),
			city: address.city.trim(),
			state: address.state.trim(),
			zip: address.zip.trim(),
			country: (address.country || 'US').trim().toUpperCase().slice(0, 2)
		});
		loading = false;
		if (ok) advanceGlobal();
	}

	// Create the org from the collected General Information, then move into Import
	// Files. Retailers terminate at creation (create-retailer redirects to /dashboard).
	async function createOrg() {
		if (loading) return;
		loading = true;
		errorMsg = '';
		try {
			if (values.orgType === 'retailer') {
				const res = await fetch('/api/onboarding/create-retailer', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ retailerName: values.orgName, displayName: values.name })
				});
				if (!res.ok) {
					errorMsg = (await res.json()).error || 'Could not create your organization.';
					loading = false;
					return;
				}
				window.location.href = '/dashboard';
				return;
			}

			const res = await fetch('/api/onboarding/create-org', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orgName: values.orgName,
					displayName: values.name,
					orgType: values.orgType
				})
			});
			if (!res.ok) {
				errorMsg = (await res.json()).error || 'Could not create your organization.';
				loading = false;
				return;
			}
			// Re-run load so data.organization is populated before we persist the cursor.
			await invalidateAll();
			draft = '';
			// advanceGlobal persists the new cursor now that the org exists.
			advanceGlobal();
		} catch {
			errorMsg = 'Something went wrong. Please try again.';
		} finally {
			loading = false;
		}
	}

	// Answering depends on the current sub-step. General Information writes real
	// data; other phases (P2+) still use the mock advance.
	function answer() {
		if (phase.id === 'general') {
			if (sub.id === 'name') {
				if (!draft.trim()) return;
				values.name = draft.trim();
				draft = '';
				advanceGlobal();
			} else if (sub.id === 'orgName') {
				if (!draft.trim()) return;
				values.orgName = draft.trim();
				void createOrg();
			}
			return;
		}
		// The members step also accepts a single email typed into the bar.
		if (sub.id === 'members') {
			void inviteOne(draft.trim());
			return;
		}
		// Only free-text steps advance from the input bar. Choice, multi, address
		// and upload steps commit through their own controls, so a stray Enter
		// must not skip past an unsaved answer.
		if (sub.kind !== 'text') return;
		complete('done');
	}

	// Single invite typed into the prompt bar (the "or invite them by email" path).
	async function inviteOne(email: string) {
		if (!email.includes('@') || email.length < 3) {
			errorMsg = "That doesn't look like an email address.";
			return;
		}
		errorMsg = '';
		loading = true;
		try {
			const res = await fetch('/api/invite/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, role: 'member' })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				errorMsg = body.error || "That invite couldn't be sent.";
				return;
			}
			addStat({ n: '1', label: 'Member Invited' });
			draft = '';
			advanceGlobal();
		} catch {
			errorMsg = "That invite couldn't be sent.";
		} finally {
			loading = false;
		}
	}

	// ── File upload ────────────────────────────────────────────────────────
	function openFilePicker() {
		errorMsg = '';
		fileInput?.click();
	}

	function onFilePicked(e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		const file = target.files?.[0];
		if (file) void handleFile(file);
		target.value = '';
	}

	function onDragOver(e: DragEvent) {
		if (!showConversation || sub.kind !== 'upload' || ingestState !== 'idle') return;
		e.preventDefault();
		dragActive = true;
	}

	function onDragLeave() {
		dragActive = false;
	}

	function onDrop(e: DragEvent) {
		dragActive = false;
		if (!showConversation || sub.kind !== 'upload' || ingestState !== 'idle') return;
		e.preventDefault();
		const file = e.dataTransfer?.files?.[0];
		if (file) void handleFile(file);
	}

	// ── Ingestion: drop → read → preview → confirm → commit ────────────────
	// Nothing is written until the user confirms. Invites in particular send
	// real email, so friction is matched to the blast radius.
	type IngestRow = { primary: string; secondary: string };
	type MemberDraft = { email: string; role: string; commissionRate: number | null; name: string };

	let ingestState = $state<'idle' | 'reading' | 'preview' | 'committing'>('idle');
	let ingestFileName = $state('');
	let ingestRows = $state<IngestRow[]>([]);
	let ingestNoun = $state('');
	type ProductDraft = {
		style_number: string;
		name: string;
		wholesale_price: number;
		season_id: string | null;
	};
	type OrderRowDraft = {
		account: string;
		style_number: string;
		qty: number;
		unit_price: number | null;
		color: string | null;
		size: string | null;
	};

	let memberDrafts: MemberDraft[] = [];
	let accountDrafts: Record<string, unknown>[] = [];
	let productDrafts: ProductDraft[] = [];
	let orderDrafts: OrderRowDraft[] = [];

	function resetIngest() {
		ingestState = 'idle';
		ingestFileName = '';
		ingestRows = [];
		memberDrafts = [];
		accountDrafts = [];
		productDrafts = [];
		orderDrafts = [];
	}

	function pickHeader(headers: string[], candidates: string[]): string | null {
		const lowered = headers.map((h) => h.trim().toLowerCase());
		for (const c of candidates) {
			const i = lowered.indexOf(c);
			if (i !== -1) return lowered[i];
		}
		return null;
	}

	function normalizeRole(raw: string): string {
		const v = raw.trim().toLowerCase();
		if (v.includes('admin')) return 'admin';
		if (v.includes('sales')) return 'sales';
		if (v.includes('guest')) return 'guest';
		return 'member';
	}

	function parseMembers(headers: string[], rows: Record<string, string>[]): MemberDraft[] {
		const emailH = pickHeader(headers, ['email', 'email address', 'email_address']);
		if (!emailH) return [];
		const firstH = pickHeader(headers, ['first name', 'first_name', 'firstname']);
		const lastH = pickHeader(headers, ['last name', 'last_name', 'lastname']);
		const roleH = pickHeader(headers, ['role', 'member role']);
		const commH = pickHeader(headers, ['commission', 'commission rate', 'commission_rate']);

		const out: MemberDraft[] = [];
		for (const row of rows) {
			const email = (row[emailH] ?? '').trim();
			if (!email || !email.includes('@')) continue;
			const role = roleH ? normalizeRole(row[roleH] ?? '') : 'member';
			let commissionRate: number | null = null;
			if (role === 'sales' && commH) {
				const n = Number((row[commH] ?? '').replace('%', '').trim());
				if (Number.isFinite(n) && n > 0) commissionRate = n;
			}
			const name = [firstH ? row[firstH] : '', lastH ? row[lastH] : '']
				.map((s) => (s ?? '').trim())
				.filter(Boolean)
				.join(' ');
			out.push({ email, role, commissionRate, name });
		}
		return out;
	}

	const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

	const toNumber = (raw: string): number | null => {
		const n = Number((raw ?? '').replace(/[$,]/g, '').trim());
		return Number.isFinite(n) ? n : null;
	};

	// Products use the app's shared column-suggestion mapper so onboarding
	// accepts the same headers as the /products import.
	function parseProducts(headers: string[], rows: Record<string, string>[]): ProductDraft[] {
		const headerByField = new Map<string, string>();
		for (const h of headers) {
			const field = suggestColumnMapping(h);
			if (field && !headerByField.has(field)) headerByField.set(field, h.trim().toLowerCase());
		}
		const styleH = headerByField.get('style_number');
		const nameH = headerByField.get('name');
		const priceH = headerByField.get('wholesale_price');
		if (!styleH || !nameH || !priceH) return [];

		const out: ProductDraft[] = [];
		for (const row of rows) {
			const style_number = (row[styleH] ?? '').trim();
			const name = (row[nameH] ?? '').trim();
			const price = toNumber(row[priceH] ?? '');
			if (!style_number || !name || price === null) continue;
			out.push({ style_number, name, wholesale_price: price, season_id: null });
		}
		return out;
	}

	function parseOrders(headers: string[], rows: Record<string, string>[]): OrderRowDraft[] {
		const accountH = pickHeader(headers, ['account', 'business name', 'business_name', 'customer']);
		const styleH = pickHeader(headers, ['style number', 'style_number', 'style', 'sku']);
		const qtyH = pickHeader(headers, ['qty', 'quantity', 'units']);
		if (!accountH || !styleH || !qtyH) return [];
		const priceH = pickHeader(headers, ['unit price', 'unit_price', 'price', 'wholesale price']);
		const colorH = pickHeader(headers, ['color', 'colour']);
		const sizeH = pickHeader(headers, ['size']);

		const out: OrderRowDraft[] = [];
		for (const row of rows) {
			const account = (row[accountH] ?? '').trim();
			const style_number = (row[styleH] ?? '').trim();
			const qty = toNumber(row[qtyH] ?? '');
			if (!account || !style_number || qty === null || qty <= 0) continue;
			out.push({
				account,
				style_number,
				qty: Math.trunc(qty),
				unit_price: priceH ? toNumber(row[priceH] ?? '') : null,
				color: colorH ? (row[colorH] ?? '').trim() || null : null,
				size: sizeH ? (row[sizeH] ?? '').trim() || null : null
			});
		}
		return out;
	}

	const money = (n: number) =>
		n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

	async function handleFile(file: File) {
		if (sub.kind !== 'upload' || ingestState !== 'idle') return;
		errorMsg = '';
		ingestFileName = file.name;
		ingestState = 'reading';

		const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

		// PDF line sheets go through the AI parser; only products supports it.
		if (isPdf) {
			if (sub.id !== 'products') {
				resetIngest();
				errorMsg = 'I can only read PDF line sheets on the catalog step. Try a CSV here.';
				return;
			}
			if (!data.selfBrandId) {
				resetIngest();
				errorMsg =
					"Product imports need a brand catalog — that's only set up for brand organizations right now.";
				return;
			}
			try {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch('/api/products/parse-linesheet', { method: 'POST', body: fd });
				const body = await res.json();
				if (!res.ok) {
					resetIngest();
					errorMsg = body.error || "I couldn't read that line sheet.";
					return;
				}
				const parsed = Array.isArray(body.products) ? body.products : [];
				productDrafts = parsed
					.filter(
						(p: Record<string, unknown>) =>
							p && typeof p.style_number === 'string' && typeof p.name === 'string'
					)
					.map((p: Record<string, unknown>) => ({
						style_number: String(p.style_number).trim(),
						name: String(p.name).trim(),
						wholesale_price: Number(p.wholesale_price ?? 0),
						season_id: null
					}))
					.filter((p: ProductDraft) => p.style_number && p.name);
				if (productDrafts.length === 0) {
					resetIngest();
					errorMsg = "I couldn't find any products in that line sheet.";
					return;
				}
				ingestNoun = productDrafts.length === 1 ? 'product' : 'products';
				ingestRows = productDrafts.map((p) => ({
					primary: p.name,
					secondary: [p.style_number, p.wholesale_price ? money(p.wholesale_price) : '']
						.filter(Boolean)
						.join(' · ')
				}));
				ingestState = 'preview';
			} catch {
				resetIngest();
				errorMsg = "I couldn't read that line sheet.";
			}
			return;
		}

		// A short scanning beat so the read is legible rather than a flash.
		const readAt = performance.now();
		let text = '';
		try {
			text = await file.text();
		} catch {
			resetIngest();
			errorMsg = "I couldn't read that file.";
			return;
		}
		const elapsed = performance.now() - readAt;
		if (!prefersReduced && elapsed < 700) {
			await new Promise((r) => setTimeout(r, 700 - elapsed));
		}

		const { headers, rows } = parseCSV(text);

		if (sub.id === 'members') {
			memberDrafts = parseMembers(headers, rows);
			if (memberDrafts.length === 0) {
				resetIngest();
				errorMsg =
					"I couldn't find any email addresses in that file. A CSV with an Email column works best.";
				return;
			}
			ingestNoun = memberDrafts.length === 1 ? 'person' : 'people';
			ingestRows = memberDrafts.map((m) => ({
				primary: m.name || m.email,
				secondary: [
					m.name ? m.email : '',
					roleLabel(m.role),
					m.commissionRate ? `${m.commissionRate}%` : ''
				]
					.filter(Boolean)
					.join(' · ')
			}));
			ingestState = 'preview';
			return;
		}

		if (sub.id === 'accounts') {
			const { previewRows } = buildAccountPreviewFromCsv(headers, rows);
			accountDrafts = previewRows.filter(
				(r) => typeof r.business_name === 'string' && (r.business_name as string).trim().length > 0
			);
			if (accountDrafts.length === 0) {
				resetIngest();
				errorMsg =
					"I couldn't find any accounts in that file. A CSV with a business name column works best.";
				return;
			}
			ingestNoun = accountDrafts.length === 1 ? 'account' : 'accounts';
			ingestRows = accountDrafts.map((a) => ({
				primary: String(a.business_name ?? ''),
				secondary: [a.city, a.state]
					.map((v) => (v ? String(v) : ''))
					.filter(Boolean)
					.join(', ')
			}));
			ingestState = 'preview';
			return;
		}

		if (sub.id === 'products') {
			if (!data.selfBrandId) {
				resetIngest();
				errorMsg =
					"Product imports need a brand catalog — that's only set up for brand organizations right now.";
				return;
			}
			productDrafts = parseProducts(headers, rows);
			if (productDrafts.length === 0) {
				resetIngest();
				errorMsg =
					"I couldn't read that catalog. A CSV with style number, name, and wholesale price columns works best.";
				return;
			}
			ingestNoun = productDrafts.length === 1 ? 'product' : 'products';
			ingestRows = productDrafts.map((p) => ({
				primary: p.name,
				secondary: [p.style_number, money(p.wholesale_price)].filter(Boolean).join(' · ')
			}));
			ingestState = 'preview';
			return;
		}

		if (sub.id === 'orders') {
			orderDrafts = parseOrders(headers, rows);
			if (orderDrafts.length === 0) {
				resetIngest();
				errorMsg =
					"I couldn't read those orders. A CSV with account, style number, and quantity columns works best.";
				return;
			}
			ingestNoun = orderDrafts.length === 1 ? 'order line' : 'order lines';
			ingestRows = orderDrafts.map((o) => ({
				primary: o.account,
				secondary: [o.style_number, `${o.qty} units`].filter(Boolean).join(' · ')
			}));
			ingestState = 'preview';
			return;
		}

		resetIngest();
		errorMsg = "I don't know how to read that one yet.";
	}

	async function confirmIngest() {
		ingestState = 'committing';
		try {
			if (sub.id === 'members') {
				let sent = 0;
				for (const m of memberDrafts) {
					const res = await fetch('/api/invite/send', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							email: m.email,
							role: m.role,
							commissionRate: m.commissionRate ?? undefined
						})
					});
					if (res.ok) sent++;
				}
				if (sent === 0) {
					ingestState = 'preview';
					errorMsg = 'None of those invites could be sent — they may already be members.';
					return;
				}
				addStat({ n: String(sent), label: sent === 1 ? 'Member Invited' : 'Members Invited' });
				resetIngest();
				advanceGlobal();
				return;
			}

			if (sub.id === 'accounts') {
				const res = await fetch('/api/accounts/import', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ accounts: accountDrafts })
				});
				const result = await res.json();
				if (!res.ok) {
					ingestState = 'preview';
					errorMsg = result.error || 'That import failed. Please try again.';
					return;
				}
				const created = Number(result.created ?? 0);
				if (created > 0) {
					addStat({
						n: String(created),
						label: created === 1 ? 'Account Added' : 'Accounts Added'
					});
				}
				resetIngest();
				advanceGlobal();
				return;
			}

			if (sub.id === 'products') {
				const res = await fetch('/api/products/import', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						brandId: data.selfBrandId,
						onConflict: 'skip',
						products: productDrafts
					})
				});
				const result = await res.json();
				if (!res.ok) {
					ingestState = 'preview';
					errorMsg = result.error || 'That import failed. Please try again.';
					return;
				}
				const created = Number(result.created ?? 0);
				if (created > 0) {
					addStat({
						n: String(created),
						label: created === 1 ? 'Product Added' : 'Products Added'
					});
				}
				resetIngest();
				advanceGlobal();
				return;
			}

			if (sub.id === 'orders') {
				const res = await fetch('/api/orders/import', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ rows: orderDrafts })
				});
				const result = await res.json();
				if (!res.ok) {
					ingestState = 'preview';
					errorMsg = result.error || 'That import failed. Please try again.';
					return;
				}
				const created = Number(result.created ?? 0);
				if (created === 0) {
					ingestState = 'preview';
					errorMsg =
						'None of those rows matched an account and product — bring those in first, then try again.';
					return;
				}
				addStat({ n: String(created), label: created === 1 ? 'Order Added' : 'Orders Added' });
				resetIngest();
				advanceGlobal();
				return;
			}
		} catch {
			ingestState = 'preview';
			errorMsg = 'Something went wrong. Please try again.';
		}
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey && hasDraft && showConversation) {
			e.preventDefault();
			answer();
		}
	}

	// Motion actions — spring physics for the two hero moments. Both start hidden
	// (inline opacity:0) and end visible even under reduced-motion.
	function springUp(node: HTMLElement, y = 56) {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			node.style.opacity = '1';
			return;
		}
		import('motion').then(({ animate }) => {
			animate(node, { opacity: [0, 1], y: [y, 0] } as Parameters<typeof animate>[1], {
				type: 'spring',
				stiffness: 300,
				damping: 30,
				mass: 1
			});
		});
	}

	function openPanel(node: HTMLElement) {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			node.style.opacity = '1';
			return;
		}
		node.style.transformOrigin = 'bottom center';
		import('motion').then(({ animate }) => {
			animate(
				node,
				{ opacity: [0, 1], transform: ['scale(0.96)', 'scale(1)'] } as Parameters<
					typeof animate
				>[1],
				{ type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }
			);
		});
	}

	// Orchestrate the entrance once on mount.
	let didEnter = false;
	$effect(() => {
		if (didEnter) return;
		didEnter = true;
		prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		if (prefersReduced) {
			welcomeTyped = WELCOME;
			subtitleTyped = SUBTITLE;
			showPrompt = true;
			showStepper = true;
			showConversation = true;
			return;
		}

		const timers: ReturnType<typeof setTimeout>[] = [];

		// t0 — greeting heading types + prompt springs up (prompt shown via {#if}).
		showPrompt = true;
		welcomeTyping = true;
		let hi = 0;
		const headingId = setInterval(() => {
			hi++;
			welcomeTyped = WELCOME.slice(0, hi);
			if (hi >= WELCOME.length) {
				clearInterval(headingId);
				welcomeTyping = false;
				// Subtitle types right behind the heading (faster).
				subtitleTyping = true;
				let si = 0;
				const subId = setInterval(() => {
					si++;
					subtitleTyped = SUBTITLE.slice(0, si);
					if (si >= SUBTITLE.length) {
						clearInterval(subId);
						subtitleTyping = false;
						// Greeting done → assemble stepper, then open the panel.
						showStepper = true;
						timers.push(setTimeout(() => (showConversation = true), 620));
					}
				}, 12);
				timers.push(subId);
			}
		}, 30);
		timers.push(headingId);

		return () =>
			timers.forEach((t) => {
				clearInterval(t);
				clearTimeout(t);
			});
	});

	// Moving to a different question abandons any un-confirmed ingest.
	$effect(() => {
		void sub.id;
		untrack(() => {
			if (ingestState !== 'committing') resetIngest();
		});
	});

	// Question typewriter — only after the conversation panel opens; retype on
	// every question change.
	$effect(() => {
		const full = sub.question;
		if (!showConversation) {
			typed = '';
			typing = false;
			inputRevealed = false;
			return;
		}
		inputRevealed = false;
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (reduced) {
			typed = full;
			typing = false;
			inputRevealed = true;
			return;
		}
		typed = '';
		typing = true;
		let i = 0;
		const id = setInterval(() => {
			i++;
			typed = full.slice(0, i);
			if (i >= full.length) {
				clearInterval(id);
				typing = false;
				inputRevealed = true;
			}
		}, 22);
		return () => clearInterval(id);
	});
</script>

<svelte:head>
	<title>Welcome to Threadline</title>
</svelte:head>

<input
	bind:this={fileInput}
	type="file"
	accept=".csv,.pdf,text/csv,application/pdf"
	class="hidden"
	onchange={onFilePicked}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="min-h-dvh bg-background text-foreground"
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	<!-- Scrolling content: same max-w-2xl column as the dock, with px-6 so the text
	     is inset 24px on both sides. -->
	<div class="mx-auto max-w-2xl px-6 pt-20 pb-[380px] lg:pt-24">
		<!-- Brand mark (static) -->
		<div class="flex justify-center">
			<div class="flex h-12 w-12 items-center justify-center bg-foreground text-background">
				<svg viewBox="0 0 43 43" fill="none" class="h-6 w-6" aria-hidden="true">
					<path d="M11 42.5L24.8799 1H31.5899L17.71 42.5H11Z" fill="currentColor" />
				</svg>
			</div>
		</div>

		<!-- Greeting (typed) -->
		<div class="mt-14">
			<h1 class="min-h-[2rem] text-2xl font-semibold tracking-tight">
				{welcomeTyped}{#if welcomeTyping}<span
						class="onb-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-foreground"
					></span>{/if}
			</h1>
			<p class="mt-2 min-h-[3rem] text-base text-foreground">
				{subtitleTyped}{#if subtitleTyping}<span
						class="onb-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[2px] bg-foreground"
					></span>{/if}
			</p>
		</div>

		<!-- Stepper: progress + roadmap, assembles after the greeting -->
		{#if showStepper}
			<div
				class="mt-10"
				in:fly={{ y: prefersReduced ? 0 : 10, duration: revealMs, easing: cubicOut }}
			>
				<p class="text-sm text-muted-foreground">Step {phaseIndex + 1} of {phases.length}</p>
				<div class="mt-3 flex gap-2">
					{#each phases as _, i (i)}
						<span class="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
							<span
								class="absolute inset-0 origin-left rounded-full bg-foreground transition-transform duration-500 ease-out {i <=
								phaseIndex
									? 'scale-x-100'
									: 'scale-x-0'}"
							></span>
						</span>
					{/each}
				</div>
			</div>

			<ol class="mt-8 space-y-5">
				{#each phases as p, i (p.id)}
					{@const st = phaseState(i)}
					<li
						class="flex gap-3"
						in:fly={{
							y: prefersReduced ? 0 : 10,
							duration: prefersReduced ? 0 : 360,
							delay: prefersReduced ? 0 : 80 + i * 70,
							easing: cubicOut
						}}
					>
						<span class="mt-0.5 shrink-0">
							{#if st === 'done'}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									class="h-6 w-6 text-foreground"
									aria-hidden="true"
									in:scale={{
										start: prefersReduced ? 1 : 0.5,
										duration: prefersReduced ? 0 : 320,
										easing: backOut
									}}
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							{:else}
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="1.75"
									class="h-6 w-6 {st === 'active' ? 'text-foreground' : 'text-muted-foreground/40'}"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="9" />
								</svg>
							{/if}
						</span>
						<div>
							<p
								class="font-semibold {st === 'active'
									? 'text-foreground'
									: 'text-muted-foreground'}"
							>
								{p.title}
							</p>
							<p class="text-sm {st === 'active' ? 'text-foreground' : 'text-muted-foreground'}">
								{p.subtitle}
							</p>
						</div>
					</li>
				{/each}
			</ol>
		{/if}
	</div>

	<!-- Fixed prompt dock (page-centered) + right rail anchored to its right edge -->
	<div class="fixed inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-6">
		<div class="relative w-full max-w-2xl">
			<!-- Conversation panel: opens last, onto the prompt -->
			{#if completed}
				<div
					class="mb-4 rounded-2xl bg-zinc-900 p-6 text-zinc-100 shadow-2xl ring-1 ring-white/10"
					in:fade={{ duration: revealMs }}
				>
					{#if finishing}
						<div class="flex items-center gap-3">
							<div
								class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200"
							></div>
							<p class="text-base text-zinc-100">Getting your workspace ready…</p>
						</div>
					{:else}
						<p class="text-base font-medium text-zinc-50">
							You're all set{values.name ? `, ${values.name.split(' ')[0]}` : ''}.
						</p>
						{#if stats.length}
							<ul class="mt-3 space-y-1">
								{#each stats as s (s.label)}
									<li class="flex items-center gap-2 text-sm text-zinc-300">
										<svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											class="h-4 w-4 shrink-0 text-zinc-400"
											aria-hidden="true"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												d="M4.5 12.75l6 6 9-13.5"
											/>
										</svg>
										{s.n}
										{s.label.replace(/^\d+\s*/, '')}
									</li>
								{/each}
							</ul>
						{:else}
							<p class="mt-1 text-sm text-zinc-400">
								You can bring in your accounts and catalog any time from the app.
							</p>
						{/if}

						<button
							onclick={goToApp}
							class="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
						>
							Go to Threadline
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								class="h-4 w-4"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M4.5 12h15m0 0l-6-6m6 6l-6 6"
								/>
							</svg>
						</button>
					{/if}
				</div>
			{:else if showConversation}
				<!-- Collapsed, the panel shrinks to its header and tucks in behind the
				     prompt bar, which sits above it (z-10). -->
				<div
					use:openPanel
					style="opacity: 0"
					class="rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl ring-1 ring-white/10 transition-all duration-300 ease-out {panelCollapsed
						? 'mx-5 -mb-7 px-5 pt-4 pb-8'
						: 'mb-4 p-5'}"
				>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="flex items-center justify-between {panelCollapsed ? 'cursor-pointer' : ''}"
						onclick={() => {
							if (panelCollapsed) panelCollapsed = false;
						}}
					>
						<span class="flex items-center gap-2 font-mono text-sm text-zinc-500">
							{phase.title}
							{#if currentSubState}
								<span class="rounded bg-zinc-800 px-1.5 py-0.5 font-sans text-sm text-zinc-400">
									{currentSubState === 'done' ? 'Done' : 'Skipped'}
								</span>
							{/if}
						</span>
						<div class="flex items-center gap-1.5 font-mono text-sm text-zinc-400">
							<button
								onclick={prevSub}
								disabled={!canPrev}
								class:hidden={panelCollapsed}
								class="rounded p-0.5 transition-colors hover:text-zinc-100 disabled:opacity-30 disabled:hover:text-zinc-400"
								aria-label="Previous question"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-4 w-4"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M15.75 19.5L8.25 12l7.5-7.5"
									/>
								</svg>
							</button>
							<span>Question {subIndex + 1} of {questionCount}</span>
							<button
								onclick={nextSub}
								disabled={!canNext}
								class:hidden={panelCollapsed}
								class="rounded p-0.5 transition-colors hover:text-zinc-100 disabled:opacity-30 disabled:hover:text-zinc-400"
								aria-label="Next question"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-4 w-4"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M8.25 4.5l7.5 7.5-7.5 7.5"
									/>
								</svg>
							</button>

							<!-- Collapse to just this header. stopPropagation, or the click
							     bubbles to the header's expand handler and undoes itself. -->
							<button
								onclick={(e) => {
									e.stopPropagation();
									panelCollapsed = true;
								}}
								class:hidden={panelCollapsed}
								class="ml-1.5 rounded p-0.5 transition-colors hover:text-zinc-100"
								aria-label="Collapse panel"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									class="h-4 w-4"
									aria-hidden="true"
								>
									<path stroke-linecap="round" d="M5 12h14" />
								</svg>
							</button>
						</div>
					</div>

					<!-- Body: collapses to zero height via grid-rows -->
					<div
						class="grid transition-all duration-300 ease-out {panelCollapsed
							? 'grid-rows-[0fr] opacity-0'
							: 'grid-rows-[1fr] opacity-100'}"
					>
						<div class="overflow-hidden">
							<p class="mt-4 min-h-[3rem] text-base leading-relaxed text-zinc-50">
								{typed}{#if typing}<span
										class="onb-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] bg-zinc-300"
									></span>{/if}
							</p>

							{#if sub.kind === 'choice' && inputRevealed}
								<div
									class="space-y-2"
									in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
								>
									{#each sub.options ?? [] as opt (opt.value)}
										<button
											onclick={() => chooseOption(opt.value)}
											disabled={loading}
											class="w-full rounded-xl border bg-zinc-800/40 p-4 text-left transition-colors hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60 {values.orgType ===
											opt.value
												? 'border-zinc-200'
												: 'border-zinc-700'}"
										>
											<span class="flex items-start gap-3">
												{#if opt.icon}
													<span
														class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300"
													>
														<svg
															viewBox="0 0 24 24"
															fill="none"
															stroke="currentColor"
															stroke-width="1.5"
															class="h-5 w-5"
															aria-hidden="true"
														>
															<path stroke-linecap="round" stroke-linejoin="round" d={opt.icon} />
														</svg>
													</span>
												{/if}
												<span class="min-w-0">
													<span class="block text-base font-medium text-zinc-100">{opt.label}</span>
													{#if opt.description}
														<span class="mt-0.5 block text-sm text-zinc-400">{opt.description}</span
														>
													{/if}
												</span>
											</span>
										</button>
									{/each}
								</div>
							{/if}

							{#if sub.kind === 'connect' && inputRevealed}
								<div
									class="space-y-2"
									in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
								>
									{#each sub.options ?? [] as opt (opt.value)}
										<a
											href={opt.url}
											target="_blank"
											rel="noopener noreferrer"
											onclick={() => (startedConnections = [...startedConnections, opt.value])}
											class="flex items-center justify-between gap-3 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
										>
											<span class="min-w-0">
												<span class="block text-base font-medium text-zinc-100">{opt.label}</span>
												{#if opt.description}
													<span class="mt-0.5 block text-sm text-zinc-400">{opt.description}</span>
												{/if}
											</span>
											<span class="shrink-0 text-sm text-zinc-400">
												{startedConnections.includes(opt.value) ? 'Opened' : 'Connect'}
											</span>
										</a>
									{/each}
									<button
										onclick={() => complete('done')}
										class="mt-1 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
									>
										{startedConnections.length ? 'Done connecting' : 'Finish setup'}
									</button>
								</div>
							{/if}

							{#if sub.kind === 'multi' && inputRevealed}
								<div in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}>
									<div class="flex flex-wrap gap-2">
										{#each sub.options ?? [] as opt (opt.value)}
											<button
												onclick={() => toggleMethod(opt.value)}
												class="rounded-lg border px-3.5 py-2 text-sm transition-colors {selectedMethods.includes(
													opt.value
												)
													? 'border-zinc-200 bg-zinc-100 text-zinc-900'
													: 'border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:border-zinc-500'}"
											>
												{opt.label}
											</button>
										{/each}
									</div>
									<button
										onclick={submitMethods}
										disabled={selectedMethods.length === 0 || loading}
										class="mt-3 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-40"
									>
										{loading ? 'Saving…' : 'Save'}
									</button>
								</div>
							{/if}

							{#if sub.kind === 'address' && inputRevealed}
								<div
									class="space-y-2"
									in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
								>
									<input
										bind:value={address.line1}
										placeholder="Street address"
										class="w-full rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
									/>
									<input
										bind:value={address.line2}
										placeholder="Suite, floor (optional)"
										class="w-full rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
									/>
									<div class="flex gap-2">
										<input
											bind:value={address.city}
											placeholder="City"
											class="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
										/>
										<input
											bind:value={address.state}
											placeholder="State"
											class="w-24 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
										/>
										<input
											bind:value={address.zip}
											placeholder="ZIP"
											class="w-28 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
										/>
									</div>
									<button
										onclick={submitAddress}
										disabled={!addressComplete || loading}
										class="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-40"
									>
										{loading ? 'Saving…' : 'Save address'}
									</button>
								</div>
							{/if}

							{#if sub.kind === 'upload' && inputRevealed}
								{#if ingestState === 'idle'}
									<button
										onclick={openFilePicker}
										in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
										class="w-full rounded-xl border border-dashed px-6 py-8 text-center transition-colors {dragActive
											? 'border-zinc-300 bg-zinc-800/60'
											: 'border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800/40'}"
									>
										<p class="text-base font-medium text-zinc-100">{sub.dropTitle}</p>
										<p class="mt-1 text-sm text-zinc-500">{sub.dropHint}</p>
									</button>
								{:else if ingestState === 'reading'}
									<div
										class="flex items-center gap-3 rounded-xl bg-zinc-800/60 px-4 py-4"
										in:fade={{ duration: 140 }}
									>
										<div
											class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200"
										></div>
										<p class="text-sm text-zinc-300">
											Reading <span class="font-medium text-zinc-100">{ingestFileName}</span>…
										</p>
									</div>
								{:else}
									<!-- Preview: what I found, awaiting confirmation -->
									<div
										class="mt-1"
										in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
									>
										<p class="text-base text-zinc-100">
											I found <span class="font-medium">{ingestRows.length} {ingestNoun}</span> in
											<span class="text-zinc-300">{ingestFileName}</span>.
										</p>
										<ul
											class="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl bg-zinc-800/50"
										>
											{#each ingestRows.slice(0, 4) as row, i (row.primary + i)}
												<li class="flex items-baseline justify-between gap-3 px-4 py-2.5">
													<span class="text-sm font-medium text-zinc-100">{row.primary}</span>
													{#if row.secondary}
														<span class="shrink-0 text-sm text-zinc-400">{row.secondary}</span>
													{/if}
												</li>
											{/each}
											{#if ingestRows.length > 4}
												<li class="px-4 py-2.5 text-sm text-zinc-400">
													and {ingestRows.length - 4} more
												</li>
											{/if}
										</ul>

										<div class="mt-3 flex items-center gap-2">
											<button
												onclick={confirmIngest}
												disabled={ingestState === 'committing'}
												class="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-60"
											>
												{#if ingestState === 'committing'}
													<span
														class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900"
													></span>
													{sub.id === 'members' ? 'Sending…' : 'Importing…'}
												{:else}
													{sub.id === 'members' ? 'Send invites' : 'Import them'}
												{/if}
											</button>
											<button
												onclick={resetIngest}
												disabled={ingestState === 'committing'}
												class="rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-60"
											>
												Use a different file
											</button>
										</div>
									</div>
								{/if}
							{/if}

							{#if errorMsg}
								<p class="mt-3 text-sm text-red-400">{errorMsg}</p>
							{/if}

							{#if isSkippable(sub) && inputRevealed && ingestState === 'idle'}
								<div
									class="mt-4 flex justify-end"
									in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
								>
									<button
										onclick={skip}
										class="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 active:scale-95"
									>
										Skip
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- AI prompt (input bar): springs up first, persists as the anchor -->
			{#if showPrompt && !completed}
				<div
					use:springUp={56}
					style="opacity: 0"
					class="relative z-10 rounded-2xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-white/10"
				>
					<input
						bind:value={draft}
						onkeydown={onInputKeydown}
						disabled={loading}
						placeholder={sub.placeholder}
						class="w-full bg-transparent px-2 py-2 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
					/>
					<div class="mt-2 flex items-center justify-between">
						<button
							onclick={openFilePicker}
							class="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 active:scale-95"
							aria-label="Attach file"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="h-5 w-5"
								aria-hidden="true"
							>
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
							</svg>
						</button>

						{#if loading}
							<!-- Creating org -->
							<div class="flex h-9 w-9 items-center justify-center">
								<div
									class="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-200"
								></div>
							</div>
						{:else if hasDraft}
							<!-- Send -->
							<button
								onclick={answer}
								in:scale={{ start: 0.8, duration: 160, easing: cubicOut }}
								class="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200 active:scale-95"
								aria-label="Send"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									class="h-4 w-4"
									aria-hidden="true"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
									/>
								</svg>
							</button>
						{:else}
							<!-- Voice dictation — fills the current answer -->
							<button
								onclick={toggleVoice}
								class="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:scale-95 {voiceState ===
								'listening'
									? 'bg-blue-500 text-white'
									: 'bg-white text-zinc-900 hover:bg-zinc-200'}"
								aria-label={voiceState === 'idle' ? 'Voice input' : 'Stop listening'}
							>
								{#if voiceState === 'processing'}
									<div
										class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-900"
									></div>
								{:else}
									<div class="flex items-center gap-[2px]">
										<span
											class="{voiceState === 'listening'
												? 'voice-bar'
												: ''} h-[8px] w-[3px] rounded-full bg-current"
										></span>
										<span
											class="{voiceState === 'listening'
												? 'voice-bar'
												: ''} h-[18px] w-[3px] rounded-full bg-current"
											style="animation-delay: 0.15s"
										></span>
										<span
											class="{voiceState === 'listening'
												? 'voice-bar'
												: ''} h-[12px] w-[3px] rounded-full bg-current"
											style="animation-delay: 0.3s"
										></span>
										<span
											class="{voiceState === 'listening'
												? 'voice-bar'
												: ''} h-[6px] w-[3px] rounded-full bg-current"
											style="animation-delay: 0.45s"
										></span>
									</div>
								{/if}
							</button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Right rail: stat cards + human handoff, anchored to the dock's right edge.
			     xl+ only so it never overflows narrower desktops (desktop-first). -->
			{#if showPrompt}
				<aside
					class="fixed right-10 bottom-6 hidden w-56 xl:block"
					in:fade={{ duration: revealMs }}
				>
					{#if stats.length}
						<div class="mb-6 space-y-2">
							{#each stats as s (s.label)}
								<div
									class="flex items-baseline gap-2 rounded-xl bg-muted px-4 py-3"
									in:fly={{
										y: prefersReduced ? 0 : 12,
										duration: prefersReduced ? 0 : 420,
										easing: cubicOut
									}}
								>
									<span class="text-xl font-semibold tabular-nums">{s.display}</span>
									<span class="text-sm text-foreground">{s.label}</span>
								</div>
							{/each}
						</div>
					{/if}

					<div>
						<p class="font-semibold">Prefer a human?</p>
						<p class="mt-1 text-sm text-muted-foreground">
							Not comfortable setting up your organization, or need help using Threadline.
						</p>
						<a
							href="https://calendar.app.google/c8NotsgGCKcKgajD6"
							target="_blank"
							rel="noopener noreferrer"
							class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.5"
								class="h-4 w-4"
								aria-hidden="true"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
								/>
							</svg>
							Schedule a Meeting
						</a>
					</div>
				</aside>
			{/if}
		</div>
	</div>

	{#if dragActive}
		<div
			class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/70 backdrop-blur-sm"
			transition:fade={{ duration: 120 }}
		>
			<div class="rounded-2xl border-2 border-dashed border-foreground/40 px-12 py-10 text-center">
				<p class="text-lg font-semibold">Drop to import</p>
				<p class="mt-1 text-sm text-muted-foreground">CSV or PDF</p>
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes onb-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0;
		}
	}
	.onb-caret {
		animation: onb-blink 1s steps(1, end) infinite;
	}
	@media (prefers-reduced-motion: reduce) {
		.onb-caret {
			animation: none;
			opacity: 0;
		}
	}

	/* Matches the prompt bar's listening indicator (see +layout.svelte). */
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

	@media (prefers-reduced-motion: reduce) {
		.voice-bar {
			animation: none;
		}
	}
</style>
