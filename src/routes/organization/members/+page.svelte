<script lang="ts">
	import { invalidateAll, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase.js';
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import type { UserRole } from '$lib/types/database.js';

	let { data } = $props();
	let showImport = $state(false);

	const teamColumns = [
		{ key: 'first_name', label: 'First Name', required: true },
		{ key: 'last_name', label: 'Last Name', required: true },
		{ key: 'email', label: 'Email', required: true },
		{ key: 'role', label: 'Role', required: true }
	];

	async function handleTeamImport(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row.first_name?.trim()) {
				errors.push(`Row ${i + 1}: First Name is required`);
				continue;
			}
			if (!row.last_name?.trim()) {
				errors.push(`Row ${i + 1}: Last Name is required`);
				continue;
			}
			if (!row.email?.trim()) {
				errors.push(`Row ${i + 1}: Email is required`);
				continue;
			}
			const role = row.role?.trim().toLowerCase() ?? '';
			if (!['admin', 'member', 'sales', 'guest'].includes(role)) {
				errors.push(`Row ${i + 1} (${row.email}): Role must be admin, member, sales, or guest`);
				continue;
			}
			const displayName = `${row.first_name.trim()} ${row.last_name.trim()}`;
			const res = await fetch('/api/invite/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: row.email.trim(), role, brandIds: [], displayName })
			});
			if (res.ok) success++;
			else {
				const json = await res.json().catch(() => ({}));
				errors.push(`Row ${i + 1} (${row.email}): ${json.error ?? 'Failed'}`);
			}
		}
		if (success > 0) invalidateAll();
		return { success, errors };
	}

	const members = $derived(
		data.members as Array<{
			id: string;
			profile_id: string;
			role: UserRole;
			commission_rate: number;
			created_at: string;
			profiles: { id: string; display_name: string; avatar_url: string | null } | null;
		}>
	);
	const invitations = $derived(
		data.invitations as Array<{
			id: string;
			email: string;
			role: UserRole;
			token: string;
			expires_at: string;
			created_at: string;
		}>
	);
	const brands = $derived(data.brands as { id: string; name: string }[]);
	const memberEmails = $derived(data.memberEmails as Record<string, string>);
	const currentUserId = $derived(data.user?.id);

	let showInviteForm = $state(false);
	let inviteEmail = $state('');
	let inviteRole: UserRole = $state('member');
	let selectedBrandIds = $state<string[]>([]);
	let inviting = $state(false);
	let inviteMessage = $state('');
	let updatingId = $state('');
	let copiedId = $state('');

	function copyInviteLink(token: string, id: string) {
		const url = `${window.location.origin}/invite/${token}`;
		navigator.clipboard.writeText(url);
		copiedId = id;
		setTimeout(() => {
			copiedId = '';
		}, 2000);
	}

	// Brand orgs only ever have one brand (their self-brand), so per-member
	// brand scope is tautological — hide for brand orgs entirely.
	const isBrandOrg = $derived(data.orgType === 'brand');
	const showBrandScope = $derived(
		!isBrandOrg && (inviteRole === 'member' || inviteRole === 'sales' || inviteRole === 'guest')
	);

	function toggleBrand(brandId: string) {
		if (selectedBrandIds.includes(brandId)) {
			selectedBrandIds = selectedBrandIds.filter((id) => id !== brandId);
		} else {
			selectedBrandIds = [...selectedBrandIds, brandId];
		}
	}

	const roleBadgeVariant = (role: UserRole) => {
		switch (role) {
			case 'owner':
				return 'default' as const;
			case 'admin':
				return 'secondary' as const;
			case 'member':
				return 'outline' as const;
			case 'sales':
				return 'secondary' as const;
			case 'guest':
				return 'warning' as const;
			default:
				return 'outline' as const;
		}
	};

	async function handleInvite() {
		if (!inviteEmail.trim()) return;
		inviting = true;
		inviteMessage = '';

		const res = await fetch('/api/invite/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: inviteEmail,
				role: inviteRole,
				brandIds: showBrandScope ? selectedBrandIds : []
			})
		});

		const result = await res.json();
		if (res.ok) {
			inviteMessage = 'Invitation sent successfully.';
			inviteEmail = '';
			inviteRole = 'member';
			selectedBrandIds = [];
			await invalidateAll();
		} else {
			inviteMessage = result.error || 'Failed to send invitation.';
		}
		inviting = false;
	}

	async function handleRoleChange(memberId: string, newRole: UserRole) {
		updatingId = memberId;
		const res = await fetch('/api/team/update-role', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ memberId, role: newRole })
		});

		if (res.ok) {
			await invalidateAll();
		}
		updatingId = '';
	}

	async function revokeInvite(invitationId: string) {
		if (!confirm('Revoke this invitation?')) return;
		updatingId = invitationId;
		const res = await fetch('/api/invite/revoke', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ invitationId })
		});
		if (res.ok) await invalidateAll();
		updatingId = '';
	}

	async function handleRemove(memberId: string) {
		if (!confirm('Are you sure you want to remove this team member?')) return;
		updatingId = memberId;

		const res = await fetch('/api/team/remove', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ memberId })
		});

		if (res.ok) {
			await invalidateAll();
			if (drawerMemberId === memberId) closeDrawer();
		}
		updatingId = '';
	}

	// ── Drawer state ──
	type DrawerMember = {
		id: string;
		role: UserRole;
		profile_id: string;
		created_at: string;
		profiles?: { display_name?: string | null; email?: string | null } | null;
	};
	type DrawerCommission = { brand_id: string; rate: number; brands?: { name?: string } | null };
	type DrawerBrandAccess = { id: string; brand_id: string; brands?: { name?: string } | null };
	type DrawerTerritory = { id: string; name: string };
	type DrawerData = {
		member: DrawerMember | null;
		commissions: DrawerCommission[];
		brandAccess: DrawerBrandAccess[];
		territories: DrawerTerritory[];
	};

	let drawerOpen = $state(false);
	let drawerMemberId = $state('');
	let drawerLoading = $state(false);
	let drawerData = $state<DrawerData | null>(null);
	let closingDrawer = $state(false);

	// Open drawer from URL query param (only on initial load)
	$effect(() => {
		const memberId = $page.url.searchParams.get('member');
		if (closingDrawer) return;
		if (memberId && memberId !== drawerMemberId && !drawerOpen) {
			openDrawer(memberId);
		}
	});

	function closeDrawer() {
		closingDrawer = true;
		drawerOpen = false;
		drawerMemberId = '';
		drawerData = null;
		const url = new URL($page.url);
		if (url.searchParams.has('member')) {
			url.searchParams.delete('member');
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-page URL rebuild
			goto(`${resolve('/organization/members')}${url.search}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}
		// Reset flag after a tick so the effect doesn't reopen
		setTimeout(() => {
			closingDrawer = false;
		}, 0);
	}

	async function openDrawer(memberId: string) {
		if (drawerMemberId === memberId && drawerOpen) {
			closeDrawer();
			return;
		}
		drawerMemberId = memberId;
		drawerOpen = true;
		drawerLoading = true;

		const url = new URL($page.url);
		url.searchParams.set('member', memberId);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-page URL rebuild
		goto(`${resolve('/organization/members')}${url.search}`, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});

		const [memberRes, commissionsRes, brandAccessRes, territoriesRes] = await Promise.all([
			supabase
				.from('organization_members')
				.select('*, profiles!organization_members_profile_id_fkey(*)')
				.eq('id', memberId)
				.single(),
			supabase.from('member_brand_commissions').select('*, brands(name)').eq('member_id', memberId),
			supabase.from('member_brand_access').select('*, brands(name)').eq('member_id', memberId),
			supabase.from('territories').select('id, name').eq('assigned_to', memberId).order('name')
		]);

		drawerData = {
			member: memberRes.data as DrawerMember | null,
			commissions: (commissionsRes.data ?? []) as DrawerCommission[],
			brandAccess: (brandAccessRes.data ?? []) as DrawerBrandAccess[],
			territories: (territoriesRes.data ?? []) as DrawerTerritory[]
		};
		drawerLoading = false;
	}

	// Drawer detail helpers
	const drawerMember = $derived(drawerData?.member);
	const drawerCommissions = $derived(drawerData?.commissions ?? []);
	const drawerBrandAccess = $derived(drawerData?.brandAccess ?? []);
	const drawerTerritories = $derived(drawerData?.territories ?? []);
	const drawerCommissionMap = $derived(new Map(drawerCommissions.map((c) => [c.brand_id, c.rate])));
	const drawerAccessBrandIds = $derived(new Set(drawerBrandAccess.map((ba) => ba.brand_id)));
	const drawerIsCurrentUser = $derived(drawerMember?.profile_id === currentUserId);
	const drawerIsOwner = $derived(drawerMember?.role === 'owner');
	const drawerCanEdit = $derived(!drawerIsCurrentUser && !drawerIsOwner);

	let drawerUpdatingRole = $state(false);
	let drawerUpdatingCommission = $state('');
	let drawerRemovingAccess = $state('');

	async function drawerHandleRoleChange(newRole: UserRole) {
		if (!drawerMember) return;
		drawerUpdatingRole = true;
		await fetch('/api/team/update-role', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ memberId: drawerMember.id, role: newRole })
		});
		drawerUpdatingRole = false;
		await invalidateAll();
		await openDrawer(drawerMember.id);
	}

	async function drawerUpdateCommission(brandId: string, value: string) {
		if (!drawerMember) return;
		const rate = parseFloat(value);
		if (isNaN(rate) || rate < 0 || rate > 100) return;
		drawerUpdatingCommission = brandId;
		await fetch('/api/team/update-commission', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ memberId: drawerMember.id, brandId, rate })
		});
		drawerUpdatingCommission = '';
		await openDrawer(drawerMember.id);
	}

	async function drawerAddBrandAccess(brandId: string) {
		if (!drawerMember) return;
		await supabase.from('member_brand_access').insert({
			member_id: drawerMember.id,
			brand_id: brandId,
			granted_by: currentUserId
		});
		await invalidateAll();
		await openDrawer(drawerMember.id);
	}

	async function drawerRemoveBrandAccess(accessId: string) {
		if (!drawerMember) return;
		drawerRemovingAccess = accessId;
		await supabase.from('member_brand_access').delete().eq('id', accessId);
		drawerRemovingAccess = '';
		await invalidateAll();
		await openDrawer(drawerMember.id);
	}

	async function drawerHandleRemove() {
		if (!drawerMember) return;
		if (!confirm(`Remove ${drawerMember.profiles?.display_name ?? 'this member'} from the team?`))
			return;
		const res = await fetch('/api/team/remove', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ memberId: drawerMember.id })
		});
		if (res.ok) {
			closeDrawer();
			await invalidateAll();
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Members</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">
				Manage roles and access for your organization
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button variant="outline" size="sm" onclick={() => (showImport = true)}>Import</Button>
			<Button size="sm" onclick={() => (showInviteForm = !showInviteForm)}>
				{#if showInviteForm}
					Cancel
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="-ml-1 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
					>
					Add User
				{/if}
			</Button>
		</div>
	</div>

	<div class="space-y-4">
		<!-- Inline invite form -->
		{#if showInviteForm}
			<div class="space-y-3 rounded-lg border border-dashed p-4">
				<div class="flex flex-wrap items-end gap-3">
					<div class="min-w-[200px] flex-1">
						<label for="invite-email" class="text-sm font-medium">Email</label>
						<Input
							id="invite-email"
							type="email"
							bind:value={inviteEmail}
							placeholder="team@example.com"
						/>
					</div>
					<div class="w-36">
						<label for="invite-role" class="text-sm font-medium">Role</label>
						<select
							id="invite-role"
							bind:value={inviteRole}
							class="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
						>
							<option value="member">Member</option>
							<option value="sales">Sales</option>
							<option value="admin">Admin</option>
							<option value="guest">Guest</option>
						</select>
					</div>
					<Button size="sm" onclick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
						{inviting ? 'Sending...' : 'Send Invite'}
					</Button>
				</div>
				{#if showBrandScope && brands.length > 0}
					<div class="space-y-2">
						<p class="text-sm text-muted-foreground">
							Brand Access <span class="font-normal">(optional — leave empty for all)</span>
						</p>
						<div class="flex flex-wrap gap-2">
							{#each brands as brand (brand.id)}
								<button
									type="button"
									class="rounded-lg border px-2.5 py-1 text-sm transition-all {selectedBrandIds.includes(
										brand.id
									)
										? 'border-primary bg-primary text-primary-foreground'
										: 'text-muted-foreground hover:border-foreground/20 hover:text-foreground'}"
									onclick={() => toggleBrand(brand.id)}
								>
									{brand.name}
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#if inviteMessage}
					<p class="text-sm text-muted-foreground">{inviteMessage}</p>
				{/if}
			</div>
		{/if}

		<!-- Pending invitations (compact) -->
		{#if invitations.length > 0}
			<div class="space-y-2">
				<p class="text-sm font-medium text-muted-foreground">Pending Invitations</p>
				{#each invitations as invitation (invitation.id)}
					<div class="flex items-center justify-between rounded-lg border px-4 py-2.5">
						<div class="flex items-center gap-3">
							<span class="font-mono text-sm">{invitation.email}</span>
							<Badge variant={roleBadgeVariant(invitation.role)}>{invitation.role}</Badge>
						</div>
						<div class="flex items-center gap-1">
							<button
								class="text-sm text-muted-foreground transition-colors hover:text-foreground"
								onclick={() => copyInviteLink(invitation.token, invitation.id)}
							>
								{copiedId === invitation.id ? 'Copied!' : 'Copy Link'}
							</button>
							<button
								class="text-sm text-muted-foreground transition-colors hover:text-destructive"
								disabled={updatingId === invitation.id}
								onclick={() => revokeInvite(invitation.id)}
							>
								Revoke
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if members.length === 0}
			<div class="rounded-lg border border-dashed p-8 text-center">
				<p class="text-muted-foreground">No team members found.</p>
			</div>
		{:else}
			<div class="rounded-md border">
				<table class="w-full">
					<thead>
						<tr class="border-b bg-muted/50">
							<th class="px-4 py-3 text-left text-sm font-medium">Name</th>
							<th class="px-4 py-3 text-left text-sm font-medium">Role</th>
							<th class="px-4 py-3 text-right text-sm font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each members as member (member.id)}
							{@const isCurrentUser = member.profile_id === currentUserId}
							{@const isOwner = member.role === 'owner'}
							<tr
								class="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/50 {drawerMemberId ===
								member.id
									? 'bg-muted/50'
									: ''}"
								onclick={() => openDrawer(member.id)}
							>
								<td class="px-4 py-3">
									<div class="flex items-center gap-3">
										<div
											class="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-medium"
										>
											{member.profiles?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
										</div>
										<div>
											<span class="text-base font-medium"
												>{member.profiles?.display_name ?? 'Unknown'}
												{#if isCurrentUser}<span
														class="ml-1 text-xs font-normal text-muted-foreground">(You)</span
													>{/if}</span
											>
											<p class="font-mono text-xs text-muted-foreground">
												{memberEmails[member.profile_id] ?? ''}
											</p>
										</div>
									</div>
								</td>
								<td class="px-4 py-3">
									{#if isOwner || isCurrentUser}
										<Badge variant={roleBadgeVariant(member.role)}>
											{member.role}
										</Badge>
									{:else}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div onclick={(e) => e.stopPropagation()}>
											<select
												value={member.role}
												disabled={updatingId === member.id}
												onchange={(e) =>
													handleRoleChange(
														member.id,
														(e.target as HTMLSelectElement).value as UserRole
													)}
												class="h-8 rounded-md border border-input bg-background px-2 text-sm"
											>
												<option value="admin">Admin</option>
												<option value="member">Member</option>
												<option value="sales">Sales</option>
												<option value="guest">Guest</option>
											</select>
										</div>
									{/if}
								</td>
								<td class="px-4 py-3 text-right">
									{#if !isOwner && !isCurrentUser}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div onclick={(e) => e.stopPropagation()}>
											<Button
												variant="destructive"
												size="sm"
												disabled={updatingId === member.id}
												onclick={() => handleRemove(member.id)}
											>
												Remove
											</Button>
										</div>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>

<!-- Member Detail Drawer -->
{#if drawerOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" onclick={closeDrawer}></div>
{/if}

<div
	class={cn(
		'fixed top-3 right-3 bottom-3 z-50 w-[calc(100vw-5rem)] overflow-hidden rounded-none border bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[28rem]',
		drawerOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
	)}
>
	<div class="flex h-full flex-col">
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-4">
			{#if drawerMember}
				<div class="flex min-w-0 items-center gap-3">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
					>
						{drawerMember.profiles?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
					</div>
					<div class="min-w-0">
						<h2 class="truncate text-base font-semibold">
							{drawerMember.profiles?.display_name ?? 'Unknown'}
						</h2>
						<div class="flex items-center gap-2">
							<Badge variant={roleBadgeVariant(drawerMember.role)}>{drawerMember.role}</Badge>
							{#if drawerIsCurrentUser}
								<span class="text-xs text-muted-foreground">You</span>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<h2 class="text-base font-semibold">Member Details</h2>
			{/if}
			<button
				onclick={closeDrawer}
				aria-label="Close"
				class="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
			{#if drawerLoading}
				<div class="flex items-center justify-center py-12">
					<div
						class="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
					></div>
				</div>
			{:else if drawerMember}
				<!-- Profile -->
				<div class="space-y-3">
					<h3 class="text-sm font-semibold">Profile</h3>
					<dl class="space-y-2.5 text-sm">
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Name</dt>
							<dd class="font-medium">{drawerMember.profiles?.display_name ?? '--'}</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Role</dt>
							<dd>
								{#if drawerCanEdit}
									<select
										value={drawerMember.role}
										disabled={drawerUpdatingRole}
										onchange={(e) =>
											drawerHandleRoleChange((e.target as HTMLSelectElement).value as UserRole)}
										class="h-8 rounded-md border border-input bg-background px-2 text-sm"
									>
										<option value="admin">Admin</option>
										<option value="member">Member</option>
										<option value="sales">Sales</option>
										<option value="guest">Guest</option>
									</select>
								{:else}
									<Badge variant={roleBadgeVariant(drawerMember.role)}>{drawerMember.role}</Badge>
								{/if}
							</dd>
						</div>
						<div class="flex justify-between">
							<dt class="text-muted-foreground">Member since</dt>
							<dd>
								{new Date(drawerMember.created_at).toLocaleDateString('en-US', {
									month: 'long',
									day: 'numeric',
									year: 'numeric'
								})}
							</dd>
						</div>
					</dl>
				</div>

				<!-- Territories -->
				{#if drawerTerritories.length > 0}
					<div class="h-px bg-border"></div>
					<div class="space-y-3">
						<h3 class="text-sm font-semibold">Territories</h3>
						<div class="space-y-1.5">
							{#each drawerTerritories as territory (territory.id)}
								<div class="flex items-center rounded-lg border px-3 py-2">
									<a
										href={resolve(`/organization/territories/${territory.id}`)}
										class="text-sm font-medium hover:underline">{territory.name}</a
									>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Commission Rates -->
				{#if drawerBrandAccess.length === 0}
					<div class="h-px bg-border"></div>
					<div class="space-y-3">
						<h3 class="text-sm font-semibold">Commission Rates</h3>
						{#if brands.length === 0}
							<p class="text-sm text-muted-foreground">No brands available.</p>
						{:else}
							<div class="space-y-1.5">
								{#each brands as brand (brand.id)}
									<div class="flex items-center justify-between rounded-lg border px-3 py-2">
										<span class="text-sm font-medium">{brand.name}</span>
										<div class="flex items-center gap-1.5">
											<input
												type="number"
												step="0.01"
												min="0"
												max="100"
												value={drawerCommissionMap.get(brand.id) ?? 0}
												disabled={drawerUpdatingCommission === brand.id}
												onchange={(e) =>
													drawerUpdateCommission(brand.id, (e.target as HTMLInputElement).value)}
												class="h-7 w-16 rounded-md border border-input bg-background px-2 text-right text-sm"
											/>
											<span class="text-xs text-muted-foreground">%</span>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Brand Access — rep orgs only (brand orgs are single-brand) -->
				{#if !isBrandOrg && (drawerMember.role === 'member' || drawerMember.role === 'guest')}
					<div class="h-px bg-border"></div>
					<div class="space-y-3">
						<h3 class="text-sm font-semibold">Brand Access</h3>
						<p class="text-xs text-muted-foreground">
							{drawerBrandAccess.length === 0
								? 'Can see all brands (default). Add specific brands to restrict.'
								: 'Can only see the brands listed below.'}
						</p>
						{#if drawerBrandAccess.length > 0}
							<div class="flex flex-wrap gap-1.5">
								{#each drawerBrandAccess as ba (ba.id)}
									<div class="flex items-center gap-1 rounded-lg border px-2.5 py-1">
										<span class="text-sm">{ba.brands?.name ?? 'Unknown'}</span>
										<button
											aria-label="Remove brand access"
											class="text-muted-foreground transition-colors hover:text-destructive"
											disabled={drawerRemovingAccess === ba.id}
											onclick={() => drawerRemoveBrandAccess(ba.id)}
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3.5 w-3.5"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
													clip-rule="evenodd"
												/>
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}

						{#if brands.filter((b) => !drawerAccessBrandIds.has(b.id)).length > 0}
							<select
								class="h-8 rounded-lg border border-input bg-background px-3 text-sm"
								onchange={(e) => {
									const val = (e.target as HTMLSelectElement).value;
									if (val) {
										drawerAddBrandAccess(val);
										(e.target as HTMLSelectElement).value = '';
									}
								}}
							>
								<option value="">Add brand access...</option>
								{#each brands.filter((b) => !drawerAccessBrandIds.has(b.id)) as brand (brand.id)}
									<option value={brand.id}>{brand.name}</option>
								{/each}
							</select>
						{/if}
					</div>
				{/if}

				<!-- Remove -->
				{#if drawerCanEdit}
					<div class="h-px bg-border"></div>
					<div class="flex justify-end">
						<Button variant="destructive" size="sm" onclick={drawerHandleRemove}>
							Remove member
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<BulkImportModal
	open={showImport}
	ontoggle={() => (showImport = false)}
	entityType="team member"
	columns={teamColumns}
	onimport={handleTeamImport}
/>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && drawerOpen) closeDrawer();
	}}
/>
