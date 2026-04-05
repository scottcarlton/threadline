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
	let contactName = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');
	let website = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit() {
		error = '';
		loading = true;

		const { error: err } = await supabase.from('brands').insert({
			organization_id: data.organization?.id,
			name,
			contact_name: contactName || null,
			contact_email: contactEmail || null,
			contact_phone: contactPhone || null,
			website: website || null,
			notes: notes || null
		});

		loading = false;
		if (err) {
			error = err.message;
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
						<Label for="contact-name">Contact name</Label>
						<Input id="contact-name" bind:value={contactName} placeholder="Jane Smith" />
					</div>
					<div class="space-y-2">
						<Label for="contact-email">Contact email</Label>
						<Input id="contact-email" type="email" bind:value={contactEmail} placeholder="jane@example.com" />
					</div>
				</div>
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
