<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { supabase } from '$lib/supabase.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import type { Show, ShowDate, ShowDateDocument } from '$lib/types/database.js';

	type ShowWithDates = Show & { show_dates: ShowDate[] };

	let { data } = $props();
	const show = $derived(data.show as ShowWithDates);
	const documents = $derived(data.documents as Record<string, ShowDateDocument[]>);
	const canEdit = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

	// Edit series name/notes
	let editing = $state(false);
	let name = $state('');
	let notes = $state('');
	let error = $state('');
	let loading = $state(false);

	function startEdit() {
		name = show.name;
		notes = show.notes ?? '';
		editing = true;
	}

	async function handleSave() {
		error = '';
		loading = true;

		const { error: err } = await supabase
			.from('shows')
			.update({
				name,
				notes: notes || null,
				updated_at: new Date().toISOString()
			})
			.eq('id', show.id);

		loading = false;
		if (err) {
			error = err.message;
		} else {
			editing = false;
			invalidateAll();
		}
	}

	// Add date form
	let addingDate = $state(false);
	let newMonth = $state(1);
	let newYear = $state(new Date().getFullYear());
	let newCity = $state('');
	let newState = $state('');
	let newVenue = $state('');
	let newStartDate = $state('');
	let newEndDate = $state('');
	let newContactName = $state('');
	let newContactEmail = $state('');
	let newContactPhone = $state('');
	let newDateNotes = $state('');
	let dateError = $state('');
	let dateLoading = $state(false);

	function resetDateForm() {
		newMonth = 1;
		newYear = new Date().getFullYear();
		newCity = '';
		newState = '';
		newVenue = '';
		newStartDate = '';
		newEndDate = '';
		newContactName = '';
		newContactEmail = '';
		newContactPhone = '';
		newDateNotes = '';
		dateError = '';
	}

	async function saveDate() {
		dateError = '';
		dateLoading = true;

		const { error: err } = await supabase.from('show_dates').insert({
			show_id: show.id,
			organization_id: data.organization?.id,
			year: newYear,
			month: newMonth,
			venue: newVenue || null,
			city: newCity || null,
			state: newState || null,
			start_date: newStartDate || null,
			end_date: newEndDate || null,
			contact_name: newContactName || null,
			contact_email: newContactEmail || null,
			contact_phone: newContactPhone || null,
			notes: newDateNotes || null
		});

		dateLoading = false;
		if (err) {
			dateError = err.message;
		} else {
			addingDate = false;
			resetDateForm();
			invalidateAll();
		}
	}

	// Edit date
	let editingDateId = $state<string | null>(null);
	let editMonth = $state(1);
	let editYear = $state(2026);
	let editCity = $state('');
	let editState = $state('');
	let editVenue = $state('');
	let editStartDate = $state('');
	let editEndDate = $state('');
	let editContactName = $state('');
	let editContactEmail = $state('');
	let editContactPhone = $state('');
	let editDateNotes = $state('');
	let editDateError = $state('');
	let editDateLoading = $state(false);

	function startEditDate(d: ShowDate) {
		editingDateId = d.id;
		editMonth = d.month;
		editYear = d.year;
		editCity = d.city ?? '';
		editState = d.state ?? '';
		editVenue = d.venue ?? '';
		editStartDate = d.start_date ?? '';
		editEndDate = d.end_date ?? '';
		editContactName = d.contact_name ?? '';
		editContactEmail = d.contact_email ?? '';
		editContactPhone = d.contact_phone ?? '';
		editDateNotes = d.notes ?? '';
		editDateError = '';
	}

	async function updateDate() {
		if (!editingDateId) return;
		editDateError = '';
		editDateLoading = true;

		const { error: err } = await supabase
			.from('show_dates')
			.update({
				year: editYear,
				month: editMonth,
				venue: editVenue || null,
				city: editCity || null,
				state: editState || null,
				start_date: editStartDate || null,
				end_date: editEndDate || null,
				contact_name: editContactName || null,
				contact_email: editContactEmail || null,
				contact_phone: editContactPhone || null,
				notes: editDateNotes || null
			})
			.eq('id', editingDateId);

		editDateLoading = false;
		if (err) {
			editDateError = err.message;
		} else {
			editingDateId = null;
			invalidateAll();
		}
	}

	async function deleteDate(id: string) {
		const { error: err } = await supabase.from('show_dates').delete().eq('id', id);
		if (err) {
			dateError = err.message;
		} else {
			invalidateAll();
		}
	}

	// Document upload
	let uploadingForDateId = $state('');

	let uploadError = $state('');

	async function uploadDocument(dateId: string, file: File) {
		uploadingForDateId = dateId;
		uploadError = '';
		const formData = new FormData();
		formData.append('file', file);
		try {
			const res = await fetch(`/api/shows/${dateId}/documents`, { method: 'POST', body: formData });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				uploadError = data.error ?? 'Upload failed';
			}
		} catch {
			uploadError = 'Upload failed';
		}
		uploadingForDateId = '';
		invalidateAll();
	}

	async function deleteDocument(dateId: string, documentId: string) {
		await fetch(`/api/shows/${dateId}/documents`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ documentId })
		});
		invalidateAll();
	}

	function formatFileSize(bytes: number | null): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" href="/organization/shows">← Back</Button>
			<h1 class="text-2xl font-bold">{show.name}</h1>
		</div>
		{#if canEdit && !editing}
			<Button size="sm" onclick={startEdit}>Edit</Button>
		{/if}
	</div>

	<!-- Series info card -->
	<Card>
		<CardContent class="pt-6">
			{#if error}
				<div class="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
			{/if}

			{#if editing}
				<form
					id="edit-form"
					onsubmit={(e) => {
						e.preventDefault();
						handleSave();
					}}
					class="space-y-4"
				>
					<div class="space-y-2">
						<Label for="name">Show name *</Label>
						<Input id="name" bind:value={name} required />
					</div>
					<div class="space-y-2">
						<Label for="notes">Notes</Label>
						<textarea
							id="notes"
							bind:value={notes}
							rows="3"
							class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
						></textarea>
					</div>
				</form>
			{:else}
				<dl class="space-y-4">
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Name</dt>
						<dd class="mt-1">{show.name}</dd>
					</div>
					{#if show.notes}
						<div>
							<dt class="text-sm font-medium text-muted-foreground">Notes</dt>
							<dd class="mt-1 whitespace-pre-wrap">{show.notes}</dd>
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

	<!-- Dates section -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">Dates</h2>
			{#if canEdit && !addingDate}
				<Button
					size="sm"
					variant="outline"
					onclick={() => {
						resetDateForm();
						addingDate = true;
					}}>+ Add Date</Button
				>
			{/if}
		</div>

		{#if (show.show_dates?.length ?? 0) === 0 && !addingDate}
			<div class="rounded-none border border-dashed p-6 text-center">
				<p class="text-sm text-muted-foreground">No dates yet. Add your first date.</p>
			</div>
		{/if}

		{#each show.show_dates ?? [] as date}
			<Card>
				<CardContent class="pt-4 pb-4">
					{#if editingDateId === date.id}
						{#if editDateError}
							<div class="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
								{editDateError}
							</div>
						{/if}
						<form
							onsubmit={(e) => {
								e.preventDefault();
								updateDate();
							}}
							class="space-y-3"
						>
							<div class="flex flex-wrap gap-3">
								<div class="space-y-1">
									<Label for="edit-month">Month</Label>
									<select
										id="edit-month"
										bind:value={editMonth}
										class="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
									>
										{#each monthNames as m, i}
											<option value={i + 1}>{m}</option>
										{/each}
									</select>
								</div>
								<div class="space-y-1">
									<Label for="edit-year">Year</Label>
									<Input
										id="edit-year"
										type="number"
										bind:value={editYear}
										min={2020}
										max={2040}
										class="w-24"
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-city">City</Label>
									<Input id="edit-city" bind:value={editCity} class="w-36" />
								</div>
								<div class="space-y-1">
									<Label for="edit-state">State</Label>
									<Input id="edit-state" bind:value={editState} class="w-20" />
								</div>
								<div class="space-y-1">
									<Label for="edit-venue">Venue</Label>
									<Input id="edit-venue" bind:value={editVenue} class="w-44" />
								</div>
							</div>
							<div class="grid gap-3 sm:grid-cols-2">
								<div class="space-y-1">
									<Label for="edit-start">Start date</Label>
									<Input id="edit-start" type="date" bind:value={editStartDate} />
								</div>
								<div class="space-y-1">
									<Label for="edit-end">End date</Label>
									<Input id="edit-end" type="date" bind:value={editEndDate} />
								</div>
							</div>
							<div class="flex flex-wrap gap-3">
								<div class="space-y-1">
									<Label for="edit-contact-name">Contact</Label>
									<Input
										id="edit-contact-name"
										bind:value={editContactName}
										placeholder="Name"
										class="w-36"
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-contact-email">Email</Label>
									<Input
										id="edit-contact-email"
										type="email"
										bind:value={editContactEmail}
										placeholder="email@example.com"
										class="w-44"
									/>
								</div>
								<div class="space-y-1">
									<Label for="edit-contact-phone">Phone</Label>
									<Input
										id="edit-contact-phone"
										bind:value={editContactPhone}
										placeholder="(555) 123-4567"
										class="w-36"
									/>
								</div>
							</div>
							<div class="space-y-1">
								<Label for="edit-date-notes">Notes</Label>
								<Input id="edit-date-notes" bind:value={editDateNotes} />
							</div>
							<div class="flex gap-2">
								<Button type="submit" size="sm" disabled={editDateLoading}>
									{editDateLoading ? 'Saving...' : 'Save'}
								</Button>
								<Button variant="outline" size="sm" onclick={() => (editingDateId = null)}
									>Cancel</Button
								>
							</div>
						</form>
					{:else}
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-6 text-sm">
									<span class="font-medium">{monthLabel(date.month)} {date.year}</span>
									<span class="text-muted-foreground"
										>{[date.city, date.state].filter(Boolean).join(', ') || '—'}</span
									>
									<span class="text-muted-foreground">{date.venue || ''}</span>
								</div>
								{#if canEdit}
									<div class="flex gap-1">
										<Button
											variant="ghost"
											size="sm"
											class="cursor-pointer"
											onclick={() => startEditDate(date)}>Edit</Button
										>
										<Button
											variant="ghost"
											size="sm"
											class="cursor-pointer text-destructive hover:text-destructive"
											onclick={() => deleteDate(date.id)}>Delete</Button
										>
									</div>
								{/if}
							</div>
							{#if date.contact_name || date.contact_email || date.contact_phone}
								<div class="flex items-center gap-4 text-sm text-muted-foreground">
									{#if date.contact_name}
										<span>{date.contact_name}</span>
									{/if}
									{#if date.contact_email}
										<a href="mailto:{date.contact_email}" class="hover:underline"
											>{date.contact_email}</a
										>
									{/if}
									{#if date.contact_phone}
										<span>{date.contact_phone}</span>
									{/if}
								</div>
							{/if}
							{#if date.notes}
								<p class="text-sm text-muted-foreground italic">{date.notes}</p>
							{/if}
							<!-- Documents -->
							{#if (documents[date.id] ?? []).length > 0 || canEdit}
								<div class="border-t pt-2">
									{#if (documents[date.id] ?? []).length > 0}
										<div class="space-y-1">
											{#each documents[date.id] ?? [] as doc}
												<div class="flex items-center justify-between text-sm">
													<div class="flex items-center gap-2">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="h-3.5 w-3.5 text-muted-foreground"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															stroke-width="1.5"
														>
															<path
																stroke-linecap="round"
																stroke-linejoin="round"
																d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
															/>
														</svg>
														<span class="text-muted-foreground">{doc.name}</span>
														{#if doc.file_size}
															<span class="text-xs text-muted-foreground/60"
																>{formatFileSize(doc.file_size)}</span
															>
														{/if}
													</div>
													{#if canEdit}
														<button
															class="text-xs text-muted-foreground transition-colors hover:text-destructive"
															onclick={() => deleteDocument(date.id, doc.id)}>Remove</button
														>
													{/if}
												</div>
											{/each}
										</div>
									{/if}
									{#if canEdit}
										<label
											class="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
										>
											{#if uploadingForDateId === date.id}
												<div
													class="h-3 w-3 animate-spin rounded-full border border-muted-foreground/30 border-t-muted-foreground"
												></div>
												Uploading...
											{:else}
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3.5 w-3.5"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
													stroke-width="2"
												>
													<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
												</svg>
												Attach file
											{/if}
											<input
												type="file"
												class="hidden"
												onchange={(e) => {
													const t = e.target as HTMLInputElement;
													const f = t.files?.[0];
													if (f) uploadDocument(date.id, f);
													t.value = '';
												}}
											/>
										</label>
										{#if uploadError && uploadingForDateId === ''}
											<p class="text-xs text-destructive">{uploadError}</p>
										{/if}
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</CardContent>
			</Card>
		{/each}

		<!-- Add date form -->
		{#if addingDate}
			<Card>
				<CardContent class="space-y-3 pt-4 pb-4">
					<p class="text-sm font-medium">New Date</p>
					{#if dateError}
						<div class="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{dateError}</div>
					{/if}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							saveDate();
						}}
						class="space-y-3"
					>
						<div class="flex flex-wrap gap-3">
							<div class="space-y-1">
								<Label for="new-month">Month</Label>
								<select
									id="new-month"
									bind:value={newMonth}
									class="flex h-10 w-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
								>
									{#each monthNames as m, i}
										<option value={i + 1}>{m}</option>
									{/each}
								</select>
							</div>
							<div class="space-y-1">
								<Label for="new-year">Year</Label>
								<Input
									id="new-year"
									type="number"
									bind:value={newYear}
									min={2020}
									max={2040}
									class="w-24"
								/>
							</div>
							<div class="space-y-1">
								<Label for="new-city">City</Label>
								<Input id="new-city" bind:value={newCity} placeholder="New York" class="w-36" />
							</div>
							<div class="space-y-1">
								<Label for="new-state">State</Label>
								<Input id="new-state" bind:value={newState} placeholder="NY" class="w-20" />
							</div>
							<div class="space-y-1">
								<Label for="new-venue">Venue</Label>
								<Input
									id="new-venue"
									bind:value={newVenue}
									placeholder="Convention Center"
									class="w-44"
								/>
							</div>
						</div>
						<div class="grid gap-3 sm:grid-cols-2">
							<div class="space-y-1">
								<Label for="new-start">Start date</Label>
								<Input id="new-start" type="date" bind:value={newStartDate} />
							</div>
							<div class="space-y-1">
								<Label for="new-end">End date</Label>
								<Input id="new-end" type="date" bind:value={newEndDate} />
							</div>
						</div>
						<div class="flex flex-wrap gap-3">
							<div class="space-y-1">
								<Label for="new-contact-name">Contact</Label>
								<Input
									id="new-contact-name"
									bind:value={newContactName}
									placeholder="Name"
									class="w-36"
								/>
							</div>
							<div class="space-y-1">
								<Label for="new-contact-email">Email</Label>
								<Input
									id="new-contact-email"
									type="email"
									bind:value={newContactEmail}
									placeholder="email@example.com"
									class="w-44"
								/>
							</div>
							<div class="space-y-1">
								<Label for="new-contact-phone">Phone</Label>
								<Input
									id="new-contact-phone"
									bind:value={newContactPhone}
									placeholder="(555) 123-4567"
									class="w-36"
								/>
							</div>
						</div>
						<div class="space-y-1">
							<Label for="new-date-notes">Notes</Label>
							<Input id="new-date-notes" bind:value={newDateNotes} placeholder="Optional notes" />
						</div>
						<div class="flex gap-2">
							<Button type="submit" size="sm" disabled={dateLoading}>
								{dateLoading ? 'Saving...' : 'Save Date'}
							</Button>
							<Button variant="outline" size="sm" onclick={() => (addingDate = false)}
								>Cancel</Button
							>
						</div>
					</form>
				</CardContent>
			</Card>
		{/if}
	</div>
</div>
