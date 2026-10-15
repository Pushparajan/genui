> Imported proposed design reference. See [implemented architecture](../../rag/architecture.md) for current behavior.

03 GenUI Developer Guide v4

15 October 2026  •  Open-source TypeScript architecture  •  Proposed specification

Purpose

Implementable service contracts, data design, retrieval, planning, UI and connector interfaces.

Architecture decision

GenUI is a TypeScript-native Apache-2.0 proposed open-source framework. GenUI Marketing orchestrates Adobe, Salesforce and extensible provider MCPs. Dynamic Forms Service (DFS) owns governed UI composition and rendering contracts; Campaign Orchestration Service (COS) owns authoritative business decisions, workflows and execution.

Target architecture

User → Intent API → hybrid retrieval (keyword + pgvector + filtered metadata) → capability graph → LLM structured plan proposal → deterministic plan validator → DFS governed UI compiler → user review/approval → COS durable workflow engine → MCP Gateway → Adobe/Salesforce/other providers → event/audit store → refreshed UI.

Persistence boundaries

PostgreSQL owns action/capability/provider registries, graph edges, published view schemas, tenant configuration, workflow references, execution journals, audit and idempotency. pgvector holds derived embeddings. Source platforms remain authoritative for their native objects. Redis optional for transient state; durable workflow engine for long-running operations.

Security invariants

Tenant scoping and row-level security; retrieval ACL filtering; OAuth/OIDC identity mapping and delegated provider permissions; secrets outside LLM context; retrieved text and MCP descriptions treated as untrusted; plan actions must resolve immutable registered capability versions; no arbitrary generated SQL, JSX, HTTP endpoints or tool names; approval for activation, spend and destructive actions.

Adobe and Salesforce boundaries

Salesforce CRM for Accounts, Contacts, Leads, Opportunities and sales follow-up; Workfront for project tasks and approvals; AEM Assets for asset lifecycle; AEP Segmentation for supported audiences without assuming RT-CDP licensing; AJO for licensed journeys/activation; CJA for analytics. Connector availability and licensed feature support must be verified per tenant.

Reliability and operations

Idempotency keys, retries with backoff, rate limiting, circuit breakers, per-provider timeouts, correlation IDs, compensation where supported, explicit partial-failure states, dead-letter reconciliation, OpenTelemetry traces, evaluation of retrieval relevance and planner accuracy.

SQL migration outline

CREATE EXTENSION IF NOT EXISTS vector; create tables tenants, capabilities, capability_versions, provider_bindings, capability_edges, ui_schema_versions, knowledge_documents, knowledge_chunks, embeddings, execution_plans, execution_steps, idempotency_keys, audit_events. Index tenant_id and capability_version; use GIN full-text and HNSW vector indexes. Embedding dimension is model-specific; migrations must not hardcode provider assumptions.

Hybrid retrieval algorithm

1 Authenticate principal and tenant. 2 Pre-filter authorized published capability IDs. 3 Lexical BM25/FTS retrieval plus pgvector similarity using compatible embedding model. 4 Fuse ranked results (e.g. reciprocal rank fusion). 5 Rerank with capability metadata, version, permissions, license and source freshness. 6 Return evidence with scores and provenance. 7 Never treat retrieval as authorization.

API contracts

POST /v1/intents/resolve; POST /v1/retrieval/search; GET /v1/capabilities; POST /v1/plans/propose; POST /v1/plans/validate; POST /v1/plans/{id}/approve; POST /v1/plans/{id}/execute; GET /v1/executions/{id}; POST /v1/ui/compose; POST /v1/ui/validate; GET /v1/ui/schemas/{id}. Mutations require auth, idempotency and policy checks.

TypeScript contracts

Capability {id,version,inputSchema,outputSchema,effects,prerequisites,providerBindings}; RetrievalResult {sourceId,tenantId,score,content,provenance,acl}; PlanStep {id,capabilityId,capabilityVersion,input,dependsOn,requiresApproval}; ExecutionContext {principal,tenantId,correlationId,credentialRef}; MCPConnector {manifest,discover,invoke,health}.

DFS implementation

DFS receives sanitized domain projections, approved action bindings and published view definitions. It compiles JSON UI schema to React Spectrum components. It does not invoke MCP tools or mutate business data. Browser sends action IDs and typed arguments to COS; COS revalidates everything.

COS implementation

COS resolves approved immutable plan, evaluates policies and prerequisite graph, reserves idempotency key, starts durable workflow, dispatches to MCP Gateway, normalizes provider responses, records audit and returns safe projections. Compensate only when provider supports it.

Testing

Unit: schema, fusion, graph traversal, action policy. Contract: MCP tool versions and normalized outputs. Integration: Postgres RLS, pgvector index, provider pagination/rate limits. Security: prompt injection, ACL leakage, tampered action IDs, tenant crossing. E2E: intent→retrieval→plan→UI→approval→execution→results. Chaos: partial provider outages, retries, duplicate requests.

Status: Design specification; vendor MCP availability, product entitlements and runtime performance require verification in target environments.
