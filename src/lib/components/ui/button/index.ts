import { type VariantProps, cva } from 'class-variance-authority';
import Root from './button.svelte';

export const buttonVariants = cva(
	'inline-flex items-center justify-center gap-2 whitespace-nowrap text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50',
	{
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
				destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
				outline:
					'border border-black/80! bg-background hover:bg-accent hover:text-accent-foreground dark:border-white/20!',
				secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-9 px-4 py-2',
				sm: 'h-8 px-3 text-[12px]',
				lg: 'h-11 px-6 text-sm',
				icon: 'h-9 w-9'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
);

export type ButtonVariants = VariantProps<typeof buttonVariants>;

export { Root as Button, Root };
