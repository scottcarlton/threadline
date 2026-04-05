<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Account } from '$lib/types/database.js';

	let { data } = $props();
	const account = $derived(data.account as Account);
	const canEdit = $derived(data.membership?.role !== 'guest');

	let editing = $state(false);
	let businessName = $state('');
	let contactName = $state('');
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

	function startEdit() {
		businessName = account.business_name;
		contactName = account.contact_name ?? '';
		contactEmail = account.contact_email ?? '';
		phone = account.phone ?? '';
		addressLine1 = account.address_line1 ?? '';
		addressLine2 = account.address_line2 ?? '';
		city = account.city ?? '';
		accountState = account.state ?? '';
		zip = account.zip ?? '';
		notes = account.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('accounts')
			.update({
				business_name: businessName,
				contact_name: contactName || null,
				contact_email: contactEmail || null,
				phone: phone || null,
				address_line1: addressLine1 || null,
				address_line2: addressLine2 || null,
				city: city || null,
				state: accountState || null,
				zip: zip || null,
				notes: notes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', account.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	async function toggleActive() {
		await supabase
			.from('accounts')
			.update({ is_active: !account.is_active, updated_at: new Date().toISOString() })
			.eq('id', account.id);
		invalidateAll();
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/accounts">← Back</Button>
			<h1 class="text-2xl font-bold">{account.business_name}</h1>
			<Badge variant={account.is_active ? 'success' : 'secondary'}>
				{account.is_active ? 'Active' : 'Inactive'}
			</Badge>
		</div>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={toggleActive}>
					{account.is_active ? 'Deactivate' : 'Activate'}
				</Button>
				<Button size="sm" onclick={startEdit}>Edit</Button>
			</div>
		{/if}
	</div>

	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form id="edit-form" onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
					<div class="space-y-2">
						<Label for="business-name">Business name *</Label>
						<Input id="business-name" bind:value={businessName} required />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-name">Contact name</Label>
							<Input id="contact-name" bind:value={contactName} />
						</div>
						<div class="space-y-2">
							<Label for="contact-email">Email</Label>
							<Input id="contact-email" type="email" bind:value={contactEmail} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="phone">Phone</Label>
						<Input id="phone" bind:value={phone} />
					</div>
					<div class="space-y-2">
						<Label for="address1">Address line 1</Label>
						<Input id="address1" bind:value={addressLine1} />
					</div>
					<div class="space-y-2">
						<Label for="address2">Address line 2</Label>
						<Input id="address2" bind:value={addressLine2} />
					</div>
					<div class="grid gap-4 sm:grid-cols-3">
						<div class="space-y-2">
							<Label for="city">City</Label>
							<Input id="city" bind:value={city} />
						</div>
						<div class="space-y-2">
							<Label for="state">State</Label>
							<Input id="state" bind:value={accountState} />
						</div>
						<div class="space-y-2">
							<Label for="zip">ZIP</Label>
							<Input id="zip" bind:value={zip} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<textarea
							id="notes"
							bind:value={notes}
							rows="3"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
						></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-4">
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Contact Name</dt>
							<dd class="mt-1">{account.contact_name ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Email</dt>
							<dd class="mt-1">{account.contact_email ?? '—'}</dd>
						</div>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Phone</dt>
						<dd class="mt-1">{account.phone ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Address</dt>
						<dd class="mt-1">
							{#if account.address_line1}
								{account.address_line1}<br />
								{#if account.address_line2}{account.address_line2}<br />{/if}
								{[account.city, account.state].filter(Boolean).join(', ')}
								{#if account.zip} {account.zip}{/if}
							{:else}
								—
							{/if}
						</dd>
					</div>
					{#if account.notes}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
							<dd class="mt-1 whitespace-pre-wrap">{account.notes}</dd>
						</div>
					{/if}
				</dl>
			{/if}
		</CardContent>
		{#if editing}
			<CardFooter class="justify-between">
				<Button variant="outline" onclick={() => (editing = false)}>Cancel</Button>
				<Button type="submit" form="edit-form" disabled={loading}>
					{loading ? 'Saving...' : 'Save Changes'}
				</Button>
			</CardFooter>
		{/if}
	</Card>
</div>
