# 04 · Dynamic Capability Graph

Each `MarketingCapability` declares its normalized schemas, effect class, dependencies, approval flag, provider implementations and safe retry policy. The deterministic planner traverses target dependencies in order, rejects cycles or missing capabilities, evaluates permissions/entitlements/provider identities, and resolves an available provider. Multiple candidates require an explicit configured preference; array order is never an implicit policy.

A plan pins capability and provider versions, selected providers, normalized inputs, explicit dependency bindings, tenant/requester identity, campaign ID and correlation ID. Bindings can reference only a direct dependency's normalized output field. Runtime validation occurs after bindings resolve. The workflow engine rejects forged dependencies, duplicate stages, approval flags or changed pinned versions.

An LLM may propose target capability IDs and inputs. Hosts must pass proposals through this planner and the workflow engine, never execute returned tool names directly. The Studio is intentionally deterministic and requires no LLM credentials. Its graph renders persisted plan steps, dependencies, result IDs and stage state. Missing licenses or identities prevent planning rather than silently choosing an unsupported operation.

Reference execution order: eligible accounts → project → content → audience → draft journey → approved activation → performance report. Content and audience are independent prerequisites of the draft journey but run sequentially in this implementation. The graph is a dependency model, not a parallel scheduler.
