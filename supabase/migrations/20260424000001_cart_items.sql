-- Server-side buyer cart persistence (SCO-40)
-- Replaces the localStorage-only cart with a profile-scoped table so the cart
-- survives browser close and follows the user across devices.

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, product_id)
);

CREATE INDEX idx_cart_items_profile ON cart_items(profile_id);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own cart"
  ON cart_items FOR SELECT
  USING (profile_id = auth.uid());

CREATE POLICY "Users insert own cart"
  ON cart_items FOR INSERT
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users delete own cart"
  ON cart_items FOR DELETE
  USING (profile_id = auth.uid());
