import { RECIPE_FIELDS, normalizeRecipe, recipeFromRow, recipeForApi } from "../../_shared/recipe-schema.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestGet({ env, params }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  const columns = ["recipe_key", ...RECIPE_FIELDS].join(", ");
  const row = await env.DB.prepare(`SELECT ${columns} FROM recipes WHERE recipe_key = ?`)
    .bind(params.key).first();
  if (!row) return json({ error: "Recipe not found." }, 404);
  return json({ recipe: recipeFromRow(row) });
}

export async function onRequestPut({ request, env, params }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  let recipe;
  try { recipe = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe)) return json({ error: "Recipe must be an object." }, 400);
  const fields = normalizeRecipe(recipe);
  // The imported CSV id is internal metadata and is not editable through the UI.
  const editableFields = RECIPE_FIELDS.filter(field => field !== "id");
  const assignments = editableFields.map(field => `${field} = ?`).join(", ");
  const result = await env.DB.prepare(`UPDATE recipes SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE recipe_key = ?`)
    .bind(...editableFields.map(field => fields[field]), params.key).run();
  if (!result.meta.changes) return json({ error: "Recipe not found." }, 404);
  return json(recipeForApi(params.key, fields));
}

export async function onRequestDelete({ request, env, params }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  const result = await env.DB.prepare("DELETE FROM recipes WHERE recipe_key = ?").bind(params.key).run();
  if (!result.meta.changes) return json({ error: "Recipe not found." }, 404);
  return new Response(null, { status: 204 });
}
