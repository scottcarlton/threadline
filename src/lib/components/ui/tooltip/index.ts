import { Tooltip as TooltipPrimitive } from 'bits-ui';

const Root = TooltipPrimitive.Root;
const Trigger = TooltipPrimitive.Trigger;
const Provider = TooltipPrimitive.Provider;

export {
	Root,
	Trigger,
	Provider,
	Root as Tooltip,
	Trigger as TooltipTrigger,
	Provider as TooltipProvider
};

export { default as TooltipContent } from './tooltip-content.svelte';
