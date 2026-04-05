<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Brand } from '$lib/types/database.js';

	let { data } = $props();
	const brand = $derived(data.brand as Brand);
	const canEdit = $derived(
		data.membership?.role === 'admin' ||
		data.membership?.role === 'owner' ||
		data.membership?.role === 'member'
	);

	let editing = $state(false);
	let name = $state('');
	let contactName = $state('');
	let contactEmail = $state('');
	let contactPhone = $state('');
	let website = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	function startEdit() {
		name = brand.name;
		contactName = brand.contact_name ?? '';
		contactEmail = brand.contact_email ?? '';
		contactPhone = brand.contact_phone ?? '';
		website = brand.website ?? '';
		notes = brand.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('brands')
			.update({
				name,
				contact_name: contactName || null,
				contact_email: contactEmail || null,
				contact_phone: contactPhone || null,
				website: website || null,
				notes: notes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', brand.id);

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
			.from('brands')
			.update({ is_active: !brand.is_active, updated_at: new Date().toISOString() })
			.eq('id', brand.id);
		invalidateAll();
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/brands">← Back</Button>
			<h1 class="text-2xl font-bold">{brand.name}</h1>
			<Badge variant={brand.is_active ? 'success' : 'secondary'}>
				{brand.is_active ? 'Active' : 'Inactive'}
			</Badge>
		</div>
		{#if canEdit && !editing}
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={toggleActive}>
					{brand.is_active ? 'Deactivate' : 'Activate'}
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
						<Label for="name">Brand name *</Label>
						<Input id="name" bind:value={name} required />
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-name">Contact name</Label>
							<Input id="contact-name" bind:value={contactName} />
						</div>
						<div class="space-y-2">
							<Label for="contact-email">Contact email</Label>
							<Input id="contact-email" type="email" bind:value={contactEmail} />
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-phone">Phone</Label>
							<Input id="contact-phone" bind:value={contactPhone} />
						</div>
						<div class="space-y-2">
							<Label for="website">Website</Label>
							<Input id="website" bind:value={website} />
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
							<dd class="mt-1">{brand.contact_name ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Email</dt>
							<dd class="mt-1">{brand.contact_email ?? '—'}</dd>
						</div>
					</div>
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Phone</dt>
							<dd class="mt-1">{brand.contact_phone ?? '—'}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Website</dt>
							<dd class="mt-1">
								{#if brand.website}
									<a href={brand.website} target="_blank" class="text-primary hover:underline">{brand.website}</a>
								{:else}
									—
								{/if}
							</dd>
						</div>
					</div>
					{#if brand.notes}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
							<dd class="mt-1 whitespace-pre-wrap">{brand.notes}</dd>
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
