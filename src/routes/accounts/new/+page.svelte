<script lang="ts">
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';

	let { data } = $props();

	let businessName = $state('');
	let contactFirstName = $state('');
	let contactLastName = $state('');
	let contactEmail = $state('');
	let phone = $state('');
	let addressLine1 = $state('');
	let addressLine2 = $state('');
	let city = $state('');
	let accountState = $state('');
	let zip = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		error = '';
		loading = true;

		const { data: newAccount, error: err } = await supabase.from('accounts').insert({
			organization_id: data.organization?.id,
			business_name: businessName,
			contact_first_name: contactFirstName || null,
			contact_last_name: contactLastName || null,
			contact_email: contactEmail || null,
			phone: phone || null,
			address_line1: addressLine1 || null,
			address_line2: addressLine2 || null,
			city: city || null,
			state: accountState || null,
			zip: zip || null,
			notes: notes || null
		}).select('id').single();

		if (err) {
			loading = false;
			error = err.message;
			return;
		}

		// Auto-invite contact to buyer portal if email provided
		if (contactEmail.trim() && newAccount?.id) {
			await fetch('/api/buyer-invite/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: contactEmail.trim(), accountId: newAccount.id, brandIds: [] })
			});
		}

		loading = false;
		goto('/accounts');
	}
</script>

<div class="mx-auto max-w-2xl">
	<Card>
		<CardHeader>
			<CardTitle>Add Account</CardTitle>
		</CardHeader>
		<CardContent>
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			<form id="account-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
				<div class="space-y-2">
					<Label for="business-name">Business name *</Label>
					<Input id="business-name" bind:value={businessName} required placeholder="Bloom Boutique" />
				</div>
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2">
						<Label for="contact-first-name">First name</Label>
						<Input id="contact-first-name" bind:value={contactFirstName} placeholder="Jane" />
					</div>
					<div class="space-y-2">
						<Label for="contact-last-name">Last name</Label>
						<Input id="contact-last-name" bind:value={contactLastName} placeholder="Smith" />
					</div>
					<div class="space-y-2">
						<Label for="contact-email">Email</Label>
						<Input id="contact-email" type="email" bind:value={contactEmail} placeholder="jane@bloom.com" />
					</div>
				</div>
				<div class="space-y-2">
					<Label for="phone">Phone</Label>
					<Input id="phone" bind:value={phone} placeholder="(555) 123-4567" />
				</div>
				<div class="space-y-2">
					<Label for="address1">Address line 1</Label>
					<Input id="address1" bind:value={addressLine1} placeholder="123 Main St" />
				</div>
				<div class="space-y-2">
					<Label for="address2">Address line 2</Label>
					<Input id="address2" bind:value={addressLine2} placeholder="Suite 100" />
				</div>
				<div class="grid gap-4 sm:grid-cols-3">
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" bind:value={city} placeholder="Denver" />
					</div>
					<div class="space-y-2">
						<Label for="state">State</Label>
						<Input id="state" bind:value={accountState} placeholder="CO" />
					</div>
					<div class="space-y-2">
						<Label for="zip">ZIP</Label>
						<Input id="zip" bind:value={zip} placeholder="80202" />
					</div>
				</div>
				<div class="space-y-2">
					<Label for="notes">Notes</Label>
					<textarea
						id="notes"
						bind:value={notes}
						rows="3"
						placeholder="Any additional notes..."
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					></textarea>
				</div>
			</form>
		</CardContent>
		<CardFooter class="justify-between">
			<Button variant="outline" href="/accounts">Cancel</Button>
			<Button type="submit" form="account-form" disabled={loading}>
				{loading ? 'Creating...' : 'Create Account'}
			</Button>
		</CardFooter>
	</Card>
</div>
