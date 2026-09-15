<script lang="ts">
	// Gmail / Outlook brand marks, in one place. Previously duplicated between
	// settings/+page.svelte and settings/ConnectionCard.svelte; preflight would
	// have been a third copy.
	type Props = { provider: 'gmail' | 'outlook'; cls?: string };
	let { provider, cls = 'h-6 w-6' }: Props = $props();
</script>

{#if provider === 'gmail'}
	<svg xmlns="http://www.w3.org/2000/svg" class={cls} viewBox="0 -31.5 256 256">
		<path
			d="M58.182 192.05V93.14L27.507 65.077 0 49.504v125.091c0 9.658 7.825 17.455 17.455 17.455h40.727z"
			fill="#4285F4"
		/>
		<path
			d="M197.818 192.05h40.727c9.659 0 17.455-7.826 17.455-17.455V49.504l-31.156 17.838-27.026 25.798v98.91z"
			fill="#34A853"
		/>
		<polygon
			fill="#EA4335"
			points="58.182 93.14 54.008 54.493 58.182 17.504 128 69.868 197.818 17.504 202.487 52.496 197.818 93.14 128 145.504"
		/>
		<path
			d="M197.818 17.504V93.14L256 49.504V26.231C256 4.646 231.36-7.66 214.109 5.286l-16.291 12.218z"
			fill="#FBBC04"
		/>
		<path
			d="M0 49.504l26.759 20.07L58.182 93.14V17.504L41.891 5.286C24.611-7.66 0 4.646 0 26.231v23.273z"
			fill="#C5221F"
		/>
	</svg>
{:else}
	<svg xmlns="http://www.w3.org/2000/svg" class={cls} viewBox="0 0 48 48" fill="none">
		<defs>
			<linearGradient
				id="mail-outlook-g1"
				x1="9.99"
				y1="22.36"
				x2="30.93"
				y2="9.37"
				gradientUnits="userSpaceOnUse"
				><stop stop-color="#20A7FA" /><stop offset=".4" stop-color="#3BD5FF" /><stop
					offset="1"
					stop-color="#C4B0FF"
				/></linearGradient
			>
			<linearGradient
				id="mail-outlook-g2"
				x1="17.2"
				y1="26.79"
				x2="28.86"
				y2="8.13"
				gradientUnits="userSpaceOnUse"
				><stop stop-color="#165AD9" /><stop offset=".5" stop-color="#1880E5" /><stop
					offset="1"
					stop-color="#8587FF"
				/></linearGradient
			>
			<linearGradient
				id="mail-outlook-g3"
				x1="24.05"
				y1="31.11"
				x2="44.51"
				y2="18.02"
				gradientUnits="userSpaceOnUse"
				><stop stop-color="#1A43A6" /><stop offset=".49" stop-color="#2052CB" /><stop
					offset="1"
					stop-color="#5F20CB"
				/></linearGradient
			>
			<linearGradient
				id="mail-outlook-g4"
				x1="42"
				y1="29.94"
				x2="23.85"
				y2="29.94"
				gradientUnits="userSpaceOnUse"
				><stop stop-color="#4DC4FF" /><stop offset=".2" stop-color="#0FAFFF" /></linearGradient
			>
			<radialGradient
				id="mail-outlook-r1"
				cx="0"
				cy="0"
				r="1"
				gradientTransform="translate(18.57 27.53) rotate(123.3) scale(20.73 53.79)"
				><stop stop-color="#49DEFF" /><stop offset=".72" stop-color="#29C3FF" /></radialGradient
			>
			<radialGradient
				id="mail-outlook-r2"
				cx="0"
				cy="0"
				r="1"
				gradientTransform="translate(3.94 23.62) rotate(46.9) scale(21.06)"
				><stop offset=".04" stop-color="#0091FF" /><stop
					offset=".92"
					stop-color="#183DAD"
				/></radialGradient
			>
		</defs>
		<path
			d="M30.93 9.34L7.98 23.89 6 20.78v-2.68c0-.98.5-1.89 1.32-2.42L20.66 7.02c2.03-1.32 4.65-1.32 6.69 0l4.58 2.32z"
			fill="url(#mail-outlook-g1)"
		/>
		<path
			d="M27.14 6.89l.21.13 10.41 6.76-25.82 16.37-3.96-6.25L26.93 11.85c1.8-1.14 1.87-3.7.21-4.96z"
			fill="url(#mail-outlook-g2)"
		/>
		<path
			d="M22.24 33.27l-10.3-3.13 21.9-13.88c1.85-1.17 1.84-3.86.01-5.03l-.1-.06.28.18 6.67 4.32c.82.53 1.32 1.44 1.32 2.42v2.6L22.24 33.27z"
			fill="url(#mail-outlook-g3)"
		/>
		<path
			d="M27.35 7.02c-2.03-1.32-4.65-1.32-6.69 0L7.32 15.68A2.68 2.68 0 0 0 6 18.1v.13c.03.98.55 1.88 1.38 2.41l16.6 10.46 16.63-10.45a2.68 2.68 0 0 0 1.39-2.55v2.55l-.01-2.6c0-.98-.5-1.89-1.31-2.42L27.35 7.02z"
			fill="url(#mail-outlook-r1)"
			opacity=".6"
		/>
		<path
			d="M21.05 42h14.7c3.45 0 6.25-2.8 6.25-6.25V18.14a2.68 2.68 0 0 1-1.39 2.51L18.75 34.38a3.58 3.58 0 0 0-1.9 3.43c0 2.32 1.88 4.2 4.2 4.2z"
			fill="url(#mail-outlook-g4)"
		/>
		<path
			d="M27.03 42H12.25A6.25 6.25 0 0 1 6 35.75V18.13c0 1.02.52 1.97 1.38 2.51l21.84 15.77a3.58 3.58 0 0 1 1.92 3.48c0 2.27-1.84 4.11-4.11 4.11z"
			fill="url(#mail-outlook-r1)"
		/>
		<path
			d="M16.75 23h-9.5A3.25 3.25 0 0 0 4 26.25v9.5A3.25 3.25 0 0 0 7.25 39h9.5A3.25 3.25 0 0 0 20 35.75v-9.5A3.25 3.25 0 0 0 16.75 23z"
			fill="url(#mail-outlook-r2)"
		/>
		<path
			d="M11.96 35.6c-1.32 0-2.41-.41-3.26-1.24-.85-.83-1.27-1.91-1.27-3.24 0-1.41.43-2.55 1.29-3.41.86-.87 1.99-1.3 3.39-1.3 1.32 0 2.39.42 3.22 1.25.83.83 1.25 1.93 1.25 3.29 0 1.4-.43 2.53-1.3 3.38-.86.86-1.97 1.28-3.32 1.28zm.04-1.76c.72 0 1.3-.25 1.74-.74.44-.49.66-1.18.66-2.06 0-.91-.21-1.63-.64-2.14-.43-.5-1-.76-1.71-.76-.73 0-1.32.26-1.77.79-.45.52-.67 1.21-.67 2.07 0 .87.22 1.56.67 2.07.45.5 1.02.76 1.72.76z"
			fill="white"
		/>
	</svg>
{/if}
