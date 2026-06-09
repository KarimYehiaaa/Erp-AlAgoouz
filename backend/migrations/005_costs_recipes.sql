-- Recipes / Costs module
CREATE TABLE IF NOT EXISTS product_recipes (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name_ar VARCHAR(200) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_recipes_product_active
  ON product_recipes(product_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS product_recipe_items (
  id SERIAL PRIMARY KEY,
  recipe_id INT NOT NULL REFERENCES product_recipes(id) ON DELETE CASCADE,
  ingredient_product_id INT NOT NULL REFERENCES products(id),
  quantity DECIMAL(14,4) NOT NULL,
  unit_code VARCHAR(10) NOT NULL, -- g, kg, ml, l, count
  notes TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_recipe_items_recipe ON product_recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_product_recipe_items_ingredient ON product_recipe_items(ingredient_product_id);
