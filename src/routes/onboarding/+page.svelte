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

	let { data } = $props();

	type SubKind = 'text' | 'upload' | 'choice';
	interface OrgOption {
		value: 'brand' | 'rep' | 'retailer';
		label: string;
		description: string;
	}
	interface SubStep {
		id: string;
		question: string;
		placeholder: string;
		required?: boolean;
		kind: SubKind;
		dropTitle?: string;
		dropHint?: string;
		options?: OrgOption[];
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
								'I manage my product catalog, track orders across all sales channels, and work with reps.'
						},
						{
							value: 'rep',
							label: 'Independent Sales Rep',
							description:
								'I represent multiple brands and manage accounts, orders, and commissions.'
						},
						{
							value: 'retailer',
							label: 'Retailer',
							description:
								'I buy wholesale from brands and want my orders and account details in one place.'
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
					kind: 'text'
				},
				{
					id: 'terms',
					question: 'What payment terms do you offer by default?',
					placeholder: 'e.g. Net 30',
					kind: 'text'
				}
			]
		},
		{
			id: 'integrations',
			title: 'Integrations',
			subtitle: 'Connect external resources for your organization.',
			subs: [
				{
					id: 'accounting',
					question: 'Want to connect your accounting? I can sync orders to QuickBooks.',
					placeholder: 'Search integrations…',
					kind: 'text'
				},
				{
					id: 'email',
					question: 'Connect your email and calendar to keep everything in one place.',
					placeholder: 'Search integrations…',
					kind: 'text'
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
	// svelte-ignore state_referenced_locally
	let phaseIndex = $state(resumePhaseIndex(data.organization?.onboarding_step, phases.length));
	let subIndex = $state(0);
	let draft = $state('');
	let completed = $state(false);
	let subStates = $state<Record<string, 'done' | 'skipped'>>({});
	let stats = $state<{ n: string; label: string; display: number }[]>([]);

	// General Information answers — held in memory until create-org. Not resumable
	// pre-org by design (plan §0 decision 2).
	let values = $state<{
		name: string;
		orgType: 'brand' | 'rep' | 'retailer' | null;
		orgName: string;
	}>({ name: '', orgType: null, orgName: '' });
	let loading = $state(false);
	let errorMsg = $state('');

	// File upload (dock-native: + button, dropzone click, drag-and-drop)
	let fileInput = $state<HTMLInputElement>();
	let dragActive = $state(false);

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
		const { cursor, completed: done } = nextCursor({ phaseIndex, subIndex }, phases);
		phaseIndex = cursor.phaseIndex;
		subIndex = cursor.subIndex;
		if (done) completed = true;
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
		await fetch('/api/onboarding/progress', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ onboardingStep: phaseIndex + 1 })
		}).catch(() => {});
	}

	function chooseOrgType(value: 'brand' | 'rep' | 'retailer') {
		values.orgType = value;
		errorMsg = '';
		advanceGlobal();
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
			advanceGlobal();
			await persistCursor();
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
		complete('done');
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
			<div
				class="flex h-12 w-12 items-center justify-center rounded-[2px] bg-foreground text-background"
			>
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
					<p class="text-base font-medium text-zinc-50">You're all set.</p>
					<p class="mt-1 text-sm text-zinc-400">
						This is a P0 mock — completion redirect and persistence land in later phases.
					</p>
				</div>
			{:else if showConversation}
				<div
					use:openPanel
					style="opacity: 0"
					class="mb-4 rounded-2xl bg-zinc-900 p-5 text-zinc-100 shadow-2xl ring-1 ring-white/10"
				>
					<div class="flex items-center justify-between">
						<span class="font-mono text-sm text-zinc-500">{phase.title}</span>
						<div class="flex items-center gap-1.5 font-mono text-sm text-zinc-400">
							<button
								onclick={prevSub}
								disabled={!canPrev}
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
						</div>
					</div>

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
									onclick={() => chooseOrgType(opt.value)}
									class="w-full rounded-xl border bg-zinc-800/40 p-4 text-left transition-colors hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.99] {values.orgType ===
									opt.value
										? 'border-zinc-200'
										: 'border-zinc-700'}"
								>
									<p class="text-base font-medium text-zinc-100">{opt.label}</p>
									<p class="mt-0.5 text-sm text-zinc-400">{opt.description}</p>
								</button>
							{/each}
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
								<ul class="mt-2 divide-y divide-white/5 overflow-hidden rounded-xl bg-zinc-800/50">
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
			{/if}

			<!-- AI prompt (input bar): springs up first, persists as the anchor -->
			{#if showPrompt}
				<div
					use:springUp={56}
					style="opacity: 0"
					class="rounded-2xl bg-zinc-900 p-3 shadow-2xl ring-1 ring-white/10"
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
							<!-- Voice idle (P0: visual only) -->
							<button
								class="flex h-9 w-9 items-center justify-center rounded-full bg-white text-zinc-900 transition-colors hover:bg-zinc-200 active:scale-95"
								aria-label="Voice input"
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
			{/if}

			<!-- Right rail: stat cards + human handoff, anchored to the dock's right edge.
			     xl+ only so it never overflows narrower desktops (desktop-first). -->
			<aside class="fixed right-10 bottom-6 hidden w-56 xl:block">
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
						href="/onboarding"
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
</style>
