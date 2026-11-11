import { RECIPE_FIELDS, normalizeRecipe, recipeForApi } from "../../_shared/recipe-schema.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  const url = new URL(request.url);
  const limit = Math.min(60, Math.max(1, Number(url.searchParams.get("limit")) || 30));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const searchable = RECIPE_FIELDS;
  const where = query
    ? `WHERE ${searchable.map(field => `lower(COALESCE(${field}, '')) LIKE lower(?) ESCAPE '\\'`).join(" OR ")}`
    : "";
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const params = query ? searchable.map(() => pattern) : [];
  const [count, result] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM recipes ${where}`).bind(...params),
    env.DB.prepare(`SELECT recipe_key, id, name, servings, preparation_time, cook_time, source, tag_list,
      substr(CASE WHEN description <> '' THEN description ELSE ingredients END, 1, 320) AS preview
      FROM recipes ${where} ORDER BY rowid LIMIT ? OFFSET ?`).bind(...params, limit, offset),
  ]);
  return json({ total: count.results[0]?.total || 0, recipes: result.results });
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
