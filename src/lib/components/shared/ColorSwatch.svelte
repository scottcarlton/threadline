<script lang="ts">
	type Props = {
		color: string | null;
		size?: number;
		class?: string;
	};

	let { color, size = 20, class: klass = '' }: Props = $props();

	// Normalize a human color name into something CSS can render. Falls back to
	// a neutral grey when the name isn't a valid CSS color. We can't perfectly
	// predict every brand-coined color name ("Oat Milk", "Stone Wash"), so the
	// swatch is a hint, not a literal rendering.
	const CSS_COLORS = new Set([
		'black',
		'white',
		'red',
		'green',
		'blue',
		'yellow',
		'orange',
		'purple',
		'pink',
		'brown',
		'grey',
		'gray',
		'beige',
		'ivory',
		'cream',
		'tan',
		'navy',
		'teal',
		'olive',
		'maroon',
		'gold',
		'silver',
		'bronze',
		'khaki',
		'coral',
		'salmon',
		'mint',
		'lavender',
		'lilac',
		'magenta',
		'cyan'
	]);
	const EXTRA: Record<string, string> = {
		natural: '#e8dfcf',
		ecru: '#efe4d2',
		stone: '#b5a896',
		charcoal: '#36454f',
		camel: '#c19a6b',
		rust: '#b7410e',
		chambray: '#8aa8c4',
		denim: '#5b7ea0'
	};

	const fill = $derived.by(() => {
		if (!color) return null;
		const key = color.trim().toLowerCase();
		if (EXTRA[key]) return EXTRA[key];
		if (CSS_COLORS.has(key)) return key;
		return '#d4d4d4';
	});
</script>

<span
	class="inline-block rounded-sm border border-border align-middle {klass}"
	style="width: {size}px; height: {size}px; {fill ? `background-color: ${fill};` : ''}"
	aria-label={color ?? 'No color'}
>
	{#if !color}
		<!-- Diagonal stroke bottom-left → top-right to indicate "no color". -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 20 20"
			class="block h-full w-full"
			aria-hidden="true"
		>
			<line
				x1="1"
				y1="19"
				x2="19"
				y2="1"
				stroke="#dc2626"
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		</svg>
	{/if}
</span>
