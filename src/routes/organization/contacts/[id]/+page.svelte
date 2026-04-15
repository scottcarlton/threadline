<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';

	let { data } = $props();

	const contact = $derived(
		data.contact as {
			name: string | null;
			email: string | null;
			phone: string | null;
			source: 'account' | 'brand' | 'discovered';
			sourceId: string;
			sourceName: string | null;
			location?: string | null;
			website?: string | null;
			status?: string;
			messageCount?: number;
			firstSeenAt?: string;
			lastSeenAt?: string;
		}
	);

	const orders = $derived(
		data.orders as Array<{
			id: string;
			order_number: string;
			total_amount: number;
			status: string;
			order_year: number | null;
			brands?: { name: string } | null;
			accounts?: { business_name: string } | null;
		}>
	);

	const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

	const sourceLabel = $derived(
		contact.source === 'account' ? 'Account' : contact.source === 'brand' ? 'Brand' : 'Discovered'
	);

	const sourceHref = $derived(
		contact.source === 'account'
			? `/accounts/${contact.sourceId}`
			: contact.source === 'brand'
				? `/brands/${contact.sourceId}`
				: null
	);

	type SuggestedAccount = { id: string; business_name: string; contact_email: string | null };
	const suggestedAccounts = $derived((data.suggestedAccounts ?? []) as SuggestedAccount[]);

	type EmailActivity = { id: string; subject: string; senderName: string | null; date: string };
	const emailActivity = $derived((data.emailActivity ?? []) as EmailActivity[]);
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/organization/contacts"
				><LongArrow direction="left" /> Back</Button
			>
			<div
				class="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-semibold"
			>
				{(contact.name ?? contact.email ?? '?').charAt(0).toUpperCase()}
			</div>
			<div>
				<h2 class="text-lg font-semibold">{contact.name ?? contact.email ?? 'Unknown'}</h2>
				{#if contact.name && contact.email}
					<a
						href="mailto:{contact.email}"
						class="font-mono text-sm text-muted-foreground hover:underline">{contact.email}</a
					>
				{/if}
			</div>
			<Badge
				variant={contact.source === 'brand'
					? 'default'
					: contact.source === 'account'
						? 'secondary'
						: 'outline'}
			>
				{sourceLabel}
			</Badge>
		</div>
		{#if contact.email}
			<Button size="sm" href="mailto:{contact.email}">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mr-1.5 h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
					/>
				</svg>
				Email
			</Button>
		{/if}
	</div>

	<!-- Details -->
	<Card>
		<CardHeader>
			<CardTitle class="text-base">Details</CardTitle>
		</CardHeader>
		<CardContent>
			<dl class="space-y-3 text-sm">
				{#if contact.email}
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Email</dt>
						<dd>
							<a href="mailto:{contact.email}" class="font-mono hover:underline">{contact.email}</a>
						</dd>
					</div>
				{/if}
				{#if contact.phone}
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Phone</dt>
						<dd class="font-mono">{contact.phone}</dd>
					</div>
				{/if}
				{#if contact.location}
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Location</dt>
						<dd>{contact.location}</dd>
					</div>
				{/if}
				{#if contact.website}
					<div class="flex justify-between">
						<dt class="text-muted-foreground">Website</dt>
						<dd>
							<a
								href={contact.website}
								target="_blank"
								rel="external noopener noreferrer"
								class="text-primary hover:underline"
								>{contact.website.replace(/^https?:\/\//, '')}</a
							>
						</dd>
					</div>
				{/if}
				{#if contact.sourceName && sourceHref}
					<div class="flex justify-between border-t pt-3">
						<dt class="text-muted-foreground">{sourceLabel}</dt>
						<dd>
							<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic href computed from contact source -->
							<a href={sourceHref} class="font-medium hover:underline">{contact.sourceName}</a>
						</dd>
					</div>
				{/if}
				{#if contact.source === 'discovered'}
					{#if contact.messageCount}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Messages seen</dt>
							<dd>{contact.messageCount}</dd>
						</div>
					{/if}
					{#if contact.firstSeenAt}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">First seen</dt>
							<dd>{new Date(contact.firstSeenAt).toLocaleDateString()}</dd>
						</div>
					{/if}
					{#if contact.lastSeenAt}
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Last seen</dt>
							<dd>{new Date(contact.lastSeenAt).toLocaleDateString()}</dd>
						</div>
					{/if}
				{/if}
			</dl>
		</CardContent>
	</Card>

	<!-- Suggested Account Matches -->
	{#if contact.source === 'discovered' && suggestedAccounts.length > 0}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Suggested Accounts</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="mb-3 text-sm text-muted-foreground">
					These accounts may be related based on email domain matching.
				</p>
				<div class="space-y-2">
					{#each suggestedAccounts as acct (acct.id)}
						<a
							href={resolve(`/accounts/${acct.id}`)}
							class="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
						>
							<div>
								<p class="text-sm font-medium">{acct.business_name}</p>
								{#if acct.contact_email}
									<p class="text-sm text-muted-foreground">{acct.contact_email}</p>
								{/if}
							</div>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4 text-muted-foreground"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								stroke-width="2"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
								/>
							</svg>
						</a>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Email Activity -->
	{#if contact.source === 'discovered' && emailActivity.length > 0}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Email Activity</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="space-y-1">
					{#each emailActivity as email (email.id)}
						<div class="flex items-start gap-3 rounded-lg px-3 py-2.5">
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									stroke-width="2"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
									/>
								</svg>
							</div>
							<div class="min-w-0 flex-1">
								<p class="text-sm font-medium">{email.subject}</p>
								{#if email.senderName}
									<p class="text-sm text-muted-foreground">Sent by {email.senderName}</p>
								{/if}
							</div>
							<span class="shrink-0 text-sm text-muted-foreground"
								>{new Date(email.date).toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric'
								})}</span
							>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Recent Orders -->
	{#if orders.length > 0}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Recent Orders</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="rounded-md border">
					<table class="w-full">
						<thead>
							<tr class="border-b bg-muted/50">
								<th class="px-3 py-2 text-left text-xs font-medium">Order</th>
								<th class="px-3 py-2 text-left text-xs font-medium"
									>{contact.source === 'brand' ? 'Account' : 'Brand'}</th
								>
								<th class="px-3 py-2 text-right text-xs font-medium">Amount</th>
								<th class="px-3 py-2 text-left text-xs font-medium">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each orders as order (order.id)}
								<tr class="border-b last:border-0">
									<td class="px-3 py-2">
										<a
											href={resolve(`/orders/${order.id}`)}
											class="text-sm font-medium hover:underline">{order.order_number}</a
										>
									</td>
									<td class="px-3 py-2 text-sm text-muted-foreground">
										{#if contact.source === 'brand'}
											{(order.accounts as any)?.business_name ?? '—'}
										{:else}
											{(order.brands as any)?.name ?? '—'}
										{/if}
									</td>
									<td class="px-3 py-2 text-right text-sm"
										>{fmt.format(Number(order.total_amount))}</td
									>
									<td class="px-3 py-2">
										<span
											class="inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium
											{order.status === 'delivered'
												? 'bg-emerald-50 text-emerald-700'
												: order.status === 'cancelled'
													? 'bg-zinc-100 text-zinc-500'
													: 'bg-blue-50 text-blue-700'}"
										>
											{order.status}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
