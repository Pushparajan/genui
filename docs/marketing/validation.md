# Validation evidence

Validated in the cloud development machine with Node.js 24.19.0 and npm 11.9.0:

- Clean `npm ci` and `npm run build` passed. Builds type-check all SDK packages, the task manager, Studio server/frontend, and fixture worker.
- `TEST_DATABASE_URL=... npm test`: 29 tests passed across seven files, with no skipped database tests in this run.
- PostgreSQL 17 ran in the official local Docker image. Repeated migrations, code-bound action metadata, tenant isolation, identity enrollment, CAS conflicts, database reconnection, canonical object mapping and audit persistence passed.
- MCP v2.3.1 client/server performed real in-memory protocol negotiation, tool discovery and invocation. HTTPS vendor MCP endpoints were not tested.
- JWT tests verified cryptographic signature, issuer, audience and expiry, and rejected cross-tenant mappings. No live federation tenant was tested.
- Five Chromium browser tests passed, covering both renderers, the four task commands, campaign planning, chat proposals, activation approval/rejection, normalized metrics, audit and manifest validation.
- The PostgreSQL helper ran repeatedly without deleting or replacing its existing container.
- The durable fixture worker resumed pending state, paused for approval, and shut down cleanly.
- Studio startup returned PostgreSQL/fixture health and a catalog of nine connectors and 13 capabilities.
- `npm audit` reported zero known vulnerabilities at validation time.

CI is configured for Node 22 and 24 with PostgreSQL, plus browser checks on Node 22; remote GitHub CI has not been run here. Adobe/Salesforce HTTP adapters have contract tests against simulated responses, not live vendor validation. Studio vendor operations and reviewer identities are fixtures. Packages and code have not been published.


The subsequent RAG architecture change is validated separately in [RAG validation evidence](../rag/validation.md): 52 unit/integration checks and six browser checks, including pgvector and restricted-role RLS. The earlier counts above describe the pre-RAG baseline.
