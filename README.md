# ECM Compliance Demo

A standalone demo of the ECM training and medical
compliance app. Open it and use Training, Medical, and Manage without signing in.
All records are fictional, and changes are saved in the current browser.

## Run locally

Use Node.js 24 LTS (minimum 22.12):

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. No environment file, database server, or
cloud account is required.

To preview the static build:

```sh
npm run build
npm run preview
```

## Add your mock data

Use **Manage** to add employees, sites, courses, medicals, and completion records.
Course and medical assignments determine each site's requirements. Training and
Medical readiness reflect these saved changes, including pending dates and date
corrections.

Sample dates are generated relative to the first load so the demo includes
current, expiring, overdue, and missing requirements. Add and edit records using
the regular management tabs.

The dummy database is stored in `localStorage`. It survives refreshes but is
specific to this browser and website address. Visitors each get their own copy;
changes are not shared between people or devices. Clearing browser storage
removes local edits. Use fictional data only: this demo has no access controls.

The initial sample data is defined in `src/data/`. To give every new visitor a
custom dataset, update the seed in the source and publish a new build. Existing
visitors can clear this site's browser storage to load the updated sample data.

See [the demo data model](docs/database-design.md) and
[management workflows](docs/manage-interface-design.md).

## Publish to GitHub Pages

This project includes `.github/workflows/pages.yml`, which tests, builds, and
publishes the demo. The removed production deployment system is not needed.

1. Create an empty GitHub repository for this demo. A public repository supports
   Pages on GitHub Free; private repositories require a plan that includes Pages.
2. Connect this folder to it and push the demo to `main`. For example, replace
   `YOUR_ACCOUNT/YOUR_REPOSITORY` below:

   ```sh
   git add .
   git commit -m "Convert app to standalone demo"
   git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
   git push -u origin HEAD:main
   ```

3. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.
4. Open **Actions → Publish demo to GitHub Pages → Run workflow** and select
   `main`. Future pushes to `main` publish automatically.
5. After the workflow succeeds, open the URL shown in **Settings → Pages** or
   the workflow's deployment. Normally it is
   `https://YOUR_ACCOUNT.github.io/YOUR_REPOSITORY/`.

If your default branch has another name, update the `push.branches` setting in
`.github/workflows/pages.yml`. No secrets or backend configuration are needed.
Relative asset paths and hash routing support repository subpaths and allow
links such as `/#/manage/employees` to survive refreshes.

References: [Vite deployment guide](https://vite.dev/guide/static-deploy.html#github-pages)
and [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Verify changes

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

Browser tests run against the static build under `/nme-demo/`, including saved
mock data and reloads. They do not need a separate API or database.

## Project structure

- `src/components/`, `src/views/`: readiness and management interface.
- `src/data/`: sample data and the browser database.
- `src/services/`: local record management and readiness calculations.
- `src/router/`: hash routes for static hosting.
- `e2e/`: browser tests for the standalone demo.
- `.github/workflows/pages.yml`: GitHub Pages publishing workflow.

The production API, database migrations, cloud deployment scripts, authentication,
and account invitations have been removed from this demo clone.
