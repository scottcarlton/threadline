-- Allow 'video' as a product_images role alongside 'primary' and 'hover'
ALTER TABLE product_images DROP CONSTRAINT IF EXISTS product_images_role_check;
ALTER TABLE product_images ADD CONSTRAINT product_images_role_check CHECK (role IN ('primary', 'hover', 'video'));
