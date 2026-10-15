# 01 · Framework kernel

## Contracts

`@genui/core` provides actions, JSON Schema, UI Schema v0.1, provider decisions, hooks and events. It stays independent of databases, renderers and vendor SDKs. `@genui/runtime` authorizes and validates registered actions; `@genui/schema` compiles action metadata into forms/tables. Marketing operations use a separate normalized capability layer rather than adding vendor types to core.

`@genui/registry-postgres` persists action **metadata**, not JavaScript or authorizer functions. Register metadata for a tenant, then `load(tenantId, trustedActions)` verifies schema/UI/confirmation metadata against application code and returns a synchronous registry for the runtime. Reload explicitly after metadata changes. Missing implementations or drift fail closed. Execute/authorize implementation upgrades remain a trusted code deployment concern.

## Compatibility and errors

Packages remain experimental 0.1.0. UI schemas carry a version marker. Core errors distinguish validation, authorization, missing actions, confirmation and provider failures; marketing errors add policy, graph, connector, rate limit, CAS conflict, approval and reconciliation codes. There are no implicit retries of core action execution.

## Acceptance

Existing four-command task example remains operational; React/Spectrum renders user data as text. Type checks and browser tests cover both applications. Future breaking contracts require an RFC and coordinated release.
