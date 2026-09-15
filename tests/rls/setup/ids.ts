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
	// Exists only to carry the draft invoice below: invoices are UNIQUE on
	// order_id, so a draft and a sent invoice cannot share one order.
	orderRepAForDraft: `${P}000000000504`,

	orderLineRepAOnBrandA: `${P}000000000601`,

	// Invoices are always issued by the brand org (orgBrandA here), even when
	// the order belongs to a rep org.
	//
	// invoiceSentRepA   sent,  order in orgRepA,   brand A1, account accountBrandA
	// invoiceSentBrandA2 sent, order in orgBrandA, brand A2, account accountBrandA
	// invoiceDraftRepA  draft, order in orgRepA,   brand A1, account accountBrandA
	//
	// invoiceSentBrandA2 is on brand A2 on purpose: brandAMember is scoped to
	// A1 via member_brand_access, so it is the row that proves brand scoping
	// bites on invoices. invoiceDraftRepA carries both a rep org and the
	// buyer's account so one row proves the draft rule for both readers.
	invoiceSentRepA: `${P}000000000701`,
	invoiceSentBrandA2: `${P}000000000702`,
	invoiceDraftRepA: `${P}000000000703`,

	invoiceLineSentRepA: `${P}000000000801`,
	invoicePaymentSentRepA: `${P}000000000901`,

	// Returns are issued by the brand org, exactly like invoices, so every row
	// here has organization_id = orgBrandA while order_org_id varies.
	//
	// returnRequestedRepA  requested, order in orgRepA,   brand A1, account accountBrandA
	// returnApprovedBrandA2 approved, order in orgBrandA, brand A2, account accountBrandA
	// returnFreeEntryRepA  requested, NO order,           brand A1, order_org_id orgRepA
	//
	// returnApprovedBrandA2 is the load-bearing row. It is brand-internal
	// (order_org_id = organization_id) AND on brand A2, which brandAMember is
	// scoped out of via member_brand_access. Without
	// `order_org_id <> organization_id` on the rep arm, that arm fires for
	// brandAMember -- who is a member of orgBrandA, so orgBrandA is in their
	// get_user_org_ids() -- and hands them a row brand scoping withheld.
	//
	// returnFreeEntryRepA has no order at all, which is the case `invoices`
	// never has to model: it proves a rep still sees a free-entry return they
	// raised, via order_org_id alone.
	returnRequestedRepA: `${P}000000001001`,
	returnApprovedBrandA2: `${P}000000001002`,
	returnFreeEntryRepA: `${P}000000001003`,

	returnLineRequestedRepA: `${P}000000001101`
} as const;

export const RLS_ORG_IDS: string[] = [
	RLS_IDS.orgBrandA,
	RLS_IDS.orgBrandB,
	RLS_IDS.orgRepA,
	RLS_IDS.orgRepB
];
