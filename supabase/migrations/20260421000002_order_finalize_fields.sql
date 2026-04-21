-- Per-order fields for the redesigned Finalize step.
--
-- location_id (already present) is the ship-to location. bill_to_location_id
-- NULL means the UI derives bill-to from ship-to.
--
-- payment_terms is distinct from payment_preference (method). Previously
-- the single payment_preference column conflated methods with terms; the
-- canonical lists now live in src/lib/payment-methods.ts as split exports.
--
-- terms_id / terms_agreed_by / terms_agreed_at stamp the order with the
-- exact brand_terms row the submitter agreed to. All three are NULL for
-- notes (drafts) and for brands with no current terms.

ALTER TABLE orders
  ADD COLUMN bill_to_location_id UUID REFERENCES account_locations(id) ON DELETE SET NULL,
  ADD COLUMN payment_terms TEXT,
  ADD COLUMN shipping_method TEXT,
  ADD COLUMN po_number TEXT,
  ADD COLUMN terms_id UUID REFERENCES brand_terms(id),
  ADD COLUMN terms_agreed_by UUID REFERENCES profiles(id),
  ADD COLUMN terms_agreed_at TIMESTAMPTZ;

CREATE INDEX orders_bill_to_location_id_idx ON orders(bill_to_location_id);
CREATE INDEX orders_terms_id_idx ON orders(terms_id);
