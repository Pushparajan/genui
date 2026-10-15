> Imported proposed design reference. See [implemented architecture](../../rag/architecture.md) for current behavior.

05 Migration and Implementation Plan v4

15 October 2026  •  Open-source TypeScript architecture  •  Proposed specification

Purpose

Migration path from Dynamic Forms v3 and marketing orchestration v1 to integrated v4.

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

Phase 0 Baseline

Inventory v3 DFS schema and action registry, COS endpoints, Adobe connectors, current authorization and regression fixtures. Freeze contracts and establish compatibility tests.

Phase 1 PostgreSQL

Add tenant-scoped registry tables, immutable capability versions, UI schema versions, graph edge tables and execution audit. Migrate existing action IDs with aliases; keep v3 API compatibility.

Phase 2 pgvector and RAG

Introduce ingestion jobs, embeddings with versioned model IDs, document chunking, lexical indexes, hybrid retrieval, source citations, ACL filtering and evaluation datasets. Reindex when model changes.

Phase 3 Graph and Planner

Build dependency graph, capability eligibility resolver, typed plan proposal endpoint, deterministic plan validation and human approval UI. Initially use published templates for high-risk actions.

Phase 4 MCP Gateway

Build connector SDK and signed/approved manifests; implement Salesforce CRM, Workfront, AEM, AEP Segmentation, AJO and CJA adapters. Test OAuth identity mapping, rate limits, schema drift and failures.

Phase 5 Execution

Implement durable workflow engine, retries, idempotency, partial-failure reconciliation, compensation policies and end-to-end audit. Keep activation blocked until approval.

Phase 6 Rollout

Shadow-mode retrieval/planning against v3, canary by tenant, compare intent accuracy and plan correctness, enable write operations after security review; rollback via feature flags and registry version pinning.

Definition of done

No unauthorized tools invoked; no cross-tenant retrieval; deterministic validator rejects invalid plans; no duplicate writes on retries; end-to-end reference campaign demonstrable; published API and connector documentation complete.

Status: Design specification; vendor MCP availability, product entitlements and runtime performance require verification in target environments.
