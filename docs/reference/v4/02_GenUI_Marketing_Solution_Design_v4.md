> Imported proposed design reference. See [implemented architecture](../../rag/architecture.md) for current behavior.

02 GenUI Marketing Solution Design v4

15 October 2026  •  Open-source TypeScript architecture  •  Proposed specification

Purpose

Cross-platform marketing orchestration reference architecture and end-to-end campaign design.

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

Domain model

Campaign, Account, BuyingGroup, Contact, Audience, Segment, ContentBrief, Asset, Approval, Journey, ChannelActivation, Experiment, PerformanceMetric, ProviderObjectReference and ExecutionPlan. Canonical IDs map to provider IDs; do not duplicate source-of-truth records.

Capability graph

Nodes: capability, action version, provider, MCP tool, data contract, view, policy, prerequisite. Typed edges: IMPLEMENTED_BY, REQUIRES, PRODUCES, AUTHORIZED_BY, PRESENTED_AS. Store versioned edges in PostgreSQL initially; Neo4j is an optional later adapter.

B2B flow

Retrieve Salesforce top-20 finance accounts → establish Workfront project → prepare AEM creative brief and approved assets → configure AEP Segmentation audience → draft AJO journey → human approval → activate via authorized providers → read CJA performance. No activation occurs on plan creation.

RAG split

System RAG indexes registered capability/tool docs, published UI templates and API documentation. Marketing RAG indexes approved playbooks, briefs, policies, historical campaign narratives and asset metadata. Metrics are fetched from authoritative analytics at query time. Every result carries provenance, tenant and freshness metadata.

Decision log

ADR-001 TypeScript core; ADR-002 DFS/COS separation; ADR-003 Postgres+pgvector initial store; ADR-004 MCP-first adapters with REST wrappers; ADR-005 deterministic authorization/execution; ADR-006 source systems authoritative; ADR-007 graph initially relational.

Status: Design specification; vendor MCP availability, product entitlements and runtime performance require verification in target environments.
