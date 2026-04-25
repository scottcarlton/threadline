<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { supabase } from '$lib/supabase.js';
	import { formatPhone } from '$lib/utils/phone';
	import { PAYMENT_METHODS } from '$lib/payment-methods';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { brandTermsSchema } from '$lib/schemas/brand-terms.js';
	import { stripProtocol } from '$lib/utils/website';

	let { data } = $props();

	const org = $derived(data.org);
	const isBrandOrg = $derived(data.orgType === 'brand');
	const selfBrand = $derived(data.selfBrand);
	const canEditTerms = $derived(data.canEditTerms);
	const currentTerms = $derived(data.currentTerms);
	const termsHistory = $derived(data.termsHistory);

	// svelte-ignore state_referenced_locally
	// Stale client bundles (post-deploy, pre-reload) occasionally arrive before
	// load returns the new `termsForm` shape — fall back to schema defaults so
	// superForm doesn't throw and kill the rest of the page.
	const termsFormInitial = data.termsForm ?? {
		id: '',
		valid: false,
		posted: false,
		errors: {},
		data: { brand_id: '', title: 'Terms & Conditions', body: '' },
		constraints: {}
	};

	const {
		form: termsForm,
		errors: termsErrors,
		enhance: termsEnhance,
		submitting: termsSubmitting
	} = superForm(termsFormInitial, {
		validators: zod4Client(brandTermsSchema),
		validationMethod: 'onblur',
		onResult: ({ result }) => {
			if (result.type === 'success') {
				toast.success('Terms saved. The new version is now current.');
			} else if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				if (msg) toast.error(msg);
			} else if (result.type === 'error') {
				toast.error(result.error?.message ?? 'Failed to save terms');
			}
		}
	});

	let orgName = $state('');
	let logoUrl = $state('');
	let website = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let orgState = $state('');
	let zip = $state('');
	let defaultCommissionRate = $state(10);

	const acceptedMethods = new SvelteSet<string>();
	let defaultMethod = $state<string | null>(null);
	let savingPayment = $state(false);

	$effect(() => {
		orgName = data.org?.name ?? '';
		logoUrl = data.org?.logo_url ?? '';
		// Strip legacy protocols when loading existing values so the input
		// always shows the clean domain form.
		website = stripProtocol(data.selfBrand?.website);
		contactEmail = data.selfBrand?.contact_email ?? '';
		contactPhone = data.selfBrand?.contact_phone ?? '';
		addressLine1 = data.org?.address_line1 ?? '';
		addressLine2 = data.org?.address_line2 ?? '';
		city = data.org?.city ?? '';
		orgState = data.org?.state ?? '';
		zip = data.org?.zip ?? '';
		defaultCommissionRate = data.org?.default_commission_rate ?? 10;
		acceptedMethods.clear();
		for (const m of data.org?.accepted_payment_methods ?? []) acceptedMethods.add(m);
		defaultMethod = data.org?.default_payment_method ?? null;
	});
	let saving = $state(false);
	let message = $state('');

	function toggleMethod(code: string, next: boolean) {
		if (next) {
			acceptedMethods.add(code);
		} else {
			acceptedMethods.delete(code);
			if (defaultMethod === code) defaultMethod = null;
		}
	}

	async function handleSavePayment() {
		if (!org) return;
		if (acceptedMethods.size === 0) {
			toast.error('Pick at least one payment method you accept.');
			return;
		}
		if (!defaultMethod || !acceptedMethods.has(defaultMethod)) {
			toast.error('Pick a default payment method.');
			return;
		}
		savingPayment = true;
		const { error } = await supabase
			.from('organizations')
			.update({
				accepted_payment_methods: Array.from(acceptedMethods),
				default_payment_method: defaultMethod,
				updated_at: new Date().toISOString()
			})
			.eq('id', org.id);
		savingPayment = false;
		if (error) {
			toast.error('Could not save payment methods.');
			return;
		}
		toast.success('Payment methods updated.');
	}

	async function handleSave() {
		if (!org) return;
		saving = true;
		message = '';

		const { error } = await supabase
			.from('organizations')
			.update({
				name: orgName,
				logo_url: logoUrl || null,
				address_line1: addressLine1 || null,
				address_line2: addressLine2 || null,
				city: city || null,
				state: orgState || null,
				zip: zip || null,
				...(isBrandOrg ? { default_commission_rate: defaultCommissionRate } : {}),
				updated_at: new Date().toISOString()
			})
			.eq('id', org.id);

		if (error) {
			message = 'Failed to save changes.';
			saving = false;
			return;
		}

		if (isBrandOrg && selfBrand?.id) {
			const cleanWebsite = stripProtocol(website);
			website = cleanWebsite;
			const { error: brandErr } = await supabase
				.from('brands')
				.update({
					website: cleanWebsite || null,
					contact_email: contactEmail || null,
					contact_phone: contactPhone || null
				})
				.eq('id', selfBrand.id);
			if (brandErr) {
				message = 'Org saved, but brand details failed.';
				saving = false;
				return;
			}
		}

		message = 'Organization updated successfully.';
		saving = false;
	}
</script>

<div class="max-w-lg space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Profile</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">Your organization name and branding</p>
	</div>

	<div class="border-b pb-6">
		<div class="mt-6 space-y-4">
			<div class="space-y-2">
				<Label for="org-name">Organization Name</Label>
				<Input id="org-name" bind:value={orgName} placeholder="Your organization name" />
			</div>
			<div class="space-y-2">
				<Label for="logo-url">Logo URL</Label>
				<Input id="logo-url" bind:value={logoUrl} placeholder="https://example.com/logo.png" />
			</div>
			{#if logoUrl}
				<div class="space-y-2">
					<p class="mb-2 text-sm font-medium text-muted-foreground">Preview</p>
					<img src={logoUrl} alt="Organization logo" class="h-14 w-14 rounded-md object-cover" />
				</div>
			{/if}

			{#if isBrandOrg}
				<div class="space-y-2">
					<Label for="website">Website</Label>
					<Input id="website" bind:value={website} placeholder="yourbrand.com" />
				</div>
				<div class="space-y-2">
					<Label for="contact-email">Contact email</Label>
					<Input
						id="contact-email"
						type="email"
						bind:value={contactEmail}
						placeholder="hello@yourbrand.com"
					/>
				</div>
				<div class="space-y-2">
					<Label for="contact-phone">Contact phone</Label>
					<Input
						id="contact-phone"
						bind:value={contactPhone}
						placeholder="(555) 123-4567"
						oninput={(e) =>
							(contactPhone = formatPhone((e.currentTarget as HTMLInputElement).value))}
					/>
				</div>
				<div class="space-y-2">
					<Label for="default-commission-rate">Default commission rate</Label>
					<div class="flex items-center gap-2">
						<Input
							id="default-commission-rate"
							type="number"
							min={0}
							max={100}
							step={0.25}
							bind:value={defaultCommissionRate}
							class="w-28"
						/>
						<span class="text-sm text-muted-foreground">%</span>
					</div>
					<p class="text-sm text-muted-foreground">
						Pre-selected when sharing your connect link with reps.
					</p>
				</div>

				<div class="space-y-2">
					<Label for="address-line1">Address</Label>
					<Input id="address-line1" bind:value={addressLine1} placeholder="123 Main St" />
				</div>
				<div class="space-y-2">
					<Label for="address-line2">Address line 2</Label>
					<Input id="address-line2" bind:value={addressLine2} placeholder="Suite 100" />
				</div>
				<div class="grid grid-cols-[1fr_80px_100px] gap-3">
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" bind:value={city} placeholder="New York" />
					</div>
					<div class="space-y-2">
						<Label for="state">State</Label>
						<Input id="state" bind:value={orgState} placeholder="NY" />
					</div>
					<div class="space-y-2">
						<Label for="zip">ZIP</Label>
						<Input id="zip" bind:value={zip} placeholder="10001" />
					</div>
				</div>
			{/if}
		</div>

		<div class="mt-6 flex items-center gap-3">
			<Button onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save changes'}
			</Button>
			{#if message}
				<p class="text-sm text-muted-foreground">{message}</p>
			{/if}
		</div>
	</div>

	<div class={canEditTerms ? 'border-b pb-6' : ''}>
		<div>
			<h2 class="text-lg font-semibold">Payment methods</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Pick the methods you accept on orders. One must be the default for new accounts.
			</p>
		</div>

		<ul class="mt-6 divide-y rounded-md border">
			{#each PAYMENT_METHODS as method (method.code)}
				{@const accepted = acceptedMethods.has(method.code)}
				{@const isDefault = defaultMethod === method.code}
				<li class="flex items-center gap-4 px-4 py-3">
					<Checkbox checked={accepted} onCheckedChange={(v) => toggleMethod(method.code, v)} />
					<span class="flex-1 text-sm font-medium">{method.label}</span>
					{#if isDefault}
						<span
							class="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-sm font-medium text-background"
						>
							<span class="h-1.5 w-1.5 rounded-full bg-background"></span>
							Default
						</span>
					{:else}
						<button
							type="button"
							disabled={!accepted}
							onclick={() => (defaultMethod = method.code)}
							class="rounded-full border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-input disabled:hover:text-muted-foreground"
						>
							Set default
						</button>
					{/if}
				</li>
			{/each}
		</ul>

		<div class="mt-6">
			<Button onclick={handleSavePayment} disabled={savingPayment}>
				{savingPayment ? 'Saving...' : 'Save payment methods'}
			</Button>
		</div>
	</div>

	{#if canEditTerms}
		<div>
			<div>
				<h2 class="text-lg font-semibold">Buyer terms</h2>
				<p class="mt-0.5 text-sm text-muted-foreground">
					Terms reps present to buyers at order submit. Saving creates a new version and records it
					on every order that agrees.
				</p>
			</div>

			<form method="POST" action="?/saveTerms" use:termsEnhance class="mt-6 space-y-5">
				<input type="hidden" name="brand_id" bind:value={$termsForm.brand_id} />

				<div class="space-y-2">
					<Label for="terms-title">Title</Label>
					<Input
						id="terms-title"
						name="title"
						bind:value={$termsForm.title}
						maxlength={120}
						aria-invalid={$termsErrors.title ? 'true' : undefined}
					/>
					{#if $termsErrors.title}
						<p class="text-sm text-destructive">{$termsErrors.title[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="terms-body">Body</Label>
					<textarea
						id="terms-body"
						name="body"
						rows={14}
						maxlength={20000}
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						bind:value={$termsForm.body}
						placeholder="Cancellations, returns, shipping, payment terms…"
						aria-invalid={$termsErrors.body ? 'true' : undefined}
					></textarea>
					{#if $termsErrors.body}
						<p class="text-sm text-destructive">{$termsErrors.body[0]}</p>
					{/if}
				</div>

				<div class="flex items-center justify-between gap-3">
					<p class="text-sm text-muted-foreground">
						{#if currentTerms}
							Current version: v{currentTerms.version}. Saving creates v{currentTerms.version + 1}
							and marks prior versions as superseded.
						{:else}
							No terms on file. Saving creates v1.
						{/if}
					</p>
					<Button type="submit" disabled={$termsSubmitting}>
						{$termsSubmitting ? 'Saving…' : 'Save new version'}
					</Button>
				</div>
			</form>

			{#if termsHistory.length > 0}
				<div class="mt-6 rounded-lg border">
					<div class="border-b px-5 py-3 text-sm font-medium">Previous versions</div>
					<ul class="divide-y">
						{#each termsHistory as h (h.id)}
							<li class="flex items-center justify-between px-5 py-3 text-sm">
								<span>v{h.version} · {h.title}</span>
								<span class="text-muted-foreground">
									{h.created_at ? new Date(h.created_at).toLocaleDateString() : ''}
								</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</div>
