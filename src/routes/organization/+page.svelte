<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { supabase } from '$lib/supabase.js';
	import { formatPhone } from '$lib/utils/phone';

	let { data } = $props();

	const org = $derived(data.org);
	const isBrandOrg = $derived(data.orgType === 'brand');
	const selfBrand = $derived(data.selfBrand);

	let orgName = $state('');
	let logoUrl = $state('');
	let website = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');

	$effect(() => {
		orgName = data.org?.name ?? '';
		logoUrl = data.org?.logo_url ?? '';
		website = data.selfBrand?.website ?? '';
		contactEmail = data.selfBrand?.contact_email ?? '';
		contactPhone = data.selfBrand?.contact_phone ?? '';
	});
	let saving = $state(false);
	let message = $state('');

	async function handleSave() {
		if (!org) return;
		saving = true;
		message = '';

		const { error } = await supabase
			.from('organizations')
			.update({
				name: orgName,
				logo_url: logoUrl || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', org.id);

		if (error) {
			message = 'Failed to save changes.';
			saving = false;
			return;
		}

		if (isBrandOrg && selfBrand?.id) {
			const { error: brandErr } = await supabase
				.from('brands')
				.update({
					website: website || null,
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
					<Input id="website" bind:value={website} placeholder="https://yourbrand.com" />
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
</div>
