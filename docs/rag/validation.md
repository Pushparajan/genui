# RAG validation evidence

Validated in the development machine with Node.js 24.19.0 and npm 11.9.0:

- Build/type-check of all packages and both applications passed.
- `npm test` with both database URLs: **52 tests passed across ten files**, with no skipped database tests in that run.
- Dedicated pgvector suite passed against a real PostgreSQL 17 / pgvector container: repeatable migration, immutable ingestion/publication, FTS/vector fusion, HNSW index creation, version/ACL/freshness filtering, and source/view withdrawal.
- Tenant RLS was exercised under a temporary non-superuser role: no tenant scope returned no rows, cross-tenant reads returned no rows, and cross-tenant writes were rejected.
- Compiler/security tests rejected invented actions/versions, fake citations, injected JSX, altered field sets, removed required fields and misleading approval-bearing titles. Withdrawal during model generation failed closed.
- Eight curated regressions (four descriptor-based requests in keyword and synthetic-hybrid modes) selected and cited the expected capability without calling any provider.
- **Six Chromium browser tests passed**, including RAG form generation, citations, request-dependent capability changes, validation without execution, tampered version rejection, and existing marketing/task workflows. Studio used pgvector with the explicitly synthetic fixture embedder in this browser run.
- `npm audit` reported zero known vulnerabilities at validation time.

The synthetic hash embedder is not a semantic model. No hosted embedding model or LLM was configured or evaluated. The curated set is not a representative production relevance benchmark. Vendor operations and Studio principals remain fixtures; live vendor/federation validation is unchanged. CI configuration includes pgvector but remote GitHub CI has not been executed here.
