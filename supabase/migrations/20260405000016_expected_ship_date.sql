-- Editable expected ship date on orders
ALTER TABLE orders ADD COLUMN expected_ship_date DATE;
