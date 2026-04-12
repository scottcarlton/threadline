-- ============================================================
-- Expense Upload Tokens (QR code phone upload)
-- ============================================================

CREATE TABLE expense_upload_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES brand_expenses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expense_upload_tokens_token ON expense_upload_tokens(token);
CREATE INDEX idx_expense_upload_tokens_expense ON expense_upload_tokens(expense_id);

ALTER TABLE expense_upload_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view upload tokens"
  ON expense_upload_tokens FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Org members can create upload tokens"
  ON expense_upload_tokens FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales'));
