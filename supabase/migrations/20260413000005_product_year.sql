-- Products carry a year alongside season so a product reads as "Fall 2026" not just "Fall".
ALTER TABLE products ADD COLUMN product_year INTEGER;

-- Backfill existing rows with the current season-year context.
-- Use the row's created_at year as a sensible default; orgs can adjust afterwards.
UPDATE products SET product_year = EXTRACT(YEAR FROM created_at)::int WHERE product_year IS NULL;
