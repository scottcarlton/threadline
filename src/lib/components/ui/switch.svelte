<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	type Props = {
		checked?: boolean;
		disabled?: boolean;
		name?: string;
		value?: string;
		onCheckedChange?: (checked: boolean) => void;
		id?: string;
		class?: string;
		'aria-label'?: string;
	};

	let {
		checked = $bindable(false),
		disabled,
		name,
		value,
		onCheckedChange,
		id,
		class: className,
		...rest
	}: Props = $props();
</script>

<SwitchPrimitive.Root
	bind:checked
	{disabled}
	{name}
	{value}
	{onCheckedChange}
	{id}
	class={cn(
		'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=unchecked]:bg-input',
		className
	)}
	{...rest}
>
	<SwitchPrimitive.Thumb
		class={cn(
			'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
		)}
	/>
</SwitchPrimitive.Root>
