import {describe,it,expect} from 'vitest';
import {createReferenceSystem} from '../apps/studio/reference.js';
import {createStudioRAG} from '../apps/studio/rag.js';
const examples=[
 ['Retrieve eligible target accounts','crm.accounts.search'],
 ['Activate reviewed journey','marketing.journey.activate'],
 ['Read campaign performance report','marketing.analytics.report'],
 ['Create a sales follow-up task','crm.tasks.create']
];
describe.each([false,true])('curated retrieval regression: hybrid fixture=%s',hybrid=>{
 it.each(examples)('selects and cites the expected capability for %s',async(query,expected)=>{
  const system=await createReferenceSystem();
  const rag=await createStudioRAG(system.registry,system.context,undefined,hybrid);
  const hits=await rag.retrieval.search(await rag.scope(system.context),{query,limit:5});
  expect(hits.some(hit=>hit.chunk.capabilities.some(cap=>cap.id===expected))).toBe(true);
  const composed=await rag.compose(query,system.context);expect(composed.binding.id).toBe(expected);expect(composed.citations.length).toBeGreaterThan(0);
  expect([...system.transports.values()].every(t=>t.calls.length===0)).toBe(true);
 });
});
