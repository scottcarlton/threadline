<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { fetchUpcomingCount } from '$lib/stores/appointments.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import PageHeader from '$lib/components/shared/PageHeader.svelte';
	import { SelectField } from '$lib/components/ui/select/index.js';
	import { formatPhone } from '$lib/utils/phone';

	let { data } = $props();

	type ShowRef = { name?: string };
	type ShowDateRow = {
		id: string;
		city?: string | null;
		state?: string | null;
		month?: number | null;
		year?: number | null;
		shows?: ShowRef | ShowRef[] | null;
	};
	type Appointment = {
		id: string;
		scheduled_date: string | null;
		scheduled_time?: string | null;
		duration_minutes?: number | null;
		appointment_type: 'scheduled' | 'walkin';
		status: 'scheduled' | 'completed' | 'cancelled' | string;
		notes?: string | null;
		location_type?: string | null;
		location_detail?: string | null;
		created_by: string;
		freeform_account_name?: string | null;
		freeform_contact_name?: string | null;
		freeform_contact_email?: string | null;
		freeform_contact_phone?: string | null;
		accounts?: {
			business_name?: string;
			contact_first_name?: string | null;
			contact_last_name?: string | null;
			contact_email?: string | null;
			city?: string | null;
			state?: string | null;
		} | null;
		profiles?: { display_name?: string | null } | null;
		show_dates?: ShowDateRow | null;
	};

	$effect(() => {
		if ($page.url.searchParams.get('new') === 'true') {
			showAddForm = true;
			const url = new URL($page.url);
			url.searchParams.delete('new');
			history.replaceState({}, '', url.pathname + url.search);
		}
	});
	const showDates = $derived((data.showDates ?? []) as ShowDateRow[]);
	const selectedShowDateId = $derived(data.selectedShowDateId ?? null);
	const appointments = $derived((data.appointments ?? []) as Appointment[]);
	const accounts = $derived(data.accounts ?? []);
	const isAdmin = $derived(data.membership?.role === 'admin' || data.membership?.role === 'owner');

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

	// Add form state
	let showAddForm = $state(false);
	let formType = $state<'scheduled' | 'walkin'>('scheduled');
	let formAccountId = $state('');
	let formDate = $state('');
	let formTime = $state('');
	let formDuration = $state(30);
	let formShowDateId = $state('');
	let formLocationType = $state('show');
	let formLocationDetail = $state('');
	let formNotes = $state('');
	let formAccountMode = $state<'existing' | 'freeform'>('existing');
	let formFreeformAccountName = $state('');
	let formFreeformContactName = $state('');
	let formFreeformContactEmail = $state('');
	let formFreeformContactPhone = $state('');
	let saving = $state(false);
	let saveError = $state('');
	let accountDropdownOpen = $state(false);
	let filterTab = $state<'all' | 'today' | 'upcoming' | 'completed'>('all');
	let ownerFilter = $state<'everyone' | 'mine' | 'others'>('everyone');
	let selectedAppointment = $state<Appointment | null>(null);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && selectedAppointment) {
			selectedAppointment = null;
		}
	}

	const todayStr = new Date().toISOString().slice(0, 10);

	// Account search
	let accountSearch = $state('');
	const filteredAccounts = $derived.by(() => {
		if (!accountSearch) return accounts;
		const q = accountSearch.toLowerCase();
		return accounts.filter(
			(a: { business_name: string; city: string | null; state: string | null }) =>
				a.business_name.toLowerCase().includes(q) ||
				(a.city?.toLowerCase().includes(q) ?? false) ||
				(a.state?.toLowerCase().includes(q) ?? false)
		);
	});

	const filteredAppointments = $derived.by(() => {
		let list = appointments;
		switch (filterTab) {
			case 'today':
				list = list.filter((a) => a.scheduled_date === todayStr);
				break;
			case 'upcoming':
				list = list.filter((a) => (a.scheduled_date ?? '') >= todayStr && a.status === 'scheduled');
				break;
			case 'completed':
				list = list.filter((a) => a.status === 'completed');
				break;
		}
		if (isAdmin && ownerFilter === 'mine') {
			list = list.filter((a) => a.created_by === data.user?.id);
		} else if (isAdmin && ownerFilter === 'others') {
			list = list.filter((a) => a.created_by !== data.user?.id);
		}
		return list;
	});

	const myCount = $derived(appointments.filter((a) => a.created_by === data.user?.id).length);
	const othersCount = $derived(appointments.filter((a) => a.created_by !== data.user?.id).length);

	function parseMonth(dateStr: string | null): string {
		if (!dateStr) return '--';
		const month = parseInt(dateStr.split('-')[1], 10);
		return monthNames[month - 1] ?? '--';
	}

	function parseDay(dateStr: string | null): string {
		if (!dateStr) return '--';
		return String(parseInt(dateStr.split('-')[2], 10));
	}

	function showDateLabel(sd: ShowDateRow): string {
		const shows = sd.shows;
		const showName = Array.isArray(shows)
			? (shows[0]?.name ?? 'Unknown Show')
			: (shows?.name ?? 'Unknown Show');
		const mon = monthNames[(sd.month ?? 1) - 1] ?? '';
		const loc = [sd.city, sd.state].filter(Boolean).join(' ');
		return `${showName} — ${mon} ${sd.year ?? ''}${loc ? ', ' + loc : ''}`;
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired to SelectField onValueChange when show filter is added
	function handleShowDateChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const val = target.value;
		const url = new URL($page.url);
		if (val) {
			url.searchParams.set('show_date', val);
		} else {
			url.searchParams.delete('show_date');
		}
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-page URL rebuild
		goto(`${resolve('/appointments')}${url.search}`, { replaceState: true });
	}

	function resetForm() {
		formType = 'scheduled';
		formLocationType = 'show';
		formLocationDetail = '';
		formShowDateId = '';
		formAccountId = '';
		formAccountMode = 'existing';
		formFreeformAccountName = '';
		formFreeformContactName = '';
		formFreeformContactEmail = '';
		formFreeformContactPhone = '';
		formDate = '';
		formTime = '';
		formDuration = 30;
		formNotes = '';
		accountSearch = '';
		accountDropdownOpen = false;
	}

	const canSave = $derived(
		formAccountMode === 'existing' ? !!formAccountId : !!formFreeformAccountName.trim()
	);

	async function handleSave() {
		if (!canSave) return;
		const showDateForSave = formShowDateId || selectedShowDateId || null;
		saving = true;
		saveError = '';
		try {
			const res = await fetch('/api/appointments', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					show_date_id: formLocationType === 'show' ? showDateForSave : null,
					appointment_type: formType,
					location_type: formLocationType,
					location_detail: formLocationDetail || null,
					account_id: formAccountMode === 'existing' ? formAccountId : null,
					freeform_account_name:
						formAccountMode === 'freeform' ? formFreeformAccountName.trim() : null,
					freeform_contact_name:
						formAccountMode === 'freeform' ? formFreeformContactName.trim() || null : null,
					freeform_contact_email:
						formAccountMode === 'freeform' ? formFreeformContactEmail.trim() || null : null,
					freeform_contact_phone:
						formAccountMode === 'freeform' ? formFreeformContactPhone.trim() || null : null,
					scheduled_date: formDate || null,
					scheduled_time: formTime || null,
					duration_minutes: formDuration,
					notes: formNotes || null
				})
			});
			if (res.ok) {
				showAddForm = false;
				resetForm();
				invalidateAll();
				fetchUpcomingCount();
			} else {
				const result = await res.json().catch(() => ({}));
				saveError = result.error || 'Failed to save appointment.';
			}
		} catch {
			saveError = 'An unexpected error occurred.';
		} finally {
			saving = false;
		}
	}

	async function updateStatus(appointmentId: string, status: string) {
		await fetch('/api/appointments', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: appointmentId, status })
		});
		invalidateAll();
		fetchUpcomingCount();
	}

	async function deleteAppointment(appointmentId: string) {
		await fetch('/api/appointments', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: appointmentId })
		});
		invalidateAll();
		fetchUpcomingCount();
	}

	function statusBadge(status: string): string {
		switch (status) {
			case 'scheduled':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
			case 'completed':
				return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
			case 'cancelled':
				return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400';
			case 'no_show':
				return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	function statusLabel(status: string): string {
		switch (status) {
			case 'scheduled':
				return 'Scheduled';
			case 'completed':
				return 'Completed';
			case 'cancelled':
				return 'Cancelled';
			case 'no_show':
				return 'No Show';
			default:
				return status;
		}
	}

	function formatDate(dateStr: string | null): string {
		if (!dateStr) return '--';
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function formatTime(timeStr: string | null | undefined): string {
		if (!timeStr) return '--';
		const [h, m] = timeStr.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const hour12 = h % 12 || 12;
		return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-6">
	<PageHeader title="Appointments" subtitle="Schedule and manage appointments">
		<Button
			variant={showAddForm ? 'outline' : 'default'}
			onclick={() => {
				showAddForm = !showAddForm;
				if (showAddForm && selectedShowDateId) formShowDateId = selectedShowDateId;
				if (!showAddForm) resetForm();
			}}
		>
			{#if showAddForm}
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
				Add Appointment
			{/if}
		</Button>
	</PageHeader>

	<!-- Filters -->
	{#if !showAddForm}
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex w-fit gap-1 rounded-lg bg-muted p-1">
				<button
					type="button"
					class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {filterTab === 'all'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (filterTab = 'all')}>All</button
				>
				<button
					type="button"
					class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {filterTab === 'today'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (filterTab = 'today')}>Today</button
				>
				<button
					type="button"
					class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {filterTab ===
					'upcoming'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (filterTab = 'upcoming')}>Upcoming</button
				>
				<button
					type="button"
					class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {filterTab ===
					'completed'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (filterTab = 'completed')}>Completed</button
				>
			</div>
			<SelectField
				value={selectedShowDateId ?? ''}
				items={[
					{ value: '', label: 'All Shows' },
					...showDates.map((sd) => ({ value: sd.id, label: showDateLabel(sd) }))
				]}
				onValueChange={(v) => {
					const url = new URL($page.url);
					if (v) url.searchParams.set('show_date', v);
					else url.searchParams.delete('show_date');
					// eslint-disable-next-line svelte/no-navigation-without-resolve -- dynamic same-page URL rebuild
					goto(`${resolve('/appointments')}${url.search}`, { replaceState: true });
				}}
			/>
		</div>
		{#if isAdmin}
			<div class="flex items-center gap-1 font-mono text-sm" style="margin-bottom: 6px">
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors {ownerFilter ===
					'everyone'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (ownerFilter = 'everyone')}
				>
					<span class="inline-block h-0.5 w-2 rounded-full bg-primary"></span>
					<span class="-ml-1 inline-block h-0.5 w-2 rounded-full bg-muted-foreground/30"></span>
					All
				</button>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors {ownerFilter ===
					'mine'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (ownerFilter = 'mine')}
				>
					<span class="inline-block h-0.5 w-3.5 rounded-full bg-primary"></span>
					Yours{#if myCount > 0}
						({myCount}){/if}
				</button>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors {ownerFilter ===
					'others'
						? 'bg-muted text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (ownerFilter = 'others')}
				>
					<span class="inline-block h-0.5 w-3.5 rounded-full bg-muted-foreground/30"></span>
					Others{#if othersCount > 0}
						({othersCount}){/if}
				</button>
			</div>
		{/if}
	{/if}

	<!-- Add appointment form -->
	{#if showAddForm}
		<div class="space-y-4 rounded-none border bg-card p-5">
			<h3 class="text-sm font-semibold">New Appointment</h3>
			<!-- Type toggle -->
			<div class="mb-4 flex w-fit gap-1 rounded-lg bg-muted p-1">
				<button
					type="button"
					class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {formType ===
					'scheduled'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (formType = 'scheduled')}>Scheduled</button
				>
				<button
					type="button"
					class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors {formType === 'walkin'
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (formType = 'walkin')}>Walk-in</button
				>
			</div>

			<!-- Location row -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="space-y-1.5">
					<label for="appt-location" class="text-sm font-medium text-muted-foreground"
						>Location</label
					>
					<select
						id="appt-location"
						class="w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						bind:value={formLocationType}
					>
						<option value="show">Show</option>
						<option value="road">Road</option>
						<option value="phone">Phone</option>
						<option value="video">Video</option>
						<option value="other">Other</option>
					</select>
				</div>

				{#if formLocationType === 'show'}
					<div class="space-y-1.5">
						<label for="appt-show" class="text-sm font-medium text-muted-foreground">Show</label>
						<select
							id="appt-show"
							class="w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							bind:value={formShowDateId}
						>
							<option value="">Select show...</option>
							{#each showDates as sd (sd.id)}
								<option value={sd.id}>
									{(Array.isArray(sd.shows) ? sd.shows[0]?.name : sd.shows?.name) ?? 'Show'} — {monthNames[
										(sd.month ?? 1) - 1
									]}
									{sd.year}{sd.city ? `, ${sd.city}` : ''}{sd.state ? ` ${sd.state}` : ''}
								</option>
							{/each}
						</select>
					</div>
				{:else}
					<div class="space-y-1.5">
						<label for="appt-location-detail" class="text-sm font-medium text-muted-foreground">
							{formLocationType === 'road'
								? 'Address'
								: formLocationType === 'phone'
									? 'Phone Number'
									: formLocationType === 'video'
										? 'Meeting Link'
										: 'Details'}
						</label>
						<input
							id="appt-location-detail"
							type="text"
							class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							placeholder={formLocationType === 'road'
								? '123 Main St, City, ST'
								: formLocationType === 'phone'
									? '(555) 123-4567'
									: formLocationType === 'video'
										? 'https://zoom.us/...'
										: 'Location details'}
							bind:value={formLocationDetail}
						/>
					</div>
				{/if}
			</div>

			<!-- Account -->
			<div class="space-y-3" role="group" aria-label="Account">
				<div class="flex items-center justify-between">
					<span class="text-sm font-medium text-muted-foreground">Account</span>
					<div class="flex gap-1 rounded-lg bg-muted p-1">
						<button
							type="button"
							class="rounded-md px-3 py-1 text-xs font-medium transition-colors {formAccountMode ===
							'existing'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (formAccountMode = 'existing')}>Existing</button
						>
						<button
							type="button"
							class="rounded-md px-3 py-1 text-xs font-medium transition-colors {formAccountMode ===
							'freeform'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground'}"
							onclick={() => (formAccountMode = 'freeform')}>New / Other</button
						>
					</div>
				</div>

				{#if formAccountMode === 'existing'}
					<div class="relative">
						<input
							type="text"
							class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							placeholder="Search accounts..."
							bind:value={accountSearch}
							onfocus={() => (accountDropdownOpen = true)}
							oninput={() => (accountDropdownOpen = true)}
						/>
						{#if formAccountId}
							<div class="pointer-events-none absolute inset-y-0 right-3 flex items-center">
								<i class="ri-checkbox-circle-fill text-lg text-emerald-500"></i>
							</div>
						{/if}
						{#if accountDropdownOpen && filteredAccounts.length > 0}
							<div
								class="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-none border bg-card shadow-lg"
							>
								{#each filteredAccounts as account (account.id)}
									<button
										type="button"
										class="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50 {formAccountId ===
										account.id
											? 'bg-primary/5'
											: ''}"
										onclick={() => {
											formAccountId = account.id;
											accountSearch = account.business_name;
											accountDropdownOpen = false;
										}}
									>
										<div>
											<p class="font-medium">{account.business_name}</p>
											{#if account.city || account.state}
												<p class="text-sm text-muted-foreground">
													{[account.city, account.state].filter(Boolean).join(', ')}
												</p>
											{/if}
										</div>
										{#if formAccountId === account.id}
											<i class="ri-checkbox-circle-fill text-emerald-500"></i>
										{/if}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				{:else}
					<div class="space-y-3">
						<input
							type="text"
							class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
							placeholder="Business / account name *"
							bind:value={formFreeformAccountName}
						/>
						<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
							<input
								type="text"
								class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
								placeholder="Contact name"
								bind:value={formFreeformContactName}
							/>
							<input
								type="email"
								class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
								placeholder="Email"
								bind:value={formFreeformContactEmail}
							/>
							<input
								type="tel"
								class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
								placeholder="Phone"
								bind:value={formFreeformContactPhone}
								oninput={(e) =>
									(formFreeformContactPhone = formatPhone(
										(e.currentTarget as HTMLInputElement).value
									))}
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Date / Time / Duration row -->
			<div class="flex flex-wrap gap-4">
				<div class="max-w-[180px] space-y-1.5">
					<label for="appt-date" class="text-sm font-medium text-muted-foreground">Date</label>
					<input
						id="appt-date"
						type="date"
						class="w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						bind:value={formDate}
					/>
				</div>
				<div class="max-w-[180px] space-y-1.5">
					<label for="appt-time" class="text-sm font-medium text-muted-foreground">Time</label>
					<input
						id="appt-time"
						type="time"
						class="w-full cursor-pointer rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
						bind:value={formTime}
					/>
				</div>
				<div class="space-y-1.5" role="group" aria-label="Duration">
					<span class="text-sm font-medium text-muted-foreground">Duration</span>
					<div class="flex w-fit gap-1 rounded-lg bg-muted p-1">
						{#each [15, 30, 45, 60] as dur (dur)}
							<button
								type="button"
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {formDuration ===
								dur
									? 'bg-background text-foreground shadow-sm'
									: 'text-muted-foreground hover:text-foreground'}"
								onclick={() => (formDuration = dur)}>{dur}m</button
							>
						{/each}
					</div>
				</div>
			</div>

			<!-- Notes -->
			<div class="space-y-1.5">
				<label for="appt-notes" class="text-sm font-medium text-muted-foreground">Notes</label>
				<textarea
					id="appt-notes"
					class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
					rows="2"
					placeholder="Any notes for this appointment..."
					bind:value={formNotes}
				></textarea>
			</div>
			<div class="flex justify-end">
				<button
					type="button"
					class="inline-flex cursor-pointer items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
					disabled={!canSave || saving}
					onclick={handleSave}
				>
					{#if saving}Saving...{:else}Save Appointment{/if}
				</button>
			</div>
			{#if saveError}
				<p class="mt-2 text-sm text-destructive">{saveError}</p>
			{/if}
		</div>
	{/if}

	<!-- Appointments list -->
	{#if appointments.length === 0 && !showAddForm}
		<div class="rounded-none p-12 text-center">
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
					d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
				/>
			</svg>
			<p class="mt-4 text-lg font-semibold">No appointments yet</p>
			<p class="mt-2 text-sm text-muted-foreground">
				Schedule your first appointment to start tracking meetings
			</p>
		</div>
	{:else if filteredAppointments.length === 0 && !showAddForm}
		<div class="rounded-none p-12 text-center">
			<p class="text-lg font-semibold">No matching appointments</p>
			<p class="mt-2 text-sm text-muted-foreground">Try adjusting your filters</p>
		</div>
	{:else if filteredAppointments.length > 0}
		<div class="space-y-2">
			{#each filteredAppointments as appt (appt.id)}
				{@const isMine = appt.created_by === data.user?.id}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="relative flex cursor-pointer items-center gap-6 overflow-hidden rounded-none border bg-card p-4 transition-colors hover:bg-muted/50"
					onclick={() => (selectedAppointment = appt)}
				>
					{#if isAdmin && isMine}
						<div class="absolute top-0 bottom-0 left-0 w-[3px] bg-primary"></div>
					{/if}
					<!-- Left: Date & Time stacked -->
					<div class="flex min-w-[60px] flex-col items-center text-center">
						<span class="text-xs leading-tight font-medium text-muted-foreground uppercase"
							>{parseMonth(appt.scheduled_date)}</span
						>
						<span
							class="text-2xl leading-tight font-bold {isAdmin && !isMine
								? 'text-muted-foreground'
								: ''}">{parseDay(appt.scheduled_date)}</span
						>
						<span class="text-sm leading-tight text-muted-foreground"
							>{formatTime(appt.scheduled_time)}</span
						>
					</div>
					<!-- Right: Contact + Account + Show -->
					<div class="min-w-0 flex-1">
						{#if appt.accounts?.contact_first_name || appt.accounts?.contact_last_name}
							<p class="truncate text-sm">
								{[appt.accounts.contact_first_name, appt.accounts.contact_last_name]
									.filter(Boolean)
									.join(' ')}
							</p>
						{:else if appt.freeform_contact_name}
							<p class="truncate text-sm">{appt.freeform_contact_name}</p>
						{/if}
						<p class="truncate text-base font-medium">
							{appt.accounts?.business_name ?? appt.freeform_account_name ?? '--'}
						</p>
						{#if isAdmin && !isMine}
							<div class="mt-1 flex items-center gap-2">
								{#if appt.show_dates}
									<span
										class="inline-flex rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
										>{Array.isArray(appt.show_dates.shows)
											? appt.show_dates.shows[0]?.name
											: (appt.show_dates.shows?.name ?? '')}</span
									>
								{/if}
								{#if appt.profiles?.display_name}
									<span class="text-xs text-muted-foreground">{appt.profiles.display_name}</span>
								{/if}
							</div>
						{:else if appt.show_dates}
							<div class="mt-1">
								<span
									class="inline-flex rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
									>{Array.isArray(appt.show_dates.shows)
										? appt.show_dates.shows[0]?.name
										: (appt.show_dates.shows?.name ?? '')}</span
								>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Detail slide-over -->
{#if selectedAppointment}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
		onclick={() => (selectedAppointment = null)}
	></div>
{/if}

<div
	class="fixed top-3 right-3 bottom-3 z-50 flex w-[calc(100%-1.5rem)] flex-col rounded-none border bg-background shadow-xl transition-transform duration-300 ease-in-out sm:w-[28rem] {selectedAppointment
		? 'translate-x-0'
		: 'translate-x-[calc(100%+1rem)]'}"
>
	{#if selectedAppointment}
		{@const appt = selectedAppointment}
		<!-- Header -->
		<div class="flex items-center justify-between px-5 py-4">
			<h2 class="text-base font-semibold">Appointment Details</h2>
			<button
				onclick={() => (selectedAppointment = null)}
				class="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-ghost hover:text-foreground"
				aria-label="Close details"
			>
				<i class="ri-close-line text-lg"></i>
			</button>
		</div>

		<!-- Content -->
		<div class="flex-1 space-y-6 overflow-y-auto px-5 py-5">
			<!-- Date & Time -->
			<div class="flex items-center gap-4">
				<div class="flex min-w-[60px] flex-col items-center text-center">
					<span class="text-xs font-medium text-muted-foreground uppercase"
						>{parseMonth(appt.scheduled_date)}</span
					>
					<span class="text-3xl font-bold">{parseDay(appt.scheduled_date)}</span>
					<span class="text-sm text-muted-foreground">{formatTime(appt.scheduled_time)}</span>
				</div>
				<div>
					<p class="text-base font-medium">{formatDate(appt.scheduled_date)}</p>
					<p class="text-sm text-muted-foreground">{appt.duration_minutes} minutes</p>
				</div>
			</div>

			<!-- Status -->
			<div>
				<p class="mb-1 text-sm font-medium text-muted-foreground">Status</p>
				<span
					class="inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium {statusBadge(
						appt.status
					)}"
				>
					{statusLabel(appt.status)}
				</span>
			</div>

			<!-- Account & Contact -->
			<div class="space-y-3">
				<div>
					<p class="mb-1 text-sm font-medium text-muted-foreground">Account</p>
					<p class="text-base font-medium">
						{appt.accounts?.business_name ?? appt.freeform_account_name ?? '--'}
					</p>
					{#if appt.accounts?.city || appt.accounts?.state}
						<p class="text-sm text-muted-foreground">
							{[appt.accounts.city, appt.accounts.state].filter(Boolean).join(', ')}
						</p>
					{/if}
					{#if !appt.accounts && appt.freeform_account_name}
						<span
							class="mt-1 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
							>Freeform</span
						>
					{/if}
				</div>
				{#if appt.accounts?.contact_first_name || appt.accounts?.contact_last_name || appt.freeform_contact_name}
					<div>
						<p class="mb-1 text-sm font-medium text-muted-foreground">Contact</p>
						<p class="text-sm">
							{appt.accounts
								? [appt.accounts.contact_first_name, appt.accounts.contact_last_name]
										.filter(Boolean)
										.join(' ')
								: appt.freeform_contact_name}
						</p>
						{#if appt.freeform_contact_email}
							<p class="text-sm text-muted-foreground">{appt.freeform_contact_email}</p>
						{/if}
						{#if appt.freeform_contact_phone}
							<p class="text-sm text-muted-foreground">{appt.freeform_contact_phone}</p>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Location -->
			<div>
				<p class="mb-1 text-sm font-medium text-muted-foreground">Location</p>
				{#if appt.location_type === 'show' && appt.show_dates}
					{@const sd = appt.show_dates}
					<p class="text-sm">
						{Array.isArray(sd.shows) ? sd.shows[0]?.name : (sd.shows?.name ?? 'Show')}
					</p>
					<p class="text-sm text-muted-foreground">
						{monthNames[(sd.month ?? 1) - 1]}
						{sd.year}{sd.city ? `, ${sd.city}` : ''}{sd.state ? ` ${sd.state}` : ''}
					</p>
				{:else}
					<p class="text-sm capitalize">{appt.location_type}</p>
					{#if appt.location_detail}
						<p class="text-sm text-muted-foreground">{appt.location_detail}</p>
					{/if}
				{/if}
			</div>

			<!-- Type -->
			<div>
				<p class="mb-1 text-sm font-medium text-muted-foreground">Type</p>
				<p class="text-sm">{appt.appointment_type === 'walkin' ? 'Walk-in' : 'Scheduled'}</p>
			</div>

			<!-- Rep (admin/owner only) -->
			{#if isAdmin && appt.profiles?.display_name}
				<div>
					<p class="mb-1 text-sm font-medium text-muted-foreground">Rep</p>
					<div class="flex items-center gap-2">
						<div
							class="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium"
						>
							{appt.profiles.display_name
								.split(' ')
								.map((w: string) => w[0])
								.join('')
								.toUpperCase()
								.slice(0, 2)}
						</div>
						<span class="text-sm">{appt.profiles.display_name}</span>
					</div>
				</div>
			{/if}

			<!-- Notes -->
			{#if appt.notes}
				<div>
					<p class="mb-1 text-sm font-medium text-muted-foreground">Notes</p>
					<p class="text-sm whitespace-pre-wrap">{appt.notes}</p>
				</div>
			{/if}
		</div>

		<!-- Footer actions -->
		<div class="space-y-2 px-5 py-4">
			{#if appt.status === 'scheduled'}
				<div class="flex gap-2">
					<button
						type="button"
						class="flex-1 cursor-pointer rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
						onclick={() => {
							updateStatus(appt.id, 'completed');
							selectedAppointment = null;
						}}>Complete</button
					>
					<button
						type="button"
						class="flex-1 cursor-pointer rounded-lg bg-zinc-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
						onclick={() => {
							updateStatus(appt.id, 'cancelled');
							selectedAppointment = null;
						}}>Cancel</button
					>
					<button
						type="button"
						class="flex-1 cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
						onclick={() => {
							updateStatus(appt.id, 'no_show');
							selectedAppointment = null;
						}}>No Show</button
					>
				</div>
			{/if}
			<button
				type="button"
				class="w-full cursor-pointer rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
				onclick={() => {
					deleteAppointment(appt.id);
					selectedAppointment = null;
				}}>Delete Appointment</button
			>
		</div>
	{/if}
</div>
