-- Products catalog
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  style_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  wholesale_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  retail_price DECIMAL(10,2),
  category TEXT,
  subcategory TEXT,
  season_id UUID REFERENCES seasons(id),
  is_active BOOLEAN DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color TEXT,
  size TEXT,
  sku TEXT,
  barcode TEXT,
  price_override DECIMAL(10,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  sort_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link order lines to products (optional — manual fallback still works)
ALTER TABLE order_lines ADD COLUMN product_id UUID REFERENCES products(id);
ALTER TABLE order_lines ADD COLUMN variant_id UUID REFERENCES product_variants(id);

-- RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products visible to org members"
  ON products FOR SELECT USING (is_org_member(organization_id));
CREATE POLICY "Members can insert products"
  ON products FOR INSERT WITH CHECK (get_user_role(organization_id) IN ('admin', 'owner', 'member'));
CREATE POLICY "Members can update products"
  ON products FOR UPDATE USING (get_user_role(organization_id) IN ('admin', 'owner', 'member'));
CREATE POLICY "Admin can delete products"
  ON products FOR DELETE USING (get_user_role(organization_id) IN ('admin', 'owner'));

CREATE POLICY "Product variants visible to org members"
  ON product_variants FOR SELECT USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND is_org_member(p.organization_id))
  );
CREATE POLICY "Members can manage product variants"
  ON product_variants FOR ALL USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND get_user_role(p.organization_id) IN ('admin', 'owner', 'member'))
  );

CREATE POLICY "Product images visible to org members"
  ON product_images FOR SELECT USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND is_org_member(p.organization_id))
  );
CREATE POLICY "Members can manage product images"
  ON product_images FOR ALL USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id = product_id AND get_user_role(p.organization_id) IN ('admin', 'owner', 'member'))
  );
