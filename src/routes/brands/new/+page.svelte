<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter
	} from '$lib/components/ui/card/index.js';
	import { createBrandSchema } from '$lib/schemas/brand';
	import { formatPhone } from '$lib/utils/phone';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form, {
		validators: zod4Client(createBrandSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		onUpdated: ({ form }) => {
			const msg = form.message as
				| { type: 'success'; brandId: string; inviteFailed: boolean }
				| string
				| undefined;
			if (typeof msg === 'string') {
				toast.error(msg);
				return;
			}
			if (msg?.type === 'success') {
				toast.success('Brand created');
				if (msg.inviteFailed) {
					toast.warning("Brand saved, but we couldn't send the team-member invite.");
				}
				goto(resolve('/brands/[id]', { id: msg.brandId }));
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Something went wrong. Please try again.');
		},
		onResult: ({ result }) => {
			if (result.type === 'failure') {
				const msg = (result.data as { message?: string } | undefined)?.message;
				toast.error(msg ?? 'Could not create brand. Check required fields.');
			}
		}
	});
</script>

<div class="mx-auto max-w-2xl">
	<Card>
		<CardHeader>
			<CardTitle>Add Brand</CardTitle>
		</CardHeader>
		<CardContent>
			<form id="brand-form" method="POST" use:enhance class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Brand name *</Label>
					<Input
						id="name"
						bind:value={$form.name}
						aria-invalid={$errors.name ? 'true' : undefined}
						placeholder="e.g. Velvet Rose"
					/>
					{#if $errors.name}
						<p class="text-sm text-destructive">{$errors.name[0]}</p>
					{/if}
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="contact-first-name">First name</Label>
						<Input id="contact-first-name" bind:value={$form.contactFirstName} placeholder="Jane" />
					</div>
					<div class="space-y-2">
						<Label for="contact-last-name">Last name</Label>
						<Input id="contact-last-name" bind:value={$form.contactLastName} placeholder="Smith" />
					</div>
				</div>

				<div class="space-y-2">
					<Label for="contact-email">Contact email</Label>
					<Input
						id="contact-email"
						type="email"
						bind:value={$form.contactEmail}
						aria-invalid={$errors.contactEmail ? 'true' : undefined}
						placeholder="jane@example.com"
					/>
					{#if $errors.contactEmail}
						<p class="text-sm text-destructive">{$errors.contactEmail[0]}</p>
					{/if}
				</div>

				{#if $form.contactEmail}
					<label class="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
						<input
							type="checkbox"
							bind:checked={$form.inviteContact}
							class="rounded border-input"
						/>
						Invite as team member (scoped to this brand)
					</label>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="contact-phone">Phone</Label>
						<Input
							id="contact-phone"
							bind:value={$form.contactPhone}
							oninput={(e) =>
								($form.contactPhone = formatPhone((e.currentTarget as HTMLInputElement).value))}
							aria-invalid={$errors.contactPhone ? 'true' : undefined}
							placeholder="(555) 123-4567"
						/>
						{#if $errors.contactPhone}
							<p class="text-sm text-destructive">{$errors.contactPhone[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="website">Website</Label>
						<Input
							id="website"
							bind:value={$form.website}
							aria-invalid={$errors.website ? 'true' : undefined}
							placeholder="yourbrand.com"
						/>
						{#if $errors.website}
							<p class="text-sm text-destructive">{$errors.website[0]}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="commission-rate">Commission Rate (%)</Label>
					<Input
						id="commission-rate"
						type="number"
						step="0.01"
						min="0"
						max="100"
						bind:value={$form.commissionRate}
						aria-invalid={$errors.commissionRate ? 'true' : undefined}
						placeholder="e.g. 15"
					/>
					{#if $errors.commissionRate}
						<p class="text-sm text-destructive">{$errors.commissionRate[0]}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="notes">Notes</Label>
					<textarea
						id="notes"
						bind:value={$form.notes}
						placeholder="Any additional notes..."
						rows="3"
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					></textarea>
					{#if $errors.notes}
						<p class="text-sm text-destructive">{$errors.notes[0]}</p>
					{/if}
				</div>
			</form>
		</CardContent>
		<CardFooter class="justify-between">
			<Button variant="outline" href="/brands">Cancel</Button>
			<Button type="submit" form="brand-form" disabled={$submitting}>
				{$submitting ? 'Creating...' : 'Create Brand'}
			</Button>
		</CardFooter>
	</Card>
</div>
