<script lang="ts">
	import { daysInMonth, sameDay, isBefore, isBetween, type SeasonWindow } from './helpers';

	type Props = {
		viewMonth: Date;
		draftStart: Date | null;
		draftEnd: Date | null;
		hoverDate: Date | null;
		seasonWindow: SeasonWindow | null;
		focusing: 'start' | 'end';
		onDayClick: (d: Date) => void;
		onDayHover: (d: Date | null) => void;
		onPrevMonth: () => void;
		onNextMonth: () => void;
		showNav?: boolean;
		prevDisabled?: boolean;
		nextDisabled?: boolean;
	};

	let {
		viewMonth,
		draftStart,
		draftEnd,
		hoverDate,
		seasonWindow,
		focusing,
		onDayClick,
		onDayHover,
		onPrevMonth,
		onNextMonth,
		showNav = true,
		prevDisabled = false,
		nextDisabled = false
	}: Props = $props();

	const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const MONTH_NAMES = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	const year = $derived(viewMonth.getFullYear());
	const month = $derived(viewMonth.getMonth());
	const totalDays = $derived(daysInMonth(year, month));
	const firstDayOfWeek = $derived(new Date(year, month, 1).getDay());

	const days = $derived.by(() => {
		const cells: Array<{ date: Date; isCurrentMonth: boolean }> = [];
		const prevMonthDays = daysInMonth(year, month - 1);
		for (let i = firstDayOfWeek - 1; i >= 0; i--) {
			cells.push({
				date: new Date(year, month - 1, prevMonthDays - i),
				isCurrentMonth: false
			});
		}
		for (let d = 1; d <= totalDays; d++) {
			cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
		}
		const remaining = 42 - cells.length;
		for (let d = 1; d <= remaining; d++) {
			cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
		}
		return cells;
	});

	function isDayDisabled(d: Date): boolean {
		if (!seasonWindow) return false;
		return isBefore(d, seasonWindow.startDate);
	}

	function isInRange(d: Date): boolean {
		const rangeEnd = focusing === 'end' && hoverDate ? hoverDate : draftEnd;
		if (!draftStart || !rangeEnd) return false;
		const [s, e] = isBefore(rangeEnd, draftStart) ? [rangeEnd, draftStart] : [draftStart, rangeEnd];
		return isBetween(d, s, e) && !sameDay(d, s) && !sameDay(d, e);
	}

	function isRangeStart(d: Date): boolean {
		if (!draftStart) return false;
		const rangeEnd = focusing === 'end' && hoverDate ? hoverDate : draftEnd;
		if (rangeEnd && isBefore(rangeEnd, draftStart)) return sameDay(d, rangeEnd);
		return sameDay(d, draftStart);
	}

	function isRangeEnd(d: Date): boolean {
		const rangeEnd = focusing === 'end' && hoverDate ? hoverDate : draftEnd;
		if (!rangeEnd) return false;
		if (!draftStart) return sameDay(d, rangeEnd);
		if (isBefore(rangeEnd, draftStart)) return sameDay(d, draftStart);
		return sameDay(d, rangeEnd);
	}
</script>

<div class="w-full">
	{#if showNav}
		<div class="mb-3 flex items-center justify-between">
			<button
				type="button"
				class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
				disabled={prevDisabled}
				onclick={onPrevMonth}
				aria-label="Previous month"
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
				</svg>
			</button>
			<span class="text-sm font-medium">{MONTH_NAMES[month]} {year}</span>
			<button
				type="button"
				class="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
				disabled={nextDisabled}
				onclick={onNextMonth}
				aria-label="Next month"
			>
				<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		</div>
	{/if}

	<div class="grid grid-cols-7 gap-0">
		{#each WEEKDAYS as wd (wd)}
			<div class="flex h-8 items-center justify-center text-sm text-muted-foreground">{wd}</div>
		{/each}
		{#each days as cell (cell.date.toISOString())}
			{@const disabled = isDayDisabled(cell.date)}
			{@const inRange = !disabled && cell.isCurrentMonth && isInRange(cell.date)}
			{@const rangeStart = !disabled && cell.isCurrentMonth && isRangeStart(cell.date)}
			{@const rangeEnd = !disabled && cell.isCurrentMonth && isRangeEnd(cell.date)}
			<button
				type="button"
				class="relative flex h-9 items-center justify-center text-sm transition-colors
					{!cell.isCurrentMonth ? 'text-muted-foreground/40' : ''}
					{disabled && cell.isCurrentMonth ? 'pointer-events-none text-muted-foreground/30 line-through' : ''}
					{inRange ? 'bg-foreground/10' : ''}
					{rangeStart || rangeEnd ? 'rounded-md bg-foreground font-medium text-background' : ''}
					{!disabled && cell.isCurrentMonth && !rangeStart && !rangeEnd && !inRange
					? 'rounded-md hover:bg-muted'
					: ''}"
				disabled={disabled || !cell.isCurrentMonth}
				aria-disabled={disabled}
				tabindex={disabled ? -1 : 0}
				onclick={() => onDayClick(cell.date)}
				onmouseenter={() => onDayHover(cell.date)}
				onmouseleave={() => onDayHover(null)}
			>
				{cell.date.getDate()}
			</button>
		{/each}
	</div>
</div>
