<script lang="ts">
	type Props = {
		value: number;
		label?: string;
		onchange: (qty: number) => void;
	};

	let { value, label, onchange }: Props = $props();

	function dec() {
		onchange(Math.max(0, value - 1));
	}

	function inc() {
		onchange(value + 1);
	}
</script>

<div
	class="flex h-11 items-center overflow-hidden rounded-lg border border-input bg-background focus-within:border-foreground focus-within:ring-1 focus-within:ring-foreground/20"
>
	{#if label}
		<span class="shrink-0 pl-4 text-sm font-medium">{label}</span>
	{/if}
	<button
		type="button"
		aria-label={label ? `Decrease ${label}` : 'Decrease'}
		disabled={value === 0}
		onclick={dec}
		class="flex h-full shrink-0 items-center justify-center px-6 text-base text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
	>
		−
	</button>
	<input
		type="text"
		inputmode="numeric"
		pattern="[0-9]*"
		aria-label={label ? `${label} quantity` : 'Quantity'}
		{value}
		oninput={(e) => {
			const raw = (e.currentTarget as HTMLInputElement).value.replace(/[^0-9]/g, '');
			onchange(raw === '' ? 0 : parseInt(raw, 10));
		}}
		onkeydown={(e) => {
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				inc();
			} else if (e.key === 'ArrowDown') {
				e.preventDefault();
				dec();
			} else if (e.key === 'Enter') {
				e.preventDefault();
				(e.currentTarget as HTMLInputElement).blur();
			}
		}}
		onclick={(e) => e.stopPropagation()}
		class="h-full w-full min-w-0 bg-transparent text-center font-mono text-base outline-none"
	/>
	<button
		type="button"
		aria-label={label ? `Increase ${label}` : 'Increase'}
		onclick={inc}
		class="flex h-full shrink-0 items-center justify-center px-6 text-base text-muted-foreground transition-colors hover:text-foreground"
	>
		+
	</button>
</div>
