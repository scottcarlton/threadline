-- ============================================================
-- Domain Tables
-- ============================================================

-- Brands
CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  logo_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Brand access for scoped users (member/guest roles)
CREATE TABLE member_brand_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL REFERENCES organization_members(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, brand_id)
);

-- Accounts (buyer businesses)
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'US',
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seasons (reusable templates)
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, name)
);

-- Shows
CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  season_id UUID REFERENCES seasons(id) ON DELETE SET NULL,
  year INTEGER,
  name TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  state TEXT,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order status enum
CREATE TYPE order_status AS ENUM (
  'draft', 'submitted', 'confirmed', 'shipped', 'delivered', 'cancelled'
);

-- Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  order_number TEXT UNIQUE NOT NULL DEFAULT '',
  account_id UUID NOT NULL REFERENCES accounts(id),
  brand_id UUID NOT NULL REFERENCES brands(id),
  season_id UUID REFERENCES seasons(id),
  order_year INTEGER,
  show_id UUID REFERENCES shows(id),
  status order_status NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order lines
CREATE TABLE order_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  style_number TEXT,
  description TEXT,
  color TEXT,
  size TEXT,
  qty INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Triggers & Functions
-- ============================================================

-- Auto-generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  org_slug TEXT;
  seq_num INTEGER;
BEGIN
  SELECT slug INTO org_slug FROM public.organizations WHERE id = NEW.organization_id;
  SELECT COUNT(*) + 1 INTO seq_num FROM public.orders WHERE organization_id = NEW.organization_id;
  NEW.order_number := UPPER(LEFT(org_slug, 3)) || '-' || LPAD(seq_num::TEXT, 6, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Auto-update order total when lines change
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.orders
  SET total_amount = (
    SELECT COALESCE(SUM(line_total), 0) FROM public.order_lines WHERE order_id = COALESCE(NEW.order_id, OLD.order_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER recalc_order_total
  AFTER INSERT OR UPDATE OR DELETE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION update_order_total();

-- Seed default seasons when an organization is created
CREATE OR REPLACE FUNCTION seed_default_seasons()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.seasons (organization_id, name, sort_order) VALUES
    (NEW.id, 'Spring', 1),
    (NEW.id, 'Summer', 2),
    (NEW.id, 'Fall', 3),
    (NEW.id, 'Resort', 4),
    (NEW.id, 'Holiday', 5);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER seed_org_seasons
  AFTER INSERT ON organizations
  FOR EACH ROW EXECUTE FUNCTION seed_default_seasons();

-- Seed seasons for existing organizations that don't have any
INSERT INTO seasons (organization_id, name, sort_order)
SELECT o.id, s.name, s.sort_order
FROM organizations o
CROSS JOIN (VALUES
  ('Spring', 1), ('Summer', 2), ('Pre-Fall', 3),
  ('Fall', 4), ('Resort', 5), ('Holiday', 6)
) AS s(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM seasons WHERE organization_id = o.id
);

-- ============================================================
-- RLS Policies — Domain Tables
-- ============================================================

-- Helper function: get accessible brand IDs for current user
CREATE OR REPLACE FUNCTION get_user_brand_ids(org_id UUID)
RETURNS SETOF UUID AS $$
DECLARE
  member_role user_role;
  member_id_val UUID;
  scope_count INTEGER;
BEGIN
  SELECT om.role, om.id INTO member_role, member_id_val
  FROM organization_members om
  WHERE om.organization_id = org_id AND om.profile_id = auth.uid();

  IF member_role IS NULL THEN
    RETURN;
  END IF;

  -- Admin and Owner always see all brands
  IF member_role IN ('admin', 'owner') THEN
    RETURN QUERY SELECT b.id FROM brands b WHERE b.organization_id = org_id;
    RETURN;
  END IF;

  -- Member/Guest: check if they have brand scoping
  SELECT COUNT(*) INTO scope_count
  FROM member_brand_access mba
  WHERE mba.member_id = member_id_val;

  IF scope_count = 0 THEN
    RETURN QUERY SELECT b.id FROM brands b WHERE b.organization_id = org_id;
  ELSE
    RETURN QUERY SELECT mba.brand_id FROM member_brand_access mba WHERE mba.member_id = member_id_val;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Helper: check if user is a member of an org
CREATE OR REPLACE FUNCTION is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = org_id AND profile_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- Helper: check user role in org
CREATE OR REPLACE FUNCTION get_user_role(org_id UUID)
RETURNS user_role AS $$
DECLARE
  r user_role;
BEGIN
  SELECT role INTO r FROM organization_members
  WHERE organization_id = org_id AND profile_id = auth.uid();
  RETURN r;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

-- ---- Brands RLS ----
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brands visible to org members (scoped)"
  ON brands FOR SELECT
  USING (id IN (SELECT get_user_brand_ids(organization_id)));

CREATE POLICY "Admin/owner can insert brands"
  ON brands FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update brands"
  ON brands FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete brands"
  ON brands FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Members can insert brands for their org"
  ON brands FOR INSERT
  WITH CHECK (
    get_user_role(organization_id) = 'member'
    AND NOT EXISTS (
      SELECT 1 FROM member_brand_access mba
      JOIN organization_members om ON om.id = mba.member_id
      WHERE om.profile_id = auth.uid() AND om.organization_id = organization_id
    )
  );

CREATE POLICY "Scoped members can update their brands"
  ON brands FOR UPDATE
  USING (
    get_user_role(organization_id) = 'member'
    AND id IN (SELECT get_user_brand_ids(organization_id))
  );

-- ---- Accounts RLS ----
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Accounts visible to org members"
  ON accounts FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner/member can insert accounts"
  ON accounts FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner/member can update accounts"
  ON accounts FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));

CREATE POLICY "Admin/owner can delete accounts"
  ON accounts FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- ---- Seasons RLS ----
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seasons visible to org members"
  ON seasons FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can manage seasons"
  ON seasons FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update seasons"
  ON seasons FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete seasons"
  ON seasons FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- ---- Shows RLS ----
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shows visible to org members"
  ON shows FOR SELECT
  USING (is_org_member(organization_id));

CREATE POLICY "Admin/owner can insert shows"
  ON shows FOR INSERT
  WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can update shows"
  ON shows FOR UPDATE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Admin/owner can delete shows"
  ON shows FOR DELETE
  USING (get_user_role(organization_id) IN ('admin', 'owner'));

-- ---- Orders RLS ----
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Orders visible to org members (brand-scoped)"
  ON orders FOR SELECT
  USING (brand_id IN (SELECT get_user_brand_ids(organization_id)));

CREATE POLICY "Admin/owner/member can insert orders"
  ON orders FOR INSERT
  WITH CHECK (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  );

CREATE POLICY "Admin/owner/member can update orders"
  ON orders FOR UPDATE
  USING (
    brand_id IN (SELECT get_user_brand_ids(organization_id))
    AND get_user_role(organization_id) IN ('admin', 'owner', 'member')
  );

-- ---- Order Lines RLS ----
ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order lines visible via order access"
  ON order_lines FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders)
  );

CREATE POLICY "Can insert lines for accessible orders"
  ON order_lines FOR INSERT
  WITH CHECK (
    order_id IN (
      SELECT id FROM orders
      WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member')
    )
  );

CREATE POLICY "Can update lines for accessible orders"
  ON order_lines FOR UPDATE
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member')
    )
  );

CREATE POLICY "Can delete lines for accessible orders"
  ON order_lines FOR DELETE
  USING (
    order_id IN (
      SELECT id FROM orders
      WHERE get_user_role(organization_id) IN ('admin', 'owner', 'member')
    )
  );

-- ---- Member Brand Access RLS ----
ALTER TABLE member_brand_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Brand access visible to admin/owner"
  ON member_brand_access FOR SELECT
  USING (
    member_id IN (
      SELECT om.id FROM organization_members om
      WHERE om.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
      )
    )
  );

CREATE POLICY "Admin/owner can manage brand access"
  ON member_brand_access FOR ALL
  USING (
    member_id IN (
      SELECT om.id FROM organization_members om
      WHERE om.organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE profile_id = auth.uid() AND role IN ('admin', 'owner')
      )
    )
  );
