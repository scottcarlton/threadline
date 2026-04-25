# Orders — 22 orders across Sofia & Lauren for Elise Varga brand

All orders belong to the two MBISR rep orgs (SH Showroom, Lauren
Mackey) with `brand_id = Elise Varga`. Accounts are all from Elise
Varga's pool (the rep orgs don't own accounts — accounts are shared
context between the two sides of an active MBISR ↔ Brand connection).

## High-level mix

| Rep (org)            | Orders | Status mix                                       | Seasons                    |
| -------------------- | ------ | ------------------------------------------------ | -------------------------- |
| Sofia Hernandez (SH) | 13     | 3 submitted, 3 shipped, 5 confirmed, 2 delivered | 3 Spring, 5 Summer, 5 Fall |
| Lauren Mackey        | 9      | 2 submitted, 2 shipped, 3 confirmed, 2 delivered | 2 Spring, 3 Summer, 4 Fall |

The 4 orders seeded directly as `delivered` (instead of walking the
status chain) give the Elise Varga dashboard its demo numbers:

- **Delivered Revenue:** $8,134 (sum of the 4 delivered totals)
- **Needs Attention — overdue:** 1 (SH--000002, the lone still-overdue Spring submit)

The remaining Spring `submitted` order is kept overdue deliberately to
populate the "Needs Attention" card with a non-zero value.

## Relative dates (important)

All dates in this fixture are **offsets from `now()` at seed time**, so
the dashboard (which computes "overdue" from `expected_ship_date <
CURRENT_DATE`) produces the same screenshot regardless of when you
reseed.

The offsets encode:

- **Spring orders:** ship dates ~2 months behind (past/overdue)
- **Summer orders:** ship dates ~1 month ahead (upcoming)
- **Fall orders:** ship dates ~4–5 months ahead (future)

Offset columns (in days, relative to `now()`):

- `start_ship` / `expected` — applied as
  `CURRENT_DATE + (offset) * interval '1 day'`
- `submitted` / `confirmed` / `shipped` / `delivered` — applied as
  `now() + (offset) * interval '1 day'` (always negative for these)

Blanks mean the column is `null` for that status.

## Orders table

| Order #    | Rep    | Account              | Season | Source         | Status    | start | exp | sub | conf | ship | deliv |
| ---------- | ------ | -------------------- | ------ | -------------- | --------- | ----- | --- | --- | ---- | ---- | ----- |
| SH--000001 | Sofia  | Clover & Cane        | Summer | Road           | submitted | 38    | 67  | 0   |      |      |       |
| SH--000002 | Sofia  | Quill & Vine         | Spring | Road           | submitted | -58   | -28 | -32 |      |      |       |
| SH--000003 | Sofia  | Moxie & Main         | Spring | Brand Assembly | delivered | -65   | -35 | -34 | -32  | -38  | -31   |
| SH--000004 | Sofia  | Laurel Park          | Spring | Brand Assembly | delivered | -63   | -33 | -53 | -51  | -36  | -29   |
| SH--000005 | Sofia  | Driftwood Outfitters | Summer | Road           | confirmed | 20    | 50  | -38 | -36  |      |       |
| SH--000006 | Sofia  | Birch Row            | Summer | FIG            | shipped   | 23    | 53  | -25 | -23  | -17  |       |
| SH--000007 | Sofia  | Quillwren            | Summer | FIG            | confirmed | 17    | 47  | -49 | -46  |      |       |
| SH--000008 | Sofia  | Dovetail Mercantile  | Summer | Road           | submitted | 24    | 54  | -49 |      |      |       |
| SH--000009 | Sofia  | Driftwood Outfitters | Fall   | Brand Assembly | confirmed | 126   | 156 | -53 | -52  |      |       |
| SH--000010 | Sofia  | Kestrel & Co         | Fall   | FIG            | shipped   | 108   | 138 | -21 | -18  | -11  |       |
| SH--000011 | Sofia  | Fjord Atelier        | Fall   | Brand Assembly | confirmed | 121   | 151 | -50 | -48  |      |       |
| SH--000012 | Sofia  | Terra Cotta Goods    | Fall   | Road           | shipped   | 116   | 146 | -34 | -32  | -25  |       |
| SH--000013 | Sofia  | Harvester Lane       | Fall   | Road           | confirmed | 119   | 149 | -39 | -38  |      |       |
| LAU-000001 | Lauren | Birch Row            | Fall   | Road           | submitted | 130   | 159 | 0   |      |      |       |
| LAU-000002 | Lauren | Sunday Supply        | Spring | Road           | delivered | -71   | -41 | -45 | -41  | -44  | -37   |
| LAU-000003 | Lauren | Marigold Threadworks | Spring | CALA           | delivered | -81   | -51 | -42 | -40  | -54  | -47   |
| LAU-000004 | Lauren | The Ivory Collective | Summer | CALA           | confirmed | 26    | 56  | -45 | -43  |      |       |
| LAU-000005 | Lauren | Ninebark Mercantile  | Summer | Road           | shipped   | 8     | 38  | -41 | -38  | -34  |       |
| LAU-000006 | Lauren | Briar & Bloom        | Summer | CALA           | submitted | 12    | 42  | -43 |      |      |       |
| LAU-000007 | Lauren | Terra Cotta Goods    | Fall   | Road           | confirmed | 117   | 147 | -44 | -43  |      |       |
| LAU-000008 | Lauren | Quill & Vine         | Fall   | CALA           | shipped   | 108   | 138 | -34 | -31  | -26  |       |
| LAU-000009 | Lauren | Linea Forma          | Fall   | Road           | confirmed | 118   | 148 | -57 | -54  |      |       |

Source lookup:

- `Road` → `source_types.name = 'Road'` in the **rep's** org
- `Brand Assembly` / `FIG` → `show_dates` under SH Showroom (specific date rows per §7 of prerequisites)
- `CALA` → `show_dates` under Lauren Mackey

When a show is picked, write both `show_id` (from the show) and
`show_date_id` (from the matching show_date for that show). Leave
`source_type_id` null. When a source type is picked, leave show
columns null.

## Order lines

All lines use `unit_price = product.wholesale_price` (no overrides).
`line_total` is a generated column — don't set it; the
`recalc_order_total` trigger fills `orders.total_amount` from the
lines automatically.

### Sofia's orders (SH Showroom)

**SH--000001** (5 × 11 lines, Summer — pre-existing, matches initial seed)

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-202 | XS   | 1   |
| SU26-202 | S    | 1   |
| SU26-202 | M    | 3   |
| SU26-202 | L    | 1   |
| SU26-202 | XL   | 1   |
| SU26-207 | M    | 3   |
| SU26-207 | L    | 2   |
| SU26-207 | XL   | 2   |
| SU26-210 | S    | 3   |
| SU26-210 | M    | 3   |
| SU26-210 | L    | 3   |

**SH--000002**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SP26-102 | M    | 5   |
| SP26-104 | XL   | 3   |
| SP26-109 | S    | 4   |
| SP26-109 | XS   | 1   |
| SP26-110 | L    | 4   |

**SH--000003**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SP26-101 | XS   | 3   |
| SP26-104 | XL   | 1   |
| SP26-105 | XL   | 3   |
| SP26-109 | XS   | 2   |

**SH--000004**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SP26-101 | XS   | 5   |
| SP26-104 | L    | 3   |
| SP26-106 | M    | 4   |
| SP26-109 | M    | 2   |

**SH--000005**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-201 | XS   | 4   |
| SU26-204 | XS   | 2   |
| SU26-207 | M    | 2   |
| SU26-208 | L    | 3   |
| SU26-209 | L    | 2   |
| SU26-212 | XL   | 3   |

**SH--000006**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-201 | XL   | 4   |
| SU26-202 | XS   | 3   |
| SU26-206 | XL   | 4   |
| SU26-213 | XL   | 2   |
| SU26-214 | M    | 4   |

**SH--000007**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-205 | L    | 2   |
| SU26-206 | S    | 6   |
| SU26-206 | XL   | 4   |
| SU26-207 | M    | 2   |
| SU26-208 | XS   | 4   |
| SU26-211 | L    | 4   |

**SH--000008**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-205 | M    | 3   |
| SU26-206 | L    | 2   |
| SU26-209 | M    | 1   |
| SU26-211 | S    | 4   |
| SU26-213 | L    | 4   |

**SH--000009**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-301 | M    | 5   |
| FA26-302 | L    | 2   |
| FA26-302 | XL   | 4   |
| FA26-308 | XL   | 4   |
| FA26-310 | S    | 3   |
| FA26-312 | M    | 2   |
| FA26-314 | S    | 4   |

**SH--000010**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-301 | L    | 2   |
| FA26-303 | XL   | 4   |
| FA26-309 | M    | 4   |
| FA26-314 | M    | 5   |

**SH--000011**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-303 | L    | 4   |
| FA26-304 | L    | 5   |
| FA26-305 | M    | 4   |
| FA26-305 | XS   | 1   |
| FA26-306 | L    | 4   |
| FA26-306 | XL   | 6   |
| FA26-313 | XL   | 4   |

**SH--000012**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-303 | L    | 5   |
| FA26-307 | XL   | 3   |
| FA26-309 | L    | 5   |
| FA26-309 | XS   | 1   |
| FA26-312 | L    | 6   |
| FA26-313 | S    | 2   |
| FA26-315 | XL   | 6   |

**SH--000013**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-303 | S    | 1   |
| FA26-305 | S    | 2   |
| FA26-311 | M    | 5   |
| FA26-313 | XL   | 4   |
| FA26-315 | M    | 2   |

### Lauren's orders (Lauren Mackey)

**LAU-000001** (Fall — pre-existing, matches initial seed)

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-303 | XS   | 1   |
| FA26-303 | S    | 2   |
| FA26-303 | M    | 3   |
| FA26-303 | L    | 1   |
| FA26-303 | XL   | 1   |
| FA26-305 | S    | 1   |
| FA26-305 | M    | 2   |
| FA26-305 | L    | 1   |
| FA26-301 | XS   | 1   |
| FA26-301 | S    | 1   |
| FA26-301 | M    | 2   |
| FA26-301 | L    | 2   |
| FA26-301 | XL   | 1   |

**LAU-000002**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SP26-102 | M    | 1   |
| SP26-104 | XL   | 5   |
| SP26-105 | XL   | 3   |
| SP26-106 | M    | 3   |
| SP26-106 | XL   | 3   |

**LAU-000003**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SP26-101 | XL   | 6   |
| SP26-102 | XL   | 4   |
| SP26-102 | XS   | 6   |
| SP26-103 | S    | 5   |
| SP26-108 | L    | 1   |
| SP26-110 | L    | 3   |

**LAU-000004**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-203 | L    | 2   |
| SU26-205 | S    | 3   |
| SU26-208 | S    | 3   |
| SU26-210 | L    | 4   |
| SU26-213 | L    | 1   |
| SU26-214 | XL   | 3   |

**LAU-000005**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-202 | M    | 5   |
| SU26-205 | XL   | 3   |
| SU26-208 | S    | 6   |
| SU26-211 | M    | 2   |

**LAU-000006**

| Style    | Size | Qty |
| -------- | ---- | --- |
| SU26-206 | S    | 4   |
| SU26-208 | L    | 5   |
| SU26-210 | L    | 6   |
| SU26-212 | S    | 3   |
| SU26-213 | XL   | 5   |
| SU26-213 | XS   | 5   |

**LAU-000007**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-304 | XL   | 4   |
| FA26-306 | XS   | 2   |
| FA26-309 | XL   | 2   |
| FA26-313 | XL   | 6   |

**LAU-000008**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-301 | L    | 4   |
| FA26-302 | M    | 5   |
| FA26-303 | L    | 3   |
| FA26-310 | S    | 5   |
| FA26-312 | S    | 4   |
| FA26-312 | XL   | 2   |

**LAU-000009**

| Style    | Size | Qty |
| -------- | ---- | --- |
| FA26-302 | S    | 6   |
| FA26-304 | XS   | 6   |
| FA26-310 | XL   | 3   |

## Insertion SQL pattern

```sql
-- Resolve per-order:
--   v_rep_org_id   : organizations.id for 'SH Showroom' or 'Lauren Mackey'
--   v_rep_user_id  : profiles.id for Sofia or Lauren
--   v_account_id   : accounts.id where business_name = (row's account name)
--   v_brand_id     : Elise Varga's brand id (constant across all orders)
--   v_season_id    : Elise Varga's Spring/Summer/Fall season id (constant per season)
--   v_source_type_id OR (v_show_id, v_show_date_id) — one-hot

INSERT INTO public.orders (
  organization_id, brand_id, account_id, season_id, order_year,
  order_type, status,
  source_type_id, show_id, show_date_id,
  rep_user_id, created_by,
  start_ship_date, expected_ship_date,
  submitted_at, confirmed_at, shipped_at, delivered_at
) VALUES (
  v_rep_org_id, v_brand_id, v_account_id, v_season_id, 2026,
  'order', '<status>'::order_status,
  v_source_type_id, v_show_id, v_show_date_id,
  v_rep_user_id, v_rep_user_id,
  CURRENT_DATE + (start_offset) * interval '1 day',
  CURRENT_DATE + (expected_offset) * interval '1 day',
  now() + (submitted_offset) * interval '1 day',
  CASE WHEN status IN ('confirmed','shipped','delivered') THEN now() + (confirmed_offset) * interval '1 day' ELSE NULL END,
  CASE WHEN status IN ('shipped','delivered') THEN now() + (shipped_offset) * interval '1 day' ELSE NULL END,
  CASE WHEN status = 'delivered' THEN now() + (delivered_offset) * interval '1 day' ELSE NULL END
);

-- Then for each order, insert its lines:
INSERT INTO public.order_lines (
  order_id, product_id, variant_id, style_number, description, size, qty, unit_price, sort_order
)
SELECT
  v_order_id,
  p.id,
  v.id,
  p.style_number,
  p.name,
  v.size,
  <qty>,
  p.wholesale_price,
  <sort_order>
FROM public.products p
JOIN public.product_variants v ON v.product_id = p.id
WHERE p.style_number = '<style>' AND v.size = '<size>';
```

Triggers auto-populate:

- `order_number` (via `set_order_number` — produces `SH--000NNN` / `LAU-000NNN`)
- `total_amount` (via `recalc_order_total` after line inserts)
- `federated_order_links` row targeting Elise Varga (via `federate_new_order`)
