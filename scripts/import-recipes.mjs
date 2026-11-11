import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { RECIPE_FIELDS, NUTRITION_FIELDS } from '../functions/_shared/recipe-schema.js';

const args = process.argv.slice(2);
const local = args.includes('--local');
const batchSize = 20;
const startAt = Number(args.find(arg => arg.startsWith('--start='))?.split('=')[1] || 0);
const dbName = args.find(arg => !arg.startsWith('--')) || 'recipe-box';
if (!Number.isInteger(startAt) || startAt < 0 || startAt % batchSize !== 0) {
  throw new Error(`--start must be a non-negative multiple of ${batchSize}.`);
}
const data = JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8'));
const dir = await mkdtemp(join(tmpdir(), 'recipe-box-import-'));
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_BATCH_BYTES = 80 * 1024;
const MAX_INLINE_FIELD_BYTES = 8 * 1024;
const APPEND_CHUNK_BYTES = 8 * 1024;

function recipeValues(recipe, blankLargeFields = false) {
  return RECIPE_FIELDS.map(field => {
    const value = field === 'nutrition'
      ? JSON.stringify(Object.fromEntries(NUTRITION_FIELDS.map(name => [name, String(recipe[name] ?? '')])))
      : String(recipe[field] ?? '');
    return blankLargeFields && Buffer.byteLength(value, 'utf8') > MAX_INLINE_FIELD_BYTES ? '' : value;
  });
}

function splitUtf8(value, maxBytes) {
  const chunks = [];
  let current = '';
  let size = 0;
  for (const character of value) {
    const bytes = Buffer.byteLength(character, 'utf8');
    if (size + bytes > maxBytes && current) {
      chunks.push(current);
      current = '';
      size = 0;
    }
    current += character;
    size += bytes;
  }
  if (current) chunks.push(current);
  return chunks;
}

function insertSql(recipes, blankLargeFields = false) {
  const columns = ['recipe_key', ...RECIPE_FIELDS].join(', ');
  const rows = recipes.map(recipe => `(${[quote(`legacy-${recipe.id}`), ...recipeValues(recipe, blankLargeFields).map(quote)].join(', ')})`);
  return `INSERT OR IGNORE INTO recipes (${columns}) VALUES\n${rows.join(',\n')};\n`;
}

function runWrangler(args) {
  return spawnSync('npx', ['wrangler', 'd1', 'execute', dbName, ...(local ? ['--local'] : ['--remote']), ...args, '--yes'], { stdio: 'inherit' });
}

async function runFile(sql, name, retry = true) {
  const file = join(dir, `${name}.sql`);
  await writeFile(file, sql);
  for (let attempt = 0; attempt < (retry ? 5 : 1); attempt++) {
    const result = runWrangler(['--file', file]);
    if (result.status === 0) return;
    if (attempt === (retry ? 4 : 0)) throw new Error(`Import failed while running ${name}.`);
    const delay = 1000 * (2 ** attempt) + Math.floor(Math.random() * 500);
    console.log(`Batch failed; retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 2} of 5).`);
    await pause(delay);
  }
}

async function importOversizedBatch(recipes, start) {
  console.log(`Large SQL batch at recipe ${start + 1}; importing rows separately and splitting long text fields.`);
  for (let offset = 0; offset < recipes.length; offset++) {
    const recipe = recipes[offset];
    const key = `legacy-${recipe.id}`;
    const fields = RECIPE_FIELDS.filter(field => {
      const value = field === 'nutrition'
        ? JSON.stringify(Object.fromEntries(NUTRITION_FIELDS.map(name => [name, String(recipe[name] ?? '')])))
        : String(recipe[field] ?? '');
      return Buffer.byteLength(value, 'utf8') > MAX_INLINE_FIELD_BYTES;
    });
    await runFile(insertSql([recipe], true), `row-${start + offset}`, false);
    for (const field of fields) {
      const value = field === 'nutrition'
        ? JSON.stringify(Object.fromEntries(NUTRITION_FIELDS.map(name => [name, String(recipe[name] ?? '')])))
        : String(recipe[field] ?? '');
      // Reset first so rerunning a partially completed import remains safe.
      const reset = runWrangler(['--command', `UPDATE recipes SET ${field} = '' WHERE recipe_key = ${quote(key)};`]);
      if (reset.status !== 0) throw new Error(`Could not reset ${field} for recipe ${start + offset + 1}.`);
      for (const textChunk of splitUtf8(value, APPEND_CHUNK_BYTES)) {
        const append = runWrangler(['--command', `UPDATE recipes SET ${field} = ${field} || ${quote(textChunk)} WHERE recipe_key = ${quote(key)};`]);
        if (append.status !== 0) throw new Error(`Could not restore ${field} for recipe ${start + offset + 1}.`);
      }
    }
  }
}

try {
  for (let start = startAt; start < data.recipes.length; start += batchSize) {
    const chunk = data.recipes.slice(start, start + batchSize);
    const sql = insertSql(chunk);
    if (Buffer.byteLength(sql, 'utf8') > MAX_BATCH_BYTES) await importOversizedBatch(chunk, start);
    else await runFile(sql, `batch-${start}`);
    console.log(`Imported ${Math.min(start + chunk.length, data.recipes.length)} / ${data.recipes.length}`);
  }
} finally { await rm(dir, { recursive: true, force: true }); }
