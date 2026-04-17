<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { data } = $props();

	type RepRow = {
		id: string;
		name: string;
		email?: string | null;
		role: string;
		orderCount: number;
		revenue: number;
		avatarUrl?: string | null;
	};
	const reps = $derived((data.reps ?? []) as RepRow[]);
	const selfBrandId = $derived((data.selfBrandId as string | null) ?? null);
	const pendingInvites = $derived(data.pendingInvites ?? []);
	const totalRevenue = $derived(reps.reduce((sum, r) => sum + r.revenue, 0));
	const totalOrders = $derived(reps.reduce((sum, r) => sum + r.orderCount, 0));
	const canManage = $derived(
		data.membership?.role === 'admin' || data.membership?.role === 'owner'
	);

	let showImport = $state(false);

	let copiedInviteId = $state<string | null>(null);

	async function copyPendingInviteLink(token: string, id: string) {
		try {
			await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
			copiedInviteId = id;
			setTimeout(() => {
				if (copiedInviteId === id) copiedInviteId = null;
			}, 2000);
		} catch {
			// Ignore — user can fall back to opening the page.
		}
	}

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((w: string) => w[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}

	function roleLabel(r: string): string {
		return r.charAt(0).toUpperCase() + r.slice(1);
	}

	const fmt = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	function csvEscape(value: unknown): string {
		if (value === null || value === undefined) return '';
		const s = String(value);
		if (s.includes(',') || s.includes('"') || s.includes('\n')) {
			return `"${s.replace(/"/g, '""')}"`;
		}
		return s;
	}

	function handleExport() {
		const header = ['name', 'role', 'orders', 'revenue'];
		const rows = reps.map((r) =>
			[r.name, r.role, r.orderCount, r.revenue].map(csvEscape).join(',')
		);
		const csv = [header.join(','), ...rows].join('\n');
		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `reps-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	const repColumns = [
		{ key: 'email', label: 'Email', required: true },
		{ key: 'role', label: 'Role (admin, member, sales, guest)', required: true }
	];

	async function handleImport(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const email = row.email?.trim();
			const role = row.role?.trim().toLowerCase();
			if (!email) {
				errors.push(`Row ${i + 1}: email is required`);
				continue;
			}
			if (!role || !['admin', 'member', 'sales', 'guest'].includes(role)) {
				errors.push(`Row ${i + 1} (${email}): role must be admin, member, sales, or guest`);
				continue;
			}
			try {
				const res = await fetch('/api/invite/send', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ email, role, brandIds: [] })
				});
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					errors.push(`Row ${i + 1} (${email}): ${body.error ?? 'Invite failed'}`);
					continue;
				}
				success++;
			} catch (e) {
				errors.push(`Row ${i + 1} (${email}): ${e instanceof Error ? e.message : 'Invite failed'}`);
			}
		}
		if (success > 0) invalidateAll();
		return { success, errors };
	}

	// ── Invite form ────────────────────────────────────────────────────────
	let inviteOpen = $state(false);
	let inviteEmail = $state('');
	let inviteCommissionRate = $state<string>('');
	let sending = $state(false);
	let inviteError = $state('');
	let inviteSuccess = $state('');
	let inviteLink = $state('');
	let linkCopied = $state(false);

	async function sendInvite() {
		const email = inviteEmail.trim();
		if (!email) {
			inviteError = 'Enter an email address.';
			return;
		}
		sending = true;
		inviteError = '';
		inviteSuccess = '';
		inviteLink = '';
		linkCopied = false;
		const res = await fetch('/api/invite/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email,
				role: 'sales',
				brandIds: selfBrandId ? [selfBrandId] : [],
				commissionRate: parseFloat(inviteCommissionRate) || 0
			})
		});
		sending = false;
		const body = (await res.json().catch(() => ({}))) as {
			error?: string;
			autoAdded?: boolean;
			inviteUrl?: string;
		};
		if (!res.ok) {
			inviteError = body.error ?? 'Failed to send invite';
			return;
		}
		if (body.autoAdded) {
			inviteSuccess = `${email} was added to your organization.`;
		} else if (body.inviteUrl) {
			inviteLink = `${window.location.origin}${body.inviteUrl}`;
			inviteSuccess = `Invite ready for ${email}. Copy the link below and send it to them.`;
		} else {
			inviteSuccess = `Invite created for ${email}.`;
		}
		inviteEmail = '';
		inviteCommissionRate = '';
		invalidateAll();
	}

	async function copyInviteLink() {
		if (!inviteLink) return;
		try {
			await navigator.clipboard.writeText(inviteLink);
			linkCopied = true;
			setTimeout(() => (linkCopied = false), 2000);
		} catch {
			// Clipboard API can fail in insecure contexts — fall through silently; the input is selectable.
		}
	}

	function closeInvite() {
		inviteOpen = false;
		inviteError = '';
		inviteSuccess = '';
		inviteLink = '';
		linkCopied = false;
	}
</script>

<div class="space-y-6">
	<PageHeader
		title="Reps"
		subtitle="{reps.length} team member{reps.length !== 1 ? 's' : ''}{pendingInvites.length > 0
			? ` · ${pendingInvites.length} pending`
			: ''} · {totalOrders} orders · {fmt.format(totalRevenue)} revenue"
	>
		{#if canManage}
			<Button variant="outline" onclick={handleExport} disabled={reps.length === 0}>Export</Button>
			<Button variant="outline" onclick={() => (showImport = true)}>Import</Button>
		{/if}
		<Button onclick={() => (inviteOpen = !inviteOpen)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
			</svg>
			{inviteOpen ? 'Close' : 'Invite'}
		</Button>
	</PageHeader>

	{#if inviteOpen}
		<div class="rounded-lg border p-5">
			<h2 class="text-lg font-semibold">Invite a rep</h2>
			<p class="text-sm text-muted-foreground">
				Send an invite to join your org. They'll get an email with a signup link.
			</p>
			<div class="mt-4 grid gap-4 sm:grid-cols-[1fr_140px_auto]">
				<div>
					<Label for="invite-email">Email</Label>
					<Input
						id="invite-email"
						type="email"
						placeholder="name@example.com"
						bind:value={inviteEmail}
					/>
				</div>
				<div>
					<Label for="invite-commission">Commission %</Label>
					<Input
						id="invite-commission"
						type="number"
						min="0"
						max="100"
						step="0.25"
						placeholder="0"
						bind:value={inviteCommissionRate}
					/>
				</div>
				<div class="flex items-end">
					<Button disabled={sending || !inviteEmail.trim()} onclick={sendInvite}>
						{sending ? 'Sending…' : 'Send invite'}
					</Button>
				</div>
			</div>
			<p class="mt-2 text-sm text-muted-foreground">
				Invites from this page join as sales reps. To invite an admin or member, use
				<a href={resolve('/organization/members')} class="underline hover:text-foreground"
					>Organization › Members</a
				>.
			</p>
			{#if inviteError}
				<p class="mt-3 text-sm text-red-600">{inviteError}</p>
			{/if}
			{#if inviteSuccess}
				<div class="mt-3 space-y-3">
					<div class="flex items-center justify-between text-sm text-emerald-600">
						<span>{inviteSuccess}</span>
						<button
							type="button"
							class="text-sm text-muted-foreground underline hover:text-foreground"
							onclick={closeInvite}
						>
							Done
						</button>
					</div>
					{#if inviteLink}
						<div class="flex items-center gap-2">
							<Input
								readonly
								value={inviteLink}
								onclick={(e: Event) => (e.currentTarget as HTMLInputElement).select()}
							/>
							<Button variant="outline" onclick={copyInviteLink}>
								{linkCopied ? 'Copied' : 'Copy link'}
							</Button>
						</div>
						<p class="text-sm text-muted-foreground">
							Link expires in 7 days. Email delivery is coming soon — share this link manually for
							now.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if pendingInvites.length > 0}
		<div class="space-y-2">
			<h2 class="text-sm font-semibold text-muted-foreground">Pending invitations</h2>
			{#each pendingInvites as inv (inv.id)}
				<div class="flex items-center justify-between rounded-none border bg-card px-5 py-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground"
						>
							{inv.email.charAt(0).toUpperCase()}
						</div>
						<div>
							<p class="text-sm font-medium">{inv.email}</p>
							<p class="text-sm text-muted-foreground">
								{roleLabel(inv.role)} &middot; Invited {new Date(
									inv.created_at
								).toLocaleDateString()}
							</p>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<span class="rounded-full border px-2 py-0.5 text-sm text-muted-foreground"
							>Pending</span
						>
						<Button
							variant="outline"
							size="sm"
							onclick={() => copyPendingInviteLink(inv.token, inv.id)}
						>
							{copiedInviteId === inv.id ? 'Copied' : 'Copy link'}
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if reps.length === 0 && pendingInvites.length === 0}
		<div class="flex flex-col items-center justify-center py-16">
			<div class="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-7 w-7 text-muted-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
					/>
				</svg>
			</div>
			<h3 class="mt-4 text-base font-semibold">No reps yet</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				Invite team members to start tracking rep performance.
			</p>
		</div>
	{:else}
		<div class="space-y-2">
			{#each reps as rep (rep.id)}
				<div class="flex items-center justify-between rounded-none border bg-card px-5 py-4">
					<div class="flex items-center gap-3">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
						>
							{getInitials(rep.name)}
						</div>
						<div>
							<p class="text-sm font-medium">{rep.name}</p>
							<p class="text-sm text-muted-foreground">{roleLabel(rep.role)}</p>
						</div>
					</div>
					<div class="flex items-center gap-8 text-right">
						<div>
							<p class="text-sm font-medium">{rep.orderCount}</p>
							<p class="text-sm text-muted-foreground">Orders</p>
						</div>
						<div>
							<p class="text-sm font-medium">{fmt.format(rep.revenue)}</p>
							<p class="text-sm text-muted-foreground">Revenue</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<BulkImportModal
	open={showImport}
	ontoggle={() => (showImport = false)}
	entityType="Reps"
	columns={repColumns}
	onimport={handleImport}
/>
