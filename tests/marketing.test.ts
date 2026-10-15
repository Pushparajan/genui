import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CapabilityPlanner, CapabilityRegistry, MarketingError, type CapabilityContext } from '@genui/marketing-core';
import { MemoryWorkflowStore, WorkflowEngine, WorkflowWorker } from '@genui/workflow-engine';
import { bindConnector, HttpConnectorTransport, defineConnector } from '@genui/connector-sdk';
import { lifecycleInputs, FixtureConnectorTransport, referenceManifests, certifyConnector, createVendorConnector, salesforceCRM, workfrontProjects } from '@genui/marketing-connectors';
import { createReferenceSystem } from '../apps/studio/reference.js';
async function setup() { const system = await createReferenceSystem(); const args = lifecycleInputs('Finance campaign'); const context = { ...system.context, correlationId: randomUUID() }; const plan = await system.planner.plan(['marketing.analytics.report'], context, args.inputs, args.bindings); return { ...system, context, plan }; }
describe('capability graph and governed lifecycle', () => {
  it('prepares all dependencies, pauses for independent approval, resumes and never replays completed writes', async () => {
    const { plan, context, reviewer, engine, transports } = await setup();
    expect(plan.steps).toHaveLength(7); expect(plan.steps[0].capability).toBe('crm.accounts.search');
    await engine.create(plan, context); const prepared = await engine.resume(plan.id, context);
    expect(prepared.status).toBe('awaiting_approval'); expect(prepared.steps['marketing.journey.activate'].attempts).toBe(0);
    await expect(engine.approve(plan.id, { ...context, principal: { ...context.principal, roles: ['approver'] } })).rejects.toMatchObject({ code: 'APPROVAL' });
    await engine.approve(plan.id, reviewer); const finished = await engine.resume(plan.id, context);
    expect(finished.status).toBe('completed'); expect(finished.steps['marketing.analytics.report'].result?.data.metrics).toBeDefined();
    const count = () => [...transports.values()].reduce((sum,t) => sum+t.calls.length,0);
    expect(count()).toBe(7); await engine.resume(plan.id, context); expect(count()).toBe(7);
    expect(finished.events.some(e => e.type === 'approval.granted')).toBe(true);
  });
  it('fails closed for missing consent, permissions, identities, licenses and cross-tenant requests', async () => {
    const { planner, context, plan, engine } = await setup(); const args = lifecycleInputs('x');
    for (const change of [{ licenses: [] }, { identities: [] }, { principal: { ...context.principal, permissions: [] } }]) await expect(planner.plan(['marketing.analytics.report'], { ...context, ...change }, args.inputs, args.bindings)).rejects.toBeInstanceOf(Error);
    args.inputs['crm.accounts.search'].consentVerified = false;
    await expect(planner.plan(['marketing.analytics.report'], context, args.inputs, args.bindings)).rejects.toMatchObject({ code: 'VALIDATION' });
    await engine.create(plan, context);
    await expect(engine.resume(plan.id, { ...context, principal: { ...context.principal, tenantId: 'other' } })).rejects.toMatchObject({ code: 'POLICY' });
  });
  it('rejects cycles, missing dependencies, ambiguous providers, and forged approval flags', async () => {
    const { registry, context, plan, engine } = await setup();
    const cap = registry.get('crm.accounts.search'); cap.dependencies = ['marketing.analytics.report'];
    await expect(new CapabilityPlanner(registry).plan(['marketing.analytics.report'], context, {})).rejects.toMatchObject({ code: 'GRAPH' });
    cap.dependencies = []; cap.providers.push({ ...cap.providers[0], id: 'second-provider' });
    await expect(new CapabilityPlanner(registry).plan(['crm.accounts.search'], context, lifecycleInputs('x').inputs)).rejects.toMatchObject({ code: 'AMBIGUOUS_PROVIDER' });
    plan.steps.find(s => s.requiresApproval)!.requiresApproval = false;
    await expect(engine.create(plan, context)).rejects.toMatchObject({ code: 'GRAPH' });
    await expect(new CapabilityPlanner(new CapabilityRegistry()).plan(['missing'], context, {})).rejects.toMatchObject({ code: 'MISSING_CAPABILITY' });
  });
  it('uses optimistic checkpoints to stop concurrent duplicate execution', async () => {
    const { plan, engine, context, transports } = await setup(); await engine.create(plan, context);
    const results = await Promise.allSettled([engine.resume(plan.id, context), engine.resume(plan.id, context)]);
    expect(results.some(r => r.status === 'rejected')).toBe(true);
    expect([...transports.values()].flatMap(t => t.calls).filter(c => c.tool === 'marketing.campaign.plan')).toHaveLength(1);
  });
  it('requires reconciliation after a crash between provider execution and checkpoint', async () => {
    const { registry, context, plan } = await setup(); const memory = new MemoryWorkflowStore(); let fail = true;
    const store = { create: memory.create.bind(memory), get: memory.get.bind(memory), list: memory.list.bind(memory), async save(run: any, expected: number) { if (fail && run.steps['marketing.campaign.plan'].status === 'completed') { fail = false; throw new Error('simulated database interruption'); } await memory.save(run, expected); } };
    const engine = new WorkflowEngine(registry, store); await engine.create(plan, context);
    await expect(engine.resume(plan.id, context)).rejects.toThrow('database interruption');
    const restarted = new WorkflowEngine(registry, memory);
    await expect(restarted.resume(plan.id, context)).rejects.toMatchObject({ code: 'RECONCILE' });
    const current = (await memory.get(context.principal.tenantId,plan.id))!; expect(current.steps['marketing.campaign.plan'].status).toBe('executing');
    const operator = { ...context, principal: { ...context.principal, roles: ['operator'] } };
    await restarted.reconcile(plan.id, 'marketing.campaign.plan', operator, { output: { platform: 'workfront', objectId: 'verified-project-id', correlationId: plan.correlationId, data: { id: 'verified-project-id' } } });
    expect((await restarted.resume(plan.id,context)).status).toBe('awaiting_approval');
  });
  it('retries transient reads on schedule, but reconciles ambiguous writes', async () => {
    vi.useFakeTimers();
    try {
      const { registry, engine, context, plan } = await setup(); const read = registry.get('crm.accounts.search').providers[0]; const execute = read.execute;
      read.execute = vi.fn().mockRejectedValueOnce(new MarketingError('CONNECTOR','transient',true)).mockImplementation(execute);
      await engine.create(plan, context); expect((await engine.resume(plan.id,context)).status).toBe('retrying');
      await engine.resume(plan.id,context); expect(read.execute).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1001);
      registry.get('marketing.campaign.plan').providers[0].execute = async () => { throw new MarketingError('CONNECTOR','unknown write outcome',true); };
      expect((await engine.resume(plan.id,context)).status).toBe('reconciliation_required');
      expect((await engine.store.get(context.principal.tenantId,plan.id))!.steps['marketing.campaign.plan'].attempts).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it('records unsupported compensation instead of promising automatic rollback', async () => {
    const { registry, engine, context, plan } = await setup();
    registry.get('marketing.content.prepare').providers[0].execute = async () => { throw new Error('failure'); };
    await engine.create(plan,context); await engine.resume(plan.id,context);
    await expect(engine.compensate(plan.id,context)).rejects.toMatchObject({code:'RECONCILE'});
    await engine.reconcile(plan.id,'marketing.content.prepare',{...context,principal:{...context.principal,roles:['operator']}},{notApplied:true});
    const run = await engine.compensate(plan.id,context); expect(run.status).toBe('reconciliation_required'); expect(run.events.at(-1)?.type).toBe('compensation.unsupported');
  });
});
describe('connector trust and provider normalization', () => {
  it('rejects untrusted registration, schema drift, cross-tenant identity, and enforces rate limits', async () => {
    const manifest = referenceManifests()[0]; const { context } = await setup(); const transport = new FixtureConnectorTransport(manifest);
    await expect(bindConnector(manifest,transport,{ connectorIds:[],endpoints:[],allowFixtures:true })).rejects.toMatchObject({ code:'CONNECTOR' });
    await expect(bindConnector(manifest,{ ...transport, invoke: transport.invoke.bind(transport), discover: async () => [{ name:'crm.accounts.search',inputSchema:{} }] },{connectorIds:[manifest.id],endpoints:[],allowFixtures:true})).rejects.toMatchObject({code:'CONNECTOR'});
    manifest.rateLimit.calls=1; const [provider] = await bindConnector(manifest,transport,{connectorIds:[manifest.id],endpoints:[],allowFixtures:true});
    const input = lifecycleInputs('x').inputs['crm.accounts.search']; await provider.execute(input,context,'one');
    await expect(provider.execute(input,context,'two')).rejects.toMatchObject({ code:'RATE_LIMIT' });
    await expect(provider.execute(input,{ ...context,principal:{...context.principal,tenantId:'other'} },'three')).rejects.toMatchObject({code:'POLICY'});
  });
  it('normalizes Salesforce records and Workfront project IDs without exposing credentials', async () => {
    const {context}=await setup(); const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({records:[{Id:'001',Name:'Finance Co',Industry:'Finance'}]})));
    const sf=salesforceCRM('https://example.my.salesforce.com/',async()=>({Authorization:'Bearer test-fixture'}),request);
    const [provider]=await bindConnector(sf.manifest,sf.transport,{connectorIds:['salesforce-crm'],endpoints:['https://example.my.salesforce.com/']});
    expect((await provider.execute(lifecycleInputs('x').inputs['crm.accounts.search'],context,'key')).data.accounts).toEqual([{id:'001',name:'Finance Co',industry:'Finance'}]);
    expect(String(request.mock.calls[0][0])).toContain('/services/data/v64.0/query'); expect(JSON.stringify(sf.manifest)).not.toContain('Bearer');
    const wf=workfrontProjects('https://example.my.workfront.com/',async()=>({Authorization:'Bearer test-fixture'}),vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{ID:'project-1'}}))));
    expect(await wf.transport.invoke('marketing.campaign.plan',{name:'Finance',accountSetId:'set-1'},context,'key')).toMatchObject({id:'project-1'});
  });
  it('restricts REST/GraphQL requests to trusted configured paths and normalizes GraphQL errors', async () => {
    const {context}=await setup(); const manifest=referenceManifests()[0]; manifest.transport={type:'graphql',endpoint:'https://api.example.com/graphql'};
    const transport=new HttpConnectorTransport(manifest,{query:{method:'POST',path:'/graphql',query:'query Accounts { accounts { id } }'}},async()=>({}),vi.fn().mockResolvedValue(new Response(JSON.stringify({errors:[{message:'no permission'}]}))));
    await expect(transport.invoke('query',{},context,'key')).rejects.toMatchObject({code:'CONNECTOR'});
    const escape=new HttpConnectorTransport(manifest,{escape:{method:'POST',path:'https://evil.example/'}},async()=>({}));
    await expect(escape.invoke('escape',{},context,'key')).rejects.toMatchObject({code:'CONNECTOR'});
  });
});

it('records rejected approvals without activating and workers never approve automatically',async()=>{
  const {engine,context,reviewer,plan}=await setup(); await engine.create(plan,context);
  const worker=new WorkflowWorker(engine); expect((await worker.tick(context))[0].status).toBe('awaiting_approval');
  await engine.reject(plan.id,reviewer); expect((await engine.resume(plan.id,context)).status).toBe('rejected');
  expect((await engine.store.get(context.principal.tenantId,plan.id))!.steps['marketing.journey.activate'].attempts).toBe(0);
});
it('compensates supported operations in reverse dependency order after a known failed step',async()=>{
  const {registry,engine,context,plan}=await setup(); const order:string[]=[];
  for(const cap of registry.list()) for(const provider of cap.providers) provider.compensate=async()=>{order.push(cap.id);};
  registry.get('marketing.journey.prepare').providers[0].execute=async()=>{throw new Error('write failure');};
  await engine.create(plan,context); await engine.resume(plan.id,context);
  await engine.reconcile(plan.id,'marketing.journey.prepare',{...context,principal:{...context.principal,roles:['operator']}},{notApplied:true});
  expect((await engine.compensate(plan.id,context)).status).toBe('compensated');
  expect(order).toEqual(['marketing.audience.prepare','marketing.content.prepare','marketing.campaign.plan']);
});
it('certifies sandbox samples and binds a configured Adobe SDK implementation',async()=>{
  const {context}=await setup(); const manifest=referenceManifests()[0];
  const report=await certifyConnector(manifest,new FixtureConnectorTransport(manifest),context,[{capability:'crm.accounts.search',input:lifecycleInputs('x').inputs['crm.accounts.search']}]); expect(report[0].passed).toBe(true);
  await expect(certifyConnector(manifest,new FixtureConnectorTransport(manifest),context,[{capability:'crm.tasks.create',input:{subject:'Follow up',accountId:'one',dueDate:'2026-10-20'}}])).rejects.toMatchObject({code:'POLICY'});
  const configured=createVendorConnector({connectorId:'adobe-aem',endpoint:'https://aem.example.com/api/',apiVersion:'configured-by-host',transport:'rest',scopes:[]},async()=>({id:'aem-asset-one'}));
  const [provider]=await bindConnector(configured.manifest,configured.transport,{connectorIds:['adobe-aem'],endpoints:['https://aem.example.com/api/']});
  expect((await provider.execute({name:'Campaign brief',projectId:'proj-1'},context,'key')).objectId).toBe('aem-asset-one');
});

it('rejects malformed connector manifests and schemas before discovery',()=>{
  const manifest=referenceManifests()[0];
  expect(()=>defineConnector({...manifest,auth:{type:'invalid' as any,scopes:[]}})).toThrow();
  expect(()=>defineConnector({...manifest,capabilities:{'crm.accounts.search':{...manifest.capabilities['crm.accounts.search'],effects:'unknown' as any}}})).toThrow();
  expect(()=>defineConnector({...manifest,capabilities:{'crm.accounts.search':{...manifest.capabilities['crm.accounts.search'],inputSchema:{type:'invalid' as any}}}})).toThrow();
});
