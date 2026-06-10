<script lang="ts">
	type Provider = 'gmail' | 'outlook' | 'google_calendar' | 'microsoft_calendar' | 'calendly';

	type Props = {
		provider: Provider;
		name: string;
		detail?: string;
		onDisconnect: () => void;
		disconnecting?: boolean;
	};

	let { provider, name, detail, onDisconnect, disconnecting = false }: Props = $props();
</script>

<div class="flex items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
	<div class="flex min-w-0 items-center gap-3">
		<span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
			{#if provider === 'gmail'}
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 -31.5 256 256">
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
			{:else if provider === 'outlook'}
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 48 48" fill="none">
					<defs>
						<linearGradient
							id="conn-outlook-g1"
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
							id="conn-outlook-g2"
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
							id="conn-outlook-g3"
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
							id="conn-outlook-g4"
							x1="42"
							y1="29.94"
							x2="23.85"
							y2="29.94"
							gradientUnits="userSpaceOnUse"
							><stop stop-color="#4DC4FF" /><stop
								offset=".2"
								stop-color="#0FAFFF"
							/></linearGradient
						>
						<radialGradient
							id="conn-outlook-r1"
							cx="0"
							cy="0"
							r="1"
							gradientTransform="translate(18.57 27.53) rotate(123.3) scale(20.73 53.79)"
							><stop stop-color="#49DEFF" /><stop
								offset=".72"
								stop-color="#29C3FF"
							/></radialGradient
						>
						<radialGradient
							id="conn-outlook-r2"
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
						fill="url(#conn-outlook-g1)"
					/>
					<path
						d="M27.14 6.89l.21.13 10.41 6.76-25.82 16.37-3.96-6.25L26.93 11.85c1.8-1.14 1.87-3.7.21-4.96z"
						fill="url(#conn-outlook-g2)"
					/>
					<path
						d="M22.24 33.27l-10.3-3.13 21.9-13.88c1.85-1.17 1.84-3.86.01-5.03l-.1-.06.28.18 6.67 4.32c.82.53 1.32 1.44 1.32 2.42v2.6L22.24 33.27z"
						fill="url(#conn-outlook-g3)"
					/>
					<path
						d="M27.35 7.02c-2.03-1.32-4.65-1.32-6.69 0L7.32 15.68A2.68 2.68 0 0 0 6 18.1v.13c.03.98.55 1.88 1.38 2.41l16.6 10.46 16.63-10.45a2.68 2.68 0 0 0 1.39-2.55v2.55l-.01-2.6c0-.98-.5-1.89-1.31-2.42L27.35 7.02z"
						fill="url(#conn-outlook-r1)"
						opacity=".6"
					/>
					<path
						d="M21.05 42h14.7c3.45 0 6.25-2.8 6.25-6.25V18.14a2.68 2.68 0 0 1-1.39 2.51L18.75 34.38a3.58 3.58 0 0 0-1.9 3.43c0 2.32 1.88 4.2 4.2 4.2z"
						fill="url(#conn-outlook-g4)"
					/>
					<path
						d="M27.03 42H12.25A6.25 6.25 0 0 1 6 35.75V18.13c0 1.02.52 1.97 1.38 2.51l21.84 15.77a3.58 3.58 0 0 1 1.92 3.48c0 2.27-1.84 4.11-4.11 4.11z"
						fill="url(#conn-outlook-r1)"
					/>
					<path
						d="M16.75 23h-9.5A3.25 3.25 0 0 0 4 26.25v9.5A3.25 3.25 0 0 0 7.25 39h9.5A3.25 3.25 0 0 0 20 35.75v-9.5A3.25 3.25 0 0 0 16.75 23z"
						fill="url(#conn-outlook-r2)"
					/>
					<path
						d="M11.96 35.6c-1.32 0-2.41-.41-3.26-1.24-.85-.83-1.27-1.91-1.27-3.24 0-1.41.43-2.55 1.29-3.41.86-.87 1.99-1.3 3.39-1.3 1.32 0 2.39.42 3.22 1.25.83.83 1.25 1.93 1.25 3.29 0 1.4-.43 2.53-1.3 3.38-.86.86-1.97 1.28-3.32 1.28zm.04-1.76c.72 0 1.3-.25 1.74-.74.44-.49.66-1.18.66-2.06 0-.91-.21-1.63-.64-2.14-.43-.5-1-.76-1.71-.76-.73 0-1.32.26-1.77.79-.45.52-.67 1.21-.67 2.07 0 .87.22 1.56.67 2.07.45.5 1.02.76 1.72.76z"
						fill="white"
					/>
				</svg>
			{:else if provider === 'google_calendar'}
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 256 256">
					<polygon
						fill="#FFFFFF"
						points="195.368 60.632 60.632 60.632 60.632 195.368 195.368 195.368"
					/>
					<polygon
						fill="#EA4335"
						points="195.368 256 256 195.368 225.684 190.196 195.368 195.368 189.835 223.098"
					/>
					<path
						d="M0 195.368v40.421C0 246.956 9.044 256 20.211 256h40.421l6.225-30.316-6.225-30.316H27.599L0 195.368z"
						fill="#188038"
					/>
					<path
						d="M256 60.632V20.211C256 9.044 246.956 0 235.789 0h-40.421c-3.689 15.036-5.533 26.101-5.533 33.196 0 7.094 1.844 16.24 5.533 27.436 13.41 3.84 23.515 5.76 30.316 5.76 6.801 0 16.906-1.92 30.316-5.76z"
						fill="#1967D2"
					/>
					<polygon fill="#FBBC04" points="256 60.632 195.368 60.632 195.368 195.368 256 195.368" />
					<polygon fill="#34A853" points="195.368 195.368 60.632 195.368 60.632 256 195.368 256" />
					<path
						d="M195.368 0H20.211C9.044 0 0 9.044 0 20.211v175.158h60.632V60.632h134.737V0z"
						fill="#4285F4"
					/>
					<path
						d="M88.27 165.154c-5.036-3.402-8.522-8.37-10.425-14.939l11.688-4.817c1.061 4.042 2.914 7.175 5.558 9.398 2.627 2.223 5.827 3.318 9.566 3.318 3.824 0 7.108-1.162 9.853-3.487 2.745-2.324 4.126-5.288 4.126-8.876 0-3.671-1.448-6.669-4.345-8.993-2.897-2.324-6.535-3.487-10.88-3.487h-6.754v-11.57h6.063c3.739 0 6.888-1.011 9.448-3.032 2.56-2.021 3.84-4.783 3.84-8.303 0-3.133-1.145-5.625-3.436-7.495-2.29-1.87-5.187-2.813-8.707-2.813-3.436 0-6.164.91-8.186 2.746a12.123 12.123 0 0 0-4.412 6.753l-11.57-4.816c1.532-4.345 4.345-8.186 8.471-11.504 4.126-3.318 9.398-4.985 15.798-4.985 4.733 0 8.994.91 12.766 2.745 3.773 1.836 6.737 4.379 8.876 7.613 2.139 3.25 3.2 6.888 3.2 10.93 0 4.127-.994 7.613-2.981 10.476-1.987 2.863-4.429 5.053-7.326 6.585v.69c3.74 1.543 6.99 4.076 9.398 7.327 2.442 3.284 3.671 7.208 3.671 11.789 0 4.581-1.162 8.674-3.486 12.261-2.324 3.587-5.541 6.417-9.617 8.471-4.092 2.055-8.69 3.099-13.793 3.099-5.912.017-11.369-1.684-16.405-5.086zm71.798-58.004L147.234 116.43l-6.417-9.735 23.024-16.606h9.46V168.42h-12.598l-.635-61.27z"
						fill="#4285F4"
					/>
				</svg>
			{:else if provider === 'microsoft_calendar'}
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 48 48" fill="none">
					<defs>
						<linearGradient
							id="conn-mscal-g1"
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
							id="conn-mscal-g2"
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
							id="conn-mscal-g3"
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
							id="conn-mscal-g4"
							x1="42"
							y1="29.94"
							x2="23.85"
							y2="29.94"
							gradientUnits="userSpaceOnUse"
							><stop stop-color="#4DC4FF" /><stop
								offset=".2"
								stop-color="#0FAFFF"
							/></linearGradient
						>
						<radialGradient
							id="conn-mscal-r1"
							cx="0"
							cy="0"
							r="1"
							gradientTransform="translate(18.57 27.53) rotate(123.3) scale(20.73 53.79)"
							><stop stop-color="#49DEFF" /><stop
								offset=".72"
								stop-color="#29C3FF"
							/></radialGradient
						>
						<radialGradient
							id="conn-mscal-r2"
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
						fill="url(#conn-mscal-g1)"
					/>
					<path
						d="M27.14 6.89l.21.13 10.41 6.76-25.82 16.37-3.96-6.25L26.93 11.85c1.8-1.14 1.87-3.7.21-4.96z"
						fill="url(#conn-mscal-g2)"
					/>
					<path
						d="M22.24 33.27l-10.3-3.13 21.9-13.88c1.85-1.17 1.84-3.86.01-5.03l-.1-.06.28.18 6.67 4.32c.82.53 1.32 1.44 1.32 2.42v2.6L22.24 33.27z"
						fill="url(#conn-mscal-g3)"
					/>
					<path
						d="M27.35 7.02c-2.03-1.32-4.65-1.32-6.69 0L7.32 15.68A2.68 2.68 0 0 0 6 18.1v.13c.03.98.55 1.88 1.38 2.41l16.6 10.46 16.63-10.45a2.68 2.68 0 0 0 1.39-2.55v2.55l-.01-2.6c0-.98-.5-1.89-1.31-2.42L27.35 7.02z"
						fill="url(#conn-mscal-r1)"
						opacity=".6"
					/>
					<path
						d="M21.05 42h14.7c3.45 0 6.25-2.8 6.25-6.25V18.14a2.68 2.68 0 0 1-1.39 2.51L18.75 34.38a3.58 3.58 0 0 0-1.9 3.43c0 2.32 1.88 4.2 4.2 4.2z"
						fill="url(#conn-mscal-g4)"
					/>
					<path
						d="M27.03 42H12.25A6.25 6.25 0 0 1 6 35.75V18.13c0 1.02.52 1.97 1.38 2.51l21.84 15.77a3.58 3.58 0 0 1 1.92 3.48c0 2.27-1.84 4.11-4.11 4.11z"
						fill="url(#conn-mscal-r1)"
					/>
					<path
						d="M16.75 23h-9.5A3.25 3.25 0 0 0 4 26.25v9.5A3.25 3.25 0 0 0 7.25 39h9.5A3.25 3.25 0 0 0 20 35.75v-9.5A3.25 3.25 0 0 0 16.75 23z"
						fill="url(#conn-mscal-r2)"
					/>
					<path
						d="M11.96 35.6c-1.32 0-2.41-.41-3.26-1.24-.85-.83-1.27-1.91-1.27-3.24 0-1.41.43-2.55 1.29-3.41.86-.87 1.99-1.3 3.39-1.3 1.32 0 2.39.42 3.22 1.25.83.83 1.25 1.93 1.25 3.29 0 1.4-.43 2.53-1.3 3.38-.86.86-1.97 1.28-3.32 1.28zm.04-1.76c.72 0 1.3-.25 1.74-.74.44-.49.66-1.18.66-2.06 0-.91-.21-1.63-.64-2.14-.43-.5-1-.76-1.71-.76-.73 0-1.32.26-1.77.79-.45.52-.67 1.21-.67 2.07 0 .87.22 1.56.67 2.07.45.5 1.02.76 1.72.76z"
						fill="white"
					/>
				</svg>
			{:else if provider === 'calendly'}
				<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" viewBox="0 0 525.8 535.73">
					<path
						d="M360.4,347.4c-17,15.09-38.21,33.87-76.78,33.87h-23c-27.88,0-53.23-10.12-71.37-28.49-17.72-17.94-27.48-42.5-27.48-69.16V252.11c0-26.66,9.76-51.22,27.48-69.16,18.14-18.37,43.49-28.49,71.37-28.49h23c38.57,0,59.76,18.78,76.78,33.87,17.65,15.65,32.9,29.16,73.52,29.16a116.05,116.05,0,0,0,18.5-1.48c0-.12-.08-.23-.13-.35a139.23,139.23,0,0,0-8.55-17.55l-27.16-47.05A139.53,139.53,0,0,0,295.76,81.3H241.43a139.53,139.53,0,0,0-120.82,69.76L93.45,198.11a139.52,139.52,0,0,0,0,139.51l27.16,47.05a139.52,139.52,0,0,0,120.82,69.75h54.33a139.52,139.52,0,0,0,120.82-69.75l27.16-47.05a139.23,139.23,0,0,0,8.55-17.55c0-.12.09-.23.13-.35a116.05,116.05,0,0,0-18.5-1.48C393.3,318.24,378.05,331.75,360.4,347.4Z"
						fill="#006bff"
					/>
					<path
						d="M283.62,183h-23c-42.42,0-70.3,30.3-70.3,69.09v31.51c0,38.79,27.88,69.09,70.3,69.09h23c61.82,0,57-63,150.3-63a144.19,144.19,0,0,1,26.37,2.41,139.36,139.36,0,0,0,0-48.46,143.32,143.32,0,0,1-26.37,2.42C340.59,246.05,345.44,183,283.62,183Z"
						fill="#006bff"
					/>
					<path
						d="M513.91,315.13a130.21,130.21,0,0,0-53.62-23c0,.16-.05.32-.08.47a138.46,138.46,0,0,1-7.79,27.16A102.15,102.15,0,0,1,496.75,338c0,.14-.08.28-.13.43A237.8,237.8,0,0,1,463.33,406a240.67,240.67,0,0,1-52,53.48A239.3,239.3,0,0,1,98.65,98.65a239.43,239.43,0,0,1,398,98.69c.05.15.09.29.13.43A102.15,102.15,0,0,1,452.42,216a139.36,139.36,0,0,1,7.8,27.18c0,.15,0,.3.07.44a129.94,129.94,0,0,0,53.62-23c15.29-11.31,12.33-24.09,10-31.65C490.22,79.52,388.33,0,267.86,0,119.93,0,0,119.93,0,267.86S119.93,535.73,267.86,535.73c120.47,0,222.36-79.52,256-188.94C526.24,339.23,529.2,326.45,513.91,315.13Z"
						fill="#006bff"
					/>
					<path
						d="M452.42,216a116.05,116.05,0,0,1-18.5,1.48c-40.62,0-55.87-13.51-73.52-29.16-17-15.09-38.21-33.87-76.78-33.87h-23c-27.88,0-53.23,10.12-71.37,28.49-17.72,17.94-27.48,42.5-27.48,69.16V252.11c0,26.66,9.76,51.22,27.48,69.16,18.14,18.37,43.49,28.49,71.37,28.49h23c38.57,0,59.76-18.78,76.78-33.87,17.65-15.65,32.9-29.16,73.52-29.16a116.05,116.05,0,0,1,18.5,1.48,138.46,138.46,0,0,0,7.79-27.16c0-.15.06-.31.08-.47a144.19,144.19,0,0,0-26.37-2.41c-93.33,0-88.48,63-150.3,63h-23c-42.42,0-70.3-30.3-70.3-69.09V252.11c0-38.79,27.88-69.09,70.3-69.09h23c61.82,0,57,63,150.3,63a143.32,143.32,0,0,0,26.37-2.42c0-.14,0-.29-.07-.44A139.36,139.36,0,0,0,452.42,216Z"
						fill="#0ae9ef"
					/>
				</svg>
			{/if}
		</span>
		<div class="min-w-0">
			<p class="truncate text-sm font-semibold">{name}</p>
			{#if detail}
				<p class="truncate text-sm text-muted-foreground">{detail}</p>
			{/if}
		</div>
	</div>
	<div class="flex shrink-0 items-center gap-4">
		<span
			class="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400"
		>
			<span class="h-2 w-2 rounded-full bg-emerald-500"></span>
			Connected
		</span>
		<button
			type="button"
			onclick={onDisconnect}
			disabled={disconnecting}
			class="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
		>
			{disconnecting ? 'Disconnecting…' : 'Disconnect'}
		</button>
	</div>
</div>
