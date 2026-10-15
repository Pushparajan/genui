# ADR 0003: Retrieval-grounded UI with a governed compiler

Status: accepted for the experimental reference implementation.

Adopt retrieval-augmented UI composition from the v4 design reference. Separate authorized system knowledge (capabilities and published views) from approved marketing context. Use PostgreSQL full-text search with optional model-versioned pgvector embeddings, ACL/version/freshness filtering and reciprocal rank fusion. Add tenant RLS on new retrieval tables and retain explicit query predicates.

DFS retrieves evidence and compiles an allowlisted declarative UI from a typed proposal. It cannot execute tools or change registered input schemas, capability versions, required fields or approval policy. COS remains responsible for authoritative domain calculations, dependency planning, approvals, durable execution, MCP invocation and result projection. Retrieved content is data, never policy or executable instructions.

Keep memory and keyword modes available without external model credentials. Provide embedding and JSON proposal adapter interfaces; synthetic hash vectors and deterministic template selection are explicitly labeled fixture/baseline modes. Do not equate these with semantic LLM behavior. Recheck cited source and view publication after generation to reject withdrawals during model calls.

This preserves UI schema v0.1 and existing action workflows. It introduces trusted ingestion/publication jobs and retrieval quality evaluation responsibilities. Full v4 graph persistence, model-generated workflow proposals, complete v4 APIs and production authentication remain separate work.
