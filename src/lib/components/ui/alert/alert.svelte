<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { type VariantProps, cva } from 'class-variance-authority';

	const alertVariants = cva(
		'relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
		{
			variants: {
				variant: {
					default: 'bg-background text-foreground',
					destructive:
						'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive'
				}
			},
			defaultVariants: { variant: 'default' }
		}
	);

	type Props = {
		variant?: VariantProps<typeof alertVariants>['variant'];
		class?: string;
		children?: import('svelte').Snippet;
	};

	let { variant = 'default', class: className = '', children, ...restProps }: Props = $props();
</script>

<div role="alert" class={cn(alertVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>
