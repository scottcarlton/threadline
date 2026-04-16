/**
 * Format a string of digits (or any input containing digits) as a US phone:
 *   123          -> (123)
 *   1234         -> (123) 4
 *   1234567      -> (123) 456-7
 *   1234567890   -> (123) 456-7890
 *   12345678901+ -> (123) 456-7890   (extras dropped)
 * Empty input returns ''.
 */
export function formatPhone(input: string): string {
	const digits = input.replace(/\D/g, '').slice(0, 10);
	if (digits.length === 0) return '';
	if (digits.length < 4) return `(${digits}`;
	if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export const PHONE_REGEX = /^\(\d{3}\) \d{3}-\d{4}$/;
