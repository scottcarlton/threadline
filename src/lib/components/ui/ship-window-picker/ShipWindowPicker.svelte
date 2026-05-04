<script lang="ts">
	import { browser } from '$app/environment';
	import { Popover, Dialog } from 'bits-ui';
	import Calendar from './Calendar.svelte';
	import {
		startOfMonth,
		addMonths,
		isBefore,
		isAfter,
		formatDateShort,
		daysBetween,
		toLocalDate,
		toISODate,
		deriveSeasonWindow,
		defaultRange,
		type SeasonDeliveryLike
	} from './helpers';

	type Props = {
		deliveries: SeasonDeliveryLike[];
		orderYear: number;
		startShipDate: string;
		completeShipDate: string;
		onApply: (range: { startShipDate: string; completeShipDate: string }) => void;
		disabled?: boolean;
		id?: string;
		variant?: 'field' | 'button';
		buttonLabel?: string;
	};

	let {
		deliveries,
		orderYear,
		startShipDate,
		completeShipDate,
		onApply,
		disabled = false,
		id,
		variant = 'field',
		buttonLabel = 'Edit window'
	}: Props = $props();

	let open = $state(false);
	let focusing = $state<'start' | 'end'>('start');
	let draftStart = $state<Date | null>(null);
	let draftEnd = $state<Date | null>(null);
	let viewMonth = $state<Date>(new Date());
	let hoverDate = $state<Date | null>(null);

	const seasonWindow = $derived(deriveSeasonWindow(deliveries, orderYear));

	let mode = $state<'mobile' | 'ipad' | 'desktop'>('desktop');
	$effect(() => {
		if (!browser) return;
		const update = () => {
			const w = window.innerWidth;
			mode = w < 768 ? 'mobile' : w < 1024 ? 'ipad' : 'desktop';
		};
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
	});

	function openPicker() {
		if (disabled) return;
		if (startShipDate && completeShipDate) {
			draftStart = toLocalDate(startShipDate);
			draftEnd = toLocalDate(completeShipDate);
		} else {
			const defaults = defaultRange(seasonWindow);
			if (defaults) {
				draftStart = defaults.start;
				draftEnd = defaults.end;
			} else {
				draftStart = null;
				draftEnd = null;
			}
		}
		focusing = 'start';
		viewMonth = draftStart ? startOfMonth(draftStart) : startOfMonth(new Date());
		open = true;
	}

	function handleDayClick(d: Date) {
		if (seasonWindow && isBefore(d, seasonWindow.startDate)) return;

		if (focusing === 'start') {
			draftStart = d;
			if (draftEnd && isBefore(draftEnd, d)) draftEnd = null;
			focusing = 'end';
			if (draftEnd) viewMonth = startOfMonth(draftEnd);
		} else {
			if (!draftStart) {
				draftStart = d;
				focusing = 'end';
			} else if (isBefore(d, draftStart)) {
				draftEnd = draftStart;
				draftStart = d;
				focusing = 'start';
			} else {
				draftEnd = d;
				focusing = 'start';
			}
		}
	}

	function handleTabClick(tab: 'start' | 'end') {
		focusing = tab;
		if (tab === 'start' && draftStart) viewMonth = startOfMonth(draftStart);
		if (tab === 'end' && draftEnd) viewMonth = startOfMonth(draftEnd);
	}

	function applyRange() {
		if (!draftStart || !draftEnd) return;
		if (isAfter(draftStart, draftEnd)) return;
		if (seasonWindow && isBefore(draftStart, seasonWindow.startDate)) return;
		onApply({ startShipDate: toISODate(draftStart), completeShipDate: toISODate(draftEnd) });
		open = false;
	}

	function cancel() {
		open = false;
	}

	function clearDraft() {
		draftStart = null;
		draftEnd = null;
		focusing = 'start';
	}

	function prevMonth() {
		viewMonth = addMonths(viewMonth, -1);
	}

	function nextMonth() {
		viewMonth = addMonths(viewMonth, 1);
	}

	const prevDisabled = $derived(
		seasonWindow
			? viewMonth.getFullYear() === seasonWindow.startDate.getFullYear() &&
					viewMonth.getMonth() <= seasonWindow.startDate.getMonth()
			: false
	);

	const nextMonthDate = $derived(addMonths(viewMonth, 1));
	const nextDisabled = false;

	const canApply = $derived(
		draftStart !== null && draftEnd !== null && !isAfter(draftStart, draftEnd)
	);

	const triggerRange = $derived.by(() => {
		if (!startShipDate || !completeShipDate) return null;
		const s = toLocalDate(startShipDate);
		const e = toLocalDate(completeShipDate);
		const duration = daysBetween(s, e);
		return {
			start: formatDateShort(s),
			end: formatDateShort(e),
			days: duration
		};
	});
</script>

{#snippet triggerInner()}
	<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
		<svg
			class="h-5 w-5 text-muted-foreground"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
		>
			<rect x="3" y="4" width="18" height="18" rx="2" />
			<path d="M16 2v4M8 2v4M3 10h18" />
		</svg>
	</div>
	<div class="min-w-0 flex-1">
		{#if triggerRange}
			<div class="text-xs text-muted-foreground">Ship window</div>
			<div class="flex items-baseline gap-2 text-sm font-medium">
				<span class="whitespace-nowrap">{triggerRange.start}</span>
				<span class="text-muted-foreground">→</span>
				<span class="whitespace-nowrap">{triggerRange.end}</span>
			</div>
			<span
				class="mt-0.5 inline-block rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground"
				>{triggerRange.days} day{triggerRange.days === 1 ? '' : 's'}</span
			>
		{:else}
			<div class="text-xs text-muted-foreground">Ship window</div>
			<div class="text-sm text-muted-foreground">Pick a ship window</div>
		{/if}
	</div>
	<svg
		class="h-4 w-4 shrink-0 text-muted-foreground transition-transform {open ? 'rotate-180' : ''}"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
	</svg>
{/snippet}

{#snippet trigger()}
	{#if variant === 'button'}
		<button
			type="button"
			{id}
			class="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
			{disabled}
			onclick={openPicker}
		>
			{buttonLabel}
		</button>
	{:else}
		<button
			type="button"
			{id}
			class="flex w-full items-center gap-3 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			{disabled}
			onclick={openPicker}
		>
			{@render triggerInner()}
		</button>
	{/if}
{/snippet}

{#snippet tabs()}
	<div class="grid grid-cols-2 border-b">
		<button
			type="button"
			class="px-5 py-3 text-left transition-colors {focusing === 'start'
				? 'border-b-2 border-foreground'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => handleTabClick('start')}
		>
			<div
				class="text-xs tracking-wider uppercase {focusing === 'start'
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				Start ship
			</div>
			<div
				class="text-sm font-medium {focusing === 'start'
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				{draftStart ? formatDateShort(draftStart) : '—'}
			</div>
		</button>
		<button
			type="button"
			class="border-l px-5 py-3 text-left transition-colors {focusing === 'end'
				? 'border-b-2 border-foreground'
				: 'text-muted-foreground hover:text-foreground'}"
			onclick={() => handleTabClick('end')}
		>
			<div
				class="text-xs tracking-wider uppercase {focusing === 'end'
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				Complete ship
			</div>
			<div
				class="text-sm font-medium {focusing === 'end'
					? 'text-foreground'
					: 'text-muted-foreground'}"
			>
				{draftEnd ? formatDateShort(draftEnd) : '—'}
			</div>
		</button>
	</div>
{/snippet}

{#snippet calendarContent()}
	{#if mode === 'mobile'}
		<div class="p-4">
			<Calendar
				{viewMonth}
				{draftStart}
				{draftEnd}
				{hoverDate}
				{seasonWindow}
				{focusing}
				onDayClick={handleDayClick}
				onDayHover={(d) => (hoverDate = d)}
				onPrevMonth={prevMonth}
				onNextMonth={nextMonth}
				{prevDisabled}
				{nextDisabled}
			/>
		</div>
	{:else}
		<div class="flex gap-6 p-4">
			<Calendar
				{viewMonth}
				{draftStart}
				{draftEnd}
				{hoverDate}
				{seasonWindow}
				{focusing}
				onDayClick={handleDayClick}
				onDayHover={(d) => (hoverDate = d)}
				onPrevMonth={prevMonth}
				onNextMonth={() => {}}
				{prevDisabled}
				showNav={true}
				nextDisabled={true}
			/>
			<Calendar
				viewMonth={nextMonthDate}
				{draftStart}
				{draftEnd}
				{hoverDate}
				{seasonWindow}
				{focusing}
				onDayClick={handleDayClick}
				onDayHover={(d) => (hoverDate = d)}
				onPrevMonth={() => {}}
				onNextMonth={nextMonth}
				prevDisabled={true}
				showNav={true}
				{nextDisabled}
			/>
		</div>
	{/if}
{/snippet}

{#snippet footer()}
	<div class="flex items-center justify-between border-t px-4 py-3">
		{#if mode !== 'mobile'}
			<button
				type="button"
				class="text-sm text-muted-foreground hover:text-foreground"
				onclick={clearDraft}
			>
				Clear
			</button>
		{:else}
			<span></span>
		{/if}
		<div class="flex items-center gap-2">
			<button
				type="button"
				class="rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
				onclick={cancel}
			>
				Cancel
			</button>
			<button
				type="button"
				class="rounded-md bg-foreground px-3 py-1.5 text-sm text-background transition-colors hover:bg-foreground/90 disabled:pointer-events-none disabled:opacity-50"
				disabled={!canApply}
				onclick={applyRange}
			>
				Apply
			</button>
		</div>
	</div>
{/snippet}

<!-- Desktop: Popover -->
{#if mode === 'desktop'}
	<Popover.Root
		bind:open
		onOpenChange={(o) => {
			if (o) openPicker();
		}}
	>
		{#if variant === 'button'}
			<Popover.Trigger
				{id}
				{disabled}
				class="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
			>
				{buttonLabel}
			</Popover.Trigger>
		{:else}
			<Popover.Trigger
				{id}
				{disabled}
				class="flex w-full items-center gap-3 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				{@render triggerInner()}
			</Popover.Trigger>
		{/if}
		<Popover.Content
			sideOffset={6}
			class="z-50 w-[580px] rounded-lg border bg-background shadow-lg"
			onEscapeKeydown={cancel}
		>
			{@render tabs()}
			{@render calendarContent()}
			{@render footer()}
		</Popover.Content>
	</Popover.Root>
{:else if mode === 'ipad'}
	{@render trigger()}
	<Dialog.Root bind:open>
		<Dialog.Portal>
			<Dialog.Overlay
				class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
			/>
			<Dialog.Content
				class="fixed top-[50%] left-[50%] z-50 w-full max-w-[580px] translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background shadow-lg"
				onEscapeKeydown={cancel}
			>
				<Dialog.Title class="sr-only">Ship window</Dialog.Title>
				{@render tabs()}
				{@render calendarContent()}
				{@render footer()}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{:else}
	{@render trigger()}
	<Dialog.Root bind:open>
		<Dialog.Portal>
			<Dialog.Overlay
				class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
			/>
			<Dialog.Content
				class="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-auto rounded-t-xl border-t bg-background shadow-lg"
				onEscapeKeydown={cancel}
			>
				<Dialog.Title class="sr-only">Ship window</Dialog.Title>
				<div class="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/20"></div>
				{@render tabs()}
				{@render calendarContent()}
				{@render footer()}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}
