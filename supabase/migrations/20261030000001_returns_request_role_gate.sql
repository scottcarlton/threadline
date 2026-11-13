-- SCO-213: who may create a return.
--
-- Admin, owner, member and sales may create a return, on either side of a
-- connection. Guest may read returns but never create one; Roles & Access makes
-- guest read-only. Only admin, owner and member may create one already
-- approved, since approving is not a sales action (the same set as the UPDATE
-- policy). The app enforces the same rules in create-return.ts.
--
-- Before this migration the rep arm checked org membership only, so a rep-org
-- guest could open a request, and the brand arm refused sales outright.

DROP POLICY IF EXISTS "Reps can request a return" ON return_authorizations;
CREATE POLICY "Reps can request a return"
  ON return_authorizations FOR INSERT
  WITH CHECK (
    status = 'requested'
    AND order_org_id IN (SELECT get_user_org_ids())
    AND order_org_id <> organization_id
    AND get_user_role(order_org_id) IN ('admin', 'owner', 'member', 'sales')
  );

-- A brand sales member (BLSR) opens a request for an approver, the same as a
-- rep does. Admin, owner and member may still create at `approved`.
DROP POLICY IF EXISTS "Brand can create a return" ON return_authorizations;
CREATE POLICY "Brand can create a return"
  ON return_authorizations FOR INSERT
  WITH CHECK (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND (
      (
        status IN ('requested', 'approved')
        AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
      )
      OR (
        status = 'requested'
        AND get_user_role(organization_id) = 'sales'
      )
    )
  );

-- return_lines had the same gap one level down. Its first arm accepted lines
-- for any `requested` return the caller could read, and every SELECT arm is
-- role-blind, so a guest on either side could add lines to an open request.
-- The arm now names its initiators: the buyer on their own account, the
-- requesting rep, and brand sales, each with a creating role. The approver arm
-- is carried over unchanged from 20260915000020.

DROP POLICY IF EXISTS "Initiators can add lines to their own request" ON return_lines;
CREATE POLICY "Initiators can add lines to their own request"
  ON return_lines FOR INSERT
  WITH CHECK (
    return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status = 'requested'
        AND (
          r.account_id IN (SELECT get_buyer_account_ids())
          OR (
            r.order_org_id IN (SELECT get_user_org_ids())
            AND r.order_org_id <> r.organization_id
            AND get_user_role(r.order_org_id) IN ('admin', 'owner', 'member', 'sales')
          )
          OR (
            r.brand_id IN (SELECT get_user_brand_ids(r.organization_id))
            AND get_user_role(r.organization_id) = 'sales'
          )
        )
    )
    OR return_id IN (
      SELECT r.id FROM return_authorizations r
      WHERE r.status IN ('requested', 'approved')
        AND r.brand_id IN (SELECT get_user_brand_ids(r.organization_id))
        AND get_user_role(r.organization_id) IN ('admin', 'owner', 'member')
    )
  );

COMMENT ON POLICY "Initiators can add lines to their own request" ON return_lines IS
  'While the parent is `requested`: its buyer (own account), its requesting rep (admin/owner/member/sales) or brand sales. The brand (admin/owner/member) may also add lines while it is `approved`, since a brand-created return starts there. Guest never.';
