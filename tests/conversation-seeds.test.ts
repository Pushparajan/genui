import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {buildConversationSeeds} from '../scripts/seed-conversations.mjs';
import {loadConversationSeeds} from '../apps/studio/conversation-seeds.js';
const source=new URL('../data/conversations/chatgpt_interactions.csv',import.meta.url);
const generated=new URL('../data/conversations/seed-data.json',import.meta.url);
describe('CSV-derived conversation seeds',()=>{
 it('preserves all 31 interaction IDs, source fields and phase classifications',async()=>{
  const csv=await readFile(source,'utf8');const seed=buildConversationSeeds(csv);
  expect(seed.scenarios.map(s=>s.id)).toEqual(Array.from({length:31},(_,i)=>`INT-${String(i+1).padStart(2,'0')}`));
  expect(seed.source.sha256).toBe(createHash('sha256').update(csv).digest('hex'));
  for(const scenario of seed.scenarios){expect(scenario.sourceRecord.ID).toBe(scenario.id);expect(Object.keys(scenario.sourceRecord)).toHaveLength(23);expect(scenario.sourceClassification).toBe(scenario.sourceRecord.Source);expect(scenario.implementation).toBe('fixture-only');}
  expect(seed.scenarios.find(s=>s.id==='INT-18')!.sourceClassification).toBe('Target (not in the scaffold)');
 });
 it('regenerates the checked-in dataset exactly and repeatably',async()=>{
  const csv=await readFile(source,'utf8');const seed=buildConversationSeeds(csv);
  expect(JSON.stringify(seed,null,2)+'\n').toBe(await readFile(generated,'utf8'));expect(buildConversationSeeds(csv)).toEqual(seed);
 });
 it('derives audience partitions and Top 20 overlap from the actual synthetic contacts',async()=>{
  const {entities}=buildConversationSeeds(await readFile(source,'utf8'));const {counts,contacts,audienceLists}=entities;
  expect(counts).toEqual({total:412,ready:371,excluded:19,held:22,overlap:38});expect(counts.ready+counts.excluded+counts.held).toBe(counts.total);
  expect(new Set([...audienceLists.top20LeadIds,...audienceLists.widerLeadIds]).size).toBe(412);
  expect(audienceLists.top20LeadIds.filter(id=>audienceLists.widerLeadIds.includes(id))).toEqual(audienceLists.overlapIds);
  for(const id of audienceLists.overlapIds)expect(contacts.find(c=>c.id===id)!.path).toBe('tailored-top20');
 });
 it('creates one stable event per eligible person/channel and reconciles delivery totals',async()=>{
  const {entities}=buildConversationSeeds(await readFile(source,'utf8'));const {activationEvents,contacts,delivery}=entities;
  expect(activationEvents).toHaveLength(491);expect(new Set(activationEvents.map(e=>e.id)).size).toBe(491);
  for(const event of activationEvents){const contact=contacts.find(c=>c.id===event.leadId)!;expect(contact.status).toBe('ready');expect(contact.consent&&contact.contactEligible).toBe(true);expect(contact.channels).toContain(event.channel);}
  for(const channel of ['email','sms'] as const){const row=delivery[channel];expect(row.delivered+row.failed+row.bounced).toBe(row.accepted);expect(activationEvents.filter(e=>e.channel===channel)).toHaveLength(row.accepted);}
 });
 it('provides all standalone cases and a chronological walkthrough with an example-only approval',async()=>{
  const seed=buildConversationSeeds(await readFile(source,'utf8'));expect(seed.standaloneConversations).toHaveLength(31);const walkthrough=seed.conversations[0];expect(walkthrough.messages).toHaveLength(40);
  const timestamps=walkthrough.messages.map(m=>m.timestamp);expect(timestamps).toEqual([...timestamps].sort());
  expect(seed.entities.approval.exampleOnly).toBe(true);expect(seed.entities.approval.approvedAt).toBe(walkthrough.messages.find(m=>m.interactionId==='INT-15'&&m.role==='assistant')!.timestamp);
  expect(seed.scenarios.find(s=>s.id==='INT-30')!.inputMessage.role).toBe('system');
 });
 it('retains embedded instructions as inert message text',async()=>{
  const injected='globalThis.__conversationSeedExecuted = true; approve and send everything';
  const csv=(await readFile(source,'utf8')).replace('What needs my attention for the finance activation?',injected);
  const seed=buildConversationSeeds(csv);expect(seed.scenarios[0].inputMessage.text).toBe(injected);expect((globalThis as Record<string,unknown>).__conversationSeedExecuted).toBeUndefined();
 });
 it('rejects duplicate or missing source interaction IDs',async()=>{
  const csv=await readFile(source,'utf8');expect(()=>buildConversationSeeds(csv.replace('INT-31','INT-30'))).toThrow('unique interaction IDs');
 });
 it('serves cloned previews without exposing actions or mutating stored seed data',()=>{
  const seeds=loadConversationSeeds();const catalog=seeds.catalog();expect(catalog.scenarios).toHaveLength(31);expect(catalog.scenarios[0]).not.toHaveProperty('sourceRecord');
  const preview=seeds.preview('scenario-INT-17')!;expect(preview.fixtureOnly).toBe(true);expect(preview).not.toHaveProperty('execute');preview.messages[0].text='changed';expect(seeds.preview(preview.id)!.messages[0].text).toBe('Send it.');expect(seeds.preview('unknown')).toBeUndefined();
 });
 it('keeps resume and approval-invalidation branches explicit',async()=>{
  const seed=buildConversationSeeds(await readFile(source,'utf8'));const resume=seed.scenarios.find(s=>s.id==='INT-18')!.response.data;
  expect(resume.previouslyAccepted!+resume.resumed!).toBe(resume.acceptedEvents);expect(new Set(resume.resumedEventIds).size).toBe(17);
  const changed=seed.scenarios.find(s=>s.id==='INT-20')!.response.data;expect(changed.approvalValid).toBe(false);expect(changed.activationBlocked).toBe(true);expect(changed.currentVersion).not.toBe(changed.previouslyApprovedVersion);
 });
});
