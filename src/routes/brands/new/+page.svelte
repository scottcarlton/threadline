<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';

	let { data } = $props();

	let name = $state('');
	let contactFirstName = $state('');
	let contactLastName = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');
	let website = $state('');
	let commissionRate = $state('');
	let notes = $state('');
	let inviteContact = $state(true);
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		error = '';
		loading = true;

		const { error: err } = await supabase.from('brands').insert({
			organization_id: data.organization?.id,
			name,
			contact_first_name: contactFirstName || null,
			contact_last_name: contactLastName || null,
			contact_email: contactEmail || null,
			contact_phone: contactPhone || null,
			website: website || null,
			commission_rate: parseFloat(commissionRate) || 0,
			notes: notes || null
		});

		if (err) {
			loading = false;
			error = err.message;
			return;
		}

		// Fetch the newly created brand to get its ID
		const { data: newBrand } = await supabase
			.from('brands')
			.select('id')
			.eq('organization_id', data.organization?.id)
			.eq('name', name)
			.order('created_at', { ascending: false })
			.limit(1)
			.single();

		// Auto-invite contact as a team member scoped to this brand
		if (inviteContact && contactEmail && newBrand) {
			try {
				await fetch('/api/invite/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						email: contactEmail,
						role: 'member',
						brandIds: [newBrand.id]
					})
				});
			} catch {
				// Invite failure shouldn't block brand creation
			}
		}

		loading = false;
		if (newBrand) {
			goto(`/brands/${newBrand.id}`);
		} else {
			goto('/brands');
		}
	}
</script>

<div class="mx-auto max-w-2xl">
	<Card>
		<CardHeader>
			<CardTitle>Add Brand</CardTitle>
		</CardHeader>
		<CardContent>
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			<form id="brand-form" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Brand name *</Label>
					<Input id="name" bind:value={name} required placeholder="e.g. Velvet Rose" />
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="contact-first-name">First name</Label>
						<Input id="contact-first-name" bind:value={contactFirstName} placeholder="Jane" />
					</div>
					<div class="space-y-2">
						<Label for="contact-last-name">Last name</Label>
						<Input id="contact-last-name" bind:value={contactLastName} placeholder="Smith" />
					</div>
				</div>
				<div class="space-y-2">
					<Label for="contact-email">Contact email</Label>
					<Input id="contact-email" type="email" bind:value={contactEmail} placeholder="jane@example.com" />
				</div>
				{#if contactEmail}
					<label class="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
						<input type="checkbox" bind:checked={inviteContact} class="rounded border-input" />
						Invite as team member (scoped to this brand)
					</label>
				{/if}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="contact-phone">Phone</Label>
						<Input id="contact-phone" bind:value={contactPhone} placeholder="(555) 123-4567" />
					</div>
					<div class="space-y-2">
						<Label for="website">Website</Label>
						<Input id="website" bind:value={website} placeholder="https://example.com" />
					</div>
				</div>
				<div class="space-y-2">
					<Label for="commission-rate">Commission Rate (%)</Label>
					<Input id="commission-rate" type="number" step="0.01" min="0" max="100" bind:value={commissionRate} placeholder="e.g. 15" />
				</div>
				<div class="space-y-2">
					<Label for="notes">Notes</Label>
					<textarea
						id="notes"
						bind:value={notes}
						placeholder="Any additional notes..."
						rows="3"
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					></textarea>
				</div>
			</form>
		</CardContent>
		<CardFooter class="justify-between">
			<Button variant="outline" href="/brands">Cancel</Button>
			<Button type="submit" form="brand-form" disabled={loading}>
				{loading ? 'Creating...' : 'Create Brand'}
			</Button>
		</CardFooter>
	</Card>
</div>
