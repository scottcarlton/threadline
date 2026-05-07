<script lang="ts">
	import { cn } from '$lib/utils.js';

	type Props = {
		class?: string;
		value?: number;
		placeholder?: string;
		disabled?: boolean;
		onchange?: (value: number) => void;
	};

	let {
		class: className = '',
		value = $bindable(0),
		placeholder: _placeholder,
		disabled = false,
		onchange
	}: Props = $props();

	let cents = $state(Math.round(value * 100));
	let focused = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);

	const display = $derived(() => {
		const c = cents;
		const dollars = Math.floor(c / 100);
		const remainder = c % 100;
		return `${dollars.toLocaleString('en-US')}.${String(remainder).padStart(2, '0')}`;
	});

	$effect(() => {
		const incoming = Math.round(value * 100);
		if (incoming !== cents) cents = incoming;
	});

	function syncValue() {
		value = cents / 100;
		onchange?.(value);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Backspace') {
			e.preventDefault();
			cents = Math.floor(cents / 10);
			syncValue();
			return;
		}

		if (e.key === 'Delete') {
			e.preventDefault();
			cents = 0;
			syncValue();
			return;
		}

		const digit = e.key;
		if (digit >= '0' && digit <= '9') {
			e.preventDefault();
			cents = cents * 10 + parseInt(digit);
			syncValue();
		}
	}
</script>

<div
	class={cn(
		'flex min-h-[44px] w-full items-center rounded-sm border border-input bg-background px-3.5 py-2 text-base transition-colors',
		focused && 'border-ring ring-2 ring-ring/20',
		disabled && 'cursor-not-allowed opacity-50',
		className
	)}
	onclick={() => inputEl?.focus()}
	role="textbox"
	tabindex="-1"
>
	<span class="text-muted-foreground/60">$</span>
	<input
		bind:this={inputEl}
		type="text"
		inputmode="numeric"
		{disabled}
		value={display()}
		readonly
		class="w-full bg-transparent text-right outline-none"
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		onkeydown={handleKeydown}
	/>
</div>
