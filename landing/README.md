# OpenRadlr landing page

The public page for openradlr.com: a static [Astro](https://astro.build) site
that explains OpenRadlr and links to the app (app.openradlr.com). It is
separate from `client/`, which stays dependency-free.

- `src/pages/index.astro`: the page itself; the privacy policy and imprint are
  operator-provided links (`PUBLIC_PRIVACY_URL`, `PUBLIC_IMPRINT_URL`).
- `src/pages/changelog.astro` renders the repository's `CHANGELOG.md`.
- The hero's elevation profile is drawn at build time from
  `routes/col-de-la-forge.json`, so it always matches the game.
- Colours and fonts follow the app (`client/public/styles.css`).
- Screenshots in `src/assets/` come from the real game; Astro turns them into
  AVIF/WebP in several sizes.

## Build and run

With Node 22.12+ installed, in `landing/`:

```bash
npm ci
npm run dev       # http://localhost:4321, reloads on save
PUBLIC_APP_URL=https://app.example.org npm run build   # static files in dist/
```

Serve `dist/` with any static file server (Caddy, nginx, a CDN) and point the
domain at it; see [docs/deploy.md](../docs/deploy.md#landing-page).

## Settings (build time)

| Variable | Default | Used for |
| --- | --- | --- |
| `PUBLIC_SITE_URL` | `https://openradlr.com` | canonical links, sitemap, Open Graph |
| `PUBLIC_APP_URL` | `https://app.openradlr.com` | every *Ride now* button |
| `PUBLIC_DISCORD_URL` | – | Discord link; without it the page points to GitHub issues |
| `PUBLIC_PRIVACY_URL` | – | privacy policy link in the footer (the app's `OPENRADLR_PRIVACY_URL`); without it no link is shown |
| `PUBLIC_IMPRINT_URL` | – | imprint (legal notice) link in the footer, e.g. a page from online-impressum.de; without it no link is shown |
| `PUBLIC_PLAUSIBLE_DOMAIN` | – | cookie-free Plausible analytics; without it no script is loaded |
| `PUBLIC_PLAUSIBLE_SCRIPT` | Plausible Cloud (`https://plausible.io/js/script.js`) | script URL, e.g. your own instance |

Set them in the environment when running `npm run build` (or `npm run dev`);
Astro bakes them into the page at build time. `PUBLIC_PLAUSIBLE_SCRIPT` defaults
to Plausible Cloud — set it to your own instance's script URL if you self-host
Plausible (the same script the app loads via `OPENRADLR_ANALYTICS_SCRIPT`).
Deployment: [docs/deploy.md](../docs/deploy.md#landing-page).
