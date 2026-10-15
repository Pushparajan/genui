# Development

Use the existing checkout. Node 22+ and npm are required. Run `npm ci`, `npm run build`, and `npm test` from the root. Builds emit ignored `dist` directories. Use `npm run dev` for the task-manager. No environment variables or remote services are needed. `npm run typecheck` includes the example server and browser source.

## Test a scaffold before npm publication

```sh
npm run build
mkdir -p /tmp/genui-tarballs
for pkg in core registry schema runtime ai renderer-react renderer-spectrum; do
  npm pack "./packages/$pkg" --pack-destination /tmp/genui-tarballs
done
node packages/create-genui/bin/create-genui.js /tmp/my-genui-app
cd /tmp/my-genui-app
npm install /tmp/genui-tarballs/*.tgz
npm run dev
```

Use fresh temporary directories or preserve existing files. The CLI rejects nonempty destinations. It does not run installation commands, initialize Git, or overwrite user files.

## Browser tests

```sh
npx playwright install --with-deps chromium
npm run test:e2e
```

Alternatively point `CHROMIUM_PATH` to an installed compatible Chromium. Playwright starts and stops the example automatically when it is not already running. Tests verify all four actions and Spectrum form submission. Test output is ignored by Git.

## Releases

All packages currently share version 0.1.0. Before publishing, verify npm organization ownership and package-name availability, update internal versions together, add license/README files to package artifacts, review `npm pack --dry-run` output, run CI, and publish dependencies before dependants. Nothing is automatically published. Breaking changes before 1.0 require release notes; stabilize the action and UI contracts through RFC review.


## Marketing development

See [GenUI Marketing](marketing/README.md) for Studio, local PostgreSQL, the durable worker, vendor fixture/live boundaries and six implementation specifications. `npm run build` type-checks all packages plus both applications. `TEST_DATABASE_URL=... npm test` includes PostgreSQL tests; the dedicated `npm run test:postgres` command fails if its database URL is unset. No vendor credentials are required for the reference workflow. Live credentials and identity federation must be supplied by a trusted production host.


## RAG UI development

See [RAG development](rag/development.md) for trusted ingestion, PostgreSQL/pgvector setup, tenant RLS, semantic model adapters, Studio UI composition and the curated regression set. Use `npm run test:rag` for retrieval/compiler tests and `TEST_RAG_DATABASE_URL=... npm run test:rag:postgres` for the dedicated vector/RLS integration suite. All these tests run under `npm test` when the corresponding test database URL is configured.
