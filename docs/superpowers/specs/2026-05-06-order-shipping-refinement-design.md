# Order Shipping Refinement — Design Spec

**Date:** 2026-05-06
**Branch:** `feat/order-shipping-refinement`
**Scope:** Add `preparing` status, fulfillment UI, tracking/carrier fields, notification improvements

## Problem

When a brand org confirms an order and prepares it for shipment, there is no intermediate status between "Confirmed" and "Shipped." In practice, brands spend 1-3 days picking, packing, and coordinating freight before the order physically leaves. This gap means:

- Reps and buyers have no visibility into fulfillment progress
- There is no place to enter tracking number, carrier, or shipping cost
- Notifications cannot fire at the right moments
- The shipped email contains no tracking information

## Status Flow Change

```
draft → submitted → confirmed → preparing → shipped → delivered
```

`preparing` represents active fulfillment work (picking, packing, label generation) that may happen days before the order physically ships.

## Schema Changes

### New enum value

Add `preparing` to `order_status` between `confirmed` and `shipped`.

### New columns on `orders`

| Column            | Type        | Nullable | Notes                                    |
| ----------------- | ----------- | -------- | ---------------------------------------- |
| `tracking_number` | TEXT        | yes      | Free-form; carrier-specific format       |
| `carrier`         | TEXT        | yes      | UPS, FedEx, USPS, DHL, Freight, Other    |
| `shipping_cost`   | NUMERIC     | yes      | Actual cost entered by brand             |
| `preparing_at`    | TIMESTAMPTZ | yes      | Timestamp when status moved to preparing |

### Audit trail

Add `preparing` to the `order_audits` trigger so `preparing_at` is captured. Track changes to `tracking_number`, `carrier`, and `shipping_cost` as `field_changed` events.

## UI Flow (Order Detail Page)

### Status stepper update

The timeline stepper adds a "Preparing" step:

```
Draft ── Submitted ── Confirmed ── Preparing ── Shipped ── Delivered
```

### When order is `confirmed`

- Stepper shows Confirmed as current
- Action button: **"Prepare Shipment"**
- Clicking transitions status to `preparing` and reveals the shipment details section

### When order is `preparing`

New **Shipment Details** section appears below the status card:

- **Carrier** — select (UPS, FedEx, USPS, DHL, Freight, Other)
- **Tracking number** — text input
- **Shipping cost** — currency input
- **Ship date** — date select, pre-filled from `start_ship_date` if set

All fields are editable and auto-save on blur (same pattern as `shipped_amount` today). Information trickles in over the prep period — brand might know carrier on day 1, get tracking on day 2, ship on day 3.

Action button: **"Mark as Shipped"**

Clicking opens a **confirmation dialog** that shows:

- Summary of filled shipment fields
- Empty fields highlighted with inline inputs so they can be completed on the spot
- **"Ship Order"** button to finalize the transition

### When order is `shipped`

- Shipment details section becomes read-only
- Tracking number displayed as a link (auto-generated carrier tracking URL)

### Status context copy

| Status                   | Context line                                                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| `confirmed` (rep view)   | "Move to Preparing when the brand starts fulfillment."                            |
| `confirmed` (brand view) | "Start preparing this order for shipment."                                        |
| `preparing` (brand view) | "Fill in shipment details. Mark as Shipped when the order leaves your warehouse." |
| `preparing` (rep view)   | "The brand is preparing this order for shipment."                                 |
| `shipped`                | "Shipped {date}. Move to Delivered once the buyer receives it."                   |

## Status Transition Validation

```
ALLOWED_TRANSITIONS:
  draft     → [submitted]
  submitted → [confirmed]
  confirmed → [preparing, cancelled]
  preparing → [shipped, cancelled]
  shipped   → [delivered]
```

Brand-side federated view (`brandAllowedNext`):

```
  submitted → [confirmed, cancelled]
  confirmed → [preparing, cancelled]
  preparing → [shipped, cancelled]
  shipped   → [delivered]
```

No fields are required to transition from `preparing` → `shipped`. Tracking, carrier, and cost are all optional to accommodate freight/LTL scenarios where tracking comes later or not at all.

## Notification Matrix

| Event       | Condition              | Recipients                          | Channel        |
| ----------- | ---------------------- | ----------------------------------- | -------------- |
| `confirmed` | Actor is buyer         | Brand admins + rep (`created_by`)   | Email + in-app |
| `confirmed` | Actor is rep/brand org | Buyer contacts on account           | Email + in-app |
| `preparing` | Always                 | Rep (`created_by`) + buyer contacts | Email + in-app |
| `shipped`   | Always                 | Buyer contacts on account           | Email + in-app |

### Actor detection

Compare `locals.organization.org_type`:

- If `brand` (federated view) → brand is acting
- Otherwise → rep or buyer is acting

For `confirmed`, also check if actor is `order.created_by` to distinguish rep from buyer.

### Shipped email enhancement

When tracking number and carrier are available, include them in the shipped email body. Auto-generate a tracking URL from carrier + tracking number:

- UPS: `https://www.ups.com/track?tracknum={tracking_number}`
- FedEx: `https://www.fedex.com/fedextrack/?trknbr={tracking_number}`
- USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking_number}`
- DHL: `https://www.dhl.com/us-en/home/tracking.html?tracking-id={tracking_number}`

### Preparing email content

"Your order #{order_number} is being prepared for shipment by {brand_name}."

Include expected ship date if available.

## Order List Updates

- Add `preparing` to status filter options
- Add badge color: `preparing: 'bg-violet-50 text-violet-700'`
- Spotlight system: orders in `preparing` status past their `start_ship_date` should appear in "overdue" attention bucket

## Split Shipments

Not in scope. One shipment per order. The existing `shipped_amount` field continues to handle commission math for partial-value scenarios. Split shipment tracking (multiple tracking numbers per order, per-line fulfillment) is a future feature.

## Carrier Integration

Not in scope. All fields are manual entry. The `integration_connections` infrastructure supports adding EasyPost/Shippo later for:

- Rate shopping at order finalization
- Label generation from the fulfillment panel
- Automatic tracking number capture
- Tracking webhooks for delivery updates

## Files Touched

| Area            | Files                                                           |
| --------------- | --------------------------------------------------------------- |
| Migration       | New: add `preparing` to enum, add columns, update audit trigger |
| Status API      | `src/routes/api/orders/[id]/status/+server.ts`                  |
| Order emails    | `src/lib/server/order-emails.ts`                                |
| Notifications   | `src/lib/server/notifications.ts` (confirmed logic)             |
| Order detail UI | `src/routes/orders/[id]/+page.svelte`, `+page.server.ts`        |
| Order list UI   | `src/routes/orders/+page.svelte` (labels, badges, filters)      |
| Order list API  | `src/routes/api/orders/list/+server.ts` (status filter)         |
| Types           | `src/lib/types/database.ts`                                     |
| Spotlight       | Wherever attention/spotlight logic lives                        |
