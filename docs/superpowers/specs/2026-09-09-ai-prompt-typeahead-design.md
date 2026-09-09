# AI prompt typeahead

Design doc. 2026-09-09. Branch `feat/ai-suggestions`.

## Problem

The AI dock input (`src/routes/+layout.svelte`) is a blank contenteditable with the
placeholder "Ask anything about your business...". Nothing tells the user what the
assistant can actually do. There are 46 tools behind it, including six report tools,
and none of that capability is discoverable from the input itself.

Follow-up suggestions already exist: the server emits a `SUGGESTIONS:` line that the
client parses (`src/routes/api/ai/+server.ts:1600`) and renders as chips after an
assistant reply (`+layout.svelte:841`). Those only appear after the first exchange.
The cold start is unaided.

Two components carry hardcoded suggestion lists, `AssistantPanel.svelte` and
`InlineChat.svelte`, but neither is imported anywhere. They are dead code and are not
part of this work.

## Solution

A typeahead panel above the dock input. The user types, matching prompts appear,
arrow keys and Enter accept one.

## Placement and behavior

The dock is a vertical `space-y-3` stack: conversation panel, product-selection bar,
setup wizard card, input. The suggestion panel becomes one more sibling, directly
above the input and below everything else.

Styling matches the conversation panel exactly:
`rounded-2xl bg-zinc-900 shadow-2xl ring-1 ring-white/10`.

- Opens at 2 or more typed characters with at least one match.
- Closes on no match, on Escape, on blur, and once a message is sent.
- Each row is a magnifier icon plus the suggestion text. The typed portion renders
  `text-zinc-500`, the completion renders `text-zinc-100`.
- Row text is `text-base`, matching the input. No `text-xs`.
- Maximum 6 rows.
- Highlighted row background is `bg-zinc-800`, matching the agent picker.

The panel sits above the input, so the best match is at the **bottom** of the list,
nearest the cursor, and the list reads upward. Nothing is highlighted by default, so
Enter continues to send whatever the user typed.

| Key                        | Action                                                 |
| -------------------------- | ------------------------------------------------------ |
| ArrowUp                    | Highlight the bottom (best) row, then continue upward  |
| ArrowDown                  | Move back down; past the last row clears the highlight |
| Enter, row highlighted     | Fill the input and send                                |
| Enter, nothing highlighted | Send the typed text (existing behavior, unchanged)     |
| Tab                        | Fill the input without sending, so it can be edited    |
| Escape                     | Dismiss the panel, keep the typed text                 |
| Click a row                | Fill the input and send                                |

Escape must be handled before the existing global Escape branch
(`+layout.svelte:365`), which closes the conversation panel. When the suggestion
panel is open it consumes Escape first.

All key handling lands as an early return in `handleAiKeydown` (`+layout.svelte:358`),
before the existing Enter branch.

## Where suggestions come from

A static curated catalog, filtered client-side. No network call and no model call per
keystroke. A per-keystroke model call would add latency and token cost to every
character typed, for a list that changes rarely.

```ts
type AiSuggestion = {
	text: string;
	routes?: string[]; // route prefixes that boost this entry, e.g. ['/reports']
	orgTypes?: OrgType[]; // 'rep' | 'brand' | 'retailer'; omit means all
	roles?: UserRole[]; // omit means all
	unscopedOnly?: boolean; // requires brandScope === null
	entity?: EntityType; // requires this record type in entityContext
	keywords?: string[]; // match terms that are not in the visible text
};
```

### Matching

Follows the precedent in `src/lib/utils/csv-column-suggest.ts`.

1. Normalize both sides: lowercase, collapse whitespace.
2. Score, highest first:
   - suggestion text starts with the typed string
   - any word in the suggestion starts with the typed string
   - a keyword starts with the typed string
3. Ties break on route match against `$page.url.pathname`, then catalog order.
4. Take the top 6.

Route match is a tie-breaker, not a filter. Typing "commission" on `/orders` still
surfaces the commission prompts.

### Gating

A suggestion that runs and returns "you do not have access" is worse than no
suggestion. Every entry is filtered before matching, against `data.orgType`,
`data.membership.role`, `data.brandScope`, and the `entityContext` store.

Entries that say "this order" or "this account" only make sense with a record on
screen. Those declare an `entity` field and are filtered out unless
`entityContext.type` matches (`src/lib/stores/entityContext.ts`).

Verified against the endpoint:

- `role === 'guest'` is read-only. The system prompt restricts it to `query_data`,
  `list_brands`, `list_accounts`, `get_dashboard_metrics`, `get_sales_report`,
  `get_sales_analytics`, `get_commission_report`, `get_style_velocity`
  (`+server.ts:1169`), and `WRITE_TOOLS` calls are refused outright
  (`+server.ts:1334`). Guests get no create, update, or archive suggestions.
- `orgType === 'brand'` means the org manages its own catalog and sees orders from
  connected reps (`+server.ts:1169`). Cross-brand comparisons are meaningless there,
  so those entries are rep-only. Brand orgs get rep-performance framing instead.
- `brandScope !== null` restricts writes to the scoped brand IDs
  (`+server.ts:1350`). Scoped users get no cross-brand comparison entries.
- Buyers never reach the dock. It renders behind `!data.isBuyer`
  (`+layout.svelte:754`) and `/api/ai` rejects `locals.isBuyer` outright
  (`+server.ts:1011`). There is no buyer catalog.

## Catalog

Every entry maps to a tool that exists today. Copy follows `docs/brand/guidelines.md`
section 1.5: specific over vague, declarative, industry language, no superlatives.

### Reports

Backed by `get_sales_report`, `get_sales_analytics`, `get_style_velocity`,
`get_commission_report`, `get_account_health`, `get_dashboard_metrics`,
`export_to_google_sheet`. Routes: `/reports`, `/dashboard`, `/insight`.

| Text                                                 | Gating     |
| ---------------------------------------------------- | ---------- |
| Sell-through by brand this season                    | rep only   |
| Top 10 styles by units this season                   | all        |
| Which accounts have not reordered since last season? | all        |
| Commission owed by brand this season                 | rep only   |
| Commission owed by rep this season                   | brand only |
| Compare this season to last season by account        | all        |
| Which styles are underperforming?                    | all        |
| Which accounts grew year over year?                  | all        |
| Export this to a Google Sheet                        | all        |

Keywords: `sell-through`, `sellthrough`, `revenue`, `report`, `analytics`,
`velocity`, `commission`, `performance`.

### Orders

Backed by `query_data`, `create_order`, `add_order_lines`, `update_order`,
`update_order_status`, `update_order_line`, `remove_order_line`. Route: `/orders`.

| Text                                     | Gating                            |
| ---------------------------------------- | --------------------------------- |
| Show me draft orders                     | all                               |
| Which orders ship this month?            | all                               |
| Total order value by account this season | all                               |
| Create an order                          | not guest                         |
| Add a line to this order                 | not guest, entity context `order` |
| Mark this order confirmed                | not guest, entity context `order` |

Entries marked "entity context" only appear when `entityContext.type === 'order'`.

### Accounts

Backed by `list_accounts`, `query_data`, `create_account`, `update_account`,
`get_account_health`, `assign_account_territory`. Route: `/accounts`.

| Text                                         | Gating                              |
| -------------------------------------------- | ----------------------------------- |
| Which accounts have not ordered this season? | all                                 |
| Show me accounts by territory                | all                                 |
| Which accounts are at risk?                  | all                                 |
| Create an account                            | not guest                           |
| Assign this account to a territory           | not guest, entity context `account` |

### Brands

Backed by `list_brands`, `create_brand`, `update_brand`, `get_sales_report`.
Route: `/brands`. Rep orgs only: a brand org does not manage a list of brands.

| Text                                  | Gating                             |
| ------------------------------------- | ---------------------------------- |
| Which brands are growing this season? | rep only                           |
| Show me orders for this brand         | rep only, entity context `brand`   |
| Create a brand                        | rep only, not guest, unscoped only |

### Products

Backed by `add_product`, `update_products`, `query_data`, `get_style_velocity`.
Route: `/products`.

| Text                                   | Gating    |
| -------------------------------------- | --------- |
| Which styles sold best this season?    | all       |
| Show me products without images        | all       |
| Add a product                          | not guest |
| Update wholesale prices for this brand | not guest |

### Appointments and shows

Backed by `create_appointment`, `update_appointment`, `delete_appointment`,
`create_show`, `create_season`, `query_data`. Routes: `/appointments`, `/shows`,
`/seasons`.

| Text                                   | Gating    |
| -------------------------------------- | --------- |
| What appointments do I have this week? | all       |
| Which shows are coming up?             | all       |
| Book an appointment                    | not guest |
| Create a season                        | not guest |

### Inbox

Backed by `draft_email`, `send_email`, `search_emails`. Route: `/inbox`.

| Text                              | Gating    |
| --------------------------------- | --------- |
| Draft a follow-up to this account | not guest |
| Search emails from this account   | all       |

### Always available

No route boost. These match from anywhere.

| Text                            | Gating |
| ------------------------------- | ------ |
| What should I focus on today?   | all    |
| Show me this season at a glance | all    |

## Files

| File                                           | Change                                                 |
| ---------------------------------------------- | ------------------------------------------------------ |
| `src/lib/data/ai-suggestions.ts`               | New. Catalog and the `AiSuggestion` type.              |
| `src/lib/utils/ai-suggest.ts`                  | New. Pure filter, match, rank.                         |
| `src/lib/utils/ai-suggest.test.ts`             | New. Unit tests.                                       |
| `src/lib/components/ai/SuggestionPanel.svelte` | New. Presentational only.                              |
| `src/routes/+layout.svelte`                    | State, keydown interception, render in the dock stack. |

`+layout.svelte` is already 1336 lines. The matcher stays pure and testable outside
it, and the panel stays its own component, so the layout gains state wiring and a
render block rather than logic.

## Testing

`src/lib/utils/ai-suggest.test.ts` covers the pure matcher:

- Full-string prefix ranks above word-start prefix ranks above keyword match.
- Route match breaks ties, and does not filter out off-route matches.
- Guest role excludes every write-tool entry.
- `orgType === 'brand'` excludes rep-only entries, and the reverse.
- `brandScope !== null` excludes cross-brand comparison entries.
- Entity-context entries are absent when no entity is in context.
- Fewer than 2 characters returns an empty array.
- Result length never exceeds 6.

Keyboard behavior and rendering are verified in the browser, per the CLAUDE.md
verification gate.

## Out of scope

**Starter chips on an empty input.** The dock shows nothing before the first message,
which is a real gap, but it is a different interaction and would compete with this
panel for the same space. Separate ticket.

**Recent-query suggestions.** Ranking against the user's own past prompts would beat a
static list, but nothing persists past prompts today. `src/lib/server/ai-history.ts`
is request-scoped sanitization, not storage. This needs a new table and should wait
until the static list shows which prompts people actually reach for.

**Removing the dead components.** `AssistantPanel.svelte` and `InlineChat.svelte` are
unimported and carry stale hardcoded suggestion lists. Deleting them is correct but
unrelated to this change.
