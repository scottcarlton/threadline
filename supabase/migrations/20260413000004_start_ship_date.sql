-- Custom delivery windows have a start AND a complete ship date.
-- expected_ship_date already exists and is reused as the "complete" boundary.
ALTER TABLE orders ADD COLUMN start_ship_date DATE;
