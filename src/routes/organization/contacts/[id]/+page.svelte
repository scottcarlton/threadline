<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import LongArrow from '$lib/components/ui/long-arrow.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { stripProtocol, withProtocol } from '$lib/utils/website';

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

	type SuggestedAccount = { id: string; business_name: string; contact_email: string | null };
	const suggestedAccounts = $derived((data.suggestedAccounts ?? []) as SuggestedAccount[]);

	type LinkedAccount = {
		id: string;
		business_name: string;
		contact_email: string | null;
		location: string | null;
	};
	const linkedAccount = $derived(data.linkedAccount as LinkedAccount | null);

	type ActivityItem = {
		type: 'order' | 'appointment' | 'email';
		id: string;
		title: string;
		subtitle: string | null;
		date: string;
		status?: string;
	};
	const activity = $derived((data.activity ?? []) as ActivityItem[]);

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

	let linkingAccountId = $state<string | null>(null);
	let unlinking = $state(false);
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
			{#if linkedAccount}
				<Badge variant="secondary">Linked</Badge>
			{/if}
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
								href={withProtocol(contact.website)}
								target="_blank"
								rel="external noopener noreferrer"
								class="text-primary hover:underline">{stripProtocol(contact.website)}</a
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

	<!-- Linked Account (discovered contact that's been linked) -->
	{#if linkedAccount}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Linked account</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0 flex-1">
						<a
							href={resolve(`/accounts/${linkedAccount.id}`)}
							class="text-sm font-medium hover:underline"
						>
							{linkedAccount.business_name}
						</a>
						{#if linkedAccount.contact_email}
							<p class="font-mono text-sm text-muted-foreground">{linkedAccount.contact_email}</p>
						{/if}
						{#if linkedAccount.location}
							<p class="text-sm text-muted-foreground">{linkedAccount.location}</p>
						{/if}
					</div>
					<form
						method="POST"
						action="?/unlink"
						use:enhance={() => {
							unlinking = true;
							return async ({ result }) => {
								unlinking = false;
								if (result.type === 'success') {
									toast.success('Unlinked from account');
									await invalidateAll();
								} else if (result.type === 'failure') {
									toast.error(
										(result.data as { message?: string } | undefined)?.message ?? 'Could not unlink'
									);
								}
							};
						}}
					>
						<Button type="submit" variant="outline" size="sm" disabled={unlinking}>
							{unlinking ? 'Unlinking…' : 'Unlink'}
						</Button>
					</form>
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Suggested Account Matches (discovered, not yet linked) -->
	{#if contact.source === 'discovered' && !linkedAccount && suggestedAccounts.length > 0}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Suggested accounts</CardTitle>
			</CardHeader>
			<CardContent>
				<p class="mb-3 text-sm text-muted-foreground">
					These accounts may be the same contact — link to pull their orders and appointments into
					this timeline.
				</p>
				<div class="space-y-2">
					{#each suggestedAccounts as acct (acct.id)}
						<div
							class="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/30"
						>
							<a
								href={resolve(`/accounts/${acct.id}`)}
								class="min-w-0 flex-1 text-sm hover:underline"
							>
								<p class="font-medium">{acct.business_name}</p>
								{#if acct.contact_email}
									<p class="font-mono text-sm text-muted-foreground">{acct.contact_email}</p>
								{/if}
							</a>
							<form
								method="POST"
								action="?/linkToAccount"
								use:enhance={() => {
									linkingAccountId = acct.id;
									return async ({ result }) => {
										linkingAccountId = null;
										if (result.type === 'success') {
											toast.success(`Linked to ${acct.business_name}`);
											await invalidateAll();
										} else if (result.type === 'failure') {
											toast.error(
												(result.data as { message?: string } | undefined)?.message ??
													'Could not link account'
											);
										}
									};
								}}
							>
								<input type="hidden" name="account_id" value={acct.id} />
								<Button type="submit" size="sm" disabled={linkingAccountId !== null}>
									{linkingAccountId === acct.id ? 'Linking…' : 'Link'}
								</Button>
							</form>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- Activity Timeline -->
	{#if activity.length > 0}
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Activity</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="space-y-1">
					{#each activity as item (item.type + item.id)}
						<div class="flex items-start gap-3 rounded-lg px-3 py-2.5">
							<div
								class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
								{item.type === 'email'
									? 'bg-emerald-50 text-emerald-600'
									: item.type === 'order'
										? 'bg-blue-50 text-blue-600'
										: 'bg-violet-50 text-violet-600'}"
							>
								{#if item.type === 'email'}
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
								{:else if item.type === 'order'}
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
											d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
										/>
									</svg>
								{:else}
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
											d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
										/>
									</svg>
								{/if}
							</div>
							<div class="min-w-0 flex-1">
								{#if item.type === 'order'}
									<a
										href={resolve(`/orders/${item.id}`)}
										class="text-sm font-medium hover:underline"
									>
										{item.title}
									</a>
								{:else}
									<p class="text-sm font-medium">{item.title}</p>
								{/if}
								{#if item.subtitle}
									<p class="text-sm text-muted-foreground">{item.subtitle}</p>
								{/if}
							</div>
							{#if item.status}
								<span
									class="inline-flex shrink-0 rounded-md px-2 py-0.5 text-sm font-medium
									{item.status === 'delivered' || item.status === 'completed'
										? 'bg-emerald-50 text-emerald-700'
										: item.status === 'cancelled'
											? 'bg-zinc-100 text-zinc-500'
											: 'bg-blue-50 text-blue-700'}"
								>
									{item.status}
								</span>
							{/if}
							<span class="shrink-0 text-sm text-muted-foreground"
								>{new Date(item.date).toLocaleDateString('en-US', {
									month: 'short',
									day: 'numeric'
								})}</span
							>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{:else}
		<Card>
			<CardContent class="py-10">
				<div class="flex flex-col items-center gap-3 text-center">
					<div class="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
							/>
						</svg>
					</div>
					<div>
						<p class="text-sm font-medium">No activity yet</p>
						<p class="text-sm text-muted-foreground">
							{contact.source === 'discovered' && !linkedAccount
								? 'Link this contact to an account to see orders and appointments.'
								: 'Orders, appointments, and emails will appear here.'}
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
