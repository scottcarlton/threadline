export type ReasonCode =
	| 'account_missing'
	| 'account_low_confidence'
	| 'brand_missing'
	| 'variant_not_found'
	| 'qty_out_of_range'
	| 'product_low_confidence'
	| 'product_ambiguous'
	| 'product_no_match'
	| 'variant_unknown'
	| 'unknown';

const DIRECT_PATTERNS: Array<[RegExp, ReasonCode]> = [
	[/^Account could not be identified$/, 'account_missing'],
	[/^Account match confidence too low/, 'account_low_confidence'],
	[/^Brand could not be identified$/, 'brand_missing'],
	[/^No variant found for size/, 'variant_not_found'],
	[/^Quantity \d+ out of range/, 'qty_out_of_range']
];

const ISSUE_CODE_MAP: Record<string, ReasonCode> = {
	low_confidence: 'product_low_confidence',
	ambiguous_product: 'product_ambiguous',
	no_match: 'product_no_match',
	unknown_variant: 'variant_unknown'
};

export function classifyReason(reason: string, issueCode?: string): ReasonCode {
	if (issueCode && issueCode in ISSUE_CODE_MAP) {
		return ISSUE_CODE_MAP[issueCode];
	}

	for (const [pattern, code] of DIRECT_PATTERNS) {
		if (pattern.test(reason)) return code;
	}

	return 'unknown';
}
