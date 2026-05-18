<script lang="ts">
	import { setupWizard, type SetupStep } from '$lib/stores/setup-wizard.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	const dockInput =
		'border-zinc-700 bg-zinc-800/60 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-500';
	const dockBtn =
		'rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200';
	const dockBtnPrimary =
		'rounded-lg bg-zinc-600 px-3 py-1.5 text-sm text-zinc-100 transition-colors hover:bg-zinc-500 disabled:opacity-40';
	const dockOption =
		'flex w-full items-center gap-3 rounded-lg border border-zinc-700 px-3 py-2.5 text-left transition-colors hover:bg-zinc-700';
	const dockBadge =
		'flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-700 text-sm font-medium text-zinc-400';

	let wizard = $derived($setupWizard);
	let step = $derived(wizard.steps[wizard.currentIndex]);
	let isFirst = $derived(wizard.currentIndex === 0);
	let isLast = $derived(wizard.currentIndex === wizard.steps.length - 1);
	let total = $derived(wizard.steps.length);
	let current = $derived(wizard.currentIndex + 1);

	// Input state
	let selectedMulti = $state<string[]>([]);
	let saving = $state(false);

	// Address fields
	let addrLine1 = $state('');
	let addrLine2 = $state('');
	let addrCity = $state('');
	let addrState = $state('');
	let addrZip = $state('');

	// File upload (navigate steps)
	let fileInputEl: HTMLInputElement | undefined = $state();
	let uploading = $state(false);

	// ── Sub-stepper for manual product/account creation ──
	let subMode = $state<'product' | 'account' | 'member' | 'partner' | null>(null);
	let subStep = $state(0);

	// Product fields
	let prodStyle = $state('');
	let prodName = $state('');
	let prodWholesale = $state('');
	let prodRetail = $state('');
	let prodCategory = $state('');
	let prodSizes = $state('');
	let prodColors = $state('');
	let prodImageEl: HTMLInputElement | undefined = $state();
	let prodImageFile = $state<File | null>(null);
	let prodImagePreview = $state('');
	let prodSizeMode = $state<'letter' | 'numeric'>('letter');
	let prodSelectedSizes = $state<string[]>([]);

	// Account fields
	let acctBizName = $state('');
	let acctWebsite = $state('');
	let acctAddr1 = $state('');
	let acctAddr2 = $state('');
	let acctCity = $state('');
	let acctState = $state('');
	let acctZip = $state('');
	let acctFirstName = $state('');
	let acctLastName = $state('');
	let acctEmail = $state('');
	let acctPhone = $state('');

	// Member/partner invite fields
	let inviteEmail = $state('');
	let inviteRole = $state<'admin' | 'member' | 'sales' | 'guest'>('member');
	let inviteCommission = $state('10');

	$effect(() => {
		wizard.currentIndex;
		resetInputs();
	});

	function resetInputs() {
		selectedMulti = [];
		addrLine1 = '';
		addrLine2 = '';
		addrCity = '';
		addrState = '';
		addrZip = '';
		subMode = null;
		subStep = 0;
		prodStyle = '';
		prodName = '';
		prodWholesale = '';
		prodRetail = '';
		prodCategory = '';
		prodSizes = '';
		prodColors = '';
		prodImageFile = null;
		prodImagePreview = '';
		acctBizName = '';
		acctWebsite = '';
		acctAddr1 = '';
		acctAddr2 = '';
		acctCity = '';
		acctState = '';
		acctZip = '';
		acctFirstName = '';
		acctLastName = '';
		acctEmail = '';
		acctPhone = '';
		inviteEmail = '';
		inviteRole = 'member';
		inviteCommission = '10';

		const saved = step ? wizard.answers[step.id] : undefined;
		if (saved && step) {
			if (step.type === 'multi') selectedMulti = [...(saved as string[])];
			if (step.type === 'address' && typeof saved === 'object' && saved !== null) {
				const a = saved as Record<string, string>;
				addrLine1 = a.line1 ?? '';
				addrLine2 = a.line2 ?? '';
				addrCity = a.city ?? '';
				addrState = a.state ?? '';
				addrZip = a.zip ?? '';
			}
		}
	}

	function toggleMulti(value: string) {
		if (selectedMulti.includes(value)) {
			selectedMulti = selectedMulti.filter((v) => v !== value);
		} else {
			selectedMulti = [...selectedMulti, value];
		}
	}

	async function save(answer: unknown) {
		if (!step || saving) return;
		const currentStepId = step.id;
		saving = true;

		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ step: currentStepId, value: answer })
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Save failed' }));
				toast.error(body.error ?? 'Something went wrong');
				saving = false;
				return;
			}
		} catch {
			toast.error('Network error — please try again');
			saving = false;
			return;
		}

		setupWizard.saveAnswer(currentStepId, answer);

		if (isLast) {
			setupWizard.close();
			await invalidateAll();
		} else {
			setupWizard.goNext();
		}
		saving = false;
	}

	// ── File upload handler ──
	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploading = true;
		try {
			const isPdf = file.type === 'application/pdf';
			const isCsv = file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv');

			if (!isPdf && !isCsv) {
				toast.error('Upload a PDF or CSV file.');
				uploading = false;
				return;
			}

			if (isPdf) {
				const formData = new FormData();
				formData.append('file', file);
				const res = await fetch('/api/products/parse-linesheet', {
					method: 'POST',
					body: formData
				});
				if (!res.ok) {
					const body = await res.json().catch(() => ({ error: 'Upload failed' }));
					toast.error(body.error ?? 'Failed to parse file');
					uploading = false;
					return;
				}
				toast.success('Linesheet parsed — review your products');
				setupWizard.close();
				goto('/products');
			} else {
				setupWizard.close();
				goto('/products');
			}
		} catch {
			toast.error('Upload failed — please try again');
		} finally {
			uploading = false;
			if (input) input.value = '';
		}
	}

	// ── Product image handler ──
	function handleProductImage(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		prodImageFile = file;
		prodImagePreview = URL.createObjectURL(file);
	}

	// ── Product submit ──
	async function submitProduct() {
		if (!prodStyle.trim() || !prodName.trim() || !prodWholesale) return;
		saving = true;

		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					step: 'product-manual',
					value: {
						styleNumber: prodStyle.trim(),
						name: prodName.trim(),
						wholesalePrice: parseFloat(prodWholesale),
						retailPrice: prodRetail ? parseFloat(prodRetail) : undefined,
						category: prodCategory.trim(),
						sizes: prodSelectedSizes,
						colors: prodColors
							.split(',')
							.map((s: string) => s.trim())
							.filter(Boolean)
					}
				})
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Save failed' }));
				toast.error(body.error ?? 'Failed to create product');
				saving = false;
				return;
			}

			const result = await res.json().catch(() => ({}));

			if (prodImageFile && result?.productId) {
				const imgForm = new FormData();
				imgForm.append('file', prodImageFile);
				imgForm.append('role', 'primary');
				await fetch(`/api/products/${result.productId}/images`, {
					method: 'POST',
					body: imgForm
				});
			}

			subStep = 3;
		} catch {
			toast.error('Something went wrong');
		} finally {
			saving = false;
		}
	}

	// ── Account submit ──
	async function submitAccount() {
		if (!acctBizName.trim()) return;
		saving = true;

		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					step: 'account-manual',
					value: {
						businessName: acctBizName.trim(),
						contactName: [acctFirstName.trim(), acctLastName.trim()].filter(Boolean).join(' '),
						contactEmail: acctEmail.trim(),
						contactPhone: acctPhone.trim(),
						addressLine1: acctAddr1.trim(),
						addressLine2: acctAddr2.trim(),
						city: acctCity.trim(),
						state: acctState.trim(),
						zip: acctZip.trim()
					}
				})
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Save failed' }));
				toast.error(body.error ?? 'Failed to create account');
				saving = false;
				return;
			}

			subStep = 2;
		} catch {
			toast.error('Something went wrong');
		} finally {
			saving = false;
		}
	}

	function toggleProdSize(size: string) {
		if (prodSelectedSizes.includes(size)) {
			prodSelectedSizes = prodSelectedSizes.filter((s) => s !== size);
		} else {
			prodSelectedSizes = [...prodSelectedSizes, size];
		}
	}

	function resetProductFields() {
		prodStyle = '';
		prodName = '';
		prodWholesale = '';
		prodRetail = '';
		prodCategory = '';
		prodSizes = '';
		prodColors = '';
		prodImageFile = null;
		prodImagePreview = '';
		prodSizeMode = 'letter';
		prodSelectedSizes = [];
	}

	function resetAccountFields() {
		acctBizName = '';
		acctWebsite = '';
		acctAddr1 = '';
		acctAddr2 = '';
		acctCity = '';
		acctState = '';
		acctZip = '';
		acctFirstName = '';
		acctLastName = '';
		acctEmail = '';
		acctPhone = '';
	}

	async function submitMemberInvite() {
		if (!inviteEmail.trim()) return;
		saving = true;
		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					step: 'member-invite',
					value: {
						email: inviteEmail.trim(),
						role: inviteRole,
						commissionRate: inviteRole === 'sales' ? parseFloat(inviteCommission) : 0
					}
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Failed' }));
				toast.error(body.error ?? 'Failed to send invite');
				saving = false;
				return;
			}
			subStep = 2;
		} catch {
			toast.error('Something went wrong');
		} finally {
			saving = false;
		}
	}

	async function submitPartnerInvite() {
		if (!inviteEmail.trim()) return;
		saving = true;
		try {
			const res = await fetch('/api/setup/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					step: 'partner-invite',
					value: { email: inviteEmail.trim() }
				})
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Failed' }));
				toast.error(body.error ?? 'Failed to send invite');
				saving = false;
				return;
			}
			subStep = 1;
		} catch {
			toast.error('Something went wrong');
		} finally {
			saving = false;
		}
	}

	function resetInviteFields() {
		inviteEmail = '';
		inviteRole = 'member';
		inviteCommission = '10';
	}

	function advanceOrClose() {
		if (isLast) {
			setupWizard.close();
			invalidateAll();
		} else {
			setupWizard.goNext();
		}
	}

	function handleAddressSubmit() {
		if (!addrLine1.trim() || !addrCity.trim() || !addrState.trim() || !addrZip.trim()) return;
		save({
			line1: addrLine1.trim(),
			line2: addrLine2.trim(),
			city: addrCity.trim(),
			state: addrState.trim(),
			zip: addrZip.trim()
		});
	}
</script>

{#if step}
	<div>
		<!-- Header -->
		<div class="mb-4">
			<div class="flex items-center justify-between">
				<p class="text-base font-medium text-zinc-100">{step.question}</p>
				<div class="flex items-center gap-2 text-sm text-zinc-500">
					{#if !subMode}
						{#if !isFirst}
							<button
								onclick={() => setupWizard.goBack()}
								class="transition-colors hover:text-zinc-300"
								aria-label="Previous question">&lt;</button
							>
						{/if}
					{/if}
					<span>{current} of {total}</span>
					{#if !subMode}
						{#if !isLast}
							<button
								onclick={() => setupWizard.goNext()}
								class="transition-colors hover:text-zinc-300"
								aria-label="Next question">&gt;</button
							>
						{/if}
					{/if}
					<button
						onclick={() => {
							if (subMode) {
								subMode = null;
								subStep = 0;
							} else {
								setupWizard.close();
							}
						}}
						class="ml-1 transition-colors hover:text-zinc-300"
						aria-label={subMode ? 'Back to options' : 'Close setup'}>&times;</button
					>
				</div>
			</div>
			{#if subMode === 'product'}
				{@const labels = ['General Information', 'Images', 'Sizes & Colors']}
				{#if subStep < labels.length}
					<p class="mt-1 text-sm text-zinc-500">
						{labels[subStep]} • {subStep + 1} of {labels.length}
					</p>
				{/if}
			{:else if subMode === 'account'}
				{@const labels = ['Business Details', 'Primary Contact']}
				{#if subStep < labels.length}
					<p class="mt-1 text-sm text-zinc-500">
						{labels[subStep]} • {subStep + 1} of {labels.length}
					</p>
				{/if}
			{/if}
		</div>

		<!-- Step content -->
		<div class="space-y-1.5">
			{#if step.type === 'address'}
				<form
					onsubmit={(e) => {
						e.preventDefault();
						handleAddressSubmit();
					}}
				>
					<div class="space-y-2">
						<Input bind:value={addrLine1} placeholder="Street address" class={dockInput} />
						<Input
							bind:value={addrLine2}
							placeholder="Apt, suite, etc. (optional)"
							class={dockInput}
						/>
						<div class="grid grid-cols-[1fr_80px_100px] gap-2">
							<Input bind:value={addrCity} placeholder="City" class={dockInput} />
							<Input bind:value={addrState} placeholder="State" class={dockInput} />
							<Input bind:value={addrZip} placeholder="ZIP" class={dockInput} />
						</div>
					</div>
					<div class="mt-3 flex items-center justify-end gap-2">
						<button onclick={() => save('skip')} disabled={saving} class={dockBtn}>Skip</button>
						<button
							type="submit"
							disabled={!addrLine1.trim() ||
								!addrCity.trim() ||
								!addrState.trim() ||
								!addrZip.trim() ||
								saving}
							class={dockBtnPrimary}
						>
							{saving ? 'Saving...' : 'Continue'}
						</button>
					</div>
				</form>
			{:else if step.type === 'single'}
				{#each step.options ?? [] as option, i (option.value)}
					<button onclick={() => save(option.value)} disabled={saving} class={dockOption}>
						<span class={dockBadge}>{i + 1}</span>
						<span class="text-sm text-zinc-200">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex justify-end">
					<button onclick={() => save('skip')} disabled={saving} class={dockBtn}>Skip</button>
				</div>
			{:else if step.type === 'multi'}
				{#each step.options ?? [] as option (option.value)}
					<button
						onclick={() => toggleMulti(option.value)}
						disabled={saving}
						class="flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-zinc-700 {selectedMulti.includes(
							option.value
						)
							? 'border-zinc-500 bg-zinc-700'
							: 'border-zinc-700'}"
					>
						<Checkbox checked={selectedMulti.includes(option.value)} />
						<span class="text-sm text-zinc-200">{option.label}</span>
					</button>
				{/each}
				<div class="mt-2 flex items-center justify-between">
					<span class="text-sm text-zinc-500">{selectedMulti.length} selected</span>
					<div class="flex gap-2">
						<button onclick={() => save('skip')} disabled={saving} class={dockBtn}>Skip</button>
						<button
							onclick={() => save(selectedMulti)}
							disabled={selectedMulti.length === 0 || saving}
							class={dockBtnPrimary}
						>
							{saving ? 'Saving...' : 'Continue'}
						</button>
					</div>
				</div>
			{:else if step.type === 'navigate'}
				<input
					bind:this={fileInputEl}
					type="file"
					accept=".pdf,.csv"
					class="hidden"
					onchange={handleFileUpload}
				/>
				<input
					bind:this={prodImageEl}
					type="file"
					accept="image/*"
					class="hidden"
					onchange={handleProductImage}
				/>

				{#if subMode === 'product'}
					<!-- Product sub-stepper -->
					{#if subStep === 0}
						<!-- Style & Pricing -->
						<div class="space-y-3">
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="mb-1 block text-sm text-zinc-400">Product name</label>
									<Input
										bind:value={prodName}
										placeholder="e.g. Linen Button-Down"
										class={dockInput}
									/>
								</div>
								<div>
									<label class="mb-1 block text-sm text-zinc-400">Style number</label>
									<Input bind:value={prodStyle} placeholder="e.g. VR-2001" class={dockInput} />
								</div>
							</div>
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="mb-1 block text-sm text-zinc-400">Wholesale</label>
									<div class="flex overflow-hidden rounded-lg border border-zinc-700">
										<span
											class="flex items-center bg-zinc-800 px-2.5 font-mono text-sm text-zinc-500"
											>$</span
										>
										<input
											type="number"
											step="0.01"
											min="0"
											placeholder="0.00"
											bind:value={prodWholesale}
											class="min-w-0 flex-1 bg-zinc-800/60 px-2.5 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
										/>
									</div>
								</div>
								<div>
									<label class="mb-1 block text-sm text-zinc-400"
										>Retail <span class="text-zinc-600">(optional)</span></label
									>
									<div class="flex overflow-hidden rounded-lg border border-zinc-700">
										<span
											class="flex items-center bg-zinc-800 px-2.5 font-mono text-sm text-zinc-500"
											>$</span
										>
										<input
											type="number"
											step="0.01"
											min="0"
											placeholder="0.00"
											bind:value={prodRetail}
											class="min-w-0 flex-1 bg-zinc-800/60 px-2.5 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
										/>
									</div>
								</div>
							</div>
							<div>
								<label class="mb-1 block text-sm text-zinc-400"
									>Category <span class="text-zinc-600">(optional)</span></label
								>
								<Input
									bind:value={prodCategory}
									placeholder="Tops, Bottoms, Dresses…"
									class={dockInput}
								/>
							</div>
						</div>
						<div class="mt-4 flex items-center justify-between">
							<button
								onclick={() => {
									subMode = null;
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<div class="flex gap-1.5">
								{#each [0, 1, 2] as i (i)}
									<div
										class="h-1.5 w-10 rounded-full {i <= subStep ? 'bg-zinc-100' : 'bg-zinc-700'}"
									></div>
								{/each}
							</div>
							<button
								onclick={() => {
									subStep = 1;
								}}
								disabled={!prodName.trim() || !prodStyle.trim() || !prodWholesale}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 1}
						<!-- Images -->
						<input
							bind:this={prodImageEl}
							type="file"
							accept="image/jpeg,image/png,image/webp,image/avif"
							class="hidden"
							onchange={handleProductImage}
						/>
						<div class="grid grid-cols-2 gap-3">
							<button
								onclick={() => prodImageEl?.click()}
								class="group relative flex aspect-square flex-col items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 transition-colors hover:border-zinc-500 {prodImagePreview
									? ''
									: 'text-zinc-500'}"
							>
								<span
									class="absolute top-2 left-2 rounded bg-zinc-900/80 px-1.5 py-0.5 font-mono text-sm text-zinc-400"
									>primary</span
								>
								{#if prodImagePreview}
									<img
										src={prodImagePreview}
										alt="Primary"
										class="h-full w-full rounded-lg object-cover"
									/>
									<span
										class="absolute right-2 bottom-2 rounded bg-zinc-900/90 px-2 py-0.5 font-mono text-sm text-zinc-300 opacity-0 group-hover:opacity-100"
										>Replace</span
									>
								{:else}
									<span class="text-2xl font-light">+</span>
									<span class="font-mono text-sm">grid image</span>
								{/if}
							</button>
							<button
								onclick={() => {
									/* hover image - TODO wire up */
								}}
								class="flex aspect-square flex-col items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-500 transition-colors hover:border-zinc-500"
							>
								<span
									class="absolute top-2 left-2 rounded bg-zinc-900/80 px-1.5 py-0.5 font-mono text-sm text-zinc-400"
									>hover</span
								>
								<span class="text-2xl font-light">+</span>
								<span class="font-mono text-sm">hover image</span>
							</button>
						</div>
						<p class="mt-2 text-sm text-zinc-500">
							JPG, PNG, WebP, or AVIF. Square ratio recommended.
						</p>
						<div class="mt-4 flex items-center justify-between">
							<button
								onclick={() => {
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<div class="flex gap-1.5">
								{#each [0, 1, 2] as i (i)}
									<div
										class="h-1.5 w-10 rounded-full {i <= subStep ? 'bg-zinc-100' : 'bg-zinc-700'}"
									></div>
								{/each}
							</div>
							<button
								onclick={() => {
									subStep = 2;
								}}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 2}
						<!-- Sizes & Colors -->
						<div class="space-y-3">
							<div>
								<label class="mb-1.5 block text-sm text-zinc-400">Sizes</label>
								<div class="mb-2 inline-flex overflow-hidden rounded border border-zinc-700">
									<button
										type="button"
										class="px-3 py-1.5 text-sm {prodSizeMode === 'letter'
											? 'bg-zinc-200 text-zinc-900'
											: 'text-zinc-400 hover:text-zinc-200'}"
										onclick={() => {
											prodSizeMode = 'letter';
										}}>Letter</button
									>
									<button
										type="button"
										class="px-3 py-1.5 text-sm {prodSizeMode === 'numeric'
											? 'bg-zinc-200 text-zinc-900'
											: 'text-zinc-400 hover:text-zinc-200'}"
										onclick={() => {
											prodSizeMode = 'numeric';
										}}>Numeric</button
									>
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each prodSizeMode === 'letter' ? ['XS', 'S', 'M', 'L', 'XL', 'XXL'] : ['0', '2', '4', '6', '8', '10', '12', '14'] as size (size)}
										<button
											type="button"
											class="min-w-[40px] rounded border px-2.5 py-1.5 text-center text-sm font-medium transition-colors {prodSelectedSizes.includes(
												size
											)
												? 'border-zinc-400 bg-zinc-200 text-zinc-900'
												: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}"
											onclick={() => toggleProdSize(size)}>{size}</button
										>
									{/each}
								</div>
							</div>
							<div>
								<label class="mb-1 block text-sm text-zinc-400"
									>Colors <span class="text-zinc-600">(optional)</span></label
								>
								<Input
									bind:value={prodColors}
									placeholder="Black, Navy, White…"
									class={dockInput}
								/>
							</div>
						</div>
						<div class="mt-4 flex items-center justify-between">
							<button
								onclick={() => {
									subStep = 1;
								}}
								class={dockBtn}>Back</button
							>
							<div class="flex gap-1.5">
								{#each [0, 1, 2] as i (i)}
									<div
										class="h-1.5 w-10 rounded-full {i <= subStep ? 'bg-zinc-100' : 'bg-zinc-700'}"
									></div>
								{/each}
							</div>
							<button onclick={submitProduct} disabled={saving} class={dockBtnPrimary}>
								{saving ? 'Adding…' : 'Add Product'}
							</button>
						</div>
					{:else if subStep === 3}
						<!-- Success -->
						<div class="py-2 text-center">
							<p class="text-sm font-medium text-zinc-100">Product added</p>
							<p class="mt-1 text-sm text-zinc-400">{prodName} — {prodStyle}</p>
							<div class="mt-4 flex justify-center gap-2">
								<button
									onclick={() => {
										resetProductFields();
										subStep = 0;
									}}
									class={dockBtn}>Add another</button
								>
								<button
									onclick={() => {
										subMode = null;
										subStep = 0;
										advanceOrClose();
									}}
									class={dockBtnPrimary}>Continue</button
								>
							</div>
						</div>
					{/if}
				{:else if subMode === 'account'}
					<!-- Account sub-stepper -->
					{#if subStep === 0}
						<!-- Business details -->
						<div class="space-y-3">
							<div>
								<label class="mb-1 block text-sm text-zinc-400">Business name</label>
								<Input
									bind:value={acctBizName}
									placeholder="e.g. Bloom Boutique"
									class={dockInput}
								/>
							</div>
							<div>
								<label class="mb-1 block text-sm text-zinc-400"
									>Website <span class="text-zinc-600">(optional)</span></label
								>
								<Input
									bind:value={acctWebsite}
									placeholder="e.g. bloomboutique.com"
									class={dockInput}
								/>
							</div>
							<div>
								<label class="mb-1 block text-sm text-zinc-400">Address</label>
								<Input bind:value={acctAddr1} placeholder="Street address" class={dockInput} />
							</div>
							<Input
								bind:value={acctAddr2}
								placeholder="Apt, suite, etc. (optional)"
								class={dockInput}
							/>
							<div class="grid grid-cols-[1fr_80px_100px] gap-2">
								<Input bind:value={acctCity} placeholder="City" class={dockInput} />
								<Input bind:value={acctState} placeholder="State" class={dockInput} />
								<Input bind:value={acctZip} placeholder="ZIP" class={dockInput} />
							</div>
						</div>
						<div class="mt-4 flex items-center justify-between">
							<button
								onclick={() => {
									subMode = null;
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<div class="flex gap-1.5">
								{#each [0, 1] as i (i)}
									<div
										class="h-1.5 w-10 rounded-full {i <= subStep ? 'bg-zinc-100' : 'bg-zinc-700'}"
									></div>
								{/each}
							</div>
							<button
								onclick={() => {
									subStep = 1;
								}}
								disabled={!acctBizName.trim()}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 1}
						<!-- Primary contact -->
						<div class="space-y-3">
							<div class="grid grid-cols-2 gap-3">
								<div>
									<label class="mb-1 block text-sm text-zinc-400">First name</label>
									<Input bind:value={acctFirstName} placeholder="Jane" class={dockInput} />
								</div>
								<div>
									<label class="mb-1 block text-sm text-zinc-400">Last name</label>
									<Input bind:value={acctLastName} placeholder="Smith" class={dockInput} />
								</div>
							</div>
							<div>
								<label class="mb-1 block text-sm text-zinc-400">Email</label>
								<Input
									bind:value={acctEmail}
									placeholder="jane@bloomboutique.com"
									class={dockInput}
								/>
							</div>
							<div>
								<label class="mb-1 block text-sm text-zinc-400"
									>Phone <span class="text-zinc-600">(optional)</span></label
								>
								<Input bind:value={acctPhone} placeholder="(555) 123-4567" class={dockInput} />
							</div>
						</div>
						<div class="mt-4 flex items-center justify-between">
							<button
								onclick={() => {
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<div class="flex gap-1.5">
								{#each [0, 1] as i (i)}
									<div
										class="h-1.5 w-10 rounded-full {i <= subStep ? 'bg-zinc-100' : 'bg-zinc-700'}"
									></div>
								{/each}
							</div>
							<button onclick={submitAccount} disabled={saving} class={dockBtnPrimary}>
								{saving ? 'Adding…' : 'Add Account'}
							</button>
						</div>
					{:else if subStep === 2}
						<!-- Success -->
						<div class="py-2 text-center">
							<p class="text-sm font-medium text-zinc-100">Account added</p>
							<p class="mt-1 text-sm text-zinc-400">{acctBizName}</p>
							<div class="mt-4 flex justify-center gap-2">
								<button
									onclick={() => {
										resetAccountFields();
										subStep = 0;
									}}
									class={dockBtn}>Add another</button
								>
								<button
									onclick={() => {
										subMode = null;
										subStep = 0;
										advanceOrClose();
									}}
									class={dockBtnPrimary}>Continue</button
								>
							</div>
						</div>
					{/if}
				{:else if subMode === 'member' || subMode === 'partner'}
					<!-- Member / Partner invite -->
					{#if subStep === 0}
						<!-- Choose: team member or rep partner -->
						<button
							onclick={() => {
								subMode = 'member';
								subStep = 1;
								resetInviteFields();
							}}
							class={dockOption}
						>
							<span class={dockBadge}>1</span>
							<span class="text-sm text-zinc-200">Invite a team member</span>
						</button>
						<button
							onclick={() => {
								subMode = 'partner';
								subStep = 1;
								resetInviteFields();
							}}
							class={dockOption}
						>
							<span class={dockBadge}>2</span>
							<span class="text-sm text-zinc-200">Connect a rep partner</span>
						</button>
						<div class="mt-2 flex justify-end">
							<button
								onclick={() => {
									subMode = null;
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
						</div>
					{:else if subStep === 1}
						{#if subMode === 'member'}
							<div class="space-y-3">
								<div>
									<label class="mb-1 block text-sm text-zinc-400">Email address</label>
									<Input
										bind:value={inviteEmail}
										placeholder="teammate@company.com"
										type="email"
										class={dockInput}
									/>
								</div>
								<div>
									<label class="mb-1.5 block text-sm text-zinc-400">Role</label>
									<div class="flex gap-1.5">
										{#each ['admin', 'member', 'sales', 'guest'] as role (role)}
											<button
												type="button"
												onclick={() => {
													inviteRole = role as typeof inviteRole;
												}}
												class="rounded-lg border px-3 py-1.5 text-sm transition-colors {inviteRole ===
												role
													? 'border-zinc-400 bg-zinc-200 text-zinc-900'
													: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}"
												>{role.charAt(0).toUpperCase() + role.slice(1)}</button
											>
										{/each}
									</div>
								</div>
								{#if inviteRole === 'sales'}
									<div>
										<label class="mb-1 block text-sm text-zinc-400">Commission rate (%)</label>
										<Input
											bind:value={inviteCommission}
											placeholder="10"
											type="number"
											class={dockInput}
										/>
									</div>
								{/if}
							</div>
							<div class="mt-4 flex items-center justify-between">
								<button
									onclick={() => {
										subStep = 0;
									}}
									class={dockBtn}>Back</button
								>
								<button
									onclick={submitMemberInvite}
									disabled={!inviteEmail.trim() || saving}
									class={dockBtnPrimary}
								>
									{saving ? 'Sending…' : 'Send Invite'}
								</button>
							</div>
						{:else}
							<div class="space-y-3">
								<div>
									<label class="mb-1 block text-sm text-zinc-400">Rep's email address</label>
									<Input
										bind:value={inviteEmail}
										placeholder="rep@agency.com"
										type="email"
										class={dockInput}
									/>
								</div>
							</div>
							<div class="mt-4 flex items-center justify-between">
								<button
									onclick={() => {
										subStep = 0;
									}}
									class={dockBtn}>Back</button
								>
								<button
									onclick={submitPartnerInvite}
									disabled={!inviteEmail.trim() || saving}
									class={dockBtnPrimary}
								>
									{saving ? 'Sending…' : 'Send Invite'}
								</button>
							</div>
						{/if}
					{:else if subStep === 2}
						<!-- Success -->
						<div class="py-2 text-center">
							<p class="text-sm font-medium text-zinc-100">
								{subMode === 'member' ? 'Invite sent' : 'Partner invite sent'}
							</p>
							<p class="mt-1 text-sm text-zinc-400">{inviteEmail}</p>
							<div class="mt-4 flex justify-center gap-2">
								<button
									onclick={() => {
										resetInviteFields();
										subStep = 1;
									}}
									class={dockBtn}>Invite another</button
								>
								<button
									onclick={() => {
										subMode = null;
										subStep = 0;
										advanceOrClose();
									}}
									class={dockBtnPrimary}>Continue</button
								>
							</div>
						</div>
					{/if}
				{:else}
					<!-- Navigate options -->
					{#if step.description}
						<p class="mb-3 text-sm text-zinc-400">{step.description}</p>
					{/if}
					{#each step.options ?? [] as option, i (option.value)}
						<button
							onclick={() => {
								if (option.value === 'upload') {
									if (step.id === 'products') {
										fileInputEl?.click();
									} else if (step.id === 'accounts') {
										setupWizard.close();
										goto('/accounts');
									} else if (step.id === 'team') {
										setupWizard.close();
										goto('/organization/members');
									}
								} else if (option.value === 'manual') {
									if (step.id === 'products') {
										subMode = 'product';
									} else if (step.id === 'accounts') {
										subMode = 'account';
									} else if (step.id === 'team') {
										subMode = 'member';
									}
									subStep = 0;
								} else {
									save(option.value);
								}
							}}
							disabled={saving || uploading}
							class={dockOption}
						>
							<span class={dockBadge}>{i + 1}</span>
							<span class="text-sm text-zinc-200"
								>{uploading && option.value === 'upload' ? 'Uploading...' : option.label}</span
							>
						</button>
					{/each}
					<div class="mt-2 flex justify-end">
						<button onclick={advanceOrClose} disabled={saving} class={dockBtn}>Skip</button>
					</div>
				{/if}
			{:else if step.type === 'yesno'}
				{#each [{ label: 'Yes', value: 'yes', idx: 1 }, { label: step.skipLabel ?? 'No, skip this', value: 'skip', idx: 2 }] as opt (opt.value)}
					<button onclick={() => save(opt.value)} disabled={saving} class={dockOption}>
						<span class={dockBadge}>{opt.idx}</span>
						<span class="text-sm text-zinc-200">{opt.label}</span>
					</button>
				{/each}
			{/if}
		</div>
	</div>
{/if}
