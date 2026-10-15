# Develop and validate RAG UI generation

## Offline keyword mode

```sh
npm ci
npm run build
npm run dev:studio
```

Open the Studio through your development tooling and select **RAG UI**. Try `Retrieve eligible target accounts`, `Activate reviewed journey`, or `Read campaign performance report`. The generated form shows its capability version, retrieval mode, source versions and update times. Submission validates typed input and explicitly reports that nothing executed. Campaign chat also offers an inspected retrieval-grounded view.

## PostgreSQL / pgvector mode

```sh
npm run postgres:rag
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/genui_rag STUDIO_RAG_HYBRID_FIXTURE=1 npm run dev:studio
```

This helper uses a digest-pinned official pgvector PostgreSQL 17 image on loopback port 5433, separate from the existing port-5432 workflow database. It preserves existing containers and data. Trust authentication and Docker volumes are for local development; volume restoration across cloud snapshots is not guaranteed. A managed production database needs secure credentials and a restricted runtime role. With a plain PostgreSQL database and the hybrid fixture flag omitted, Studio persists keyword retrieval and published views without requiring the vector extension.

The hybrid fixture flag is synthetic test mode, not a semantic model. Real embedding and LLM integrations are injected server-side:

```ts
import { CallbackEmbeddingProvider, RetrievalService } from '@genui/retrieval-core';
import { JSONUIProposalProvider, RAGUIService } from '@genui/ui-compiler';

const embeddings = new CallbackEmbeddingProvider(
  configuredModelRevision, configuredDimension,
  text => modelClient.embed(text) // Returns a finite, non-zero number[].
);
const retrieval = new RetrievalService(knowledgeStore, embeddings);
const proposalProvider = new JSONUIProposalProvider(request => modelClient.generateJSON({
  system: request.instructions,
  input: { prompt: request.prompt, candidates: request.candidates,
           untrustedEvidence: request.untrustedEvidence }
}));
const dfs = new RAGUIService(retrieval, publishedViewCatalog, proposalProvider);
const ui = await dfs.compose(prompt, serverDerivedScope, authorizedContracts);
```

`modelClient` is the host's chosen SDK wrapper. It must implement timeouts, credential handling and provider quotas. Do not place credentials in source documents, provenance, templates, browser code or proposal requests. Publishing and ingestion are trusted administrative jobs; `RetrievalService.ingest` is not a public upload endpoint.

## Reference HTTP contracts

| Endpoint | Input | Behavior |
| --- | --- | --- |
| `POST /v1/retrieval/search` | `{ query }` | Authorized source chunks, ranks, scores and provenance |
| `POST /v1/ui/compose` | `{ query }` | Governed UI schema, binding/version, template/version, citations and proposal hash |
| `POST /v1/ui/validate` | `{ capabilityId, capabilityVersion, input }` | Current policy/schema validation only; returns `executed:false` |
| Existing `/api/chat` | Campaign message and consent/eligibility attestations | Validated reference campaign plan plus a cited UI preview scoped to plan capabilities |

Clients cannot submit tenant IDs, roles, candidate tools, vectors, policies or generated code. Studio resolves its fixed demo context server-side; a production host must replace this with authenticated scope. DFS has no connector or workflow-execution dependency. These endpoints do not implement the full proposed v4 API inventory.

## Checks

```sh
npm run test:rag
TEST_RAG_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/genui_rag npm run test:rag:postgres
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/genui TEST_RAG_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/genui_rag npm test
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/genui_rag STUDIO_RAG_HYBRID_FIXTURE=1 CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

Database tests use isolated tenant IDs and clean up their own rows. The RLS test requires an isolated admin test database so it can create and remove a temporary restricted role; do not run it against a production database. Without the corresponding test URLs, general `npm test` marks database suites skipped. Dedicated database commands fail if their URL is missing.

The curated regression set contains four capability-description queries in lexical and synthetic-hybrid modes. It checks expected capability recall within five hits, selected UI binding and absence of provider calls. This is a regression set, not a production semantic relevance benchmark. Evaluate your real model with representative tenant corpora, ambiguous queries, recall/MRR, unsupported intents, permission changes, latency and cost before rollout.

## Migration and rollback

RAG is additive. Existing core action names, UI schema v0.1, renderer adapters and COS workflow contracts remain unchanged. New retrieval tables use their own repeatable migration. Do not reset or replace the existing workflow database to enable vectors. Migrate trusted sources with explicit versions, roles, provenance and expiry, then publish corresponding views. A changed source/template requires a new version and explicit withdrawal of old versions if necessary.

Roll out first as a cited preview, compare against the existing direct-schema path, and keep business execution under COS. The existing Dynamic Forms preview remains available for comparison and rollback of the UI path. No RAG request grants approval or activates a campaign.
