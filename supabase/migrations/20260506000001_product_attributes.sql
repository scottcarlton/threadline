-- Add product attributes (sustainability, material sourcing, production method, etc.)
ALTER TABLE products ADD COLUMN attributes TEXT[] DEFAULT '{}';
