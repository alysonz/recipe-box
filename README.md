# The Recipe Box

A recipe collection backed by Cloudflare Pages Functions and D1. The front end keeps all recipe fields from `data.json`, supports searching and shareable links, and provides a create/edit/delete form. Recipe tags and sources suggest values already present in the collection.

## Deploy to Cloudflare

1. Install Node.js, then authenticate Wrangler with `npx wrangler login`.
2. Create the D1 database: `npx wrangler d1 create recipe-box`.
3. Copy the database ID Wrangler prints into `wrangler.toml`, replacing `REPLACE_WITH_DATABASE_ID`.
4. Create its table: `npx wrangler d1 migrations apply recipe-box --remote`.
5. Import the existing recipes once: `node scripts/import-recipes.mjs recipe-box`. The script is safe to rerun; it skips the stable `legacy-<recipe id>` keys already imported.
6. In the Cloudflare dashboard, create a **Pages** project connected to this GitHub repository. Set the production branch to `main`, the build command to blank, and the build output directory to `.`. The `functions/` directory and `wrangler.toml` configure the API and D1 binding.
7. Configure Cloudflare Access to require authentication for the site, including `/api/*`, before enabling public access to the deployment.
8. Push to `main`; Cloudflare Pages will build and deploy the site.

Cloudflare Access provides site authentication; the app does not use a separate recipe edit password. Protect the API paths with the same Access application as the site. To use a local database, run `npx wrangler d1 migrations apply recipe-box --local`, import locally with `node scripts/import-recipes.mjs recipe-box --local`, then run `npx wrangler pages dev .`.

## Data model

Recipe details have individual D1 columns, with all nutrition values grouped as one JSON `nutrition` column. The edit form keeps the nutrition values individually editable inside one section. D1 has a separate UUID key for stable share links; the original recipe `id` stays an editable recipe field. The initial import derives stable database keys from the original IDs. Indexes cover the original ID, name, source, and tags. The single initial migration uses `CREATE TABLE` and creates these indexes; it has no schema upgrade steps.
