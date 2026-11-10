# The Recipe Box

A static recipe collection served on GitHub Pages.

## Deploy with GitHub Pages

1. Push this project to a GitHub repository.
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. Push to the `main` branch. The workflow in `.github/workflows/pages.yml` publishes the site.

The site works under a project URL such as `https://<account>.github.io/<repository>/`.

## Browse and share

Search recipe names, ingredients, descriptions, directions, sources, and tags. Source and tag information appears beneath each recipe in the search results and in its details. Click a row or **View** to open it. **Share** copies a direct link to the clipboard and displays the link in a selectable field. The link opens the recipe by its index in the collection. Recipe details include serving, timing, rating, and available nutrition values.

To run locally, serve the folder over HTTP, for example with `python3 -m http.server`, then open `http://localhost:8000`.
