<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';

	let { data } = $props();
	const account = $derived(data.account);
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-3xl">Account</h1>

	{#if account}
		<Card>
			<CardHeader>
				<CardTitle>{account.business_name}</CardTitle>
			</CardHeader>
			<CardContent>
				<dl class="grid gap-4 sm:grid-cols-2">
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Contact</dt>
						<dd class="mt-1 text-base">
							{[account.contact_first_name, account.contact_last_name].filter(Boolean).join(' ') ||
								'—'}
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Email</dt>
						<dd class="mt-1 text-base">{account.contact_email ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Phone</dt>
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
	{:else}
		<p class="text-muted-foreground">Account information not available.</p>
	{/if}
</div>
