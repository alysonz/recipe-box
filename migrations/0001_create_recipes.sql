CREATE TABLE IF NOT EXISTS recipes (
  recipe_key TEXT PRIMARY KEY,
  id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  comments TEXT NOT NULL DEFAULT '',
  cook_time TEXT NOT NULL DEFAULT '',
  directions TEXT NOT NULL DEFAULT '',
  rating TEXT NOT NULL DEFAULT '',
  servings TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tag_list TEXT NOT NULL DEFAULT '',
  reheating_instructions TEXT NOT NULL DEFAULT '',
  preparation_time TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  nutrition TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS recipes_id ON recipes(id);
CREATE INDEX IF NOT EXISTS recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS recipes_source ON recipes(source);
CREATE INDEX IF NOT EXISTS recipes_tag_list ON recipes(tag_list);
