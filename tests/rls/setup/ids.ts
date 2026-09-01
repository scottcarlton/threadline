/**
 * Every fixture row gets an explicit UUID so teardown is exact rather than
 * heuristic. Auth user ids are NOT here: GoTrue assigns them at creation
 * time and they are captured into PERSONA_IDS. Auth users are found for
 * teardown by their email domain instead.
 *
 * The 0f5 prefix is arbitrary and exists only to make fixture rows obvious
 * when you are staring at the local database.
 */
const P = '0f500000-0000-4000-8000-';

export const RLS_IDS = {
	orgBrandA: `${P}000000000001`,
	orgBrandB: `${P}000000000002`,
	orgRepA: `${P}000000000003`,
	orgRepB: `${P}000000000004`,

	brandA1: `${P}000000000101`,
	brandA2: `${P}000000000102`,
	brandB1: `${P}000000000103`,
	brandRepAOwn: `${P}000000000104`,

	connActive: `${P}000000000201`,
	connPending: `${P}000000000202`,

	accountBrandA: `${P}000000000301`,
	accountRepA: `${P}000000000302`,
	accountBrandB: `${P}000000000303`,

	productA1: `${P}000000000401`,
	productB1: `${P}000000000402`,
	variantA1: `${P}000000000403`,

	orderRepAOnBrandA: `${P}000000000501`,
	orderBrandAInternal: `${P}000000000502`,
	orderRepBOnBrandB: `${P}000000000503`,

	orderLineRepAOnBrandA: `${P}000000000601`
} as const;

export const RLS_ORG_IDS: string[] = [
	RLS_IDS.orgBrandA,
	RLS_IDS.orgBrandB,
	RLS_IDS.orgRepA,
	RLS_IDS.orgRepB
];
