const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

export async function onRequestGet({ env }) {
  if (!env.DB) return json({ error: "Database binding DB is missing." }, 503);
  const result = await env.DB.prepare(`SELECT DISTINCT source, tag_list FROM recipes
    WHERE source <> '' OR tag_list <> ''`).all();
  const sources = new Set();
  const tags = new Set();
  for (const row of result.results) {
    if (row.source?.trim()) sources.add(row.source.trim());
    for (const tag of String(row.tag_list || '').split(',')) {
      if (tag.trim()) tags.add(tag.trim());
    }
  }
  return json({ sources: [...sources].sort((a, b) => a.localeCompare(b)), tags: [...tags].sort((a, b) => a.localeCompare(b)) });
}
