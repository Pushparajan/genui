# Security policy

GenUI 0.1 is experimental; only the latest 0.1 release receives security fixes. Do not expose the example server to untrusted users. It uses a fixed demo identity and in-memory shared state.

Please report vulnerabilities privately through the repository's GitHub **Security → Report a vulnerability** option if enabled. Otherwise contact a repository maintainer privately to arrange confidential disclosure. Do not post exploit details, credentials, or private data in public issues. Repository maintainers should enable private vulnerability reporting before public release.

Include affected versions, reproduction steps, impact, and a suggested fix when available. No response-time or production support guarantee is offered at this stage.


Marketing Studio is also a fixture development host. It simulates requester/reviewer identities and consent assertions, even when PostgreSQL is enabled. Do not deploy it as a production marketing service. The identity package verifies OIDC tokens for integration by an authenticated host, and is not a completed login/session frontend. Live secrets belong in a secret manager and context-aware auth callbacks, never manifests, workflow state or model prompts. See [security and identity specification](docs/marketing/specs/05-security-identity.md). Local PostgreSQL trust authentication is strictly for development.


RAG knowledge is evidence, never authorization. Ingest and publish only through trusted administrative jobs, bind documents/views to exact tenant and capability versions, and keep secrets outside the corpus and model requests. New retrieval tables enforce tenant RLS for restricted database roles; application queries also filter ACLs, freshness and publication. PostgreSQL superusers bypass RLS. A production host must supply authenticated server-side scope and current policy checks before execution. See [RAG security boundaries](docs/rag/architecture.md#postgresql-and-security-boundary).
