import { RECIPE_FIELDS, normalizeRecipe, recipeFromRow, recipeForApi } from "../../_shared/recipe-schema.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  const url = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const columns = ["recipe_key", ...RECIPE_FIELDS].join(", ");
  const result = await env.DB.prepare(`SELECT ${columns} FROM recipes ORDER BY rowid LIMIT ? OFFSET ?`)
    .bind(limit, offset).all();
  return json({ recipes: result.results.map(recipeFromRow) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  let recipe;
  try { recipe = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return json({ error: "Recipe must be an object." }, 400);
  const key = crypto.randomUUID();
  const fields = normalizeRecipe(recipe);
  const columns = ["recipe_key", ...RECIPE_FIELDS].join(", ");
  const placeholders = Array(RECIPE_FIELDS.length + 1).fill("?").join(", ");
  await env.DB.prepare(`INSERT INTO recipes (${columns}) VALUES (${placeholders})`)
    .bind(key, ...RECIPE_FIELDS.map(field => fields[field])).run();
  return json(recipeForApi(key, fields), 201);
}
