# GenUI user guide

Use this guide to run GenUI Studio, explore its marketing workspace, generate interfaces from retrieved knowledge, and review a campaign before activation.

GenUI is an experimental developer framework. The supplied Studio uses simulated provider operations and demo identities. Its Salesforce and Adobe names describe the reference workflow; no live vendor account is connected. Dashboard values are fixture data. A production model, authenticated user accounts, and live connectors require developer configuration.

## 1. Start Studio

You need Node.js 22 or later and npm. Docker is optional for persistent development storage.

From the repository root, run:

```sh
npm ci
npm run build
npm run dev:studio
```

Keep the terminal running. Studio's frontend uses port **5174**, and its API uses port **3002**. Open the frontend through your development environment's browser or port-opening tools. When running on your own computer, use the frontend address printed by Vite.

The default setup needs no database or API keys. It stores campaign state in memory, uses keyword retrieval, and chooses a published UI template deterministically. It does not call an LLM.

Press **Ctrl+C** in the terminal to stop Studio. In memory mode, stopping the server clears campaign state. Browser reloads also clear chat messages and UI previews; these are not saved conversations.

## 2. Find your way around

| Page | What you can do |
| --- | --- |
| **Workspace** | Create a campaign plan, select a campaign, and run its stages. |
| **Chat** | Propose a reference campaign using a short request. |
| **Capability Graph** | Inspect ordered stages, dependencies, providers, and execution state. |
| **Connectors** | Inspect provider manifests and validate manifest JSON. |
| **Dynamic Forms** | Preview a registered capability's form directly. |
| **RAG UI** | Describe a UI and generate a form grounded in retrieved, authorized sources. |
| **Dashboards** | View normalized fixture metrics after a campaign completes. |
| **Approvals** | Review, approve, or reject a campaign awaiting activation. |
| **Audit & Identity** | Inspect demo identity mappings and correlated campaign events. |

The header identifies the fixture environment and its storage mode. Retrieval details appear alongside generated interfaces.

## 3. Complete your first campaign

### Create a plan

1. Open **Workspace**.
2. Enter a **Campaign name**, such as `Finance account campaign`.
3. Select the consent and account-eligibility checkboxes. In this demo, these are simulated attestations; the application does not verify real customer consent.
4. Click **Create campaign plan**.

The plan appears under **Campaign execution** with status `pending`. Creating it does not activate anything.

The reference lifecycle contains these stages:

| Stage | Fixture provider |
| --- | --- |
| Retrieve eligible finance accounts | Salesforce CRM |
| Establish the campaign project | Workfront |
| Prepare a creative brief | AEM |
| Prepare an audience | AEP Segmentation |
| Prepare a journey draft | AJO |
| Activate the reviewed journey | AJO, after approval |
| Retrieve a performance report | CJA |

### Run preparation stages

1. Check the selected entry in **Campaign plan**.
2. Click **Run next stages**.
3. Inspect the stage statuses and provider object IDs.

The application runs the preparation stages sequentially, then pauses at `awaiting_approval` before activation. **Capability Graph** shows the same plan with its dependencies and approval gate.

### Approve or reject activation

1. Open **Approvals**.
2. Find the campaign by its canonical campaign ID.
3. Expand **Review immutable plan and results** to inspect the inputs, provider mappings, and completed stages.
4. Choose one of the following:

   - **Approve activation as demo reviewer** records approval under a separate simulated reviewer, then immediately resumes activation and reporting. The app returns to Workspace.
   - **Reject activation** makes the workflow terminal with status `rejected`. It cannot activate afterward. Create a new plan if you want to try again.

The reviewer switch is a demonstration of independent approval, not an authenticated login or account-switching feature.

### Review the result

After approval and successful execution, Workspace shows `completed`. Open **Dashboards**, select the campaign, and inspect its fixture metrics. Open **Audit & Identity** to inspect events such as `approval.granted` and `workflow.completed`.

Use the campaign selector when you have multiple plans. Record the canonical campaign ID and correlation ID when reporting a problem.

## 4. Propose a campaign through Chat

1. Open **Chat**.
2. Enter a request such as:

   ```text
   Create a finance campaign for the top 10 accounts and prepare a journey for approval.
   ```

3. Select the consent and eligibility checkboxes.
4. Click **Propose campaign plan**.
5. Choose **Review proposed plan** to inspect the pending workflow, or **Inspect retrieved UI and sources** to inspect its generated UI preview.

Chat supports the reference finance campaign/journey recipe and between **1 and 20** accounts. It is not a general-purpose assistant. The offline handler is deterministic, and it does not execute the campaign when it proposes a plan. Continue from Workspace using **Run next stages**.

### Explore seeded conversation examples

In **Chat**, the **Example conversations** panel lets you choose a finance walkthrough or any of the 31 interaction scenarios imported from the supplied CSV. Click **Preview seed conversation**, then expand **Fixture response data** to inspect the supporting records. **Clear seed preview** closes the example.

The walkthrough has 40 messages and synthetic audience/delivery data. Previews are separate from the campaign assistant: messages such as “Send it.” and “Approve.” are displayed without being submitted or executed. They do not create plans or grant approvals. Some scenarios describe proposed features that are not implemented as live actions.

The examples are bundled fixture data, not restored user conversations. Developers can regenerate them with `npm run seed:conversations`, then restart Studio. See the [conversation seed guide](../data/conversations/README.md) for provenance, numerical assumptions and coverage.

## 5. Generate an interface with RAG UI

RAG means retrieval-augmented generation: GenUI retrieves relevant approved knowledge before composing the interface. It uses published views bound to registered capability versions.

### Generate a form

1. Open **RAG UI**.
2. Enter a request in **UI request**. Try:

   - `Retrieve eligible target accounts`
   - `Activate reviewed journey`
   - `Read campaign performance report`
   - `Create a sales follow-up task`

3. Click **Generate grounded UI**.
4. Review the capability/version binding and the generated fields.
5. Inspect **Retrieved sources** for source IDs, versions, locations, and update times. Expand **Compiled schema and provenance** for the full generated artifact.

Different requests can select different published forms. The compiler preserves registered field constraints and required fields. A capability requiring approval displays a notice; generating its form does not grant that approval.

### Validate sample inputs

For `Retrieve eligible target accounts`, enter:

| Field | Sample value |
| --- | --- |
| `industry` | `Finance` |
| `limit` | `20` |
| `consentVerified` | Selected |
| `eligibilityVerified` | Selected |

Click **Submit**. Successful validation displays:

```text
Inputs validated. No provider operation executed.
```

RAG UI submission validates inputs only. It does not create a campaign, invoke a connector, or activate a journey. Use the campaign workflow for execution.

### Understand sources and retrieval modes

| Display | Meaning |
| --- | --- |
| `lexical` | Keyword-based retrieval. No embedding model is used. |
| `hybrid` with `fixture-token-hash-v1` | Keyword plus synthetic vector retrieval for local testing. These vectors do not provide semantic understanding. |
| A configured production embedding model | A developer has supplied a real model adapter; evaluate its relevance before relying on it. |
| Source update time | When that knowledge source was updated, not when live provider data was measured. |
| Rank fusion score | A retrieval ranking value, not a probability or a guarantee of correctness. |

A source citation establishes where retrieved context came from. It does not authorize an operation or make historical text a current business fact. If no relevant authorized published view exists, rephrase the request or ask a developer to publish an appropriate view. There is no knowledge-upload or template-publication UI in this release.

## 6. Explore forms and connectors

In **Dynamic Forms**, choose a capability to preview its registered input form. Submitting this preview displays the entered data locally; it does not call a provider. Use it to compare the direct schema view with a retrieved view in **RAG UI**.

In **Connectors**, click **Inspect manifest** to load a connector's JSON into the inspector. Click **Validate manifest** to check its structure. A valid manifest remains **not registered**: validation does not connect to an endpoint, install a connector, or grant trust.

Live connector registration and credentials are configured by developers on the server. Do not paste credentials into manifests, chat, or source documents. See the [marketing implementation guide](marketing/README.md#live-integration-prerequisites) for integration requirements.

## 7. Keep development campaign data

To preserve campaign state across server restarts on the same development machine, use PostgreSQL. Stop the current Studio process before restarting it with a different storage mode.

### PostgreSQL with keyword retrieval

```sh
npm run postgres:dev
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/genui npm run dev:studio
```

### PostgreSQL with synthetic hybrid retrieval

```sh
npm run postgres:rag
STUDIO_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/genui_rag STUDIO_RAG_HYBRID_FIXTURE=1 npm run dev:studio
```

These commands use Bash-style environment assignments. On other shells, set the variables using that shell's syntax before starting Studio.

Both helpers require Docker and preserve compatible existing containers. The second uses a separate pgvector database on port **5433**. Switching databases shows the campaigns stored in the selected database; it does not migrate campaigns from memory or another database.

The local databases use development-only trust authentication. Docker volumes are not guaranteed to survive cloud environment replacement. Chat history and UI previews remain browser-session state even with PostgreSQL. See [RAG development](rag/development.md) for production database roles and real embedding/LLM integration.

## 8. Understand workflow status

| Status | What to do |
| --- | --- |
| `pending` | Review the plan, then choose **Run next stages**. |
| `running` | A stage is executing. If the backend was interrupted, ask a developer to inspect it before attempting recovery. |
| `awaiting_approval` | Open **Approvals** to approve or reject activation. |
| `retrying` | A safe retry is scheduled. Wait for the retry delay, then use **Run next stages**, or use the optional developer-run worker. |
| `completed` | Review results, dashboards, and audit events. |
| `rejected` | Activation was rejected. Create a new plan to start again. |
| `failed` | Ask a developer to inspect the failed stage and audit trail. |
| `reconciliation_required` | External outcome is uncertain or compensation is incomplete. An operator must verify provider state before recovery. |
| `compensated` | Supported compensating operations have finished. This does not imply that every external change was automatically rolled back. |

Operator reconciliation and compensation are SDK operations; Studio does not provide buttons for them. Do not repeatedly submit a workflow after an uncertain write outcome.

## 9. Try the task-manager example

From a separate terminal in the repository root, run:

```sh
npm run dev
```

This example uses frontend port **5173** and API port **3001**, so it can run alongside Studio.

1. Choose **Create a task**, click **Generate interface**, fill the form, and submit it.
2. Choose **Show my tasks** and generate the interface to see the table.
3. Choose **Change the due date**, generate the prefilled form, edit the date, and submit.
4. Choose **Delete this task**, generate the form, submit, then explicitly confirm or cancel deletion.

The update/delete forms prefill the most recently created task. Edit the task ID to target another task. Enable **Adobe Spectrum** to try the optional renderer. Task data is memory-only and resets when its API restarts.

## 10. Troubleshooting

| Problem | Next step |
| --- | --- |
| A workspace button is disabled | Fill required fields, select both attestations, and wait for the current request to finish. |
| No RAG view matches | Use a capability-oriented request from this guide. Ask a developer to check publication, permissions, licenses, versions, and source expiry. |
| Generated form reports invalid input | Follow the field constraints. Target-account limits are 1..20; dates must be valid. The server validates again even if the browser accepts a value. |
| Dashboards show no metrics | Select a completed campaign. Preparation alone does not run the final report. |
| No pending approvals appear | Confirm that the campaign has reached `awaiting_approval`; creating a plan alone does not reach the approval gate. |
| Campaigns disappear after restarting | Check the header's storage mode. Memory mode resets, and different databases contain different plans. |
| A port is already in use | Stop the older process you started before launching another instance. Avoid running two Studio backends on the same ports. |
| New UI features appear but API requests fail | Rebuild if SDK packages changed, then restart the backend. A running older server may not include the new endpoints. |
| Docker database setup fails | Confirm Docker is running and the required port is free. Preserve existing containers/data; ask a developer to inspect an image or port conflict. |
| An immutable source/view version conflicts | Ask the publisher to use a new version or inspect the mismatch. Do not erase the database to bypass the check. |
| You need real Adobe/Salesforce data or semantic AI | Ask a developer to configure licensed connectors, authenticated identities, secrets, and model adapters. The supplied demo does not do this automatically. |

For a useful issue report, include the page, steps to reproduce, displayed error, storage/retrieval mode, capability and source versions, and campaign/correlation IDs where available. Exclude credentials and private customer data.

## Further reading

- [Project README](../README.md)
- [Marketing implementation and live integration prerequisites](marketing/README.md)
- [RAG architecture](rag/architecture.md)
- [RAG development and model configuration](rag/development.md)
- [Workflow execution contracts](marketing/specs/06-workflow-execution.md)
- [Security policy](../SECURITY.md)
