<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { cn } from '$lib/utils.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import BulkImportModal from '$lib/components/shared/BulkImportModal.svelte';
	import type { Show, ShowDate, ShowDateDocument } from '$lib/types/database.js';

	type ShowWithDates = Show & { show_dates: ShowDate[] };

	let { data } = $props();
	const shows = $derived(data.shows as ShowWithDates[]);
	const canEdit = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	let showImport = $state(false);

	const showColumns = [
		{ key: 'name', label: 'Show Name', required: true },
		{ key: 'notes', label: 'Notes' }
	];

	async function handleShowImport(
		rows: Record<string, string>[]
	): Promise<{ success: number; errors: string[] }> {
		let success = 0;
		const errors: string[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row.name?.trim()) {
				errors.push(`Row ${i + 1}: Show Name is required`);
				continue;
			}
			const { error } = await supabase.from('shows').insert({
				organization_id: data.organization?.id,
				name: row.name.trim(),
				notes: row.notes?.trim() || null
			});
			if (error) errors.push(`Row ${i + 1} (${row.name}): ${error.message}`);
			else success++;
		}
		if (success > 0) invalidateAll();
		return { success, errors };
	}

	let search = $state('');
	const filtered = $derived(
		shows.filter(
			(s) =>
				s.name.toLowerCase().includes(search.toLowerCase()) ||
				s.show_dates?.some(
					(d) =>
						(d.venue?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
						(d.city?.toLowerCase().includes(search.toLowerCase()) ?? false)
				)
		)
	);

	// Expandable series
	let expandedIds = $state<Set<string>>(new Set());

	function toggleExpand(id: string) {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive transient computation
		const next = new Set(expandedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		expandedIds = next;
	}

	// Inline "Add Date" form state
	let addingDateForShowId = $state<string | null>(null);
	let newDateMonth = $state(1);
	let newDateYear = $state(new Date().getFullYear());
	let newDateCity = $state('');
	let newDateState = $state('');
	let newDateVenue = $state('');
	let dateError = $state('');
	let dateLoading = $state(false);

	function startAddDate(showId: string) {
		addingDateForShowId = showId;
		newDateMonth = 1;
		newDateYear = new Date().getFullYear();
		newDateCity = '';
		newDateState = '';
		newDateVenue = '';
		dateError = '';
		// Make sure this series is expanded
		if (!expandedIds.has(showId)) {
			toggleExpand(showId);
		}
	}

	async function saveDate() {
		if (!addingDateForShowId) return;
		dateError = '';
		dateLoading = true;

		const { error: err } = await supabase.from('show_dates').insert({
			show_id: addingDateForShowId,
			organization_id: data.organization?.id,
			year: newDateYear,
			month: newDateMonth,
			venue: newDateVenue || null,
			city: newDateCity || null,
			state: newDateState || null
		});

		dateLoading = false;
		if (err) {
			dateError = err.message;
		} else {
			addingDateForShowId = null;
			invalidateAll();
		}
	}

	// Inline "New Show" form
	let creatingShow = $state(false);
	let newShowName = $state('');
	let showError = $state('');
	let showLoading = $state(false);

	async function createShow() {
		showError = '';
		showLoading = true;

		const { error: err } = await supabase.from('shows').insert({
			organization_id: data.organization?.id,
			name: newShowName
		});

		showLoading = false;
		if (err) {
			showError = err.message;
		} else {
			newShowName = '';
			creatingShow = false;
			invalidateAll();
		}
	}

	const monthNames = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sep',
		'Oct',
		'Nov',
		'Dec'
	];

	function monthLabel(month: number): string {
		return monthNames[month - 1] ?? '';
	}

	// ── Drawer state ──
	type DrawerShow = Show & { show_dates: ShowDate[] };

	let drawerOpen = $state(false);
	let drawerShowId = $state('');
	let drawerLoading = $state(false);
	let drawerShow = $state<DrawerShow | null>(null);
	let drawerDocuments = $state<Record<string, ShowDateDocument[]>>({});

	// Drawer edit state
	let dEditing = $state(false);
	let dName = $state('');
	let dNotes = $state('');
	let dError = $state('');
	let dLoading = $state(false);
	let dAddingDate = $state(false);
	let dNewMonth = $state(1);
	let dNewYear = $state(new Date().getFullYear());
	let dNewCity = $state('');
	let dNewState = $state('');
	let dNewVenue = $state('');
	let dDateLoading = $state(false);
	let dDateError = $state('');
	let dUploadingForDateId = $state('');

	function closeDrawer() {
		drawerOpen = false;
		drawerShowId = '';
		drawerShow = null;
		drawerDocuments = {};
		dEditing = false;
		dAddingDate = false;
	}

	async function openDrawer(showId: string) {
		if (drawerShowId === showId && drawerOpen) {
			closeDrawer();
			return;
		}
		drawerShowId = showId;
		drawerOpen = true;
		drawerLoading = true;
		dEditing = false;
		dAddingDate = false;

		const { data: show } = await supabase
			.from('shows')
			.select('*, show_dates(*)')
			.eq('id', showId)
			.single();

		drawerShow = show as DrawerShow;

		const dateIds = (show?.show_dates ?? []).map((d: { id: string }) => d.id);
		drawerDocuments = {};
		if (dateIds.length > 0) {
			const { data: docs } = await supabase
				.from('show_date_documents')
				.select('*')
				.in('show_date_id', dateIds)
				.order('created_at', { ascending: false });
			for (const doc of docs ?? []) {
				if (!drawerDocuments[doc.show_date_id]) drawerDocuments[doc.show_date_id] = [];
				drawerDocuments[doc.show_date_id].push(doc);
			}
		}
		drawerLoading = false;
	}

	async function refreshDrawer() {
		if (drawerShowId) await openDrawer(drawerShowId);
	}

	function dStartEdit() {
		if (!drawerShow) return;
		dName = drawerShow.name;
		dNotes = drawerShow.notes ?? '';
		dEditing = true;
	}

	async function dHandleSave() {
		if (!drawerShow) return;
		dError = '';
		dLoading = true;
		const { error: err } = await supabase
			.from('shows')
			.update({ name: dName, notes: dNotes || null, updated_at: new Date().toISOString() })
			.eq('id', drawerShow.id);
		dLoading = false;
		if (err) {
			dError = err.message;
		} else {
			dEditing = false;
			await invalidateAll();
			await refreshDrawer();
		}
	}

	async function dSaveDate() {
		if (!drawerShow) return;
		dDateError = '';
		dDateLoading = true;
		const { error: err } = await supabase.from('show_dates').insert({
			show_id: drawerShow.id,
			organization_id: data.organization?.id,
			year: dNewYear,
			month: dNewMonth,
			venue: dNewVenue || null,
			city: dNewCity || null,
			state: dNewState || null
		});
		dDateLoading = false;
		if (err) {
			dDateError = err.message;
		} else {
			dAddingDate = false;
			dNewMonth = 1;
			dNewYear = new Date().getFullYear();
			dNewCity = '';
			dNewState = '';
			dNewVenue = '';
			await invalidateAll();
			await refreshDrawer();
		}
	}

	async function dDeleteDate(id: string) {
		await supabase.from('show_dates').delete().eq('id', id);
		await invalidateAll();
		await refreshDrawer();
	}

	async function dUploadDocument(dateId: string, file: File) {
		dUploadingForDateId = dateId;
		const formData = new FormData();
		formData.append('file', file);
		await fetch(`/api/shows/${dateId}/documents`, { method: 'POST', body: formData });
		dUploadingForDateId = '';
		await refreshDrawer();
	}

	async function dDeleteDocument(dateId: string, documentId: string) {
		await fetch(`/api/shows/${dateId}/documents`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ documentId })
		});
		await refreshDrawer();
	}

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold">Shows</h2>
			<p class="mt-0.5 text-sm text-muted-foreground">Trade show series and their dates</p>
		</div>
		{#if canEdit}
			<div class="flex items-center gap-2">
				<Button variant="outline" size="sm" onclick={() => (showImport = true)}>Import</Button>
				<Button size="sm" onclick={() => (creatingShow = true)}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="-ml-1 h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
						><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg
					>
					New Show
				</Button>
			</div>
		{/if}
	</div>

	{#if creatingShow}
		<div class="space-y-3 rounded-none border p-4">
			<p class="text-sm font-medium">New Show Series</p>
			{#if showError}
				<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{showError}</div>
			{/if}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					createShow();
				}}
				class="flex items-end gap-3"
			>
				<div class="flex-1 space-y-1">
					<Label for="new-show-name">Name *</Label>
					<Input
						id="new-show-name"
						bind:value={newShowName}
						required
						placeholder="Brand Assembly"
					/>
				</div>
				<Button type="submit" disabled={showLoading || !newShowName}>
					{showLoading ? 'Creating...' : 'Create'}
				</Button>
				<Button variant="outline" onclick={() => (creatingShow = false)}>Cancel</Button>
			</form>
		</div>
	{/if}

	<div class="max-w-xs">
		<Input placeholder="Search shows..." bind:value={search} />
	</div>

	{#if filtered.length === 0}
		<div class="rounded-none p-12 text-center">
			{#if search}
				<p class="text-lg font-semibold">No shows match your search</p>
				<p class="mt-2 text-sm text-muted-foreground">Try a different search term</p>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="mx-auto h-16 w-16 text-foreground"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="0.4"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z"
					/>
				</svg>
				<p class="mt-4 text-lg font-semibold">Your shows live here</p>
				<p class="mt-2 text-sm text-muted-foreground">
					Add your first show to start tracking market events
				</p>
			{/if}
		</div>
	{:else}
		<div class="space-y-2">
			{#each filtered as show (show.id)}
				<div class="overflow-hidden rounded-none border">
					<!-- Series header -->
					<div class="flex items-center justify-between bg-muted/30 px-4 py-3">
						<button
							type="button"
							class="flex cursor-pointer items-center gap-2 text-sm font-medium hover:underline"
							onclick={() => toggleExpand(show.id)}
						>
							<span class="text-muted-foreground">{expandedIds.has(show.id) ? '▾' : '▸'}</span>
							<span
								class="cursor-pointer text-base hover:underline"
								role="button"
								tabindex="0"
								onclick={(e) => {
									e.stopPropagation();
									openDrawer(show.id);
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										e.stopPropagation();
										openDrawer(show.id);
									}
								}}>{show.name}</span
							>
							<span class="font-mono text-sm font-normal text-muted-foreground"
								>({show.show_dates?.length ?? 0} Show{(show.show_dates?.length ?? 0) === 1
									? ''
									: 's'})</span
							>
						</button>
						{#if canEdit}
							<button
								type="button"
								class="cursor-pointer text-sm text-primary hover:underline"
								onclick={() => startAddDate(show.id)}
							>
								+ Add Date
							</button>
						{/if}
					</div>

					<!-- Expanded dates -->
					{#if expandedIds.has(show.id)}
						<div class="divide-y">
							{#each show.show_dates ?? [] as date (date.id)}
								<div class="flex items-center gap-6 px-6 py-2.5 text-sm">
									<span class="font-medium">{monthLabel(date.month)} {date.year}</span>
									<span class="font-mono text-muted-foreground"
										>{[date.city, date.state].filter(Boolean).join(', ') || '—'}</span
									>
									<span class="font-mono text-muted-foreground">{date.venue || ''}</span>
								</div>
							{/each}
							{#if (show.show_dates?.length ?? 0) === 0 && addingDateForShowId !== show.id}
								<div class="px-6 py-3 text-sm text-muted-foreground">No dates yet.</div>
							{/if}

							<!-- Inline add-date form -->
							{#if addingDateForShowId === show.id}
								<div class="space-y-3 bg-muted/10 px-6 py-3">
									{#if dateError}
										<div class="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
											{dateError}
										</div>
									{/if}
									<form
										onsubmit={(e) => {
											e.preventDefault();
											saveDate();
										}}
										class="flex flex-wrap items-end gap-3"
									>
										<div class="space-y-1">
											<Label for="date-month">Month</Label>
											<select
												id="date-month"
												bind:value={newDateMonth}
												class="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
											>
												{#each monthNames as m, i (m)}
													<option value={i + 1}>{m}</option>
												{/each}
											</select>
										</div>
										<div class="space-y-1">
											<Label for="date-year">Year</Label>
											<Input
												id="date-year"
												type="number"
												bind:value={newDateYear}
												min={2020}
												max={2040}
												class="w-24"
											/>
										</div>
										<div class="space-y-1">
											<Label for="date-city">City</Label>
											<Input
												id="date-city"
												bind:value={newDateCity}
												placeholder="New York"
												class="w-36"
											/>
										</div>
										<div class="space-y-1">
											<Label for="date-state">State</Label>
											<Input
												id="date-state"
												bind:value={newDateState}
												placeholder="NY"
												class="w-20"
											/>
										</div>
										<div class="space-y-1">
											<Label for="date-venue">Venue</Label>
											<Input
												id="date-venue"
												bind:value={newDateVenue}
												placeholder="Convention Center"
												class="w-44"
											/>
										</div>
										<Button type="submit" size="sm" disabled={dateLoading}>
											{dateLoading ? 'Saving...' : 'Save'}
										</Button>
										<Button variant="outline" size="sm" onclick={() => (addingDateForShowId = null)}
											>Cancel</Button
										>
									</form>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<BulkImportModal
	open={showImport}
	ontoggle={() => (showImport = false)}
	entityType="show"
	columns={showColumns}
	onimport={handleShowImport}
/>

<!-- Show Detail Drawer -->
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
			{#if drawerShow}
				<h2 class="text-base font-semibold">{drawerShow.name}</h2>
			{:else}
				<h2 class="text-base font-semibold">Show Details</h2>
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
			{:else if drawerShow}
				<!-- Series info -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-semibold">Details</h3>
						{#if canEdit && !dEditing}
							<button
								class="text-sm text-muted-foreground hover:text-foreground"
								onclick={dStartEdit}>Edit</button
							>
						{/if}
					</div>

					{#if dError}
						<div class="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{dError}</div>
					{/if}

					{#if dEditing}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								dHandleSave();
							}}
							class="space-y-3"
						>
							<div class="space-y-1">
								<Label for="d-name">Name</Label>
								<Input id="d-name" bind:value={dName} required />
							</div>
							<div class="space-y-1">
								<Label for="d-notes">Notes</Label>
								<textarea
									id="d-notes"
									bind:value={dNotes}
									rows="2"
									class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
								></textarea>
							</div>
							<div class="flex gap-2">
								<Button type="submit" size="sm" disabled={dLoading}
									>{dLoading ? 'Saving...' : 'Save'}</Button
								>
								<Button variant="outline" size="sm" onclick={() => (dEditing = false)}
									>Cancel</Button
								>
							</div>
						</form>
					{:else}
						<dl class="space-y-2.5 text-sm">
							<div class="flex justify-between">
								<dt class="text-muted-foreground">Name</dt>
								<dd class="font-medium">{drawerShow.name}</dd>
							</div>
							{#if drawerShow.notes}
								<div class="flex justify-between">
									<dt class="text-muted-foreground">Notes</dt>
									<dd class="text-right whitespace-pre-wrap">{drawerShow.notes}</dd>
								</div>
							{/if}
						</dl>
					{/if}
				</div>

				<!-- Dates -->
				<div class="h-px bg-border"></div>
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-semibold">Dates ({drawerShow.show_dates?.length ?? 0})</h3>
						{#if canEdit && !dAddingDate}
							<button
								class="text-sm text-muted-foreground hover:text-foreground"
								onclick={() => (dAddingDate = true)}>+ Add</button
							>
						{/if}
					</div>

					{#if (drawerShow.show_dates?.length ?? 0) === 0 && !dAddingDate}
						<p class="text-sm text-muted-foreground">No dates yet.</p>
					{/if}

					{#each drawerShow.show_dates ?? [] as date (date.id)}
						<div class="space-y-2 rounded-lg border px-3 py-2.5">
							<div class="flex items-center justify-between">
								<div class="text-sm">
									<span class="font-medium">{monthLabel(date.month)} {date.year}</span>
									{#if date.city || date.state}
										<span class="ml-2 font-mono text-muted-foreground"
											>{[date.city, date.state].filter(Boolean).join(', ')}</span
										>
									{/if}
									{#if date.venue}
										<span class="ml-2 font-mono text-muted-foreground">{date.venue}</span>
									{/if}
								</div>
								{#if canEdit}
									<button
										class="text-xs text-muted-foreground hover:text-destructive"
										onclick={() => dDeleteDate(date.id)}>Remove</button
									>
								{/if}
							</div>
							{#if date.contact_name || date.contact_email}
								<div class="text-xs text-muted-foreground">
									{[date.contact_name, date.contact_email].filter(Boolean).join(' · ')}
								</div>
							{/if}
							{#if date.notes}
								<p class="text-xs text-muted-foreground italic">{date.notes}</p>
							{/if}
							<!-- Documents -->
							{#if (drawerDocuments[date.id] ?? []).length > 0 || canEdit}
								<div class="space-y-1 border-t pt-2">
									{#each drawerDocuments[date.id] ?? [] as doc (doc.id)}
										<div class="flex items-center justify-between text-xs">
											<span class="text-muted-foreground"
												>{doc.name} {doc.file_size ? formatFileSize(doc.file_size) : ''}</span
											>
											{#if canEdit}
												<button
													class="text-muted-foreground hover:text-destructive"
													onclick={() => dDeleteDocument(date.id, doc.id)}>Remove</button
												>
											{/if}
										</div>
									{/each}
									{#if canEdit}
										<label
											class="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
										>
											{#if dUploadingForDateId === date.id}
												Uploading...
											{:else}
												+ Attach file
											{/if}
											<input
												type="file"
												class="hidden"
												onchange={(e) => {
													const t = e.target as HTMLInputElement;
													const f = t.files?.[0];
													if (f) dUploadDocument(date.id, f);
													t.value = '';
												}}
											/>
										</label>
									{/if}
								</div>
							{/if}
						</div>
					{/each}

					<!-- Add date form -->
					{#if dAddingDate}
						{#if dDateError}
							<div class="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
								{dDateError}
							</div>
						{/if}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								dSaveDate();
							}}
							class="space-y-2 rounded-lg border border-dashed p-3"
						>
							<div class="flex flex-wrap gap-2">
								<div class="space-y-1">
									<Label for="d-month">Month</Label>
									<select
										id="d-month"
										bind:value={dNewMonth}
										class="flex h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
										data-size="sm"
									>
										{#each monthNames as m, i (m)}
											<option value={i + 1}>{m}</option>
										{/each}
									</select>
								</div>
								<div class="space-y-1">
									<Label for="d-year">Year</Label>
									<Input
										id="d-year"
										type="number"
										bind:value={dNewYear}
										min={2020}
										max={2040}
										class="w-20"
									/>
								</div>
								<div class="space-y-1">
									<Label for="d-city">City</Label>
									<Input id="d-city" bind:value={dNewCity} class="w-28" />
								</div>
								<div class="space-y-1">
									<Label for="d-state">State</Label>
									<Input id="d-state" bind:value={dNewState} class="w-16" />
								</div>
							</div>
							<div class="flex gap-2">
								<Button type="submit" size="sm" disabled={dDateLoading}
									>{dDateLoading ? 'Saving...' : 'Save'}</Button
								>
								<Button variant="outline" size="sm" onclick={() => (dAddingDate = false)}
									>Cancel</Button
								>
							</div>
						</form>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape' && drawerOpen) closeDrawer();
	}}
/>
