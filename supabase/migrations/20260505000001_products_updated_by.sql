ALTER TABLE products ADD COLUMN updated_by UUID REFERENCES auth.users(id);
