import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { validate } from '@genui/schema';
import { GenUIError } from '@genui/core';
import { MarketingError } from '@genui/marketing-core';
import { defineConnector } from '@genui/connector-sdk';
import { lifecycleInputs } from '@genui/marketing-connectors';
import { Pool, migrate, PostgresWorkflowStore } from '@genui/registry-postgres';
import {RetrievalError} from '@genui/retrieval-core';
import {createStudioRAG} from './rag.js';
import {loadConversationSeeds} from './conversation-seeds.js';
import { createReferenceSystem } from './reference.js';
const pool = process.env.STUDIO_DATABASE_URL ? new Pool({ connectionString: process.env.STUDIO_DATABASE_URL }) : undefined;
if (pool) await migrate(pool);
const system = await createReferenceSystem(pool ? new PostgresWorkflowStore(pool) : undefined);
const rag=await createStudioRAG(system.registry,system.context,pool,process.env.STUDIO_RAG_HYBRID_FIXTURE==='1');
const conversationSeeds=loadConversationSeeds();
const storage = pool ? 'postgresql' : 'memory';
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  try {
    const path = req.url ?? '';
    if (req.method === 'GET' && path === '/api/health') { res.end(JSON.stringify({ status: 'ok', storage, mode: 'fixture', retrieval:rag.mode })); return; }
    if (req.method === 'GET' && path === '/api/catalog') {
      res.end(JSON.stringify({ mode: 'fixture', storage, connectors: system.manifests, capabilities: system.registry.list().map(c => ({ ...c, providers: c.providers.map(p => ({ id: p.id, platform: p.platform, tool: p.tool, version: p.version })) })), retrieval:{mode:rag.mode,embeddingModel:rag.embeddingModel}, identity: { principal: system.context.principal, mappings: system.context.identities } })); return;
    }
    if(req.method==='GET' && path==='/api/conversation-seeds'){res.end(JSON.stringify(conversationSeeds.catalog()));return;}
    if(req.method==='GET' && path.startsWith('/api/conversation-seeds/')){
      const preview=conversationSeeds.preview(decodeURIComponent(path.slice('/api/conversation-seeds/'.length)));
      if(!preview){res.statusCode=404;res.end(JSON.stringify({error:'Unknown conversation seed'}));return;}
      res.end(JSON.stringify(preview));return;
    }
    if (req.method === 'GET' && path === '/api/runs') { res.end(JSON.stringify(await system.engine.store.list(system.context.principal.tenantId))); return; }
    if (req.method !== 'POST' || !['/api/plan', '/api/chat', '/api/resume', '/api/approve', '/api/reject', '/api/validate-connector','/v1/retrieval/search','/v1/ui/compose','/v1/ui/validate'].includes(path)) { res.statusCode = 404; res.end('{}'); return; }
    if (req.headers.origin && !['http://localhost:5174', 'http://127.0.0.1:5174'].includes(req.headers.origin)) { res.statusCode = 403; res.end('{}'); return; }
    let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 65_536) { res.statusCode = 413; res.end('{}'); return; } }
    const body = JSON.parse(text); let result: unknown;
    if(path==='/v1/retrieval/search'||path==='/v1/ui/compose'){
      validate({type:'object',properties:{query:{type:'string',minLength:1,maxLength:2000}},required:['query'],additionalProperties:false},body);
      result=path==='/v1/retrieval/search'?await rag.retrieval.search(await rag.scope(system.context),{query:body.query,limit:12}):await rag.compose(body.query,system.context);
    }else if(path==='/v1/ui/validate'){
      validate({type:'object',additionalProperties:false,required:['capabilityId','capabilityVersion','input'],properties:{capabilityId:{type:'string'},capabilityVersion:{type:'string'},input:{type:'object'}}},body);
      const scope=await rag.scope(system.context);const cap=system.registry.get(body.capabilityId);
      if(!scope.capabilities.some(c=>c.id===cap.id&&c.version===body.capabilityVersion))throw new MarketingError('POLICY','Capability binding is no longer authorized');
      validate(cap.inputSchema,body.input);result={valid:true,capabilityId:cap.id,capabilityVersion:cap.version,executed:false};
    }else if (path === '/api/chat') {
      validate({type:'object',properties:{message:{type:'string',minLength:1,maxLength:1000},consentVerified:{type:'boolean',const:true},eligibilityVerified:{type:'boolean',const:true}},required:['message','consentVerified','eligibilityVerified'],additionalProperties:false},body);
      if (!/campaign|journey/i.test(body.message)) throw new MarketingError('GRAPH','This reference intent handler supports campaign and journey planning.');
      const count=Number(/top\s+(\d+)/i.exec(body.message)?.[1]??20);
      if (count<1||count>20) throw new MarketingError('GRAPH','Reference targeting supports 1..20 accounts.');
      const args=lifecycleInputs('Finance campaign from conversation'); args.inputs['crm.accounts.search'].limit=count;
      const context={...system.context,correlationId:randomUUID()};
      const plan=await system.planner.plan(['marketing.analytics.report'],context,args.inputs,args.bindings);
      const generatedUI=await rag.compose(body.message,system.context,plan.steps.map(step=>step.capability));
      const run=await system.engine.create(plan,context);
      result={run,ui:generatedUI,message:`Prepared a ${run.plan.steps.length}-stage plan for ${count} eligible finance accounts. No provider operations executed. Review the plan before starting; activation requires an independent approval.`};
    } else if (path === '/api/plan') {
      validate({ type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 200 }, consentVerified: { type: 'boolean', const: true }, eligibilityVerified: { type: 'boolean', const: true } }, required: ['name', 'consentVerified', 'eligibilityVerified'], additionalProperties: false }, body);
      const args = lifecycleInputs(body.name); const context = { ...system.context, correlationId: randomUUID() };
      const plan = await system.planner.plan(['marketing.analytics.report'], context, args.inputs, args.bindings);
      result = await system.engine.create(plan, context);
    } else if (path === '/api/validate-connector') {
      // Validates structure only. Untrusted manifests are never registered or executed by this demo endpoint.
      const manifest = defineConnector(body); result = { valid: true, id: manifest.id, registered: false };
    } else {
      validate({ type: 'object', properties: { id: { type: 'string', minLength: 1 } }, required: ['id'], additionalProperties: false }, body);
      result = path === '/api/reject' ? await system.engine.reject(body.id, system.reviewer) : path === '/api/approve' ? await system.engine.approve(body.id, system.reviewer) : await system.engine.resume(body.id, system.context);
    }
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error instanceof MarketingError && ['POLICY', 'APPROVAL'].includes(error.code) ? 403 : error instanceof MarketingError && error.code === 'CONFLICT' ? 409 : 400;
    res.end(JSON.stringify({ error: error instanceof MarketingError || error instanceof GenUIError || error instanceof RetrievalError ? error.message : 'Invalid request or operation failed', code: error instanceof MarketingError || error instanceof GenUIError || error instanceof RetrievalError ? error.code : 'REQUEST' }));
  }
});
server.listen(3002, '127.0.0.1', () => console.log(`GenUI Studio API ready; ${storage} storage; fixture providers only`));
async function close() { server.close(); await system.gateway.close(); await pool?.end(); }
process.on('SIGTERM', () => { void close(); }); process.on('SIGINT', () => { void close(); });
