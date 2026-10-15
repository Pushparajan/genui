# 02 · Marketing domain

Canonical TypeScript contracts live in `@genui/marketing-core`: `Campaign`, `Audience`, `Asset`, `Journey`, `AnalyticsReport`, `CanonicalIdentity`, `Principal` and `ProviderResult`. Vendor-specific fields belong in connector normalization code. A canonical campaign ID is created once per plan; provider IDs are recorded separately per tenant/campaign/capability. Provider platforms remain systems of record. The orchestration database stores execution metadata and normalized results needed to resume, not a replica of CRM or marketing data.

Each result includes a platform, provider object ID, correlation ID and schema-checked normalized data. Strict reference result schemas permit only known fields; SDK authors should define equally narrow output contracts. `NormalizedEvent` captures typed event name, time, tenant, correlation and safe metadata. Audit events omit input payloads, credential values and raw error messages. Workflow state can contain business data and needs host-defined retention, encryption and access controls.

The reference flow requires explicit consent/eligibility attestations before planning. These booleans are demo inputs; a production domain service must verify per-account eligibility and consent against authoritative sources. Account retrieval is bounded at 20. Salesforce opportunity queries are bounded at 200 and expose truncation; no hidden assumption of exhaustive pagination is made.

Salesforce Campaign records and Workfront projects are distinct capabilities with different semantics. Similar vendor tool names do not establish equivalence. GenStudio creative requests and Marketing Cloud journeys have separate entitlement-gated extension contracts. The reference graph uses AEM content preparation and AJO execution.
