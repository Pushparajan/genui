# Conversation seed data

These fixtures are derived from the user-provided `chatgpt_interactions.csv`. The CSV is a **31-row interaction specification**, not an exported chat transcript. Original values, phases, approval effects, exceptions, provider descriptions and source classifications are retained in each scenario's `sourceRecord`.

## Contents

| File | Purpose |
| --- | --- |
| `chatgpt_interactions.csv` | Original source specification, unchanged. |
| `seed-data.json` | Generated scenario catalog, sample messages, synthetic supporting entities and walkthrough. |

The generated dataset contains:

- All **31 interaction cases**, including proposed, inferred and later-phase behavior, each labeled `fixture-only`.
- One **40-message finance activation walkthrough**, covering preparation, audience decisions, content, approval, simulated activation, results and export preview.
- A standalone conversation for every interaction, including partial sending, changed drafts, missing eligibility, unavailable systems and unsupported Sales context.
- Two example campaigns, 20 synthetic accounts, 412 synthetic contacts, sample tasks, approved draft versions and an example-only approval record.
- A reproducible audience partition: **371 ready + 19 excluded + 22 held = 412**.
- Two raw audience lists: 90 Top 20 contacts and 360 wider-list contacts with **38 overlaps**, giving 412 unique people. Overlapping people stay on the tailored Top 20 path.
- **491 unique person/channel events**: 371 email and 120 SMS. Only ready, consented, eligible contacts receive fixture events. A person may receive one event in each permitted channel.
- Illustrative delivery outcomes: 478 delivered, 10 failed and three bounced, totaling 491 accepted events. Acceptance and delivery are distinct statuses.

The CSV supplies interaction requirements, not these numerical business records. Entity IDs, counts, contact addresses, dates, approval identities and delivery outcomes are synthetic. Contact addresses use the reserved `example.com` domain. The 412/371/19/22 and 38-overlap values align with the earlier v4 reference's historical fixture; they are not live facts extracted from the CSV or vendor systems. The walkthrough uses a compressed illustrative timeline.

## Regenerate

From the repository root:

```sh
npm ci
npm run seed:conversations
```

The command deterministically rewrites only `data/conversations/seed-data.json` from the checked-in CSV. It performs no database writes, provider calls or workflow execution. Source checksum and generator version are included for provenance.

To use an edited copy of this same specification and write elsewhere:

```sh
npm run seed:conversations -- /path/to/chatgpt_interactions.csv /tmp/seed-data.json
```

The importer expects unique IDs `INT-01` through `INT-31` and the required source columns. It is tailored to this interaction specification, not a generic transcript importer. New interaction IDs or changed entity assumptions need corresponding fixture mappings and tests.

## Preview in Studio

1. Start Studio with `npm run dev:studio`.
2. Open **Chat** and find **Example conversations**.
3. Choose the walkthrough or an individual scenario.
4. Click **Preview seed conversation**.
5. Expand **Fixture response data** to inspect structured counts and records. Use **Clear seed preview** to close it.

Previews are separate from the campaign assistant and do not populate or submit its prompt. A seeded message such as “Send it.”, “Approve.” or “Discard this plan.” is displayed as text and never dispatched. Loading a preview does not create a workflow, modify a real campaign, grant an approval, send a message or call a vendor.

The read-only API provides:

- `GET /api/conversation-seeds`: walkthrough/scenario summaries and source provenance.
- `GET /api/conversation-seeds/finance-walkthrough`: the walkthrough.
- `GET /api/conversation-seeds/scenario-INT-17`: the simulated send example; other IDs use the same format.

The generated file is read on backend startup. Restart Studio after regenerating it. Seed previews are fixture content bundled with the application; they do not add historical chats or campaigns to PostgreSQL and are not automatically ingested as approved RAG knowledge.

## Interpretation boundaries

Statements in imported cells are scenario descriptions, not executable instructions or policy. The source's “not connected in phase 1” and “nothing changed” statements describe those specific CSV scenarios; they are not blanket claims about all GenUI integrations or uncertain live failure outcomes.

Example approvals cannot authorize execution. The seed preview also does not implement all 31 proposed interactions: draft change requests, work-package exports, discard/reset operations and recipient-level send recovery remain examples unless separately implemented in an execution host. Actual workflow capabilities, current permissions, registered schemas and independent approval checks remain authoritative.

## Validation

```sh
npx vitest run tests/conversation-seeds.test.ts
npm run test:e2e
```

Unit tests check exact regeneration, source coverage, count reconciliation, Top 20 precedence, event uniqueness/eligibility, delivery totals, example approval timing, inert imported instructions and isolated preview copies. The browser test previews a simulated send and verifies that the workflow list is unchanged.
