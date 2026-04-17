-- Available To Ship — true = in stock, ships now; false = futures / pre-order.
ALTER TABLE products ADD COLUMN ats boolean NOT NULL DEFAULT false;
