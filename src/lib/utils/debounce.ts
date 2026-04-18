/**
 * Returns a debounced version of the given function.
 * The function will only be called after `ms` milliseconds of inactivity.
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
	fn: T,
	ms: number
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return (...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}
