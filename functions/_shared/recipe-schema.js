export const RECIPE_FIELDS = [
  "id", "name", "comments", "cook_time", "directions", "rating",
  "servings", "source", "description", "tag_list", "reheating_instructions",
  "preparation_time", "ingredients", "nutrition",
];

export const NUTRITION_FIELDS = [
  "calories", "totalfat", "satfat", "transfat", "carbo", "fiber", "protein",
  "sodium", "sugar", "cholesterol", "iron", "vitaminc", "vitamina", "monofat",
  "polyfat", "calcium",
];

export function normalizeRecipe(value) {
  const fields = Object.fromEntries(RECIPE_FIELDS.filter(field => field !== "nutrition")
    .map(field => [field, String(value[field] ?? "")]));
  let nutrition = value.nutrition ?? {};
  if (typeof nutrition === "string") {
    try { nutrition = JSON.parse(nutrition); } catch { nutrition = {}; }
  }
  fields.nutrition = JSON.stringify(Object.fromEntries(NUTRITION_FIELDS
    .map(field => [field, String(nutrition?.[field] ?? "")])));
  return fields;
}

export function recipeFromRow(row) {
  const { recipe_key: key, ...fields } = row;
  try { fields.nutrition = JSON.parse(fields.nutrition || "{}"); }
  catch { fields.nutrition = {}; }
  return { key, ...fields };
}

export function recipeForApi(key, recipe) {
  const fields = { ...recipe };
  try { fields.nutrition = JSON.parse(fields.nutrition || "{}"); }
  catch { fields.nutrition = {}; }
  return { key, recipe: fields };
}
