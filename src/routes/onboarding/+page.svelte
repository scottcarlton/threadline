<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { supabase } from '$lib/supabase.js';

	let { data } = $props();
	const existingOrg = $derived(data.organization);

	// For Google OAuth users, pre-fill name from auth metadata
	let authUserMeta: Record<string, any> = {};

	async function loadAuthMeta() {
		const { data: authData } = await supabase.auth.getUser();
		if (authData?.user?.user_metadata) {
			authUserMeta = authData.user.user_metadata;
			if (!nameInitialized) {
				const fullName = authUserMeta.full_name ?? authUserMeta.name ?? '';
				if (fullName) {
					const parts = fullName.split(' ');
					firstName = parts[0] ?? '';
					lastName = parts.slice(1).join(' ') ?? '';
					nameInitialized = true;
				}
			}
		}
	}

	// Also pre-fill from existing profile display_name
	const prefillName = $derived(data.user?.display_name ?? '');

	let step = $state(1);
	let firstName = $state('');
	let lastName = $state('');
	let orgName = $state('');
	let orgType = $state<'rep' | 'brand' | null>(null);
	let brandName = $state('');
	let brandEmail = $state('');
	let inviteEmail = $state('');
	let inviteRole = $state<'admin' | 'member' | 'guest'>('member');
	let loading = $state(false);
	let error = $state('');

	// Welcome carousel state
	let carouselIndex = $state(0);

	// Import state
	let brandImportMode = $state(false);
	let brandPasteText = $state('');
	let parsedBrands = $state<
		{
			name: string;
			email: string;
			first_name: string;
			last_name: string;
			phone: string;
			website: string;
		}[]
	>([]);
	let brandFileInput: HTMLInputElement | undefined = $state();

	let memberImportMode = $state(false);
	let memberPasteText = $state('');
	let parsedMembers = $state<{ email: string; role: string }[]>([]);
	let memberFileInput: HTMLInputElement | undefined = $state();

	// CSV/TSV parser
	function parseCSV(
		text: string,
		columnMap: Record<string, string>,
		defaults: Record<string, string> = {}
	): Record<string, string>[] {
		const lines = text
			.trim()
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		if (lines.length === 0) return [];

		// Detect delimiter
		const firstLine = lines[0];
		const delimiter = firstLine.includes('\t') ? '\t' : ',';

		// Check if first row is headers
		const firstCells = firstLine
			.split(delimiter)
			.map((c) => c.trim().toLowerCase().replace(/['"]/g, ''));
		const knownColumns = Object.keys(columnMap);
		const hasHeaders = firstCells.some((c) => knownColumns.includes(c));

		let headers: string[];
		let dataStart: number;

		if (hasHeaders) {
			headers = firstCells;
			dataStart = 1;
		} else {
			// Assume columns in order of columnMap keys
			headers = knownColumns.slice(0, firstCells.length);
			dataStart = 0;
		}

		const rows: Record<string, string>[] = [];
		for (let i = dataStart; i < lines.length; i++) {
			const cells = lines[i].split(delimiter).map((c) => c.trim().replace(/^['"]|['"]$/g, ''));
			const row: Record<string, string> = { ...defaults };
			for (let j = 0; j < headers.length; j++) {
				const mapped = columnMap[headers[j]] ?? headers[j];
				if (cells[j]) row[mapped] = cells[j];
			}
			rows.push(row);
		}
		return rows;
	}

	const brandColumnMap: Record<string, string> = {
		name: 'name',
		brand: 'name',
		'brand name': 'name',
		brand_name: 'name',
		email: 'email',
		contact_email: 'email',
		'contact email': 'email',
		first_name: 'first_name',
		'first name': 'first_name',
		firstname: 'first_name',
		last_name: 'last_name',
		'last name': 'last_name',
		lastname: 'last_name',
		phone: 'phone',
		contact_phone: 'phone',
		'contact phone': 'phone',
		website: 'website',
		url: 'website',
		site: 'website'
	};

	const memberColumnMap: Record<string, string> = {
		email: 'email',
		'email address': 'email',
		email_address: 'email',
		role: 'role',
		'member role': 'role'
	};

	function parseBrandInput(text: string) {
		const rows = parseCSV(text, brandColumnMap);
		parsedBrands = rows
			.filter((r) => r.name?.trim())
			.map((r) => ({
				name: r.name?.trim() ?? '',
				email: r.email?.trim() ?? '',
				first_name: r.first_name?.trim() ?? '',
				last_name: r.last_name?.trim() ?? '',
				phone: r.phone?.trim() ?? '',
				website: r.website?.trim() ?? ''
			}));
	}

	function parseMemberInput(text: string) {
		const rows = parseCSV(text, memberColumnMap, { role: 'member' });
		const validRoles = ['admin', 'member', 'sales', 'guest'];
		parsedMembers = rows
			.filter((r) => r.email?.trim() && r.email.includes('@'))
			.map((r) => ({
				email: r.email.trim(),
				role: validRoles.includes(r.role?.toLowerCase()) ? r.role.toLowerCase() : 'member'
			}));
	}

	function handleBrandFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			brandPasteText = text;
			parseBrandInput(text);
		};
		reader.readAsText(file);
	}

	function handleMemberFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const text = reader.result as string;
			memberPasteText = text;
			parseMemberInput(text);
		};
		reader.readAsText(file);
	}

	function removeParsedBrand(index: number) {
		parsedBrands = parsedBrands.filter((_, i) => i !== index);
	}

	function removeParsedMember(index: number) {
		parsedMembers = parsedMembers.filter((_, i) => i !== index);
	}

	async function importBrands() {
		if (!orgId || parsedBrands.length === 0) return;
		loading = true;
		error = '';

		const rows = parsedBrands.map((b) => ({
			organization_id: orgId,
			name: b.name,
			contact_email: b.email || null,
			contact_first_name: b.first_name || null,
			contact_last_name: b.last_name || null,
			contact_phone: b.phone || null,
			website: b.website || null,
			is_active: true
		}));

		const { error: err } = await supabase.from('brands').insert(rows);
		loading = false;
		if (err) {
			error = err.message;
			return;
		}
		step = 5;
	}

	async function importMembers() {
		if (parsedMembers.length === 0) return;
		loading = true;
		error = '';

		let failed = 0;
		for (const member of parsedMembers) {
			const res = await fetch('/api/invite/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: member.email, role: member.role, brandIds: [] })
			});
			if (!res.ok) failed++;
		}

		loading = false;
		if (failed > 0) {
			error = `${failed} of ${parsedMembers.length} invitations failed to send.`;
		}
		step = welcomeStep;
	}

	const displayName = $derived(`${firstName.trim()} ${lastName.trim()}`.trim());

	// Track org created during onboarding
	let createdOrgId = $state<string | null>(null);
	const orgId = $derived(existingOrg?.id ?? createdOrgId);

	let nameInitialized = false;
	let orgNameInitialized = false;

	// Load auth metadata on mount (for Google OAuth name pre-fill)
	$effect(() => {
		loadAuthMeta();
	});

	$effect(() => {
		if (prefillName && !nameInitialized && !prefillName.includes('@')) {
			const parts = prefillName.split(' ');
			firstName = parts[0] ?? '';
			lastName = parts.slice(1).join(' ') ?? '';
			nameInitialized = true;
		}
	});

	$effect(() => {
		if (existingOrg?.name && !orgNameInitialized) {
			orgName = existingOrg.name;
			orgNameInitialized = true;
		}
	});

	// If user already has an org (e.g. from old signup flow), skip to step that makes sense
	$effect(() => {
		if (existingOrg && step === 1) {
			if (data.user?.display_name) {
				step = 2;
			}
		}
	});

	// Total steps for the indicator (brand skips step 4)
	const effectiveOrgType = $derived(orgType ?? 'rep');
	const stepLabels = $derived(
		effectiveOrgType === 'brand'
			? [
					{ number: 1, label: 'Your Name' },
					{ number: 2, label: 'Your Business' },
					{ number: 3, label: 'Business Type' },
					{ number: 4, label: 'Invite Members' },
					{ number: 5, label: 'Get Started' }
				]
			: [
					{ number: 1, label: 'Your Name' },
					{ number: 2, label: 'Your Business' },
					{ number: 3, label: 'Business Type' },
					{ number: 4, label: 'First Brand' },
					{ number: 5, label: 'Invite Members' },
					{ number: 6, label: 'Get Started' }
				]
	);

	const totalSteps = $derived(stepLabels.length);

	// Welcome carousel slides
	const repSlides = [
		{
			title: 'Manage all your brands in one place',
			description: 'Track orders, commissions, and accounts across every brand you represent.',
			icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10'
		},
		{
			title: 'AI-powered insights',
			description:
				'Ask questions in plain English. Get instant answers about revenue, commissions, and account health.',
			icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z'
		},
		{
			title: 'Connect with brands',
			description:
				"Link your Threadline to a brand's for shared order visibility and authoritative pricing.",
			icon: 'M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.182-9.182a4.5 4.5 0 00-6.364 6.364l4.5 4.5a4.5 4.5 0 006.364-6.364l-1.757-1.757'
		}
	];

	const brandSlides = [
		{
			title: 'Your product catalog, centralized',
			description: 'Manage your full product line with variants, pricing, and images in one place.',
			icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z'
		},
		{
			title: 'See orders from every channel',
			description:
				'Connected reps auto-share orders. Internal team members enter theirs directly. One unified view.',
			icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'
		},
		{
			title: 'AI that knows your business',
			description:
				'Ask about top accounts, rep performance, product trends — get answers instantly.',
			icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z'
		}
	];

	const slides = $derived(effectiveOrgType === 'brand' ? brandSlides : repSlides);

	async function saveName() {
		if (!firstName.trim() || !lastName.trim()) return;
		loading = true;
		error = '';

		if (existingOrg) {
			const { error: err } = await supabase
				.from('profiles')
				.update({ display_name: displayName })
				.eq('id', data.user.id);

			loading = false;
			if (err) {
				error = err.message;
				return;
			}
			step = 2;
			return;
		}

		loading = false;
		step = 2;
	}

	async function saveOrg() {
		if (!orgName.trim()) return;
		loading = true;
		error = '';

		if (existingOrg) {
			const { error: err } = await supabase
				.from('organizations')
				.update({ name: orgName.trim() })
				.eq('id', existingOrg.id);

			loading = false;
			if (err) {
				error = err.message;
				return;
			}
			step = 3;
			return;
		}

		loading = false;
		step = 3;
	}

	async function saveOrgType() {
		if (!orgType) return;
		loading = true;
		error = '';

		if (!existingOrg) {
			const res = await fetch('/api/onboarding/create-org', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					orgName: orgName.trim(),
					displayName: displayName,
					orgType
				})
			});

			loading = false;

			if (!res.ok) {
				const body = await res.json();
				error = body.error || 'Failed to create organization';
				return;
			}

			const { organization } = await res.json();
			createdOrgId = organization.id;
		} else {
			const { error: err } = await supabase
				.from('organizations')
				.update({ org_type: orgType })
				.eq('id', existingOrg.id);

			loading = false;
			if (err) {
				error = err.message;
				return;
			}
		}

		// Brand orgs skip the "first brand" step (self-brand auto-created by trigger)
		step = effectiveOrgType === 'brand' ? 5 : 4;
	}

	async function saveBrand() {
		if (!brandName.trim()) {
			step = 5;
			return;
		}
		if (!orgId) {
			error = 'Organization not found. Please go back.';
			return;
		}
		loading = true;
		error = '';

		const { error: err } = await supabase.from('brands').insert({
			organization_id: orgId,
			name: brandName.trim(),
			contact_email: brandEmail.trim() || null,
			is_active: true
		});

		loading = false;
		if (err) {
			error = err.message;
			return;
		}
		step = 5;
	}

	// Invite step number depends on org type
	const inviteStep = $derived(effectiveOrgType === 'brand' ? 4 : 5);
	const welcomeStep = $derived(effectiveOrgType === 'brand' ? 5 : 6);

	async function sendInvite() {
		if (!inviteEmail.trim()) {
			step = welcomeStep;
			return;
		}
		loading = true;
		error = '';

		const res = await fetch('/api/invite/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: inviteEmail.trim(),
				role: inviteRole,
				brandIds: []
			})
		});

		loading = false;
		if (!res.ok) {
			const body = await res.json();
			error = body.error || 'Failed to send invitation';
			return;
		}
		step = welcomeStep;
	}

	function goBack() {
		if (step === 1) return;
		// Skip from invite step back over brand step for brand orgs
		if (step === inviteStep && effectiveOrgType === 'brand') {
			step = 3;
		} else {
			step = step - 1;
		}
	}

	function finish() {
		window.location.href = '/insight';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-background">
	<div class="w-full max-w-2xl px-6">
		<!-- Logo (hidden on welcome step) -->
		{#if step < welcomeStep}
			<div class="mb-8 text-center">
				<div
					class="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-none bg-primary text-lg font-light text-primary-foreground italic"
				>
					/
				</div>
				<h1 class="text-xl font-semibold">Welcome to Threadline</h1>
				<p class="mt-1 text-sm text-muted-foreground">Let's get your workspace set up</p>
			</div>
		{/if}

		<!-- Content -->
		<div class="space-y-6">
			{#if error}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{error}
				</div>
			{/if}

			{#if step === 1}
				<div class="space-y-5">
					<div>
						<h2 class="text-lg font-semibold">What's your name?</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							This is how your team will see you in Threadline.
						</p>
					</div>
					<form
						onsubmit={(e) => {
							e.preventDefault();
							saveName();
						}}
						class="space-y-4"
					>
						<div class="grid grid-cols-2 gap-4">
							<div class="space-y-2">
								<Label for="first-name">First name</Label>
								<Input id="first-name" bind:value={firstName} placeholder="Jane" required />
							</div>
							<div class="space-y-2">
								<Label for="last-name">Last name</Label>
								<Input id="last-name" bind:value={lastName} placeholder="Smith" required />
							</div>
						</div>
						<Button
							size="lg"
							type="submit"
							class="h-12 w-full text-base"
							disabled={loading || !firstName.trim() || !lastName.trim()}
						>
							{loading ? 'Saving...' : 'Continue'}
						</Button>
					</form>
				</div>
			{:else if step === 2}
				<div class="space-y-5">
					<button
						class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
						onclick={goBack}
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
								d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
							/>
						</svg>
						Back
					</button>
					<div>
						<h2 class="text-lg font-semibold">Name your business</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							This is your organization in Threadline — where you'll manage brands, accounts, and
							orders.
						</p>
					</div>
					<form
						onsubmit={(e) => {
							e.preventDefault();
							saveOrg();
						}}
						class="space-y-4"
					>
						<div class="space-y-2">
							<Label for="org-name">Business name</Label>
							<Input id="org-name" bind:value={orgName} placeholder="Your Company Inc." required />
						</div>
						<Button
							size="lg"
							type="submit"
							class="h-12 w-full text-base"
							disabled={loading || !orgName.trim()}
						>
							{loading ? 'Creating...' : 'Continue'}
						</Button>
					</form>
				</div>
			{:else if step === 3}
				<div class="space-y-5">
					<button
						class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
						onclick={goBack}
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
								d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
							/>
						</svg>
						Back
					</button>
					<div>
						<h2 class="text-lg font-semibold">What best describes your business?</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							This determines your Threadline experience. You can always adjust later.
						</p>
					</div>
					<div class="space-y-3">
						<button
							class="group flex w-full items-start gap-4 rounded-lg border p-5 text-left transition-colors {orgType ===
							'rep'
								? 'border-black dark:border-white'
								: 'border-border hover:border-black dark:hover:border-white'}"
							onclick={() => {
								orgType = 'rep';
								saveOrgType();
							}}
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors {orgType ===
								'rep'
									? 'bg-black text-white dark:bg-white dark:text-black'
									: 'bg-muted text-muted-foreground group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black'}"
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
										d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
									/>
								</svg>
							</div>
							<div>
								<p class="text-sm font-semibold">Sales rep or agency</p>
								<p class="mt-0.5 text-sm text-muted-foreground">
									I represent multiple brands and manage accounts, orders, and commissions.
								</p>
							</div>
						</button>
						<button
							class="group flex w-full items-start gap-4 rounded-lg border p-5 text-left transition-colors {orgType ===
							'brand'
								? 'border-black dark:border-white'
								: 'border-border hover:border-black dark:hover:border-white'}"
							onclick={() => {
								orgType = 'brand';
								saveOrgType();
							}}
						>
							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors {orgType ===
								'brand'
									? 'bg-black text-white dark:bg-white dark:text-black'
									: 'bg-muted text-muted-foreground group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black'}"
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
										d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
									/>
								</svg>
							</div>
							<div>
								<p class="text-sm font-semibold">Brand or manufacturer</p>
								<p class="mt-0.5 text-sm text-muted-foreground">
									I manage my product catalog, track orders across all sales channels, and work with
									reps.
								</p>
							</div>
						</button>
					</div>
				</div>
			{:else if step === 4 && effectiveOrgType === 'rep'}
				<div class="space-y-5">
					<button
						class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
						onclick={goBack}
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
								d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
							/>
						</svg>
						Back
					</button>
					<div>
						<h2 class="text-lg font-semibold">Add your brands</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Brands are the fashion labels you represent. You can always add more later.
						</p>
					</div>

					{#if !brandImportMode}
						<!-- Single brand form -->
						<form
							onsubmit={(e) => {
								e.preventDefault();
								saveBrand();
							}}
							class="space-y-4"
						>
							<div class="space-y-2">
								<Label for="brand-name">Brand name</Label>
								<Input id="brand-name" bind:value={brandName} placeholder="e.g. Acme Fashion" />
							</div>
							<div class="space-y-2">
								<Label for="brand-email"
									>Contact email <span class="text-muted-foreground">(optional)</span></Label
								>
								<Input
									id="brand-email"
									type="email"
									bind:value={brandEmail}
									placeholder="contact@brand.com"
								/>
							</div>
							<Button size="lg" type="submit" class="h-12 w-full text-base" disabled={loading}>
								{loading ? 'Adding...' : 'Add Brand'}
							</Button>
						</form>
						<button
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => (brandImportMode = true)}
						>
							Import multiple brands
						</button>
					{:else}
						<!-- Import mode -->
						<div class="space-y-4">
							<div class="space-y-2">
								<Label for="brand-paste">Paste from spreadsheet or CSV</Label>
								<textarea
									id="brand-paste"
									bind:value={brandPasteText}
									oninput={() => parseBrandInput(brandPasteText)}
									rows="5"
									placeholder="name, email, phone, website&#10;Acme Fashion, hello@acme.com, 555-1234, acme.com&#10;Beta Label, info@beta.com"
									class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								></textarea>
							</div>

							<div class="flex items-center gap-3">
								<div class="h-px flex-1 bg-border"></div>
								<span class="text-sm text-muted-foreground">or</span>
								<div class="h-px flex-1 bg-border"></div>
							</div>

							<div>
								<input
									type="file"
									accept=".csv,.tsv,.txt"
									bind:this={brandFileInput}
									onchange={handleBrandFile}
									class="hidden"
								/>
								<Button variant="outline" class="w-full" onclick={() => brandFileInput?.click()}>
									Upload CSV file
								</Button>
							</div>

							<!-- Preview table -->
							{#if parsedBrands.length > 0}
								<div class="space-y-2">
									<p class="text-sm font-medium">
										{parsedBrands.length} brand{parsedBrands.length !== 1 ? 's' : ''} found
									</p>
									<div class="max-h-48 overflow-y-auto rounded-md border">
										<table class="w-full text-sm">
											<thead class="sticky top-0 bg-muted">
												<tr>
													<th class="px-3 py-2 text-left font-medium">Name</th>
													<th class="px-3 py-2 text-left font-medium">Email</th>
													<th class="w-8 px-3 py-2"></th>
												</tr>
											</thead>
											<tbody>
												{#each parsedBrands as brand, i}
													<tr class="border-t">
														<td class="px-3 py-2">{brand.name}</td>
														<td class="px-3 py-2 text-muted-foreground">{brand.email || '—'}</td>
														<td class="px-3 py-2">
															<button
																aria-label="Remove brand"
																class="text-muted-foreground hover:text-destructive"
																onclick={() => removeParsedBrand(i)}
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
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
									<Button
										size="lg"
										class="h-12 w-full text-base"
										disabled={loading}
										onclick={importBrands}
									>
										{loading
											? 'Importing...'
											: `Import ${parsedBrands.length} Brand${parsedBrands.length !== 1 ? 's' : ''}`}
									</Button>
								</div>
							{/if}
						</div>
						<button
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => {
								brandImportMode = false;
								parsedBrands = [];
								brandPasteText = '';
							}}
						>
							Add a single brand instead
						</button>
					{/if}
				</div>
			{:else if step === inviteStep || (step === 5 && effectiveOrgType === 'rep')}
				<div class="space-y-5">
					<button
						class="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
						onclick={goBack}
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
								d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
							/>
						</svg>
						Back
					</button>
					<div>
						<h2 class="text-lg font-semibold">Invite your team</h2>
						<p class="mt-1 text-sm text-muted-foreground">
							Collaborate with your team by inviting them to your organization.
						</p>
					</div>

					{#if !memberImportMode}
						<!-- Single invite form -->
						<form
							onsubmit={(e) => {
								e.preventDefault();
								sendInvite();
							}}
							class="space-y-4"
						>
							<div class="space-y-2">
								<Label for="invite-email">Email address</Label>
								<Input
									id="invite-email"
									type="email"
									bind:value={inviteEmail}
									placeholder="teammate@example.com"
								/>
							</div>
							<div class="space-y-2">
								<Label for="invite-role">Role</Label>
								<select
									id="invite-role"
									class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
									bind:value={inviteRole}
								>
									<option value="admin">Admin</option>
									<option value="member">Member</option>
									<option value="sales">Sales</option>
									<option value="guest">Guest</option>
								</select>
							</div>
							<Button size="lg" type="submit" class="h-12 w-full text-base" disabled={loading}>
								{loading ? 'Sending...' : 'Send Invite'}
							</Button>
						</form>
						<button
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => (memberImportMode = true)}
						>
							Import multiple team members
						</button>
					{:else}
						<!-- Import mode -->
						<div class="space-y-4">
							<div class="space-y-2">
								<Label for="member-paste">Paste from spreadsheet or CSV</Label>
								<textarea
									id="member-paste"
									bind:value={memberPasteText}
									oninput={() => parseMemberInput(memberPasteText)}
									rows="5"
									placeholder="email, role&#10;alice@example.com, member&#10;bob@example.com, admin&#10;carol@example.com"
									class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
								></textarea>
							</div>

							<div class="flex items-center gap-3">
								<div class="h-px flex-1 bg-border"></div>
								<span class="text-sm text-muted-foreground">or</span>
								<div class="h-px flex-1 bg-border"></div>
							</div>

							<div>
								<input
									type="file"
									accept=".csv,.tsv,.txt"
									bind:this={memberFileInput}
									onchange={handleMemberFile}
									class="hidden"
								/>
								<Button variant="outline" class="w-full" onclick={() => memberFileInput?.click()}>
									Upload CSV file
								</Button>
							</div>

							<!-- Preview table -->
							{#if parsedMembers.length > 0}
								<div class="space-y-2">
									<p class="text-sm font-medium">
										{parsedMembers.length} member{parsedMembers.length !== 1 ? 's' : ''} found
									</p>
									<div class="max-h-48 overflow-y-auto rounded-md border">
										<table class="w-full text-sm">
											<thead class="sticky top-0 bg-muted">
												<tr>
													<th class="px-3 py-2 text-left font-medium">Email</th>
													<th class="px-3 py-2 text-left font-medium">Role</th>
													<th class="w-8 px-3 py-2"></th>
												</tr>
											</thead>
											<tbody>
												{#each parsedMembers as member, i}
													<tr class="border-t">
														<td class="px-3 py-2">{member.email}</td>
														<td class="px-3 py-2 text-muted-foreground capitalize">{member.role}</td
														>
														<td class="px-3 py-2">
															<button
																aria-label="Remove member"
																class="text-muted-foreground hover:text-destructive"
																onclick={() => removeParsedMember(i)}
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
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
									<Button
										size="lg"
										class="h-12 w-full text-base"
										disabled={loading}
										onclick={importMembers}
									>
										{loading
											? 'Sending invites...'
											: `Invite ${parsedMembers.length} Member${parsedMembers.length !== 1 ? 's' : ''}`}
									</Button>
								</div>
							{/if}
						</div>
						<button
							class="text-sm text-muted-foreground transition-colors hover:text-foreground"
							onclick={() => {
								memberImportMode = false;
								parsedMembers = [];
								memberPasteText = '';
							}}
						>
							Invite a single member instead
						</button>
					{/if}
				</div>
			{:else if step === welcomeStep}
				<!-- Welcome / Get Started carousel -->
				<div class="space-y-8 text-center">
					<!-- Carousel -->
					<div class="relative overflow-hidden">
						<div
							class="flex transition-transform duration-300 ease-in-out"
							style="transform: translateX(-{carouselIndex * 100}%)"
						>
							{#each slides as slide}
								<div class="w-full shrink-0 px-4">
									<div class="mx-auto max-w-md space-y-4 py-6">
										<div
											class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-accent"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-8 w-8 text-foreground"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="1.5"
											>
												<path stroke-linecap="round" stroke-linejoin="round" d={slide.icon} />
											</svg>
										</div>
										<h3 class="text-lg font-semibold">{slide.title}</h3>
										<p class="text-sm text-muted-foreground">{slide.description}</p>
									</div>
								</div>
							{/each}
						</div>

						<!-- Dots -->
						<div class="mt-4 flex items-center justify-center gap-2">
							{#each slides as _, i}
								<button
									class="h-2 rounded-full transition-all {carouselIndex === i
										? 'w-6 bg-foreground'
										: 'w-2 bg-muted-foreground/30'}"
									onclick={() => (carouselIndex = i)}
									aria-label="Go to slide {i + 1}"
								></button>
							{/each}
						</div>
					</div>

					<button
						class="text-sm text-muted-foreground transition-colors hover:text-foreground"
						onclick={finish}
					>
						Skip
					</button>
				</div>
			{/if}
		</div>

		<!-- Step progress bar + skip -->
		{#if step < welcomeStep}
			{@const progressSteps = stepLabels.filter((s) => s.number < welcomeStep)}
			<div class="mt-10 flex flex-col items-center gap-4">
				<div class="flex items-center gap-2">
					{#each progressSteps as s, i}
						<button
							class="h-2 rounded-full transition-all {step === s.number
								? 'w-8 bg-foreground'
								: step > s.number
									? 'w-2 bg-foreground'
									: 'w-2 bg-muted-foreground/20'}"
							onclick={() => {
								if (s.number < step) step = s.number;
							}}
							disabled={s.number >= step}
							aria-label="Step {s.number}: {s.label}"
						></button>
					{/each}
				</div>
				{#if (step === 4 && effectiveOrgType === 'rep') || step === inviteStep || (step === 5 && effectiveOrgType === 'rep')}
					<button
						class="text-sm text-muted-foreground transition-colors hover:text-foreground"
						onclick={() => {
							if (step === 4 && effectiveOrgType === 'rep') step = 5;
							else step = welcomeStep;
						}}
					>
						Skip
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>

<svelte:window
	onkeydown={(e) => {
		if (step !== welcomeStep) return;
		if (e.key === 'ArrowRight' && carouselIndex < slides.length - 1) carouselIndex++;
		else if (e.key === 'ArrowLeft' && carouselIndex > 0) carouselIndex--;
	}}
/>
