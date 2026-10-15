> Imported proposed design reference. See [implemented architecture](../../rag/architecture.md) for current behavior.

04 Business Use Cases and Acceptance v4

15 October 2026  •  Open-source TypeScript architecture  •  Proposed specification

Purpose

Business use cases and acceptance criteria for GenUI Marketing v4.

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

UC-01 Campaign planning

Given a finance campaign request, retrieve approved strategy and available tools, propose a campaign with sourced recommendations, and display an editable governed plan. Acceptance: no invented actions, sources cited, missing data explicitly requested.

UC-02 Audience activation plan (UC-INT-05)

Retrieve authorized Salesforce/Adobe audience context; calculate deduplication, eligibility and holds in COS; render editable inputs and read-only counts through DFS. Preserve historical fixture 412 total / 371 ready / 19 excluded / 22 held and 38 overlap as test-only data, not live facts. Acceptance: 371+19+22=412, consent and top-20 precedence enforced.

UC-03 Creative supply chain

Create Workfront project, link AEM assets, enforce review and approval before activation. Acceptance: unapproved assets cannot be activated; provenance and provider IDs retained.

UC-04 Journey activation

Draft AJO journey after audience and content prerequisites. Acceptance: no automatic publishing, approved human action required, entitlements checked, execution logged.

UC-05 Marketing insights

Use RAG for context and CJA/Salesforce APIs for fresh numerical metrics. Acceptance: source and as-of time shown; unsupported attribution claims omitted.

UC-06 Plugin portability

Install a third-party MCP connector with manifest, auth configuration, typed tool mappings and contract tests. Acceptance: no GenUI core code changes; untrusted tool output isolated.

Nonfunctional acceptance

Tenant isolation, traceability, replayable plans, accessibility, stable schema versions, idempotent writes, graceful provider failures, retrieval evaluation benchmarks and audit completeness.

Status: Design specification; vendor MCP availability, product entitlements and runtime performance require verification in target environments.
