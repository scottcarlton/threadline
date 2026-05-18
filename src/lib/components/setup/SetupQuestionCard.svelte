<script lang="ts">
	import { setupWizard, type SetupStep } from '$lib/stores/setup-wizard.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	const dockInput =
		'border-zinc-700 bg-zinc-900 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-zinc-500';
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
	let subMode = $state<'product' | 'account' | null>(null);
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

	// Account fields
	let acctBizName = $state('');
	let acctWebsite = $state('');
	let acctFirstName = $state('');
	let acctLastName = $state('');
	let acctEmail = $state('');
	let acctPhone = $state('');

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
		acctFirstName = '';
		acctLastName = '';
		acctEmail = '';
		acctPhone = '';

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
		if (!prodStyle.trim() || !prodName.trim() || !prodWholesale.trim()) return;
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
						retailPrice: prodRetail.trim() ? parseFloat(prodRetail) : undefined,
						category: prodCategory.trim(),
						sizes: prodSizes
							.split(',')
							.map((s: string) => s.trim())
							.filter(Boolean),
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

			// Upload image if provided
			if (prodImageFile) {
				const productRes = await res.json().catch(() => null);
				if (productRes?.productId) {
					const imgForm = new FormData();
					imgForm.append('file', prodImageFile);
					imgForm.append('role', 'primary');
					await fetch(`/api/products/${productRes.productId}/images`, {
						method: 'POST',
						body: imgForm
					});
				}
			}

			toast.success('Product added');
			subMode = null;
			subStep = 0;

			if (isLast) {
				setupWizard.close();
				await invalidateAll();
			} else {
				setupWizard.goNext();
			}
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
						city: '',
						state: ''
					}
				})
			});

			if (!res.ok) {
				const body = await res.json().catch(() => ({ error: 'Save failed' }));
				toast.error(body.error ?? 'Failed to create account');
				saving = false;
				return;
			}

			toast.success('Account added');
			subMode = null;
			subStep = 0;

			if (isLast) {
				setupWizard.close();
				await invalidateAll();
			} else {
				setupWizard.goNext();
			}
		} catch {
			toast.error('Something went wrong');
		} finally {
			saving = false;
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
		<!-- Header with nav -->
		<div class="mb-4 flex items-center justify-between">
			<p class="text-base font-medium text-zinc-100">
				{subMode
					? subMode === 'product'
						? ['General', 'Sizes & colors', 'Review'][subStep]
						: ['Business', 'Contact', 'Review'][subStep]
					: step.question}
			</p>
			<div class="flex items-center gap-2 text-sm text-zinc-500">
				{#if subMode}
					<span>{subStep + 1} of 3</span>
				{:else}
					{#if !isFirst}
						<button
							onclick={() => setupWizard.goBack()}
							class="transition-colors hover:text-zinc-300"
							aria-label="Previous question">&lt;</button
						>
					{/if}
					<span>{current} of {total}</span>
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
						<!-- General -->
						<div class="space-y-2">
							<Input bind:value={prodStyle} placeholder="Style number / SKU *" class={dockInput} />
							<Input bind:value={prodName} placeholder="Product name *" class={dockInput} />
							<div class="grid grid-cols-2 gap-2">
								<Input
									bind:value={prodWholesale}
									placeholder="Wholesale price *"
									type="number"
									class={dockInput}
								/>
								<Input
									bind:value={prodRetail}
									placeholder="Retail price"
									type="number"
									class={dockInput}
								/>
							</div>
							<Input
								bind:value={prodCategory}
								placeholder="Category (e.g. Tops, Bottoms)"
								class={dockInput}
							/>
							<!-- Image upload -->
							<button
								onclick={() => prodImageEl?.click()}
								class="flex w-full items-center gap-3 rounded-lg border border-dashed border-zinc-600 px-3 py-3 text-sm text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-300"
							>
								{#if prodImagePreview}
									<img
										src={prodImagePreview}
										alt="Preview"
										class="h-10 w-10 rounded object-cover"
									/>
									<span class="text-zinc-200">Image added</span>
								{:else}
									<svg
										class="h-5 w-5"
										fill="none"
										stroke="currentColor"
										stroke-width="1.5"
										viewBox="0 0 24 24"
										><path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
										/></svg
									>
									<span>Add product image</span>
								{/if}
							</button>
						</div>
						<div class="mt-3 flex items-center justify-end gap-2">
							<button
								onclick={() => {
									subMode = null;
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<button
								onclick={() => {
									subStep = 1;
								}}
								disabled={!prodStyle.trim() || !prodName.trim() || !prodWholesale.trim()}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 1}
						<!-- Sizes & Colors -->
						<div class="space-y-2">
							<p class="text-sm text-zinc-400">Comma-separated. Leave blank to skip.</p>
							<Input
								bind:value={prodSizes}
								placeholder="Sizes — e.g. S, M, L, XL"
								class={dockInput}
							/>
							<Input
								bind:value={prodColors}
								placeholder="Colors — e.g. Black, Navy, White"
								class={dockInput}
							/>
						</div>
						<div class="mt-3 flex items-center justify-end gap-2">
							<button
								onclick={() => {
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<button
								onclick={() => {
									subStep = 2;
								}}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 2}
						<!-- Review -->
						<div class="space-y-1 text-sm">
							<div class="flex justify-between">
								<span class="text-zinc-400">Style</span><span class="text-zinc-200"
									>{prodStyle}</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-zinc-400">Name</span><span class="text-zinc-200">{prodName}</span>
							</div>
							<div class="flex justify-between">
								<span class="text-zinc-400">Wholesale</span><span class="text-zinc-200"
									>${prodWholesale}</span
								>
							</div>
							{#if prodRetail}<div class="flex justify-between">
									<span class="text-zinc-400">Retail</span><span class="text-zinc-200"
										>${prodRetail}</span
									>
								</div>{/if}
							{#if prodCategory}<div class="flex justify-between">
									<span class="text-zinc-400">Category</span><span class="text-zinc-200"
										>{prodCategory}</span
									>
								</div>{/if}
							{#if prodSizes}<div class="flex justify-between">
									<span class="text-zinc-400">Sizes</span><span class="text-zinc-200"
										>{prodSizes}</span
									>
								</div>{/if}
							{#if prodColors}<div class="flex justify-between">
									<span class="text-zinc-400">Colors</span><span class="text-zinc-200"
										>{prodColors}</span
									>
								</div>{/if}
							{#if prodImagePreview}<div class="flex items-center gap-2">
									<span class="text-zinc-400">Image</span><img
										src={prodImagePreview}
										alt="Preview"
										class="h-8 w-8 rounded object-cover"
									/>
								</div>{/if}
						</div>
						<div class="mt-3 flex items-center justify-end gap-2">
							<button
								onclick={() => {
									subStep = 1;
								}}
								class={dockBtn}>Back</button
							>
							<button onclick={submitProduct} disabled={saving} class={dockBtnPrimary}>
								{saving ? 'Adding...' : 'Add Product'}
							</button>
						</div>
					{/if}
				{:else if subMode === 'account'}
					<!-- Account sub-stepper -->
					{#if subStep === 0}
						<!-- Business -->
						<div class="space-y-2">
							<Input bind:value={acctBizName} placeholder="Business name *" class={dockInput} />
							<Input bind:value={acctWebsite} placeholder="Website (optional)" class={dockInput} />
						</div>
						<div class="mt-3 flex items-center justify-end gap-2">
							<button
								onclick={() => {
									subMode = null;
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<button
								onclick={() => {
									subStep = 1;
								}}
								disabled={!acctBizName.trim()}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 1}
						<!-- Contact -->
						<div class="space-y-2">
							<div class="grid grid-cols-2 gap-2">
								<Input bind:value={acctFirstName} placeholder="First name" class={dockInput} />
								<Input bind:value={acctLastName} placeholder="Last name" class={dockInput} />
							</div>
							<Input bind:value={acctEmail} placeholder="Email" class={dockInput} />
							<Input bind:value={acctPhone} placeholder="Phone" class={dockInput} />
						</div>
						<div class="mt-3 flex items-center justify-end gap-2">
							<button
								onclick={() => {
									subStep = 0;
								}}
								class={dockBtn}>Back</button
							>
							<button
								onclick={() => {
									subStep = 2;
								}}
								class={dockBtnPrimary}>Next</button
							>
						</div>
					{:else if subStep === 2}
						<!-- Review -->
						<div class="space-y-1 text-sm">
							<div class="flex justify-between">
								<span class="text-zinc-400">Business</span><span class="text-zinc-200"
									>{acctBizName}</span
								>
							</div>
							{#if acctWebsite}<div class="flex justify-between">
									<span class="text-zinc-400">Website</span><span class="text-zinc-200"
										>{acctWebsite}</span
									>
								</div>{/if}
							{#if acctFirstName || acctLastName}<div class="flex justify-between">
									<span class="text-zinc-400">Contact</span><span class="text-zinc-200"
										>{acctFirstName} {acctLastName}</span
									>
								</div>{/if}
							{#if acctEmail}<div class="flex justify-between">
									<span class="text-zinc-400">Email</span><span class="text-zinc-200"
										>{acctEmail}</span
									>
								</div>{/if}
							{#if acctPhone}<div class="flex justify-between">
									<span class="text-zinc-400">Phone</span><span class="text-zinc-200"
										>{acctPhone}</span
									>
								</div>{/if}
						</div>
						<div class="mt-3 flex items-center justify-end gap-2">
							<button
								onclick={() => {
									subStep = 1;
								}}
								class={dockBtn}>Back</button
							>
							<button onclick={submitAccount} disabled={saving} class={dockBtnPrimary}>
								{saving ? 'Adding...' : 'Add Account'}
							</button>
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
									fileInputEl?.click();
								} else if (option.value === 'manual') {
									subMode = step.id === 'products' ? 'product' : 'account';
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
						<button onclick={() => save('skip')} disabled={saving} class={dockBtn}>Skip</button>
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
