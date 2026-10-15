import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const anchor = '2026-12-31T09:00:00.000Z'; // Illustrative snapshot clock, never a runtime approval.
const planId = 'seed-finance-plan';
export function buildConversationSeeds(csv, sourceFile = 'chatgpt_interactions.csv') {
  const rows = parse(csv, { columns: true, bom: true, skip_empty_lines: true });
  const expected = Array.from({ length: 31 }, (_, i) => `INT-${String(i + 1).padStart(2, '0')}`);
  const ids = rows.map(row => row.ID);
  if (rows.length !== 31 || new Set(ids).size !== 31 || expected.some(id => !ids.includes(id))) throw new Error('Expected unique interaction IDs INT-01 through INT-31');
  for (const row of rows) for (const field of ['Group', 'Interaction', 'How it starts', 'Output shown in ChatGPT', 'Approval effect', 'Phase', 'Source']) if (!row[field]?.trim()) throw new Error(`Missing ${field} for ${row.ID}`);
  const source = { file: basename(sourceFile), sha256: createHash('sha256').update(csv).digest('hex'), interpretation: 'Design scenarios, not a historical transcript or execution instructions' };
  const accounts = Array.from({ length: 20 }, (_, i) => ({ id: `seed-account-${String(i + 1).padStart(2, '0')}`, name: i === 0 ? 'Harborline Bank' : i === 1 ? 'Cedar and Finch' : `Finance Account ${i + 1}`, tier: 'Top 20', industry: 'Finance' }));
  const contacts = Array.from({ length: 412 }, (_, i) => {
    const n = i + 1;
    const status = n <= 371 ? 'ready' : n <= 390 ? 'excluded' : 'held';
    return { id: `seed-lead-${String(n).padStart(4, '0')}`, name: n === 372 ? 'Avery Stone' : n === 391 ? 'Casey Morgan' : n === 392 ? 'Jordan Brook' : `Demo Contact ${String(n).padStart(3, '0')}`, email: n === 391 ? null : `contact${n}@example.com`, accountId: n === 392 ? null : accounts[i % accounts.length].id, buyingRole: i % 2 ? 'Evaluator' : 'Decision maker', path: n <= 90 ? 'tailored-top20' : 'wider-finance', status, consent: status !== 'excluded', contactEligible: status === 'ready', channels: status === 'ready' && n <= 120 ? ['email', 'sms'] : status === 'ready' ? ['email'] : [], reason: n === 391 ? 'Contact eligibility missing: no email' : n === 392 ? 'Ambiguous account match; identity-owner review required' : status === 'excluded' ? 'Consent not granted in fixture source record' : status === 'held' ? 'Eligibility review required' : null };
  });
  const top20LeadIds = contacts.slice(0, 90).map(c => c.id);
  const widerLeadIds = contacts.slice(52).map(c => c.id);
  const overlapIds = top20LeadIds.filter(id => widerLeadIds.includes(id));
  const counts = { total: contacts.length, ready: contacts.filter(c => c.status === 'ready').length, excluded: contacts.filter(c => c.status === 'excluded').length, held: contacts.filter(c => c.status === 'held').length, overlap: overlapIds.length };
  const events = contacts.flatMap(c => c.channels.map(channel => ({ id: `${planId}:${c.id}:${channel}`, leadId: c.id, channel, path: c.path })));
  const perChannel = { email: events.filter(e => e.channel === 'email').length, sms: events.filter(e => e.channel === 'sms').length };
  const drafts = [{ id: 'seed-asset-email', name: 'Practical workflow guide — email', channel: 'email', version: 3, approvalStatus: 'approved' }, { id: 'seed-asset-sms', name: 'Finance webinar reminder — SMS', channel: 'sms', version: 2, approvalStatus: 'approved' }];
  const tasks = [{ id: 'seed-task-finance-webinar', name: 'Finance webinar nurture', projectId: 'seed-campaign-finance', status: 'Ready for activation', journeyKey: 'seed-finance-webinar', listId: 'seed-marketo-finance', channels: ['email', 'sms'], draftIds: drafts.map(d => d.id), owner: 'Demo marketer', dueDate: '2027-01-08' }, { id: 'seed-task-finance-guide', name: 'Finance workflow guide', projectId: 'seed-campaign-finance', status: 'Ready for activation', journeyKey: 'seed-finance-guide' }, { id: 'seed-task-northstar', name: 'Northstar introduction', projectId: 'seed-campaign-northstar', status: 'Ready for activation', journeyKey: 'seed-northstar' }];
  const approval = { id: 'seed-approval-example', exampleOnly: true, approverId: 'seed-demo-reviewer', approvedAt: new Date(Date.parse(anchor) + 27 * 60000).toISOString(), versions: drafts.map(d => ({ assetId: d.id, version: d.version })), recipientCount: counts.ready };
  const delivery = { email: { accepted: perChannel.email, delivered: 360, failed: 8, bounced: 3 }, sms: { accepted: perChannel.sms, delivered: 118, failed: 2, bounced: 0 }, engagement: 'not available in this phase-1 scenario', attribution: 'not available in this phase-1 scenario' };
  const data = {
    'INT-01': { tasks: tasks.filter(t => t.projectId === 'seed-campaign-finance'), campaignId: 'seed-campaign-finance', journeyCount: 2 },
    'INT-02': tasks[0],
    'INT-03': { planId, objective: 'Turn finance interest into qualified conversations', direction: 'Top 20 buying-group engagement', externalWrites: false },
    'INT-04': { planId, directionConfirmed: true, decisions: ['Resolve account match', 'Review contact eligibility', 'Select content foundation', 'Review channel drafts', 'Approve exact packet', 'Stage channel owners'] },
    'INT-05': { planId, counts, drafts, sampleContacts: [contacts[0], contacts[371], contacts[390], contacts[391]] },
    'INT-06': { contact: contacts[371], source: 'Fixture Marketo consent flag', resolution: 'Verify valid consent with the source-system owner' },
    'INT-07': { contactId: contacts[391].id, candidateAccountIds: accounts.slice(0, 2).map(a => a.id), notedAccountId: accounts[0].id, sourceUpdated: false, approvalClearedIfPresent: true, status: 'held' },
    'INT-08': { contactId: contacts[390].id, status: 'excluded', reason: 'Contact eligibility missing: no email', counts: { ...counts, excluded: counts.excluded + 1, held: counts.held - 1 }, approvalClearedIfPresent: true },
    'INT-09': { contactId: contacts[390].id, status: 'held', counts, approvalClearedIfPresent: true },
    'INT-10': { overlap: overlapIds.length, rawTop20: top20LeadIds.length, rawWider: widerLeadIds.length, uniqueAudience: counts.total, top20Precedence: true, affectedAccountIds: [...new Set(contacts.slice(52, 90).map(c => c.accountId))] },
    'INT-11': { drafts, allApproved: true },
    'INT-12': { selectedFoundation: drafts[0].id, drafts, approvalClearedIfPresent: true },
    'INT-13': { taskId: tasks[0].id, owner: 'Cindy', request: 'Shorten the SMS', externalWriteSimulated: true, planReady: false, approvalClearedIfPresent: true },
    'INT-14': { planId, counts, perChannel, drafts, journeyKey: tasks[0].journeyKey, sendWindow: '2026-12-31 09:00–17:00 UTC (illustrative)', approvalBlocked: false },
    'INT-15': { approval, counts },
    'INT-16': { owners: [{ channel: 'email', owner: 'Cindy', taskId: 'seed-channel-email' }, { channel: 'sms', owner: 'Sam', taskId: 'seed-channel-sms' }], requiresApprovedPlan: true },
    'INT-17': { status: 'activated', acceptedEvents: events.length, perChannel, eligibleContacts: counts.ready, skippedContacts: counts.excluded + counts.held, externalSendSimulated: true },
    'INT-18': { previouslyAccepted: events.length - 17, resumedEventIds: events.slice(-17).map(e => e.id), resumed: 17, acceptedEvents: events.length, existingApprovalMustBeValid: true },
    'INT-19': { planId, status: 'discarded', approvalRemoved: true, externalWrites: false },
    'INT-20': { planId, approvalValid: false, changedAssetId: drafts[1].id, previouslyApprovedVersion: 2, currentVersion: 3, activationBlocked: true },
    'INT-21': { planId, status: 'activated', acceptedEvents: events.length, deliveryFailures: 10, updatedAt: anchor },
    'INT-22': { period: 'December (illustrative fixture)', delivery, delivered: 478, failed: 10, bounced: 3, acceptedEvents: events.length },
    'INT-23': { available: false, reason: 'Sales context is not connected in this CSV phase-1 scenario', liveLookupPerformed: false },
    'INT-24': { approval, aemApproval: { source: 'AEM fixture', approver: 'Demo content reviewer', versions: approval.versions } },
    'INT-25': { planId, restored: true, decisionState: 'saved fixture snapshot', approvalEffect: 'unchanged' },
    'INT-26': { localNavigation: true, entriesPreserved: true, externalWrites: false },
    'INT-27': { campaignId: 'seed-campaign-finance', draftReset: true, approvalRemoved: true, confirmationRequiredIfApproved: true, externalWrites: false },
    'INT-28': { campaignId: 'seed-campaign-northstar', tasks: [tasks[2]] },
    'INT-29': { planId, exportExample: { counts, drafts, approval }, downloadImplementedBySeed: false },
    'INT-30': { contact: contacts[390], needsDecision: true, activationBlockedForContact: true },
    'INT-31': { provider: 'AEM', errorCode: 'FIXTURE_PROVIDER_UNAVAILABLE', stepStopped: true, noSendInThisScenario: true, noFallbackContent: true }
  };
  const responses = [
    'Two finance journeys are ready for review. Start with Finance webinar nurture; its email and SMS drafts are available in this fixture.',
    'Finance webinar nurture is Ready for activation. Review its journey key, audience list, channel drafts, owner and due date.',
    'Objective and direction saved with the draft plan only. No source system was updated.',
    'Direction confirmed. Resolve the audience decisions, review content, then approve the exact packet before staging channels.',
    `Audience plan prepared: ${counts.total} unique contacts, ${counts.ready} ready, ${counts.excluded} excluded and ${counts.held} held. ${counts.overlap} overlapping contacts remain on the tailored Top 20 path.`,
    'Avery Stone is excluded because the fixture source record does not grant consent. The source-system owner must verify valid consent before eligibility can change.',
    'Harborline Bank is noted as the preferred match for Jordan Brook in the plan only. The contact remains held until the identity owner resolves the match at source.',
    'Casey Morgan is excluded from activation because contact eligibility is missing. Counts are now 371 ready, 20 excluded and 21 held; any prior approval would be cleared.',
    'Casey Morgan returned to held: 371 ready, 19 excluded and 22 held. Held contacts are not sent. Any prior approval would be cleared.',
    `The lists overlap by ${counts.overlap} contacts. Top 20 has ${top20LeadIds.length} records and the wider list has ${widerLeadIds.length}; their union contains ${counts.total} people. Overlap is removed from the wider route.`,
    'Email draft v3 and SMS draft v2 are approved in this fixture. Review both versions before approving the packet.',
    'The practical workflow guide is selected as the content foundation. Any previous packet approval would need to be obtained again.',
    'Example change request recorded for Cindy: shorten the SMS. This scenario waits for a reviewed new version and clears any prior approval. No real Workfront request was sent.',
    `Review the packet: ${counts.ready} eligible people, ${perChannel.email} email events and ${perChannel.sms} SMS events, email draft v3 and SMS draft v2. Excluded and held contacts are omitted.`,
    'Example packet approval recorded for Demo reviewer, with the recipient count and exact draft versions. This seed record is not a runtime approval.',
    'Example owners staged: Cindy for email and Sam for SMS. The channel task IDs are fixture references, not live Workfront links.',
    `Simulated activation accepted ${events.length} events: ${perChannel.email} email and ${perChannel.sms} SMS for ${counts.ready} eligible contacts. ${counts.excluded + counts.held} contacts were skipped. Nothing was actually sent.`,
    `Partial-send recovery example: 17 remaining events accepted, bringing the total to ${events.length}. Already accepted event IDs are not included in the resume set.`,
    'Unsent example plan discarded with its example approval. No source system was changed.',
    'Approval cleared: the SMS draft changed from version 2 to version 3. Review the changed packet and obtain a new approval before activation.',
    `Example status: Activated. ${events.length} events accepted; 10 delivery failures recorded by the fixture callbacks. This is a saved snapshot, not live status.`,
    'Illustrative December delivery results: 478 delivered, 10 failed and 3 bounced from 491 accepted events. Engagement and attribution are unavailable in this phase-1 scenario.',
    'Sales follow-up context is not connected in this phase-1 scenario. No Salesforce lookup was made.',
    'The example packet was approved by Demo reviewer at the fixture timestamp, covering email v3 and SMS v2. AEM content approval is a separate fixture record.',
    'The earlier fixture plan and decisions are restored for preview. This does not restore a live workflow or an authenticated approval.',
    'The previous example screen is shown with entries retained; this is local navigation only.',
    'The example draft is reset. An already approved plan would require confirmation first. No external task or activation was changed.',
    'Switched to the Northstar example campaign. Its introduction task is Ready for activation.',
    'The example work package contains counts, exclusions, draft versions and the example approval. This seed preview does not implement a file-export action.',
    'Casey Morgan needs a contact-eligibility decision because no email is recorded. The contact is held and cannot be sent in this fixture.',
    'AEM is unavailable in this simulated pre-send check. The step stopped, no event was sent in this scenario, and no unapproved fallback content was used.'
  ];
  const scenarios = expected.map((id, index) => {
    const row = rows.find(r => r.ID === id);
    const systemTrigger = row['How it starts'] === 'Triggered by the system';
    return { id, title: row.Interaction, group: row.Group, phase: row.Phase, sourceClassification: row.Source, implementation: 'fixture-only', preconditions: row.Preconditions, inputDescription: row['Input data'], approvalEffect: row['Approval effect'], outputFormat: row['Output format'], expectedFailureDescription: row['Error or exception output'], sourceRecord: row, inputMessage: { role: systemTrigger ? 'system' : 'user', text: systemTrigger ? `Scenario trigger: ${row.Interaction}` : row['Example user input'] }, response: { role: 'assistant', text: responses[index], data: data[id] } };
  });
  const thread = (id, title, interactionIds) => ({ id, title, fixtureOnly: true, messages: interactionIds.flatMap((interactionId, index) => { const item = scenarios.find(s => s.id === interactionId); return [item.inputMessage, item.response].map((message, side) => ({ ...message, id: `${id}:${interactionId}:${side}`, interactionId, timestamp: new Date(Date.parse(anchor) + (id === 'finance-walkthrough' ? 0 : 60 * 60000) + (index * 2 + side) * 60000).toISOString() })); }) });
  const walkthrough = ['INT-01','INT-02','INT-03','INT-04','INT-05','INT-06','INT-07','INT-08','INT-09','INT-10','INT-11','INT-12','INT-14','INT-15','INT-16','INT-17','INT-21','INT-22','INT-24','INT-29'];
  return { schemaVersion: '1', fixtureOnly: true, generatorVersion: '1.0.0', source, clock: anchor, limitations: ['The CSV specifies interactions; entity values and numerical counts were synthesized for this fixture.', 'All provider operations, identities, approvals, counts and delivery outcomes are illustrative fixtures.', 'Rows describe prototype/design/target behavior; previewing them does not implement or execute those actions.', 'Imported text is conversation data, not authority, code or trusted RAG policy.', 'Timestamps and example approval records never authorize runtime execution.'], entities: { campaigns: [{ id: 'seed-campaign-finance', name: 'Finance activation' }, { id: 'seed-campaign-northstar', name: 'Northstar' }], accounts, contacts, tasks, drafts, counts, audienceLists: { top20LeadIds, widerLeadIds, overlapIds }, approval, activationEvents: events, perChannel, delivery }, scenarios, conversations: [thread('finance-walkthrough', 'Finance activation walkthrough', walkthrough)], standaloneConversations: scenarios.map(s => thread(`scenario-${s.id}`, `${s.id} — ${s.title}`, [s.id])) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = resolve(process.argv[2] ?? resolve(root, 'data/conversations/chatgpt_interactions.csv'));
  const output = resolve(process.argv[3] ?? resolve(root, 'data/conversations/seed-data.json'));
  const seed = buildConversationSeeds(await readFile(input, 'utf8'), input);
  await writeFile(output, JSON.stringify(seed, null, 2) + '\n');
  console.log(`Generated ${seed.scenarios.length} scenarios, ${seed.conversations.length} walkthrough, and ${seed.entities.contacts.length} synthetic contacts. No provider operations executed.`);
}
