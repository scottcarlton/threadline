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
	import { resolve } from '$app/paths';
	import { fade, fly, scale } from 'svelte/transition';
	import { cubicOut, backOut } from 'svelte/easing';
	import {
		statLabel,
		restoreStats,
		resumePhaseIndex,
		nextCursor,
		phaseStatus,
		canGoPrev,
		canGoNext,
		isSkippable,
		matchOrgType
	} from '$lib/components/onboarding/machine';
	import { parseCSV } from '$lib/utils/csv-parse';
	import {
		buildAccountPreviewFromCsv,
		downloadAccountCsvTemplate
	} from '$lib/components/accounts/account-import-helpers';
	import { downloadCsvTemplate } from '$lib/components/products/product-import-helpers';
	import { downloadOrderCsvTemplate } from '$lib/components/orders/order-import-helpers';
	import { downloadMemberCsvTemplate } from '$lib/components/onboarding/member-template';
	import {
		parseMembers,
		parseProducts,
		parseOrders,
		capRows,
		importedCount,
		type MemberDraft,
		type ProductDraft,
		type OrderRowDraft
	} from '$lib/components/onboarding/parse';
	import { startVoiceCapture, type VoiceCaptureHandle } from '$lib/utils/voice-capture';
	import IntegrationLogo from '$lib/components/integrations/IntegrationLogo.svelte';
	import MailProviderLogo from '$lib/components/settings/MailProviderLogo.svelte';

	let { data } = $props();

	type SubKind = 'text' | 'upload' | 'choice' | 'multi' | 'address' | 'connect' | 'inbox';
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
			title: 'Connections',
			subtitle: 'Connect your inbox and the tools you already use.',
			subs: [
				{
					// The mailbox is personal (email_connections is keyed on profile_id),
					// unlike every other step here, and it's where the work actually
					// arrives — so it comes before the org-level tools.
					id: 'inbox',
					question: 'Want to connect your email?',
					placeholder: 'You can connect this later',
					kind: 'inbox'
				},
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
							url: '/api/integrations/slack/connect',
							icon: 'slack'
						},
						{
							value: 'microsoft',
							label: 'Microsoft 365',
							description: 'Outlook email, Teams notifications, and Excel exports.',
							url: '/api/integrations/microsoft/connect',
							icon: 'microsoft'
						},
						{
							value: 'google_sheets',
							label: 'Google Sheets',
							description: 'Export orders, accounts, and reports to spreadsheets.',
							url: '/api/integrations/google-sheets/connect',
							icon: 'sheets'
						},
						{
							value: 'notion',
							label: 'Notion',
							description: 'Two-way sync for orders, brands, lookbooks, and docs.',
							url: '/api/integrations/notion/connect',
							icon: 'notion'
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
	// Pre-org answers live on the profile, since the org row doesn't exist during
	// General Information (see profiles.onboarding_draft).
	// svelte-ignore state_referenced_locally
	const draftSaved = (data.user?.onboarding_draft ?? null) as {
		name?: string;
		orgType?: 'brand' | 'rep' | 'retailer';
	} | null;

	// Which General Information question to resume at: the first one still
	// unanswered. Only meaningful before the org exists.
	//
	// Only the draft counts as an answer. display_name can't be used as a signal:
	// the signup trigger defaults it to the user's email, so it's never empty and
	// would skip the name question on a first visit.
	function resumeGeneralSub(): number {
		if (draftSaved?.orgType) return 2; // name + type done → org name
		if (draftSaved?.name) return 1; // name done → org type
		return 0;
	}

	// Resume. onboarding_state (JSONB) carries the exact cursor, which sub-steps
	// are done/skipped, and the import counts, so a refresh doesn't drop you back
	// to the top of a phase and re-run work you already finished. Falls back to
	// the phase-only onboarding_step for orgs written before that column existed.
	// svelte-ignore state_referenced_locally
	const saved = (data.organization?.onboarding_state ?? null) as {
		phase?: number;
		sub?: number;
		subStates?: Record<string, 'done' | 'skipped'>;
		stats?: { key?: string; n: string; label: string; note?: string }[];
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
			: data.organization
				? 0
				: resumeGeneralSub()
	);
	let draft = $state('');
	let completed = $state(false);
	let subStates = $state<Record<string, 'done' | 'skipped'>>({ ...(saved?.subStates ?? {}) });
	let stats = $state<{ key: string; n: string; label: string; note?: string; display: number }[]>(
		restoreStats(saved?.stats ?? [])
	);

	// General Information answers, restored from the profile draft above.
	// svelte-ignore state_referenced_locally
	let values = $state<{
		name: string;
		orgType: 'brand' | 'rep' | 'retailer' | null;
		orgName: string;
	}>({
		// Same caveat as resumeGeneralSub: display_name defaults to the email, so
		// only prefill from it when it's an actual name.
		name:
			draftSaved?.name ??
			(data.user?.display_name?.includes('@') ? '' : data.user?.display_name) ??
			'',
		orgType: draftSaved?.orgType ?? null,
		orgName: ''
	});

	// Persist a pre-org answer. Fire-and-forget: a failed save costs a retype,
	// never the flow.
	async function saveDraft(patch: { name?: string; orgType?: string }) {
		await fetch('/api/onboarding/draft', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch)
		}).catch(() => {});
	}
	let loading = $state(false);
	let errorMsg = $state('');

	// Completion
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

	// Entrance orchestration state.
	// `resuming` is decided once, at init: the org already exists, or a pre-org
	// answer was saved, or we've just come back from an OAuth round-trip.
	// Reading `data` once is the point — completing a step mid-session must not
	// retroactively flip this on and kill the typewriter.
	// svelte-ignore state_referenced_locally
	const resuming =
		Boolean(data.organization) ||
		Boolean(draftSaved?.name) ||
		(typeof window !== 'undefined' &&
			/[?&](email|outlook)_connected=true/.test(window.location.search));
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

	const phaseState = (i: number) => phaseStatus(i, { phaseIndex, subIndex }, completed);

	// Stat cards are driven by real import counts only — never placeholder numbers.
	// A skipped step still gets a card, at 0, with a note saying so.
	//
	// Keyed by step: skipping members then coming back and inviting 10 must leave
	// one card, not a "0 Skipped" sitting next to a "10 Invited" for the same step.
	function addStat(demo: { key: string; n: string; note?: string }) {
		const target = Number(demo.n);
		const rest = stats.filter((s) => s.key !== demo.key);
		const idx = rest.length;
		stats = [
			...rest,
			{
				key: demo.key,
				n: demo.n,
				label: statLabel(demo.key, target),
				note: demo.note,
				display: prefersReduced ? target : 0
			}
		];
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
		void runVerification();
	}

	// ── Verification sequence ─────────────────────────────────────────────
	// The closing beat: Stitch reads back what it actually did, one line at a
	// time, like tool calls resolving. Built from real state — a step that was
	// skipped gets a dash and says so, never a checkmark on nothing.
	type VerifyLine = { text: string; ok: boolean };

	const orgDisplayName = $derived(data.organization?.name ?? values.orgName ?? 'your');

	function statCount(key: string): number {
		const row = stats.find((s) => s.key === key);
		return row ? Number(row.n) || 0 : 0;
	}

	// Walks the real phase list rather than a hand-written set, so a step can't
	// be left out of the read-back (Settings originally was). General Information
	// is excluded — creating the org is the premise, not an outcome.
	const verifyLines = $derived.by((): VerifyLine[] => {
		const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
		const lines: VerifyLine[] = [];

		phases.forEach((p, pi) => {
			if (p.id === 'general') return;
			p.subs.forEach((sb, si) => {
				const state = subStates[cursorKey(pi, si)];
				const skipped = state !== 'done';

				switch (sb.id) {
					case 'members': {
						const n = statCount('members');
						lines.push(
							n > 0
								? { text: `Invited ${n} ${plural(n, 'person', 'people')} to your team`, ok: true }
								: { text: 'No team invited — skipped for now', ok: false }
						);
						break;
					}
					case 'accounts': {
						const n = statCount('accounts');
						lines.push(
							n > 0
								? { text: `Imported ${n} ${plural(n, 'account', 'accounts')}`, ok: true }
								: { text: 'No accounts imported — skipped for now', ok: false }
						);
						break;
					}
					case 'products': {
						const n = statCount('products');
						lines.push(
							n > 0
								? { text: `${n} ${plural(n, 'product', 'products')} added`, ok: true }
								: { text: 'No products added — skipped for now', ok: false }
						);
						break;
					}
					case 'orders': {
						const n = statCount('orders');
						lines.push(
							n > 0
								? { text: `Imported ${n} ${plural(n, 'order', 'orders')}`, ok: true }
								: { text: 'No orders imported — skipped for now', ok: false }
						);
						break;
					}
					case 'address':
						lines.push(
							skipped
								? { text: 'Business address — skipped for now', ok: false }
								: { text: 'Business address saved', ok: true }
						);
						break;
					case 'payment-terms':
						lines.push(
							skipped
								? { text: 'Payment terms — skipped for now', ok: false }
								: { text: 'Payment terms set', ok: true }
						);
						break;
					case 'payment-methods':
						lines.push(
							skipped
								? { text: 'Payment methods — skipped for now', ok: false }
								: { text: 'Payment methods set', ok: true }
						);
						break;
					case 'inbox':
						lines.push(
							data.mailbox
								? {
										text: `${data.mailbox.provider === 'outlook' ? 'Outlook' : 'Gmail'} connected`,
										ok: true
									}
								: { text: 'Email — skipped for now', ok: false }
						);
						break;
					case 'connect':
						lines.push(
							startedConnections.length > 0
								? { text: `Integrations — ${startedConnections.length} connected`, ok: true }
								: { text: 'Integrations — skipped for now', ok: false }
						);
						break;
					default:
						lines.push(
							skipped
								? { text: `${sb.id} — skipped for now`, ok: false }
								: { text: `${sb.id} saved`, ok: true }
						);
				}
			});
		});

		lines.push({ text: 'Done', ok: true });
		return lines;
	});

	// Resolved once so the markup binds a plain value — the navigation lint rule
	// wants resolve() at the definition, not wrapped in a template literal.
	const MAILBOX_OPTIONS = [
		{
			provider: 'gmail' as const,
			label: 'Gmail',
			href: `${resolve('/api/email/connect')}?return=%2Fonboarding`
		},
		{
			provider: 'outlook' as const,
			label: 'Outlook',
			href: `${resolve('/api/email-outlook/connect')}?return=%2Fonboarding`
		}
	];

	let revealedLines = $state(0);
	let settledLines = $state(0);

	const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

	// Reveal each line, let it spin briefly, resolve it, then move on — the
	// cadence is what sells it as work rather than a summary.
	async function runVerification() {
		const total = verifyLines.length;
		for (let i = 0; i < total; i++) {
			revealedLines = i + 1;
			await wait(prefersReduced ? 0 : 420);
			settledLines = i + 1;
			await wait(prefersReduced ? 0 : 160);
		}
		await wait(prefersReduced ? 0 : 700);
		goToApp();
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

	// Skipping still leaves a trace: a 0 card noting it was skipped, so the rail
	// reflects every import step rather than silently omitting the ones passed on.
	// Steps whose schema has an explicit 'skip' value. Recording the skip is what
	// stops the app asking the same question again after preflight; a purely
	// local skip left `payments` unresolved forever.
	const SKIP_SAVES_STEP = new Set(['payment-terms', 'payment-methods']);

	const skip = () => {
		if (statLabel(sub.id, 0)) addStat({ key: sub.id, n: '0', note: 'Skipped for now' });
		if (SKIP_SAVES_STEP.has(sub.id)) void saveSetupStep(sub.id, 'skip');
		complete('skipped');
	};
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
					stats: stats.map((s) => ({ key: s.key, n: s.n, label: s.label, note: s.note }))
				}
			})
		}).catch(() => {});
	}

	function chooseOrgType(value: 'brand' | 'rep' | 'retailer') {
		values.orgType = value;
		errorMsg = '';
		void saveDraft({ orgType: value });
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
				void saveDraft({ name: values.name });
				draft = '';
				advanceGlobal();
			} else if (sub.id === 'orgType') {
				// The cards are one way to answer; typing it is the other. The prompt
				// is always on screen, so it has to work.
				const matched = matchOrgType(draft);
				if (!matched) {
					errorMsg = 'Tell me brand, sales rep, or retailer — or pick one above.';
					return;
				}
				draft = '';
				chooseOrgType(matched);
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
			addStat({ key: 'members', n: '1' });
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

	// Dragging across a child fires dragleave on the panel; ignore those or the
	// highlight flickers the whole time the cursor is inside.
	function onDragLeave(e: DragEvent) {
		const to = e.relatedTarget as Node | null;
		if (to && (e.currentTarget as HTMLElement).contains(to)) return;
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
	// primary/secondary is the shared shape (accounts, products, orders). Members
	// use the richer layout: name + role on one line, email beneath, and a
	// centered stat on the right.
	type IngestRow = {
		primary: string;
		secondary: string;
		detail?: string;
		inline?: string;
		metaValue?: string;
		metaLabel?: string;
	};

	let ingestState = $state<'idle' | 'reading' | 'preview' | 'committing'>('idle');
	let ingestFileName = $state('');
	let ingestRows = $state<IngestRow[]>([]);
	let ingestNoun = $state('');
	// Rows beyond MAX_IMPORT_ROWS, surfaced in the preview instead of vanishing.
	let droppedRows = $state(0);

	let memberDrafts: MemberDraft[] = [];
	let accountDrafts: Record<string, unknown>[] = [];
	let productDrafts: ProductDraft[] = [];
	let orderDrafts: OrderRowDraft[] = [];

	function resetIngest() {
		ingestState = 'idle';
		droppedRows = 0;
		ingestFileName = '';
		ingestRows = [];
		memberDrafts = [];
		accountDrafts = [];
		productDrafts = [];
		orderDrafts = [];
	}

	// Hand the user a correctly-shaped CSV for whichever import they're on.
	// Accounts/products/orders reuse the same templates their real import flows
	// ship; members has no flow outside preflight, so it has its own.
	function downloadTemplate(subId: string) {
		if (subId === 'members') return downloadMemberCsvTemplate();
		if (subId === 'accounts') return downloadAccountCsvTemplate();
		if (subId === 'products') return downloadCsvTemplate();
		if (subId === 'orders') return downloadOrderCsvTemplate();
	}

	// TODO: behavior not decided yet — the button is intentionally inert for now.
	function startManualEntry() {}

	const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

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

		// Spreadsheet formats are archives, not text. Reading one yields binary
		// noise that parses to zero rows, so without this the user gets "I
		// couldn't find any email addresses" for a file full of email addresses.
		const lowerName = file.name.toLowerCase();
		const binaryExt = ['.numbers', '.xlsx', '.xls', '.ods', '.pages', '.key', '.docx', '.doc'];
		const badExt = binaryExt.find((ext) => lowerName.endsWith(ext));
		if (badExt) {
			resetIngest();
			errorMsg = `I can't read ${badExt} files. Export it as CSV and drop it again.`;
			return;
		}

		// A short scanning beat so the read is legible rather than a flash.
		const readAt = performance.now();
		let text: string;
		try {
			text = await file.text();
		} catch {
			resetIngest();
			errorMsg = "I couldn't read that file.";
			return;
		}

		// Catch the same problem from an unfamiliar extension: NUL bytes and
		// replacement chars mean it wasn't text to begin with.
		const head = text.slice(0, 4096);
		if (head.includes('\u0000') || head.includes('\uFFFD')) {
			resetIngest();
			errorMsg = "That file isn't plain text. Export it as CSV and drop it again.";
			return;
		}
		const elapsed = performance.now() - readAt;
		if (!prefersReduced && elapsed < 700) {
			await new Promise((r) => setTimeout(r, 700 - elapsed));
		}

		const { headers, rows } = parseCSV(text);

		if (sub.id === 'members') {
			// Capped: this step sends real email, so an oversized CSV is a mailing
			// accident. Say what was dropped rather than truncating silently.
			const capped = capRows(parseMembers(headers, rows));
			memberDrafts = capped.rows;
			droppedRows = capped.dropped;
			if (memberDrafts.length === 0) {
				resetIngest();
				errorMsg =
					"I couldn't find any email addresses in that file. A CSV with an Email column works best.";
				return;
			}
			ingestNoun = memberDrafts.length === 1 ? 'person' : 'people';
			ingestRows = memberDrafts.map((m) => ({
				primary: m.name || m.email,
				// Role sits beside the name, email beneath it. When there's no name the
				// email is already the primary line, so it isn't repeated.
				inline: roleLabel(m.role),
				detail: m.name ? m.email : '',
				metaValue: m.commissionRate ? `${m.commissionRate}%` : '',
				metaLabel: m.commissionRate ? 'Commission' : '',
				secondary: ''
			}));
			ingestState = 'preview';
			return;
		}

		if (sub.id === 'accounts') {
			const { previewRows } = buildAccountPreviewFromCsv(headers, rows);
			const cappedAccounts = capRows(
				previewRows.filter(
					(r) =>
						typeof r.business_name === 'string' && (r.business_name as string).trim().length > 0
				)
			);
			accountDrafts = cappedAccounts.rows;
			droppedRows = cappedAccounts.dropped;
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
			const cappedproductDrafts = capRows(parseProducts(headers, rows));
			productDrafts = cappedproductDrafts.rows;
			droppedRows = cappedproductDrafts.dropped;
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
			const cappedorderDrafts = capRows(parseOrders(headers, rows));
			orderDrafts = cappedorderDrafts.rows;
			droppedRows = cappedorderDrafts.dropped;
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
				addStat({ key: 'members', n: String(sent) });
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
				const created = importedCount('accounts', result);
				addStat({ key: 'accounts', n: String(created) });
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
				const created = importedCount('products', result);
				addStat({ key: 'products', n: String(created) });
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
				const created = importedCount('orders', result);
				if (created === 0) {
					ingestState = 'preview';
					errorMsg =
						'None of those rows matched an account and product — bring those in first, then try again.';
					return;
				}
				addStat({ key: 'orders', n: String(created) });
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

		// The entrance is a first-impression, not a page load animation. Anyone
		// coming back — a refresh, or the full-page round-trip out to Google or
		// Microsoft to connect a mailbox — should land where they left off rather
		// than watch the greeting type itself out again.
		if (prefersReduced || resuming) {
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

	let skipNextTypewriter = resuming;

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
		// First question after a resume lands already typed; the rest still type.
		if (reduced || skipNextTypewriter) {
			skipNextTypewriter = false;
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

<!--
	The links below point at OAuth start endpoints (/api/email/connect,
	/api/integrations/*), not app routes. They carry query strings or come from
	step data, so resolve() can't wrap them at the call site.
-->
<!-- eslint-disable svelte/no-navigation-without-resolve -->

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
	<div class="mx-auto max-w-2xl px-6 pt-20 pb-8 lg:pt-24">
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
					{#each phases as phaseBar, i (phaseBar.id)}
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
				<!-- Verification: Stitch works the list, one line at a time, then hands
				     over on its own. No button — the flow shouldn't end on a form action. -->
				<div
					class="mb-4 rounded-2xl bg-zinc-900 p-6 text-zinc-100 shadow-2xl ring-1 ring-white/10"
					in:fade={{ duration: revealMs }}
				>
					<p class="text-base text-zinc-50">
						Wait while I verify your <span class="font-medium">{orgDisplayName}</span> organization
					</p>

					<ul class="mt-4 space-y-2">
						{#each verifyLines.slice(0, revealedLines) as line, i (line.text)}
							<li
								class="flex items-center gap-2.5 text-sm text-zinc-300"
								in:fly={{
									y: prefersReduced ? 0 : 6,
									duration: prefersReduced ? 0 : 220,
									easing: cubicOut
								}}
							>
								{#if i >= settledLines}
									<span
										class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-300"
									></span>
								{:else if line.ok}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4 shrink-0 text-zinc-400"
										aria-hidden="true"
										in:scale={{
											start: prefersReduced ? 1 : 0.6,
											duration: prefersReduced ? 0 : 200,
											easing: backOut
										}}
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M4.5 12.75l6 6 9-13.5"
										/>
									</svg>
								{:else}
									<svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										class="h-4 w-4 shrink-0 text-zinc-600"
										aria-hidden="true"
									>
										<path stroke-linecap="round" d="M5 12h14" />
									</svg>
								{/if}
								<span class={i >= settledLines ? 'text-zinc-500' : ''}>{line.text}</span>
							</li>
						{/each}
					</ul>
				</div>
			{:else if showConversation}
				<!-- Collapsed, the panel shrinks to its header and tucks in behind the
				     prompt bar, which sits above it (z-10). -->
				<!-- Collapsed, the whole panel is the hit area to expand again — the
				     header row alone is too small a target. Guarded on panelCollapsed so
				     clicks inside the expanded body do nothing. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					use:openPanel
					style="opacity: 0"
					onclick={() => {
						if (panelCollapsed) panelCollapsed = false;
					}}
					class="rounded-2xl bg-zinc-900 text-zinc-100 shadow-2xl ring-1 ring-white/10 transition-all duration-300 ease-out {panelCollapsed
						? 'mx-5 -mb-7 cursor-pointer px-5 pt-4 pb-8'
						: 'mb-2 p-5'}"
				>
					<div class="flex items-center justify-between">
						<span class="flex items-center gap-2 font-mono text-xs text-zinc-500">
							{phase.title}
						</span>
						<div class="flex items-center gap-1.5 font-mono text-xs text-zinc-400">
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
						<!-- The four import steps all render the same drop zone, so the body
						     holds a floor height across them. Without it the panel collapses
						     to the question while the next one types, then springs back —
						     a bounce on every advance. Not applied when collapsed, which
						     needs to reach zero height. -->
						<div
							class="overflow-hidden {sub.kind === 'upload' && !panelCollapsed
								? 'min-h-[222px]'
								: ''}"
						>
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

							{#if sub.kind === 'inbox' && inputRevealed}
								<div in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}>
									{#if data.mailbox}
										<div
											class="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4"
										>
											<span class="flex h-8 w-8 shrink-0 items-center justify-center">
												<MailProviderLogo
													provider={data.mailbox.provider === 'outlook' ? 'outlook' : 'gmail'}
													cls="h-6 w-6"
												/>
											</span>
											<span class="min-w-0">
												<span class="block text-base font-medium text-zinc-100">
													{data.mailbox.provider === 'outlook' ? 'Outlook' : 'Gmail'} connected
												</span>
												<span class="block truncate text-sm text-zinc-400"
													>{data.mailbox.email_address}</span
												>
											</span>
										</div>
									{:else}
										<div class="grid gap-2 sm:grid-cols-2">
											{#each MAILBOX_OPTIONS as opt (opt.provider)}
												<a
													href={opt.href}
													class="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
												>
													<span class="flex h-8 w-8 shrink-0 items-center justify-center">
														<MailProviderLogo
															provider={opt.provider as 'gmail' | 'outlook'}
															cls="h-6 w-6"
														/>
													</span>
													<span class="text-base font-medium text-zinc-100">{opt.label}</span>
												</a>
											{/each}
										</div>
										<p class="mt-2 text-sm text-zinc-500">
											Read and reply to emails in Threadline.
										</p>
									{/if}
								</div>
							{/if}

							{#if sub.kind === 'connect' && inputRevealed}
								<div in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}>
									<div class="grid gap-2 sm:grid-cols-2">
										{#each sub.options ?? [] as opt (opt.value)}
											<a
												href={opt.url}
												target="_blank"
												rel="noopener noreferrer"
												onclick={() => (startedConnections = [...startedConnections, opt.value])}
												class="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-800/40 p-4 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
											>
												<span class="flex h-8 w-8 shrink-0 items-center justify-center">
													<IntegrationLogo name={opt.icon} cls="h-6 w-6" />
												</span>
												<span class="min-w-0">
													<span class="flex items-baseline gap-2">
														<span class="text-base font-medium text-zinc-100">{opt.label}</span>
														<span class="text-sm text-zinc-500">
															{startedConnections.includes(opt.value) ? 'Opened' : 'Connect'}
														</span>
													</span>
													{#if opt.description}
														<span class="mt-0.5 block text-sm text-zinc-400">{opt.description}</span
														>
													{/if}
												</span>
											</a>
										{/each}
									</div>
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
										{#if droppedRows}
											<p class="mt-1 text-sm text-zinc-400">
												That's the first {ingestRows.length} — {droppedRows} more didn't make this round.
												Split the file to bring in the rest.
											</p>
										{/if}
										<ul
											class="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl bg-zinc-800/50"
										>
											{#each ingestRows.slice(0, 4) as row, i (row.primary + i)}
												<li class="flex items-center gap-3 px-4 py-2.5">
													<span class="min-w-0 flex-1">
														<span class="block truncate text-sm font-medium text-zinc-100">
															{row.primary}{#if row.inline}<span class="font-normal text-zinc-400"
																	>&nbsp;- {row.inline}</span
																>{/if}
														</span>
														{#if row.detail}
															<span class="block truncate text-sm text-zinc-400">{row.detail}</span>
														{/if}
													</span>
													{#if row.metaValue}
														<span class="shrink-0 text-right">
															<span class="block text-xs text-zinc-100">{row.metaValue}</span>
															<span class="block text-xs text-zinc-400">{row.metaLabel}</span>
														</span>
													{:else if row.secondary}
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
												class="rounded-lg px-3 py-2 text-xs text-zinc-400 transition-colors hover:text-zinc-100 disabled:opacity-60"
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
									class="mt-4 flex items-center justify-between gap-3"
									in:fly={{ y: prefersReduced ? 0 : 8, duration: revealMs, easing: cubicOut }}
								>
									<div class="flex items-center gap-3">
										<!-- Primary action on the left, Skip on the right — same as the
										     import steps' "Send invites" / "Import them". -->
										{#if sub.kind === 'multi'}
											<button
												onclick={submitMethods}
												disabled={selectedMethods.length === 0 || loading}
												class="rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-40"
											>
												{loading ? 'Saving…' : 'Save'}
											</button>
										{:else if sub.kind === 'inbox' && data.mailbox}
											<button
												onclick={() => complete('done')}
												class="rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
											>
												Continue
											</button>
										{:else if sub.kind === 'connect'}
											<button
												onclick={() => complete('done')}
												class="rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
											>
												{startedConnections.length ? 'Done connecting' : 'Finish setup'}
											</button>
										{:else if sub.kind === 'address'}
											<button
												onclick={submitAddress}
												disabled={!addressComplete || loading}
												class="rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-40"
											>
												{loading ? 'Saving…' : 'Save'}
											</button>
										{/if}
										{#if sub.id === 'members' || sub.id === 'accounts' || sub.id === 'products'}
											<button
												onclick={startManualEntry}
												class="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 active:scale-95"
											>
												Manual Entry
											</button>
											<button
												onclick={() => downloadTemplate(sub.id)}
												class="group inline-flex items-center gap-1.5 text-xs text-zinc-400 transition-colors duration-200 ease-out hover:text-zinc-200"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													viewBox="0 0 24 24"
													fill="currentColor"
													class="h-3.5 w-3.5"
													aria-hidden="true"
												>
													<path
														d="M3 19H21V21H3V19ZM13 13.1716L19.0711 7.1005L20.4853 8.51472L12 17L3.51472 8.51472L4.92893 7.1005L11 13.1716V2H13V13.1716Z"
													/>
												</svg>
												<span
													class="underline decoration-transparent decoration-dotted underline-offset-4 transition-[text-decoration-color] duration-200 ease-out group-hover:decoration-current"
													>Download Template</span
												>
											</button>
										{/if}
									</div>
									<button
										onclick={skip}
										class="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-700 active:scale-95"
									>
										Skip for now
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<!-- AI prompt (input bar): springs up first, persists as the anchor -->
			{#if showPrompt}
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
							{#each stats as s (s.key)}
								<div
									class="flex items-center gap-3 rounded-xl bg-muted px-4 py-3"
									in:fly={{
										y: prefersReduced ? 0 : 12,
										duration: prefersReduced ? 0 : 420,
										easing: cubicOut
									}}
								>
									<span class="w-7 shrink-0 text-xl font-semibold tabular-nums">{s.display}</span>
									<div class="min-w-0">
										<p class="text-sm text-foreground">{s.label}</p>
										{#if s.note}
											<p class="text-xs text-muted-foreground">{s.note}</p>
										{/if}
									</div>
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
							class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline decoration-transparent decoration-dotted underline-offset-4 transition-[text-decoration-color] duration-200 ease-out hover:decoration-current"
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
