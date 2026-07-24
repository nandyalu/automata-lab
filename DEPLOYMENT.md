# Deployment (Cloudflare Pages)

This project deploys as a static site to Cloudflare Pages. Target domains:
`ic443.link` (apex) and `labs.ic443.link` (subdomain), both pointed at the same
Pages project (`automata-lab`).

Two deployment paths are documented below:

- **[Manual](#manual-deployment-direct-upload)** — build locally, zip, drag
  into the dashboard. No GitHub required.
- **[Git-based CI/CD](#git-based-deployment-cicd)** — push to `main` on
  GitHub, GitHub Actions builds/tests/deploys automatically. Requires the repo
  to be on GitHub.

Both can target the same Pages project — pick whichever fits how you're
working, or use manual for quick one-offs and let CI/CD handle everything on
`main`.

## One-time setup (either path)

1. **Create the Pages project**
   Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Upload assets** → project name `automata-lab` → upload a build (see
   [Manual deployment](#manual-deployment-direct-upload) below) → **Deploy**.
   This creates the project once; after that both the manual and CI/CD paths
   can push new deployments to it.

2. **Attach both domains**
   In the project → **Custom domains** → **Set up a custom domain**, add:
   - `ic443.link` — apex/root domain. Since Cloudflare already manages DNS for
     this zone, it will offer to set up CNAME flattening on the root record
     automatically. If a conflicting A/AAAA record already exists on the bare
     domain (e.g. for the media server), Cloudflare will warn you — resolve
     that first.
   - `labs.ic443.link` — subdomain. One click; Cloudflare adds the CNAME.

   Both domains serve the latest deployment; every new deployment (manual or
   CI/CD) updates both at once.

## Manual deployment (direct upload)

1. **Build and zip**
   ```bash
   npm run deploy
   ```
   This runs [deploy.sh](deploy.sh), which does `ng build` (production is the
   default configuration in `angular.json`) and zips the contents of
   `dist/automata-lab/browser/` into `automata-lab.zip` at the repo root,
   with `index.html` at the archive root as Pages requires.

2. **Upload**
   Dashboard → **Workers & Pages** → `automata-lab` project →
   **Create deployment** → **Upload assets** → drag in `automata-lab.zip` →
   **Deploy**. Cloudflare publishes the new build to `ic443.link` and
   `labs.ic443.link` within a few seconds.

## Git-based deployment (CI/CD)

[.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on every
push and pull request against `main`:

- **`build-and-test`** (always): `npm ci`, `npm test`, `npm run build`.
  Runs on PRs too, so a broken build/test is caught before merge.
- **`deploy`** (only on push to `main`, after `build-and-test` passes):
  publishes `dist/automata-lab/browser` to the `automata-lab` Cloudflare
  Pages project via `cloudflare/pages-action`.

### Required GitHub secrets

The workflow needs two repo secrets (Settings → Secrets and variables →
Actions → New repository secret):

- `CLOUDFLARE_API_TOKEN` — create at
  [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
  using the **"Edit Cloudflare Pages"** template (scoped to Pages only, not a
  global/account-wide key).
- `CLOUDFLARE_ACCOUNT_ID` — found in the Cloudflare dashboard sidebar on any
  domain's overview page (or **Workers & Pages** → right sidebar).

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no setup needed.

### Enabling it

1. Push this repo to GitHub (public, per your plan).
2. Add the two secrets above under the repo's Settings.
3. Push to `main` — the workflow builds, tests, and deploys automatically.
   Check progress under the repo's **Actions** tab.

## Notes

- `public/_redirects` (contains `/* /index.html 200`) is included as an
  Angular asset and copied into every build automatically. It makes
  client-side routes (`/game-of-life`, `/maze`, etc.) resolve correctly
  instead of 404ing on a hard refresh or direct link.
- Manual and CI/CD deploys both write to the same Pages project, so whichever
  ran most recently is what's live — avoid running both at once for the same
  change.
