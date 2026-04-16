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
	import { createAccountSchema } from '$lib/schemas/account';
	import { formatPhone } from '$lib/utils/phone';

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting, validate } = superForm(data.form, {
		validators: zod4Client(createAccountSchema),
		validationMethod: 'onblur',
		dataType: 'json',
		onUpdated: ({ form }) => {
			const msg = form.message as
				| { type: 'success'; accountId: string; inviteFailed: boolean }
				| string
				| undefined;
			if (typeof msg === 'string') {
				toast.error(msg);
				return;
			}
			if (msg?.type === 'success') {
				toast.success('Account created');
				if (msg.inviteFailed) {
					toast.warning("Account saved, but we couldn't send the buyer invite email.");
				}
				goto(resolve('/accounts'));
			}
		},
		onError: ({ result }) => {
			toast.error(result.error?.message ?? 'Something went wrong. Please try again.');
		}
	});

	let step = $state<1 | 2 | 3>(1);

	const steps = [
		{ n: 1, label: 'Business' },
		{ n: 2, label: 'Contact' },
		{ n: 3, label: 'Notes' }
	] as const;

	function blankLocation() {
		return {
			label: '',
			phone: '',
			address: { line1: '', line2: '', city: '', state: '', zip: '' },
			contact: { firstName: '', lastName: '', email: '' }
		};
	}

	function addLocation() {
		$form.business.additionalLocations = [...$form.business.additionalLocations, blankLocation()];
	}

	function removeLocation(i: number) {
		$form.business.additionalLocations = $form.business.additionalLocations.filter(
			(_, idx) => idx !== i
		);
	}

	async function validatePaths(paths: string[]): Promise<boolean> {
		let ok = true;
		for (const p of paths) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const res = await validate(p as any, { update: true });
			if (res && (res as unknown as string[]).length) ok = false;
		}
		return ok;
	}

	async function next() {
		if (step === 1) {
			const paths = ['business.name', 'business.website'];
			$form.business.additionalLocations.forEach((_, i) => {
				paths.push(`business.additionalLocations[${i}].label`);
				paths.push(`business.additionalLocations[${i}].contact.email`);
			});
			if (await validatePaths(paths)) step = 2;
		} else if (step === 2) {
			if (await validatePaths(['contact.firstName', 'contact.lastName', 'contact.email'])) {
				step = 3;
			}
		}
	}

	function back() {
		if (step > 1) step = (step - 1) as 1 | 2;
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<!-- Step indicator -->
	<ol class="flex items-center justify-between gap-2" aria-label="Progress">
		{#each steps as s (s.n)}
			<li class="flex flex-1 items-center gap-3">
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors {step >
					s.n
						? 'border-primary bg-primary text-primary-foreground'
						: step === s.n
							? 'border-primary text-primary'
							: 'border-muted text-muted-foreground'}"
					aria-current={step === s.n ? 'step' : undefined}
				>
					{#if step > s.n}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4"
							viewBox="0 0 20 20"
							fill="currentColor"
						>
							<path
								fill-rule="evenodd"
								d="M16.704 5.29a1 1 0 010 1.42l-8 8a1 1 0 01-1.41 0l-4-4a1 1 0 011.41-1.42L8 12.59l7.29-7.3a1 1 0 011.414 0z"
								clip-rule="evenodd"
							/>
						</svg>
					{:else}
						{s.n}
					{/if}
				</div>
				<span
					class="text-sm font-medium {step === s.n ? 'text-foreground' : 'text-muted-foreground'}"
					>{s.label}</span
				>
				{#if s.n < steps.length}
					<div class="hidden h-px flex-1 bg-border sm:block"></div>
				{/if}
			</li>
		{/each}
	</ol>

	<Card>
		<CardHeader>
			<CardTitle>
				{step === 1 ? 'Business details' : step === 2 ? 'Primary contact' : 'Notes'}
			</CardTitle>
		</CardHeader>
		<CardContent>
			<form id="account-form" method="POST" use:enhance class="space-y-4">
				{#if step === 1}
					<div class="space-y-2">
						<Label for="business-name">Business name *</Label>
						<Input
							id="business-name"
							bind:value={$form.business.name}
							aria-invalid={$errors.business?.name ? 'true' : undefined}
							placeholder="Bloom Boutique"
						/>
						{#if $errors.business?.name}
							<p class="text-sm text-destructive">{$errors.business.name[0]}</p>
						{/if}
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="website">Website</Label>
							<Input
								id="website"
								bind:value={$form.business.website}
								aria-invalid={$errors.business?.website ? 'true' : undefined}
								placeholder="https://bloom.com"
							/>
							{#if $errors.business?.website}
								<p class="text-sm text-destructive">{$errors.business.website[0]}</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="business-phone">Phone</Label>
							<Input
								id="business-phone"
								bind:value={$form.business.phone}
								oninput={(e) =>
									($form.business.phone = formatPhone((e.currentTarget as HTMLInputElement).value))}
								aria-invalid={$errors.business?.phone ? 'true' : undefined}
								placeholder="(555) 123-4567"
							/>
							{#if $errors.business?.phone}
								<p class="text-sm text-destructive">{$errors.business.phone[0]}</p>
							{/if}
						</div>
					</div>

					<fieldset class="space-y-4 rounded-lg border border-border p-4">
						<legend class="px-2 text-sm font-medium">Primary address</legend>
						<div class="space-y-2">
							<Label for="address1">Address line 1</Label>
							<Input
								id="address1"
								bind:value={$form.business.address.line1}
								placeholder="123 Main St"
							/>
						</div>
						<div class="space-y-2">
							<Label for="address2">Address line 2</Label>
							<Input
								id="address2"
								bind:value={$form.business.address.line2}
								placeholder="Suite 100"
							/>
						</div>
						<div class="grid gap-4 sm:grid-cols-3">
							<div class="space-y-2">
								<Label for="city">City</Label>
								<Input id="city" bind:value={$form.business.address.city} placeholder="Denver" />
							</div>
							<div class="space-y-2">
								<Label for="state">State</Label>
								<Input id="state" bind:value={$form.business.address.state} placeholder="CO" />
							</div>
							<div class="space-y-2">
								<Label for="zip">ZIP</Label>
								<Input id="zip" bind:value={$form.business.address.zip} placeholder="80202" />
							</div>
						</div>
					</fieldset>

					<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
					{#each $form.business.additionalLocations as _, i (i)}
						<fieldset class="space-y-4 rounded-lg border border-border p-4">
							<div class="flex items-center justify-between">
								<legend class="px-2 text-sm font-medium">Additional location {i + 1}</legend>
								<button
									type="button"
									class="text-sm text-muted-foreground hover:text-destructive"
									onclick={() => removeLocation(i)}
								>
									Remove
								</button>
							</div>
							<div class="space-y-2">
								<Label for="loc-label-{i}">Label *</Label>
								<Input
									id="loc-label-{i}"
									bind:value={$form.business.additionalLocations[i].label}
									aria-invalid={$errors.business?.additionalLocations?.[i]?.label
										? 'true'
										: undefined}
									placeholder="Warehouse, Pop-up store, etc."
								/>
								{#if $errors.business?.additionalLocations?.[i]?.label}
									<p class="text-sm text-destructive">
										{$errors.business.additionalLocations[i].label?.[0]}
									</p>
								{/if}
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="loc-line1-{i}">Address line 1</Label>
									<Input
										id="loc-line1-{i}"
										bind:value={$form.business.additionalLocations[i].address.line1}
									/>
								</div>
								<div class="space-y-2">
									<Label for="loc-phone-{i}">Phone</Label>
									<Input
										id="loc-phone-{i}"
										bind:value={$form.business.additionalLocations[i].phone}
										oninput={(e) =>
											($form.business.additionalLocations[i].phone = formatPhone(
												(e.currentTarget as HTMLInputElement).value
											))}
										aria-invalid={$errors.business?.additionalLocations?.[i]?.phone
											? 'true'
											: undefined}
										placeholder="(555) 123-4567"
									/>
									{#if $errors.business?.additionalLocations?.[i]?.phone}
										<p class="text-sm text-destructive">
											{$errors.business.additionalLocations[i].phone?.[0]}
										</p>
									{/if}
								</div>
							</div>
							<div class="grid gap-4 sm:grid-cols-3">
								<div class="space-y-2">
									<Label for="loc-city-{i}">City</Label>
									<Input
										id="loc-city-{i}"
										bind:value={$form.business.additionalLocations[i].address.city}
									/>
								</div>
								<div class="space-y-2">
									<Label for="loc-state-{i}">State</Label>
									<Input
										id="loc-state-{i}"
										bind:value={$form.business.additionalLocations[i].address.state}
									/>
								</div>
								<div class="space-y-2">
									<Label for="loc-zip-{i}">ZIP</Label>
									<Input
										id="loc-zip-{i}"
										bind:value={$form.business.additionalLocations[i].address.zip}
									/>
								</div>
							</div>
						</fieldset>
					{/each}

					<Button type="button" variant="outline" onclick={addLocation} class="w-full">
						+ Add another location
					</Button>
				{:else if step === 2}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="contact-first-name">First name *</Label>
							<Input
								id="contact-first-name"
								bind:value={$form.contact.firstName}
								aria-invalid={$errors.contact?.firstName ? 'true' : undefined}
								placeholder="Jane"
							/>
							{#if $errors.contact?.firstName}
								<p class="text-sm text-destructive">{$errors.contact.firstName[0]}</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="contact-last-name">Last name *</Label>
							<Input
								id="contact-last-name"
								bind:value={$form.contact.lastName}
								aria-invalid={$errors.contact?.lastName ? 'true' : undefined}
								placeholder="Smith"
							/>
							{#if $errors.contact?.lastName}
								<p class="text-sm text-destructive">{$errors.contact.lastName[0]}</p>
							{/if}
						</div>
					</div>
					<div class="space-y-2">
						<Label for="contact-email">Email</Label>
						<Input
							id="contact-email"
							type="email"
							bind:value={$form.contact.email}
							aria-invalid={$errors.contact?.email ? 'true' : undefined}
							placeholder="jane@bloom.com"
						/>
						{#if $errors.contact?.email}
							<p class="text-sm text-destructive">{$errors.contact.email[0]}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="contact-phone">Phone</Label>
						<Input
							id="contact-phone"
							bind:value={$form.contact.phone}
							oninput={(e) =>
								($form.contact.phone = formatPhone((e.currentTarget as HTMLInputElement).value))}
							aria-invalid={$errors.contact?.phone ? 'true' : undefined}
							placeholder="(555) 123-4567"
						/>
						{#if $errors.contact?.phone}
							<p class="text-sm text-destructive">{$errors.contact.phone[0]}</p>
						{/if}
					</div>
				{:else}
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<textarea
							id="notes"
							bind:value={$form.notes}
							rows="6"
							placeholder="Anything worth remembering about this account..."
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						></textarea>
						{#if $errors.notes}
							<p class="text-sm text-destructive">{$errors.notes[0]}</p>
						{/if}
					</div>
				{/if}
			</form>
		</CardContent>
		<CardFooter class="justify-between">
			{#if step === 1}
				<Button variant="outline" href="/accounts">Cancel</Button>
			{:else}
				<Button variant="outline" type="button" onclick={back}>Back</Button>
			{/if}

			{#if step < 3}
				<Button type="button" onclick={next}>Next</Button>
			{:else}
				<Button type="submit" form="account-form" disabled={$submitting}>
					{$submitting ? 'Creating...' : 'Create Account'}
				</Button>
			{/if}
		</CardFooter>
	</Card>
</div>
