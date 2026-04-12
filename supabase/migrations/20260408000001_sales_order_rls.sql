-- Allow sales role to create, update orders and manage order lines

-- Orders INSERT
DROP POLICY IF EXISTS "Admin/owner/member can insert orders" ON orders;
DROP POLICY IF EXISTS "Admin/owner/member/sales can insert orders" ON orders;
CREATE POLICY "Admin/owner/member/sales can insert orders"
  ON orders FOR INSERT
  WITH CHECK (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  );

-- Orders UPDATE
DROP POLICY IF EXISTS "Admin/owner/member can update orders" ON orders;
DROP POLICY IF EXISTS "Admin/owner/member/sales can update orders" ON orders;
CREATE POLICY "Admin/owner/member/sales can update orders"
  ON orders FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales'));

-- Order lines INSERT
DROP POLICY IF EXISTS "Can insert lines for accessible orders" ON order_lines;
CREATE POLICY "Can insert lines for accessible orders (sales)"
  ON order_lines FOR INSERT
  WITH CHECK (order_id IN (
    SELECT id FROM orders
    WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  ));

-- Order lines UPDATE
DROP POLICY IF EXISTS "Can update lines for accessible orders" ON order_lines;
CREATE POLICY "Can update lines for accessible orders"
  ON order_lines FOR UPDATE
  USING (order_id IN (
    SELECT id FROM orders
    WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  ));

-- Order lines DELETE
DROP POLICY IF EXISTS "Can delete lines for accessible orders" ON order_lines;
CREATE POLICY "Can delete lines for accessible orders"
  ON order_lines FOR DELETE
  USING (order_id IN (
    SELECT id FROM orders
    WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  ));
