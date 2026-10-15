# GenUI Marketing implementation

The supplied architecture is preserved in [architecture-v1.md](architecture-v1.md). It is a product direction with proposed release stages, not a production-readiness claim. The executable reference now spans capability discovery, a deterministic graph planner, tenant policies, MCP v2 transport, durable PostgreSQL workflows, independent approvals, identity verification, audit events, and Studio.

For a step-by-step walkthrough, see the [user guide](../USER_GUIDE.md).

## Start Studio

```sh
npm ci
npm run build
npm run dev:studio
```

Studio uses port 5174 with a local-only API on 3002. Its nine connector manifests use **fixture providers**. No vendor account is connected and no remote marketing action is performed. It presents 13 business capabilities, seven of which form the reference lifecycle. The full lifecycle is Salesforce accounts → Workfront project → AEM brief / AEP audience → AJO draft → approval → activation → CJA report. AEP requires the explicit `aep.segmentation` entitlement and does not assume RT-CDP.

For durable development storage:

```sh
npm run postgres:dev
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/genui npm run dev:studio
```

The PostgreSQL helper uses a checksum-pinned official PostgreSQL 17 image and loopback-only trust authentication for development. Do not use trust authentication in a deployed environment. It preserves an existing matching container and never deletes data. New containers use a named Docker volume. Container state and Docker volumes are not guaranteed to survive a cloud task/snapshot; use an externally managed database for cross-machine retention.

An optional durable fixture scheduler runs with `STUDIO_DATABASE_URL=... npm run worker:studio`. It resumes pending/retryable runs, never approves a workflow, and uses optimistic checkpoints to prevent duplicate concurrent execution. In-flight external operations after a process crash require operator reconciliation. This is a PostgreSQL checkpoint engine, not a Temporal integration.

## What is implemented

| Area | Executable implementation | Validation |
| --- | --- | --- |
| Registry | Tenant-keyed PostgreSQL action metadata bound to trusted code | PostgreSQL load/schema mismatch/isolation tests |
| Workflow state | Durable run checkpoints, CAS revisions, identity mappings, audit events | Reconnect, stale write, concurrent resume, crash tests |
| MCP | Official split `@modelcontextprotocol/client` / `server` v2.3.1 SDK | Real in-memory MCP handshake, discovery and invocation |
| Connector SDK | Trusted manifest registration, schema drift checks, REST/GraphQL transport, rate limiting, sandbox certification | Contract and policy tests |
| Policy / identity | Capability/tenant/license checks; JWT issuer/audience/signature/expiry verification; external identity enrollment | Signed JWT and PostgreSQL mapping tests |
| Planning | Cycle detection, dependency ordering, bound inputs, explicit provider choice | Planner and forged plan tests |
| Governance | Independent approvals, rejection, pinned plan contracts, reconciliation, explicit compensation | Workflow tests and Studio browser checks |
| Studio | Workspace, deterministic chat, graph, connectors, forms, dashboards, approvals, audit/identity | Real Chromium browser workflow |
| Salesforce CRM | REST account search, opportunities, campaign creation and follow-up tasks | Mock HTTP normalization contracts |
| Workfront | REST project creation | Mock HTTP normalization contract |
| AEM/AEP/AJO/CJA/GenStudio/Marketing Cloud/custom MCP | Fixture contracts and configurable normalized vendor SDK/REST/GraphQL/MCP extension points | Fixture lifecycle and configured SDK callback tests |

## Live integration prerequisites

Live vendor behavior remains unverified. Salesforce and Workfront adapters need the organization's instance root, OAuth credentials obtained through a secrets manager, a licensed sandbox, and confirmation of API versions and field/permission requirements. Other Adobe products and Marketing Cloud require host-supplied SDK/API operation mappings and normalized responses; API availability varies by product and license. The tool names in reference manifests are GenUI-local canonical mappings, not claims about official vendor MCP server tools.

Identity federation requires the organization's trusted issuer/audience/JWKS configuration and administrator-enrolled external-to-internal mappings. Adobe Admin Console and Entra provisioning remain organizational setup; this repository does not configure either tenant. Salesforce OAuth runs under the organization's configured authorization model. The host supplies refreshed tokens using a context-aware callback; this release does not implement an OAuth login/consent portal or a secrets manager.

Studio deliberately uses fixed demo identities and simulated consent attestations, even with PostgreSQL. It is a development reference and must not be deployed as a multi-user enterprise service. A production host must authenticate users and reviewers, validate consent/eligibility from authoritative systems, isolate tenant/session context, enforce provider permissions, set retention/access controls for stored data, and complete the vendor security review. See [security specification](specs/05-security-identity.md).

## Six specifications

1. [Framework kernel](specs/01-framework-kernel.md)
2. [Marketing domain](specs/02-marketing-domain.md)
3. [Connector SDK and MCP gateway](specs/03-connectors.md)
4. [Capability graph and planner](specs/04-capability-graph.md)
5. [Security and identity](specs/05-security-identity.md)
6. [Workflow execution](specs/06-workflow-execution.md)


## Retrieval-grounded UI (v4 architecture direction)

The new [RAG/DFS/COS architecture](../rag/architecture.md) adds scoped system/marketing knowledge, published view retrieval, optional pgvector, source citations, a typed UI proposal adapter and a governed compiler. Studio's RAG UI tab and campaign chat use this path; the latter limits candidate views to capabilities in the validated campaign graph. Default retrieval is lexical and default proposal selection is deterministic. A real semantic embedding/LLM provider is not preconfigured.

Use [RAG development](../rag/development.md) for the separate loopback pgvector database on port 5433. Keyword persistence still works on plain PostgreSQL without the vector extension. Retrieval is not execution authority; existing independent activation approval and provider policies remain in force. See the [imported v4 documents](../reference/v4/README.md) for proposed future scope beyond the implemented UI path.
