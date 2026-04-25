# Products & variants — 40 women's tops under Elise Varga

All products belong to the **Elise Varga** brand inside the Elise
Varga org. Catalog aesthetic is Catherine Gee–inspired: silk blouses,
bow details, puff sleeves, camp collars, statement prints.

- **Category / subcategory:** all `Tops`; subcategory varies (Blouse,
  Shirt, Top, Tank).
- **Product year:** `2026` on every row.
- **Seasons:** Spring (10 products), Summer (15), Fall (15).
- **Images:** skipped in seed (uploaded separately post-seed).
- **ats flag:** `false` on every row.
- **Variants:** 5 per product (XS/S/M/L/XL) = 200 total. Rules below.

## Variant generation rule

For every product, create 5 variants:

| Field             | Value                                                             |
| ----------------- | ----------------------------------------------------------------- |
| `size`            | one of `XS`, `S`, `M`, `L`, `XL`                                  |
| `sku`             | `style_number \|\| '-' \|\| size`                                 |
| `stock_qty`       | `20 + (abs(hashtext(style_number \|\| size)) % 80)` (range 20–99) |
| `stock_threshold` | `5`                                                               |
| `is_active`       | `true`                                                            |
| `color`           | `null` (colorways not modeled yet)                                |
| `price_override`  | `null`                                                            |

## Spring 2026 — 10 products

| Style #  | Name                        | Description                                                          | Wholesale | Retail | Subcat |
| -------- | --------------------------- | -------------------------------------------------------------------- | --------- | ------ | ------ |
| SP26-101 | The Odette Blouse           | Silk crêpe de chine with a soft tie neck and fluted cuff.            | 148       | 375    | Blouse |
| SP26-102 | The Colette Puff Top        | Cotton poplin with smocked yoke and puff short sleeve.               | 112       | 285    | Blouse |
| SP26-103 | The Margaux Bow Blouse      | Ivory silk charmeuse with oversized pussybow.                        | 168       | 425    | Blouse |
| SP26-104 | The Juliette Eyelet Top     | Broderie anglaise with scalloped hem and keyhole back.               | 124       | 315    | Top    |
| SP26-105 | The Seraphine Floral Blouse | Pastel meadow print on silk twill, bishop sleeve.                    | 158       | 395    | Blouse |
| SP26-106 | The Amélie Ruffle Top       | Featherweight cotton voile with tiered ruffle neckline.              | 98        | 245    | Blouse |
| SP26-107 | The Sylvie Scarf Blouse     | Blush silk with attached skinny scarf collar.                        | 162       | 395    | Blouse |
| SP26-108 | The Maeve Pintuck Top       | White cotton with pintuck bib front and mother-of-pearl buttons.     | 118       | 295    | Blouse |
| SP26-109 | The Romy Peasant Blouse     | Sage voile with square neckline and smocked waistline.               | 108       | 275    | Blouse |
| SP26-110 | The Clemence Shirt          | Pinstripe poplin menswear-inspired button down with covered placket. | 132       | 325    | Shirt  |

## Summer 2026 — 15 products

| Style #  | Name                    | Description                                                   | Wholesale | Retail | Subcat |
| -------- | ----------------------- | ------------------------------------------------------------- | --------- | ------ | ------ |
| SU26-201 | The Pia Camp Shirt      | European linen camp collar shirt in washed ivory.             | 124       | 315    | Shirt  |
| SU26-202 | The Liv Cutaway Tank    | Silk satin cowl back tank with bias hem.                      | 138       | 345    | Tank   |
| SU26-203 | The Giselle Halter      | Sunflower print on silk, skinny tie halter, open back.        | 146       | 365    | Top    |
| SU26-204 | The Marina Linen Blouse | Sea-wash linen with notched collar and rolled short sleeve.   | 116       | 295    | Blouse |
| SU26-205 | The Cosima Sheer Top    | Silk organza balloon sleeve blouse with ribbon ties.          | 158       | 395    | Blouse |
| SU26-206 | The Delphine Wrap Top   | Jersey wrap top with tie waist in seafoam.                    | 108       | 265    | Top    |
| SU26-207 | The Ines Crochet Tank   | Hand-crocheted cotton shell with scalloped straps.            | 128       | 325    | Tank   |
| SU26-208 | The Bianca Poplin Shirt | Sky-blue poplin oversized shirt with convertible collar.      | 128       | 315    | Shirt  |
| SU26-209 | The Thea Bustier        | Structured cotton bustier top with covered buttons down back. | 148       | 365    | Top    |
| SU26-210 | The Yara Off-Shoulder   | Coral silk with elasticated off-shoulder neckline.            | 134       | 335    | Top    |
| SU26-211 | The Paloma Lace Blouse  | Cotton Battenburg lace blouse with tall collar.               | 164       | 415    | Blouse |
| SU26-212 | The Elsa Knot Top       | Silk bandeau-style knot front top in buttercream.             | 118       | 295    | Top    |
| SU26-213 | The Noémie Sailor Top   | Navy-and-white striped linen with boat neck.                  | 112       | 285    | Top    |
| SU26-214 | The Iris Chiffon Blouse | Lavender silk chiffon with tiered flutter sleeve.             | 142       | 355    | Blouse |
| SU26-215 | The Simone Tunic        | Gauze cotton tunic with embroidered placket and tassel ties.  | 138       | 345    | Blouse |

## Fall 2026 — 15 products

| Style #  | Name                       | Description                                                     | Wholesale | Retail | Subcat |
| -------- | -------------------------- | --------------------------------------------------------------- | --------- | ------ | ------ |
| FA26-301 | The Vivienne Silk Blouse   | Burgundy silk crêpe with tie neck and covered buttons.          | 162       | 405    | Blouse |
| FA26-302 | The Beatrice Velvet Top    | Emerald silk velvet long sleeve with keyhole neckline.          | 188       | 475    | Blouse |
| FA26-303 | The Cosette Bow Blouse     | Black silk charmeuse with oversized pussybow and bishop sleeve. | 172       | 435    | Blouse |
| FA26-304 | The Margot Equestrian      | Foulard print silk with jabot collar and French cuff.           | 178       | 445    | Blouse |
| FA26-305 | The Lenore Plisse Top      | Chocolate plissé with mock neck and fitted cuff.                | 154       | 385    | Top    |
| FA26-306 | The Ottilie Lace Blouse    | Ecru Chantilly lace with Victorian collar.                      | 198       | 495    | Blouse |
| FA26-307 | The Henriette Tuxedo Shirt | White cotton tuxedo shirt with pintuck bib and studs.           | 148       | 375    | Shirt  |
| FA26-308 | The Ines Cashmere Shell    | Fine-gauge cashmere sleeveless shell in camel.                  | 158       | 395    | Top    |
| FA26-309 | The Celine Cowl Blouse     | Draped silk cowl neck blouse in oxblood.                        | 168       | 425    | Blouse |
| FA26-310 | The Philippa Toile Blouse  | Toile de Jouy print on silk twill, with ruffle placket.         | 172       | 435    | Blouse |
| FA26-311 | The Reine Leopard Blouse   | Painterly leopard print silk with notched lapel collar.         | 178       | 445    | Blouse |
| FA26-312 | The Sibylle Prairie Top    | Plum floral on crepe with ruffle yoke and high collar.          | 168       | 425    | Blouse |
| FA26-313 | The Agathe Lace Trim       | Ivory silk with Chantilly lace trim at cuff and collar.         | 182       | 455    | Blouse |
| FA26-314 | The Theodora Silk Shirt    | Slate silk shirt with mother-of-pearl buttons and French cuffs. | 158       | 395    | Shirt  |
| FA26-315 | The Colombe Polka Dot      | Black silk with ivory polka dots, bishop sleeve, neck tie.      | 168       | 425    | Blouse |

## Insertion SQL pattern

```sql
-- Resolve once at seed time:
--   v_org_id  = (SELECT id FROM organizations WHERE name = 'Elise Varga')
--   v_brand   = (SELECT id FROM brands WHERE organization_id = v_org_id AND name = 'Elise Varga')
--   v_spring  = (SELECT id FROM seasons WHERE organization_id = v_org_id AND name = 'Spring')
--   v_summer  = (SELECT id FROM seasons WHERE organization_id = v_org_id AND name = 'Summer')
--   v_fall    = (SELECT id FROM seasons WHERE organization_id = v_org_id AND name = 'Fall')

INSERT INTO public.products (
  organization_id, brand_id, season_id, product_year,
  style_number, name, description,
  wholesale_price, retail_price,
  category, subcategory, is_active, ats
) VALUES
  (v_org_id, v_brand, v_spring, 2026, 'SP26-101', 'The Odette Blouse', '...', 148, 375, 'Tops', 'Blouse', true, false),
  -- ...all 40 rows...
;

INSERT INTO public.product_variants (product_id, size, sku, stock_qty, stock_threshold, is_active)
SELECT
  p.id,
  s.size,
  p.style_number || '-' || s.size,
  (20 + (abs(hashtext(p.style_number || s.size)) % 80))::int,
  5,
  true
FROM public.products p
CROSS JOIN (VALUES ('XS'), ('S'), ('M'), ('L'), ('XL')) AS s(size)
WHERE p.organization_id = v_org_id
  AND p.product_year = 2026;
```
