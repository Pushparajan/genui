# GenUI Marketing — Enterprise Orchestration Architecture v1.0

Architecture decision: GenUI Marketing will be an open-source, TypeScript-native, AI-powered marketing orchestration framework, initially integrating Adobe Experience Cloud and Salesforce, with a pluggable MCP architecture for additional marketing platforms.

This is the right separation of responsibilities for the initial product: GenUI owns the conversational experience, UI composition, orchestration, governance, and cross-platform coordination. Adobe, Salesforce, and future providers remain the systems of record and execution.

## 1. Platform architecture

## GenUI Marketing Workspace

Chat · Campaign Studio · Dynamic Forms · Dashboards · Approvals

### GenUI Framework

Intent Engine

UI Compiler

Action Registry

Agent Runtime

State Manager

Policy Engine

### GenUI Marketing Orchestrator

Campaign Domain Model

Workflow & Saga Engine

Capability Resolver

Cross-Platform Identity

Approval & Governance

Event & Data Normalization

MCP Gateway & Connector SDK

Discovery · Auth · Tool Mapping · Rate Limits · Observability

Adobe

Workfront · AEM · AEP · AJO · CJA

Salesforce

CRM · Accounts · Leads · Opportunities

Other MCPs

HubSpot · Braze · LinkedIn · Custom

An important detail: not every vendor API is available through an official MCP server. The connector SDK should support both MCP-native integrations and adapters that expose REST, GraphQL, or vendor SDK operations as governed MCP tools.

## 2. Core architectural principles

| Principle                  | Implementation                                                               |
| -------------------------- | ---------------------------------------------------------------------------- |
| Platform independence      | Marketing domain APIs do not contain Adobe- or Salesforce-specific types     |
| Capability-based discovery | The orchestrator discovers what each connected platform can actually do      |
| MCP-first integration      | Standardized MCP tool discovery and invocation                               |
| Provider adapters          | Wrap APIs when native MCP support is unavailable                             |
| Systems of record          | Salesforce owns CRM records; Adobe owns its respective marketing objects     |
| Governed AI                | AI proposes actions; deterministic services validate and authorize them      |
| Durable execution          | Long-running operations use workflows with retries and compensation          |
| Cross-platform identity    | Explicit mapping of users, tenants, accounts, campaigns, and assets          |
| Human oversight            | Approval gates for publishing, activation, spending, and destructive changes |
| Open-source extensibility  | Third parties can build and distribute new connectors                        |

## 3. Capability contracts are more important than vendor-specific tools

The central abstraction should be a Marketing Capability Registry.

For example, the business action `marketing.campaign.create` should not depend on which platform performs the operation.

```
interface MarketingCapability {
  id: string;
  version: string;

  inputSchema: JSONSchema;
  outputSchema: JSONSchema;

  effects: "read" | "write" | "external";
  requiresConfirmation: boolean;

  providers: CapabilityProvider[];
}

interface CapabilityProvider {
  platform: string;
  tool: string;

  supports(
    context: CapabilityContext
  ): Promise<boolean>;

  execute(
    input: unknown,
    context: ExecutionContext
  ): Promise<unknown>;
}
```

The orchestration engine can resolve a business capability to an Adobe, Salesforce, or third-party implementation based on tenant configuration, licensing, permissions, supported features, and policy.

Do not assume that similar tool names across platforms imply equivalent semantics. Provider adapters must normalize inputs, outputs, error codes, and supported behavior.

## 4. Initial Adobe and Salesforce capability map

| Marketing capability     | Adobe implementation              | Salesforce implementation             |
| ------------------------ | --------------------------------- | ------------------------------------- |
| Campaign planning        | Workfront projects and tasks      | Salesforce Campaign records           |
| Account targeting        | AEP Segmentation, where supported | Accounts, Contacts, Leads             |
| Content management       | AEM Assets                        | Salesforce Files, where appropriate   |
| Creative production      | GenStudio / Firefly               | External content integrations         |
| Journey execution        | AJO                               | Marketing Cloud products, if licensed |
| Approval workflows       | Workfront / Proof                 | Approval mechanisms or workflows      |
| CRM opportunity tracking | CRM integration                   | Opportunities                         |
| Performance analysis     | CJA                               | Salesforce reports and analytics      |
| Sales follow-up          | Workfront tasks or integration    | Salesforce Tasks and Activities       |

The orchestration layer should maintain a canonical campaign identifier and map it to native platform identifiers, rather than copying all provider data into a second master database.

For your Adobe B2B use case, AEP Segmentation should be used without assuming Real-Time CDP is licensed.

## 5. MCP Plugin Architecture

A third-party developer should be able to introduce a new marketing platform without modifying the GenUI kernel or marketing orchestration engine.

Connector installation and execution flow

Connector Manifest

Capabilities · Schemas · Auth · Version

Connector Registration & Validation

Trust policy · Tool discovery · Schema checks

Capability Registry

Normalized marketing operations

Policy-Aware Capability Resolver

Tenant · License · Permission · Provider

MCP Tool Invocation

Execution · Audit · Result normalization

### Example connector manifest

```
import {
  defineConnector
} from "@genui/connector-sdk";

export default defineConnector({
  id: "salesforce-crm",
  version: "1.0.0",

  transport: {
    type: "mcp",
    endpoint: "${SALESFORCE_MCP_URL}"
  },

  auth: {
    type: "oauth2",
    scopes: ["api"]
  },

  capabilities: {
    "crm.accounts.search": {
      tool: "salesforce.searchAccounts"
    },

    "crm.opportunities.list": {
      tool: "salesforce.listOpportunities"
    },

    "crm.tasks.create": {
      tool: "salesforce.createTask"
    }
  }
});
```

This is the proposed connector SDK syntax. The tool names are illustrative mappings, not verified names from a specific Salesforce MCP server.

The connector manifest should additionally declare supported versions, tool input/output schemas, side effects, pagination, rate-limit behavior, and any feature-specific prerequisites.

## 6. Cross-platform orchestration example

User command:

> Create a finance campaign for the top 20 Salesforce accounts, establish the Workfront project, generate the creative brief, and prepare an AJO journey for approval.

1

Salesforce MCP

Retrieve eligible accounts and buying-group contacts

2

GenUI Orchestrator

Validate campaign inputs, consent and target eligibility

3

Workfront MCP

Create project, tasks, owners and milestones

4

AEM / GenStudio Adapter

Prepare creative brief and content production requests

5

AEP / AJO Adapter

Prepare supported audience and journey configurations

6

GenUI Approval Workflow

Present cross-platform plan for human review

7

Activation Services

Execute authorized publishing and activation operations

Each stage should produce a typed result with execution status, provider object IDs, correlation IDs, and recoverable error details.

Use a durable workflow engine such as Temporal for multistep operations. Because cross-platform operations cannot generally share an ACID transaction, implement saga-style compensation and reconciliation rather than promising automatic rollback of every external action.

## 7. Identity, security, and governance

This is a first-class subsystem, not an optional connector feature.

For Adobe, the framework should support federated identity through Adobe Admin Console and Microsoft Entra ID. For Salesforce, use the organization's configured OAuth identity and authorization model.

The GenUI identity service must map the authenticated user to the correct provider identity and tenant.

```
GenUI Principal
   |
   +-- Adobe IMS / Federated User
   |
   +-- Salesforce User
   |
   +-- Workfront User
   |
   +-- Additional Provider Identities
```

Every action should enforce both GenUI-level authorization and the underlying provider's permissions.

The MCP gateway should also protect against malicious tool descriptions, prompt injection in returned content, excessive data access, credential leakage, and unauthorized cross-tenant operations.

Credentials belong in a secrets manager, not the Action Registry or LLM context.

## 8. Proposed open-source package structure

```
packages/
  core/
  runtime/
  intent/
  ui-schema/
  ui-compiler/
  renderer-react/
  renderer-spectrum/
  agent-runtime/
  policy-engine/
  workflow-engine/
  connector-sdk/
  mcp-gateway/
  registry-postgres/
  observability/

marketing/
  core/
  domain-model/
  campaigns/
  audiences/
  content/
  journeys/
  analytics/
  approvals/
  orchestration/

connectors/
  adobe-workfront/
  adobe-aem/
  adobe-aep/
  adobe-ajo/
  adobe-cja/
  adobe-genstudio/
  salesforce-crm/
  salesforce-marketing-cloud/
  generic-mcp/

apps/
  marketing-workspace/
  developer-playground/
  connector-studio/
```

## 9. Prioritized implementation

| Release | Deliverables                                                          | Target               |
| ------- | --------------------------------------------------------------------- | -------------------- |
| v0.1    | Framework kernel, React renderer, action registry, MCP gateway        | Foundation           |
| v0.2    | Marketing domain model, Salesforce CRM connector, Workfront connector | First integration    |
| v0.3    | AEM Assets, AEP Segmentation, AJO adapters, campaign workflows        | End-to-end POC       |
| v0.4    | CJA analytics, approvals, identity mapping, audit, observability      | Enterprise pilot     |
| v0.5    | Connector SDK, discovery, registration, certification test harness    | Ecosystem            |
| v1.0    | Stable APIs, production hardening, documentation, security review     | General availability |

These are proposed release scopes, not fixed delivery commitments.

## 10. The differentiating capability: Dynamic Capability Graph

I recommend making a Dynamic Capability Graph a central GenUI innovation.

Rather than merely exposing a list of MCP tools to an LLM, GenUI should understand relationships among marketing business capabilities, provider tools, permissions, data dependencies, and workflow prerequisites.

For example:

Business Intent: Launch B2B Campaign

Target Accounts

Salesforce CRM

Create Project

Adobe Workfront

Prepare Assets

AEM Assets

Configure Journey

Adobe AJO

Governed Workflow + Generated UI

Dependencies · Approval Gates · Execution State

The graph enables the framework to discover a valid execution plan, determine missing prerequisites, choose an available provider, and render the appropriate UI at each step.

The LLM can help select and propose a plan, but a deterministic planner and policy engine must validate its dependencies and permissions before execution.

## Recommended next step

I would formalize this as GenUI Marketing Architecture v1.0, with six implementation specifications: framework kernel, marketing domain model, MCP Connector SDK, Capability Graph and planner, security/identity model, and workflow execution contracts.

Then build the first reference application around the Salesforce → Workfront → AEM Assets → AEP Segmentation → AJO → CJA campaign lifecycle.

That provides a concrete, testable architecture while keeping GenUI independent of Adobe, Salesforce, and any single LLM provider.

The long-term positioning becomes:

GenUI is the open-source application framework. GenUI Marketing is the AI-native orchestration layer connecting enterprise marketing platforms through governed, pluggable capabilities.