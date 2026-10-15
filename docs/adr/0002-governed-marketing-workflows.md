# ADR 0002: Capability graph and PostgreSQL checkpoints

Status: accepted for experimental marketing reference implementation.

Keep vendor types out of the kernel. Add normalized business capability contracts, explicit provider/tenant identity maps, deterministic dependency planning and a scoped connector gateway. Use the official MCP v2 split client/server SDK. Validate locally declared tool schemas against discovery and never use vendor annotations as authorization.

Use PostgreSQL for action metadata, enrolled identity maps, workflow checkpoints, provider object maps and audit. Trusted implementations remain application code. Use optimistic revisions before external effects; interrupted operations require reconciliation. An independent approval gate precedes activation. Saga compensation is explicit and may be unsupported. Do not promise ACID rollback or exactly-once execution across external platforms.

This avoids requiring a separate workflow service for the reference app. It defers Temporal integration and parallel graph execution. Studio uses fixture providers and demo identities until an authenticated production host and licensed vendor mappings are supplied.
