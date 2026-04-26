<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { FileUpload } from '$lib/components/ui/file-upload/index.js';
	import { supabase } from '$lib/supabase.js';
	import { formatPhone } from '$lib/utils/phone';
	import { stripProtocol } from '$lib/utils/website';
	import { PAYMENT_METHODS } from '$lib/payment-methods';
	import { toast } from 'svelte-sonner';
	import { SvelteSet } from 'svelte/reactivity';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { organizationProfileSchema } from '$lib/schemas/organization-profile.js';

	let { data } = $props();

	const org = $derived(data.org);
	const isBrandOrg = $derived(data.orgType === 'brand');

	const COUNTRIES = [
		{ value: 'US', label: 'United States' },
		{ value: 'CA', label: 'Canada' },
		{ value: 'GB', label: 'United Kingdom' },
		{ value: 'AU', label: 'Australia' },
		{ value: 'NZ', label: 'New Zealand' },
		{ value: 'IE', label: 'Ireland' },
		{ value: 'DE', label: 'Germany' },
		{ value: 'FR', label: 'France' },
		{ value: 'IT', label: 'Italy' },
		{ value: 'ES', label: 'Spain' },
		{ value: 'NL', label: 'Netherlands' },
		{ value: 'SE', label: 'Sweden' },
		{ value: 'JP', label: 'Japan' },
		{ value: 'KR', label: 'South Korea' },
		{ value: 'HK', label: 'Hong Kong' },
		{ value: 'SG', label: 'Singapore' }
	];

	const TIME_ZONES = [
		{ value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
		{ value: 'America/Denver', label: 'Mountain (Denver)' },
		{ value: 'America/Chicago', label: 'Central (Chicago)' },
		{ value: 'America/New_York', label: 'Eastern (New York)' },
		{ value: 'America/Toronto', label: 'Eastern (Toronto)' },
		{ value: 'Europe/London', label: 'UK (London)' },
		{ value: 'Europe/Paris', label: 'Central Europe (Paris)' },
		{ value: 'Europe/Berlin', label: 'Central Europe (Berlin)' },
		{ value: 'Asia/Tokyo', label: 'Japan (Tokyo)' },
		{ value: 'Australia/Sydney', label: 'Australia (Sydney)' }
	];

	const CURRENCIES = [
		{ value: 'USD', label: 'USD — US Dollar' },
		{ value: 'CAD', label: 'CAD — Canadian Dollar' },
		{ value: 'GBP', label: 'GBP — British Pound' },
		{ value: 'EUR', label: 'EUR — Euro' },
		{ value: 'AUD', label: 'AUD — Australian Dollar' },
		{ value: 'JPY', label: 'JPY — Japanese Yen' }
	];

	// svelte-ignore state_referenced_locally
	const profileFormInitial = data.profileForm;

	const {
		form: profileForm,
		errors: profileErrors,
		enhance: profileEnhance,
		submitting: profileSubmitting
	} = superForm(profileFormInitial, {
		validators: zod4Client(organizationProfileSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		onUpdated: ({ form }) => {
			if (form.valid && form.message?.success) {
				toast.success('Organization updated.');
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Failed to save changes.');
		}
	});

	// svelte-ignore state_referenced_locally
	let logoStoragePath = $state(data.org?.logo_storage_path ?? '');

	$effect(() => {
		logoStoragePath = data.org?.logo_storage_path ?? '';
	});

	const logoPreviewUrl = $derived.by(() => {
		if (logoStoragePath) {
			return supabase.storage.from('organization-logos').getPublicUrl(logoStoragePath).data
				.publicUrl;
		}
		return data.org?.logo_url ?? '';
	});

	const acceptedMethods = new SvelteSet<string>();
	let defaultMethod = $state<string | null>(null);
	let savingPayment = $state(false);

	$effect(() => {
		acceptedMethods.clear();
		for (const m of data.org?.accepted_payment_methods ?? []) acceptedMethods.add(m);
		defaultMethod = data.org?.default_payment_method ?? null;
	});

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

	function onWebsiteBlur() {
		$profileForm.website = stripProtocol($profileForm.website);
	}
</script>

<div class="max-w-lg space-y-6">
	<div>
		<h2 class="text-lg font-semibold">Profile</h2>
		<p class="mt-0.5 text-sm text-muted-foreground">Your organization name and branding</p>
	</div>

	<form method="POST" use:profileEnhance class="space-y-8 border-b pb-6">
		<!-- Identity -->
		<section class="space-y-4">
			<h3 class="text-sm font-semibold">Identity</h3>

			<div class="space-y-2">
				<Label>Logo</Label>
				<FileUpload
					bind:value={logoStoragePath}
					previewUrl={logoPreviewUrl}
					endpoint="/api/organization/logo"
					accept="image/*"
					ariaLabel="Upload organization logo"
				/>
			</div>

			<div class="space-y-2">
				<Label for="org-name">Organization name *</Label>
				<Input
					id="org-name"
					bind:value={$profileForm.name}
					aria-invalid={$profileErrors.name ? 'true' : undefined}
					placeholder="Your organization name"
				/>
				{#if $profileErrors.name}
					<p class="text-sm text-destructive">{$profileErrors.name[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="legal-name">Legal business name</Label>
				<Input
					id="legal-name"
					bind:value={$profileForm.legalBusinessName}
					placeholder="Acme Industries, Inc."
				/>
				{#if $profileErrors.legalBusinessName}
					<p class="text-sm text-destructive">{$profileErrors.legalBusinessName[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="tagline">Tagline</Label>
				<Input
					id="tagline"
					bind:value={$profileForm.tagline}
					maxlength={80}
					placeholder="Short line about what you do"
				/>
				{#if $profileErrors.tagline}
					<p class="text-sm text-destructive">{$profileErrors.tagline[0]}</p>
				{/if}
			</div>
		</section>

		{#if isBrandOrg}
			<!-- Contact -->
			<section class="space-y-4">
				<h3 class="text-sm font-semibold">Contact</h3>

				<div class="space-y-2">
					<Label for="website">Website</Label>
					<Input
						id="website"
						bind:value={$profileForm.website}
						placeholder="yourbrand.com"
						onblur={onWebsiteBlur}
					/>
					{#if $profileErrors.website}
						<p class="text-sm text-destructive">{$profileErrors.website[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="contact-email">Contact email</Label>
					<Input
						id="contact-email"
						type="email"
						bind:value={$profileForm.contactEmail}
						placeholder="hello@yourbrand.com"
					/>
					{#if $profileErrors.contactEmail}
						<p class="text-sm text-destructive">{$profileErrors.contactEmail[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="contact-phone">Contact phone</Label>
					<Input
						id="contact-phone"
						bind:value={$profileForm.contactPhone}
						placeholder="(555) 123-4567"
						oninput={(e) =>
							($profileForm.contactPhone = formatPhone(
								(e.currentTarget as HTMLInputElement).value
							))}
					/>
					{#if $profileErrors.contactPhone}
						<p class="text-sm text-destructive">{$profileErrors.contactPhone[0]}</p>
					{/if}
				</div>
			</section>
		{/if}

		<!-- Business address -->
		<section class="space-y-4">
			<h3 class="text-sm font-semibold">Business address</h3>

			<div class="space-y-2">
				<Label for="address-line1">Address line 1</Label>
				<Input
					id="address-line1"
					bind:value={$profileForm.addressLine1}
					placeholder="123 Main St"
				/>
			</div>

			<div class="space-y-2">
				<Label for="address-line2">Address line 2</Label>
				<Input id="address-line2" bind:value={$profileForm.addressLine2} placeholder="Suite 100" />
			</div>

			<div class="grid grid-cols-[1fr_80px_100px] gap-3">
				<div class="space-y-2">
					<Label for="city">City</Label>
					<Input id="city" bind:value={$profileForm.city} placeholder="New York" />
				</div>
				<div class="space-y-2">
					<Label for="state">State</Label>
					<Input id="state" bind:value={$profileForm.state} placeholder="NY" />
				</div>
				<div class="space-y-2">
					<Label for="zip">ZIP</Label>
					<Input id="zip" bind:value={$profileForm.zip} placeholder="10001" />
				</div>
			</div>

			<div class="space-y-2">
				<Label for="country">Country</Label>
				<SelectField
					bind:value={$profileForm.country}
					items={COUNTRIES}
					placeholder="Select a country"
					class="w-full"
				/>
				{#if $profileErrors.country}
					<p class="text-sm text-destructive">{$profileErrors.country[0]}</p>
				{/if}
			</div>
		</section>

		<!-- Regional defaults -->
		<section class="space-y-4">
			<h3 class="text-sm font-semibold">Regional defaults</h3>

			<div class="space-y-2">
				<Label for="time-zone">Time zone</Label>
				<SelectField
					bind:value={$profileForm.timeZone}
					items={TIME_ZONES}
					placeholder="Select a time zone"
					class="w-full"
				/>
				{#if $profileErrors.timeZone}
					<p class="text-sm text-destructive">{$profileErrors.timeZone[0]}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="currency">Currency</Label>
				<SelectField
					bind:value={$profileForm.currencyCode}
					items={CURRENCIES}
					placeholder="Select a currency"
					class="w-full"
				/>
				{#if $profileErrors.currencyCode}
					<p class="text-sm text-destructive">{$profileErrors.currencyCode[0]}</p>
				{/if}
			</div>
		</section>

		<div>
			<Button type="submit" disabled={$profileSubmitting}>
				{$profileSubmitting ? 'Saving…' : 'Save changes'}
			</Button>
		</div>
	</form>

	<div>
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
</div>
