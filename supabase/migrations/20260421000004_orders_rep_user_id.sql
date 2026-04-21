-- Attribute each order to the rep who owns the relationship, separately
-- from the submitter (created_by). Admins can submit on behalf of a rep
-- without losing the rep-of-record attribution. Nullable so pre-existing
-- orders are unaffected; the Finalize step backfills from the cart-shared
-- rep_user_id on new orders.

ALTER TABLE orders
  ADD COLUMN rep_user_id UUID REFERENCES profiles(id);

CREATE INDEX orders_rep_user_id_idx ON orders(rep_user_id);
