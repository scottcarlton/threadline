-- Allow org members to SELECT orders whose brand_id points to a federated
-- (connected-BOA-owned) brand.
--
-- Migration 20260417000002 expanded the orders INSERT policy so a rep could
-- create an order against a brand owned by a connected brand org (the order
-- row still has organization_id = rep org). The matching SELECT policy was
-- not expanded, so the same rep hits 404 on /orders/[id] immediately after
-- creating the order.
--
-- Scope: only admin/owner/member roles (non-scoped roles) gain the federated
-- visibility. Sales/guest continue to resolve through get_user_brand_ids so
-- member_brand_access scoping is preserved; an unscoped-MBISR-Sales fix is
-- tracked separately under the §A.2a gap.

DROP POLICY IF EXISTS "Orders visible to org members (brand-scoped)" ON orders;

CREATE POLICY "Orders visible to org members (brand-scoped)"
  ON orders FOR SELECT
  USING (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    OR (
      get_user_role(organization_id) IN ('admin', 'owner', 'member')
      AND brand_id IN (
        SELECT b.id FROM brands b
        WHERE b.organization_id IN (SELECT get_connected_org_ids())
      )
    )
  );
