# GenUI

**Define capabilities. Generate experiences. Govern execution.**

GenUI is an experimental TypeScript framework for AI-driven interfaces. Register business capabilities once; generate schema-based views and execute actions through a server-side permission and validation boundary. Apache-2.0 licensed. Node.js 22+.

## Run the framework

```sh
npm ci
npm run build
npm test
npm run dev
```

The task-manager runs its Vite frontend on port 5173 and its local API on port 3001. It requires no database or credentials. Try “Create a task”, “Show my tasks”, “Change the due date”, and “Delete this task”. Updates and deletion prefill the most recently created task; IDs can be edited to target another task. Switch Adobe Spectrum on to try the optional renderer. Data is held in memory and resets when the server restarts.

## Marketing Studio and enterprise orchestration

The [GenUI Marketing reference implementation](docs/marketing/README.md) extends the framework with a PostgreSQL registry, official MCP v2 adapter/gateway, capability planner, durable workflows, tenant policies, federated identity verification and Studio.

```sh
npm run dev:studio
# Optional durable development storage:
npm run postgres:dev
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/genui npm run dev:studio
```

Studio runs on port 5174 and explicitly uses fixture providers and demo identities. It covers a seven-stage Salesforce → Workfront → AEM/AEP → AJO → CJA lifecycle, with independent approval before activation. Its nine connector manifests also include GenStudio, Marketing Cloud, and custom MCP extension contracts. Live vendor access requires licensed endpoints, OAuth credentials and verified mappings; no live connection is implied. See the [implementation/status table](docs/marketing/README.md#what-is-implemented) and [six specifications](docs/marketing/README.md#six-specifications).

## RAG for dynamic UI generation

The [retrieval-grounded UI architecture](docs/rag/architecture.md) now retrieves authorized capability documents, published view templates and approved marketing context before compiling a UI. Studio's **RAG UI** tab shows the generated form, exact capability/template versions, citations, source freshness and retrieval mode. Campaign chat also returns a cited UI preview scoped to its validated graph.

The default path works offline with keyword retrieval and deterministic template selection. Optional PostgreSQL/pgvector hybrid retrieval uses model-versioned embeddings; the local synthetic embedding fixture is clearly labeled. Semantic embeddings and LLM UI proposals use injectable server-side adapters. The compiler rejects invented actions, schemas, code and fake citations, and preserves required fields and approval policy. COS continues to own business execution.

```sh
npm run postgres:rag
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/genui_rag STUDIO_RAG_HYBRID_FIXTURE=1 npm run dev:studio
```

See [RAG development and model integration](docs/rag/development.md) for keyword mode, real model adapters, ingestion, database roles, API contracts and evaluation. The [uploaded v4 reference](docs/reference/v4/README.md) is preserved separately from implemented scope.

## Define a capability

```ts
import { defineAction, defineApp } from '@genui/core';

const createTask = defineAction<{ title: string }, { title: string }>({
  name: 'tasks.create',
  description: 'Create a task',
  input: {
    type: 'object',
    properties: { title: { type: 'string', minLength: 1 } },
    required: ['title'],
    additionalProperties: false
  },
  ui: { type: 'form', title: 'Create Task' },
  authorize: context => context.user?.roles?.includes('editor') ?? false,
  execute: async input => input // Replace with your business service.
});
export default defineApp({ actions: [createTask] });
```

## Packages

| Package | Responsibility |
| --- | --- |
| `@genui/core` | Dependency-free contracts, action definitions, UI schemas, typed errors |
| `@genui/registry` | In-memory registry with duplicate detection |
| `@genui/schema` | AJV JSON Schema validation, date formats, form/table compiler |
| `@genui/runtime` | Intent, authorization, hooks, execution, confirmation |
| `@genui/ai` | Provider-neutral validated JSON intent adapter |
| `@genui/renderer-react` | Forms and escaped read-only tables |
| `@genui/renderer-spectrum` | Optional Adobe Spectrum field adapter |
| `create-genui` | Non-overwriting project scaffold CLI |
| `@genui/marketing-core` | Canonical domains, capability registry, deterministic graph planner |
| `@genui/connector-sdk` | Trusted connector contracts, validation, REST/GraphQL transport |
| `@genui/adapter-mcp` | Official MCP v2 client transport, scoped discovery/invocation |
| `@genui/mcp-gateway` | Connector registration and transport lifecycle |
| `@genui/workflow-engine` | Checkpointed execution, independent approvals, retries/reconciliation/sagas |
| `@genui/registry-postgres` | Tenant-keyed metadata, workflows, identity mappings and audit persistence |
| `@genui/policy-engine` | OIDC JWT verification and enrolled tenant identities |
| `@genui/marketing-connectors` | Vendor contracts, fixtures, Salesforce/Workfront REST normalization |
| `@genui/retrieval-core` | Governed ingestion, ACL/version/freshness filtering, rank fusion and embedding interfaces |
| `@genui/retrieval-postgres` | Full-text / pgvector retrieval, published views and tenant RLS |
| `@genui/ui-compiler` | Retrieved-evidence proposals, citations and deterministic declarative UI compilation |

Core is renderer-independent and does not import Node, React, or an AI SDK. Runtime targets Node.js. The UI schema has a `version: '0.1'` marker. APIs are experimental and may change before 1.0.

## AI integration

The example uses a deterministic description-matching provider for reproducible, offline demos. It is not an LLM. Connect a model server-side through `JSONIntentProvider`:

```ts
import { JSONIntentProvider } from '@genui/ai';
const provider = new JSONIntentProvider(async request => {
  // Call your chosen SDK with request.prompt and request.actions.
  // Return JSON: { action: 'registered.action', input: { ... } }.
  return yourModel.generateIntent(request);
});
```

The adapter rejects malformed decisions and unavailable actions. Model output cannot bypass authorization or execution-time validation. No provider SDK or API key is required by the core. No automatic retries are performed for mutating actions.

## Execution and security

Create `GenUIRuntime(registry, provider, hooks?, emit?)`, then call `intent(prompt, context)` to compose a view and `execute(name, input, context)` on submission. Read-only tables also execute their registered action to retrieve rows. Authorizers filter model-visible actions and are checked again before execution. Actions without an authorizer are public; declare authorization for protected capabilities.

An action with `confirmation: true` returns `{ status: 'confirmation', token }` without executing. A trusted host should obtain explicit approval, then call `confirm(token, context)` using the **same server-owned context object**. Tokens expire after five minutes, snapshot inputs, and are consumed once; permissions are rechecked. Do not let a model confirm its own actions. Multiple instances require a shared confirmation store, which is outside this release.

The example is a single-user development server, with a fixed demo identity and local-only API binding. Before production use, implement authentication, per-session contexts and state, CSRF protection, rate limits, bounded confirmation storage, audit retention, and durable services. The framework does not infer tenant or row permissions. Do not deploy the demo as a multi-user service. Renderers support top-level fields; nested objects/arrays use JSON text fields. Full JSON Schema validation occurs server-side.

Hooks: `beforeDecision`, `afterDecision`, `beforeRender`, `beforeAction`, `afterAction`, `onError`. Runtime events: `ACTION_REQUESTED`, `CONFIRMATION_REQUIRED`, `ACTION_COMPLETED`, `VIEW_UPDATED`; `INPUT_CHANGED` is a contract for host integrations. Hooks may throw to stop execution; hooks and authorizers are trusted code.

## Scaffolding (local development)

```sh
node packages/create-genui/bin/create-genui.js /tmp/my-genui-app
```

This creates a minimal Node SDK demonstration. Packages are **not published to npm by this repository setup**; `npm create genui@latest` is the intended post-publication interface. Until publication, build and pack all SDK packages into a local directory, then install those tarballs in the generated app (see [development](docs/development.md)). The full React/Spectrum example lives in this monorepo.

## Validation and roadmap

`npm run typecheck`, `npm test`, and `npm run build` validate packages and example. `npx playwright install chromium` then `npm run test:e2e` runs real-browser workflows. To use an installed Chromium, set `CHROMIUM_PATH=/usr/bin/chromium`. CI tests Node 22 and 24 and runs browser checks on Node 22.

See [architecture](docs/architecture.md), [development](docs/development.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), and [RFCs](rfcs/README.md). PostgreSQL persistence, official MCP v2 adapters, REST/GraphQL wrapping, checkpointed marketing workflows and Studio are implemented as an experimental reference. Live vendor validation, production multi-user hosting, a Temporal adapter, a visual workflow editor, advanced dashboard composition and enterprise starter templates remain future work.


For real PostgreSQL integration checks, start the development database and run:

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/genui npm run test:postgres
```

`npm test` runs these database tests when `TEST_DATABASE_URL` is set, otherwise explicitly skips them. CI supplies PostgreSQL and runs both unit/integration and browser workflows. Run `STUDIO_DATABASE_URL=... CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` to browser-test Studio against the development database; omitting the database URL tests memory mode.
