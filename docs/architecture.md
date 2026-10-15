# Architecture · experimental GenUI

A host defines actions and trusted context. The runtime lists authorized actions to a provider, resolves its decision through the registry, and compiles a versioned UI schema. A renderer produces a form or table without access to action implementations. Submitted input crosses back to the server for authorization, JSON Schema validation, optional confirmation, and business execution.

The core contracts have no runtime dependencies. Registry and schema depend on core; runtime composes them. Renderer adapters depend on core, never the server runtime. Provider SDKs belong in the host application. AI decisions are untrusted suggestions. The in-memory registry stores executable capabilities, not serialized code.

AJV validates input and optional output schemas without coercion or default insertion. The schema compiler preserves field constraints and initial values. The host owns authentication, services, session state, and durability. Output-schema failures occur after business execution and must not be retried blindly. The demo intentionally has no external integrations.

## Scope

Implemented: typed contracts, memory registry, JSON decision boundary, form/table compiler, server runtime, single-use confirmation, React/Spectrum adapters, scaffolder, and task example.

The marketing extension now adds PostgreSQL metadata/state persistence, official MCP v2 transport, a deterministic capability planner, a checkpointed workflow engine, OIDC verification and Studio; see [marketing architecture](marketing/README.md). Core action confirmation tokens remain process-local; durable marketing stage approvals use a separate workflow contract. Model-specific adapters, generated API clients, advanced UI composition and production hosting integrations remain future work.


## Retrieval-grounded UI evolution

The [RAG architecture](rag/architecture.md) and [ADR 0003](adr/0003-retrieval-grounded-ui.md) define the new path: authenticated capability scope → filtered keyword/vector evidence → structured UI proposal → governed compiler → cited declarative UI → current COS policy and execution checks. DFS owns composition and never invokes MCP. COS owns the authoritative graph, approvals, business projections and workflow state. Existing core action/UI contracts remain compatible.
