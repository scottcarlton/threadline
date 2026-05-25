-- Product create refactor: featured flag, color hex, image-variant linking

-- products: featured flag for brand homepage / seasonal pickers
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS products_is_featured_idx
  ON products (organization_id, is_featured) WHERE is_featured = TRUE;

-- product_variants: hex swatch value for catalog cards
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS color_hex TEXT;

-- product_images: link images to a specific variant (color-group anchor)
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL;

-- product_images: distinguish primary (grid) from hover (mouseover) image
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('primary', 'hover'));

CREATE INDEX IF NOT EXISTS product_images_variant_role_idx
  ON product_images (product_id, variant_id, role);
