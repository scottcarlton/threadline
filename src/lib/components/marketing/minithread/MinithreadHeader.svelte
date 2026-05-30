<div class="flex h-10 items-center justify-between bg-background px-3">
	<div class="flex items-center gap-2">
		<!-- Sidebar toggle icon -->
		<button
			type="button"
			class="hidden cursor-pointer text-muted-foreground transition-colors hover:text-foreground lg:block"
			aria-label="Toggle sidebar"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-3.5 w-3.5"
				viewBox="0 0 24 24"
				fill="currentColor"
			>
				<path
					d="M21 3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18Zm-1 2H9v14h11V5ZM7 5H4v14h3V5Zm6 4v6l-3-3 3-3Z"
				/>
			</svg>
		</button>
		<!-- Org badge + name -->
		<div class="flex items-center gap-1.5">
			<div
				class="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-[8px] font-bold text-primary-foreground"
			>
				M
			</div>
			<div class="hidden flex-col sm:flex">
				<span class="text-xs leading-tight font-semibold">Mercer & Vine</span>
				<span class="font-mono text-[8px] text-muted-foreground">Powered by Threadline</span>
			</div>
		</div>
	</div>

	<div class="flex items-center gap-1">
		<!-- Search -->
		<button
			type="button"
			class="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-ghost hover:text-foreground"
			aria-label="Search"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-3.5 w-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
		</button>

		<!-- Bell with badge -->
		<button
			type="button"
			class="relative cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-ghost hover:text-foreground"
			aria-label="Notifications"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-3.5 w-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
				/>
			</svg>
			<span
				class="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-red-500 px-0.5 text-[6px] font-bold text-white"
				>3</span
			>
		</button>

		<!-- Settings -->
		<button
			type="button"
			class="hidden cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-ghost hover:text-foreground lg:block"
			aria-label="Settings"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-3.5 w-3.5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
				/>
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
			</svg>
		</button>

		<!-- User avatar + name -->
		<button
			type="button"
			class="hidden cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-ghost lg:flex"
			aria-label="User menu"
		>
			<div
				class="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[7px] font-semibold text-primary-foreground"
			>
				SC
			</div>
			<div class="hidden flex-col items-start leading-none sm:flex">
				<span class="text-xs font-medium">Scott Carlton</span>
				<span class="font-mono text-[8px] text-muted-foreground">Owner</span>
			</div>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="hidden h-3 w-3 text-muted-foreground sm:block"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
			</svg>
		</button>
	</div>
</div>
