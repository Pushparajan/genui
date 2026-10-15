> Imported proposed design reference. See [implemented architecture](../../rag/architecture.md) for current behavior.

01 GenUI Framework Architecture v4

15 October 2026  •  Open-source TypeScript architecture  •  Proposed specification

Purpose

Define the reusable domain-neutral GenUI kernel and its plugin interfaces.

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

Module boundaries

@genui/core, @genui/intent, @genui/registry, @genui/retrieval-core, @genui/retrieval-postgres, @genui/graph-core, @genui/planner, @genui/policy, @genui/ui-schema, @genui/ui-compiler, @genui/renderer-react, @genui/renderer-spectrum, @genui/execution, @genui/mcp-gateway, @genui/observability.

Decision policy

Retrieval produces candidates, not executable authority. LLM returns a typed plan referencing existing capability IDs and declared dependencies. Deterministic validation enforces schema, graph prerequisites, entitlements, provider availability and approvals. The compiler only emits allowlisted declarative UI.

Evolution

v0.1 kernel/registry/renderer; v0.2 pgvector hybrid retrieval; v0.3 marketing RAG and MCP gateway; v0.4 capability graph/planner; v0.5 durable execution and enterprise hardening.

Status: Design specification; vendor MCP availability, product entitlements and runtime performance require verification in target environments.
