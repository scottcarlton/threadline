-- ============================================================
-- Brand Expenses
-- ============================================================

-- Expense status enum
CREATE TYPE expense_status AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- Expense category enum
CREATE TYPE expense_category AS ENUM (
  'trade_show', 'samples', 'marketing', 'travel',
  'meals', 'shipping', 'photography', 'office', 'other'
);

-- Brand expenses table
CREATE TABLE brand_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  expense_number TEXT UNIQUE NOT NULL DEFAULT '',
  category expense_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status expense_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  reviewed_by UUID REFERENCES profiles(id),
  review_notes TEXT,
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense receipts (file attachments)
CREATE TABLE expense_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES brand_expenses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Auto-generate expense numbers
-- ============================================================

CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS TRIGGER AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  SELECT slug INTO org_slug FROM public.organizations WHERE id = NEW.organization_id;
  SELECT COUNT(*) + 1 INTO seq_num FROM public.brand_expenses WHERE organization_id = NEW.organization_id;
  NEW.expense_number := 'EXP-' || UPPER(LEFT(org_slug, 3)) || '-' || LPAD(seq_num::TEXT, 5, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER set_expense_number
  BEFORE INSERT ON brand_expenses
  FOR EACH ROW EXECUTE FUNCTION generate_expense_number();

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_brand_expenses_org ON brand_expenses(organization_id);
CREATE INDEX idx_brand_expenses_brand ON brand_expenses(brand_id);
CREATE INDEX idx_brand_expenses_status ON brand_expenses(status);
CREATE INDEX idx_brand_expenses_submitted_by ON brand_expenses(submitted_by);
CREATE INDEX idx_brand_expenses_date ON brand_expenses(expense_date);
CREATE INDEX idx_expense_receipts_expense ON expense_receipts(expense_id);

-- ============================================================
-- RLS Policies — Brand Expenses
-- ============================================================

ALTER TABLE brand_expenses ENABLE ROW LEVEL SECURITY;

-- SELECT: org members can see expenses for brands they can access
CREATE POLICY "Expenses visible to org members (brand-scoped)"
  ON brand_expenses FOR SELECT
  USING (brand_id IN (SELECT get_user_brand_ids(organization_id)));

-- INSERT: admin, owner, member, sales can create expenses
CREATE POLICY "Admin/owner/member/sales can insert expenses"
  ON brand_expenses FOR INSERT
  WITH CHECK (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  );

-- UPDATE: submitter can update own drafts; admin/owner can update any (for approval)
CREATE POLICY "Users can update expenses"
  ON brand_expenses FOR UPDATE
  USING (
    (submitted_by = auth.uid() AND status = 'draft')
    OR get_user_role(organization_id) IN ('admin', 'owner')
  );

-- DELETE: submitter can delete own drafts; admin/owner can delete any
CREATE POLICY "Users can delete expenses"
  ON brand_expenses FOR DELETE
  USING (
    (submitted_by = auth.uid() AND status = 'draft')
    OR get_user_role(organization_id) IN ('admin', 'owner')
  );

-- ============================================================
-- RLS Policies — Expense Receipts
-- ============================================================

ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Receipts visible via expense access"
  ON expense_receipts FOR SELECT
  USING (expense_id IN (SELECT id FROM brand_expenses));

CREATE POLICY "Can insert receipts for accessible expenses"
  ON expense_receipts FOR INSERT
  WITH CHECK (expense_id IN (
    SELECT id FROM brand_expenses
    WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member', 'sales')
  ));

CREATE POLICY "Can delete receipts for own draft expenses or admin"
  ON expense_receipts FOR DELETE
  USING (expense_id IN (
    SELECT id FROM brand_expenses
    WHERE (submitted_by = auth.uid() AND status = 'draft')
       OR get_user_role(organization_id) IN ('admin', 'owner')
  ));

-- ============================================================
-- Storage bucket for receipts
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Org members can read expense receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'expense-receipts');

CREATE POLICY "Members can upload expense receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'expense-receipts');

CREATE POLICY "Members can delete expense receipts"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'expense-receipts');
