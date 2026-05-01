<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { superForm } from 'sveltekit-superforms';
	import { zod4Client } from 'sveltekit-superforms/adapters';
	import { toast } from 'svelte-sonner';
	import { buyerProfileSchema } from '$lib/schemas/buyer-profile.js';
	import { formatPhone } from '$lib/utils/phone.js';

	let { data } = $props();
	const account = $derived(data.account);

	// svelte-ignore state_referenced_locally
	const { form, errors, enhance, submitting } = superForm(data.form, {
		validators: zod4Client(buyerProfileSchema),
		validationMethod: 'onblur',
		onUpdated: ({ form: f }) => {
			const m = f.message as { type: string; text: string } | undefined;
			if (m?.type === 'success') toast.success(m.text);
		},
		onError: ({ result }) => {
			const m = (result as { data?: { message?: string } }).data?.message;
			toast.error(m ?? 'Something went wrong. Try again.');
		}
	});

	function onPhoneInput(e: Event) {
		const target = e.target as HTMLInputElement;
		$form.phone = formatPhone(target.value);
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-3xl">Account</h1>

	<Card>
		<CardHeader>
			<CardTitle>Your profile</CardTitle>
		</CardHeader>
		<CardContent>
			<form method="POST" use:enhance class="space-y-4">
				<div class="space-y-1.5">
					<Label for="displayName">Name</Label>
					<Input id="displayName" name="displayName" bind:value={$form.displayName} />
					{#if $errors.displayName}
						<p class="text-sm text-destructive">{$errors.displayName[0]}</p>
					{/if}
				</div>

				<div class="space-y-1.5">
					<Label for="phone">Phone</Label>
					<Input
						id="phone"
						name="phone"
						inputmode="tel"
						placeholder="(555) 555-5555"
						value={$form.phone}
						oninput={onPhoneInput}
					/>
					{#if $errors.phone}
						<p class="text-sm text-destructive">{$errors.phone[0]}</p>
					{/if}
				</div>

				<div class="flex justify-end">
					<Button type="submit" loading={$submitting}>Save changes</Button>
				</div>
			</form>
		</CardContent>
	</Card>

	{#if account}
		<Card>
			<CardHeader>
				<CardTitle>{account.business_name}</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="mb-4 text-sm text-muted-foreground">
					Your business details are maintained by your sales rep. Contact them to make changes.
				</p>
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Account contact</dt>
						<dd class="mt-1 text-base">
							{[account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ') ||
								'—'}
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Account email</dt>
						<dd class="mt-1 text-base">{account.contact_email ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Account phone</dt>
						<dd class="mt-1 text-base">{account.phone ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Country</dt>
						<dd class="mt-1 text-base">{account.country ?? '—'}</dd>
					</div>
				</dl>

				{#if account.address_line1 || account.city}
					<div class="mt-4 border-t pt-4">
						<dt class="text-sm font-medium text-muted-foreground">Address</dt>
						<dd class="mt-1 text-base">
							{#if account.address_line1}<p>{account.address_line1}</p>{/if}
							{#if account.address_line2}<p>{account.address_line2}</p>{/if}
							{#if account.city || account.state || account.zip}
								<p>
									{[account.city, account.state].filter(Boolean).join(', ')}{account.zip
										? ` ${account.zip}`
										: ''}
								</p>
							{/if}
						</dd>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
