import { randomUUID } from 'node:crypto';
import type { JSONSchema } from '@genui/core';
import { defineConnector, type ConnectorManifest, type ConnectorTransport, type ToolMapping } from '@genui/connector-sdk';
import { MarketingError, type CapabilityContext } from '@genui/marketing-core';
export const objectSchema = (properties: Record<string, JSONSchema>, required = Object.keys(properties)): JSONSchema => ({ type: 'object', properties, required, additionalProperties: false });
const text: JSONSchema = { type: 'string', minLength: 1 };
export const resultSchema: JSONSchema = {
  type:'object', required:['id'], additionalProperties:false,
  properties:{id:text,mode:{type:'string',enum:['fixture']},status:{type:'string',enum:['prepared','active']},truncated:{type:'boolean'},
    accounts:{type:'array',items:{type:'object',properties:{id:text,name:{type:'string'},industry:{type:'string'},eligible:{type:'boolean'},consent:{type:'boolean'}},required:['id'],additionalProperties:false}},
    opportunities:{type:'array',items:{type:'object',properties:{id:text,name:{type:'string'},stage:{type:'string'},amount:{anyOf:[{type:'number'},{type:'null'}]}},required:['id'],additionalProperties:false}},
    metrics:{type:'object',patternProperties:{'^[a-zA-Z][a-zA-Z0-9_]*$':{type:'number'}},additionalProperties:false}
  }
};
export interface CapabilitySpec { id: string; description: string; platform: string; connector: string; dependencies: string[]; input: JSONSchema; effects: 'read' | 'write' | 'external'; approval: boolean; license: string }
export const lifecycle: CapabilitySpec[] = [
  { id: 'crm.accounts.search', description: 'Retrieve eligible target accounts', platform: 'salesforce', connector: 'salesforce-crm', dependencies: [], input: objectSchema({ industry: text, limit: { type: 'integer', minimum: 1, maximum: 20 }, consentVerified: { type: 'boolean', const: true }, eligibilityVerified: { type: 'boolean', const: true } }), effects: 'read', approval: false, license: 'salesforce.crm' },
  { id: 'marketing.campaign.plan', description: 'Establish campaign project and milestones', platform: 'workfront', connector: 'adobe-workfront', dependencies: ['crm.accounts.search'], input: objectSchema({ name: text, accountSetId: text }), effects: 'write', approval: false, license: 'workfront.projects' },
  { id: 'marketing.content.prepare', description: 'Prepare creative brief and content requests', platform: 'aem', connector: 'adobe-aem', dependencies: ['marketing.campaign.plan'], input: objectSchema({ name: text, projectId: text }), effects: 'write', approval: false, license: 'aem.assets' },
  { id: 'marketing.audience.prepare', description: 'Prepare an eligible AEP audience without requiring RT-CDP', platform: 'aep', connector: 'adobe-aep', dependencies: ['crm.accounts.search', 'marketing.campaign.plan'], input: objectSchema({ accountSetId: text, projectId: text, consentVerified: { type: 'boolean', const: true } }), effects: 'write', approval: false, license: 'aep.segmentation' },
  { id: 'marketing.journey.prepare', description: 'Prepare journey draft for review', platform: 'ajo', connector: 'adobe-ajo', dependencies: ['marketing.content.prepare', 'marketing.audience.prepare'], input: objectSchema({ assetId: text, audienceId: text }), effects: 'write', approval: false, license: 'ajo.journeys' },
  { id: 'marketing.journey.activate', description: 'Activate reviewed journey', platform: 'ajo', connector: 'adobe-ajo', dependencies: ['marketing.journey.prepare'], input: objectSchema({ journeyId: text }), effects: 'external', approval: true, license: 'ajo.activation' },
  { id: 'marketing.analytics.report', description: 'Read campaign performance report', platform: 'cja', connector: 'adobe-cja', dependencies: ['marketing.journey.activate'], input: objectSchema({ journeyId: text }), effects: 'read', approval: false, license: 'cja.reports' }
];
export function lifecycleInputs(name: string) {
  return {
    inputs: { 'crm.accounts.search': { industry: 'Finance', limit: 20, consentVerified: true, eligibilityVerified: true }, 'marketing.campaign.plan': { name }, 'marketing.content.prepare': { name }, 'marketing.audience.prepare': { consentVerified: true } },
    bindings: {
      'marketing.campaign.plan': { accountSetId: { step: 'crm.accounts.search', field: 'id' } },
      'marketing.content.prepare': { projectId: { step: 'marketing.campaign.plan', field: 'id' } },
      'marketing.audience.prepare': { accountSetId: { step: 'crm.accounts.search', field: 'id' }, projectId: { step: 'marketing.campaign.plan', field: 'id' } },
      'marketing.journey.prepare': { assetId: { step: 'marketing.content.prepare', field: 'id' }, audienceId: { step: 'marketing.audience.prepare', field: 'id' } },
      'marketing.journey.activate': { journeyId: { step: 'marketing.journey.prepare', field: 'id' } },
      'marketing.analytics.report': { journeyId: { step: 'marketing.journey.activate', field: 'id' } }
    }
  };
}
export function mapping(spec: CapabilitySpec): ToolMapping { return { tool: spec.id, inputSchema: spec.input, outputSchema: resultSchema, effects: spec.effects, requiresConfirmation: spec.approval, prerequisites: [spec.license], pagination: spec.id === 'crm.accounts.search' ? 'cursor' : 'none', idempotent: spec.effects === 'read', resultIdField: 'id' }; }
export function referenceManifests(): ConnectorManifest[] {
  return [...new Set([...lifecycle, ...extensionCapabilities].map(s => s.connector))].map(id => {
    const specs = [...lifecycle, ...extensionCapabilities].filter(s => s.connector === id);
    return defineConnector({ id, platform: specs[0].platform, version: '1.0.0', supportedVersions: ['fixture-v1'], transport: { type: 'fixture' }, auth: { type: 'none', scopes: [] }, rateLimit: { calls: 100, windowMs: 60_000 }, capabilities: Object.fromEntries(specs.map(s => [s.id, mapping(s)])) });
  });
}
/** Contract fixture, not a vendor server. Its cache models provider-side idempotency per tenant. */
export class FixtureConnectorTransport implements ConnectorTransport {
  public calls: { tool: string; tenantId: string; key: string }[] = [];
  private results = new Map<string, unknown>();
  constructor(private manifest: ConnectorManifest) {}
  async discover() { return Object.values(this.manifest.capabilities).map(m => ({ name: m.tool, inputSchema: m.inputSchema, outputSchema: m.outputSchema })); }
  async invoke(tool: string, input: Record<string, unknown>, context: CapabilityContext, key: string) {
    if (!Object.values(this.manifest.capabilities).some(m => m.tool === tool)) throw new MarketingError('CONNECTOR', 'Unknown fixture tool');
    const cacheKey = JSON.stringify([context.principal.tenantId, key]);
    if (this.results.has(cacheKey)) return structuredClone(this.results.get(cacheKey));
    this.calls.push({ tool, tenantId: context.principal.tenantId, key });
    const result = { id: `fixture-${this.manifest.platform}-${randomUUID()}`, mode: 'fixture', ...tool.includes('accounts') ? { accounts: Array.from({ length: Number(input.limit) }, (_, index) => ({ id: `account-${index + 1}`, industry: input.industry, eligible: true, consent: true })) } : tool.includes('analytics') ? { metrics: { impressions: 24000, engagedAccounts: 14, opportunities: 3 } } : { status: tool.endsWith('activate') ? 'active' : 'prepared' } };
    this.results.set(cacheKey, result); return structuredClone(result);
  }
}
export type AuthHeaders = (context: CapabilityContext) => Promise<Record<string, string>>;
/** Salesforce REST API normalization. The host supplies its OAuth token via headers, never the manifest. */
export function salesforceCRM(endpoint: string, auth: AuthHeaders, request: typeof fetch = fetch, apiVersion = 'v64.0'): { manifest: ConnectorManifest; transport: ConnectorTransport } {
  const base = new URL(endpoint); if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new MarketingError('CONNECTOR', 'Salesforce instance root must be HTTPS');
  if (!/^v\d+\.0$/.test(apiVersion)) throw new MarketingError('CONNECTOR', 'Invalid Salesforce API version');
  const specs = [lifecycle[0], ...extensionCapabilities.filter(s=>s.connector==='salesforce-crm')];
  const manifest = defineConnector({ id: 'salesforce-crm', platform: 'salesforce', version: '1.0.0', supportedVersions: [apiVersion], transport: { type: 'rest', endpoint }, auth: { type: 'oauth2', scopes: ['api'] }, rateLimit: { calls: 50, windowMs: 60_000 }, capabilities: Object.fromEntries(specs.map(spec=>[spec.id,{...mapping(spec),pagination:'none'}])) });
  const escapeSOQL = (value: unknown) => String(value).replaceAll('\\','\\\\').replaceAll("'","\\'");
  return { manifest, transport: {
    async discover() { return specs.map(spec=>({name:spec.id,inputSchema:spec.input,outputSchema:resultSchema})); },
    async invoke(tool, input, context) {
      const spec=specs.find(s=>s.id===tool); if(!spec) throw new MarketingError('CONNECTOR','Unknown Salesforce operation');
      const {validate}=await import('@genui/schema'); validate(spec.input,input);
      if(tool==='crm.accounts.search'&&(input.consentVerified!==true||input.eligibilityVerified!==true)) throw new MarketingError('POLICY','Eligibility and consent must be verified');
      let path='query'; let body: Record<string,unknown>|undefined;
      const url=new URL(`/services/data/${apiVersion}/${path}`,base);
      if(tool==='crm.accounts.search') url.searchParams.set('q',`SELECT Id, Name, Industry FROM Account WHERE Industry = '${escapeSOQL(input.industry)}' ORDER BY Name LIMIT ${Number(input.limit)}`);
      else if(tool==='crm.opportunities.list') url.searchParams.set('q',`SELECT Id, Name, StageName, Amount FROM Opportunity WHERE AccountId = '${escapeSOQL(input.accountId)}' ORDER BY LastModifiedDate DESC LIMIT 200`);
      else {
        const object=tool==='crm.tasks.create'?'Task':'Campaign'; url.pathname=`/services/data/${apiVersion}/sobjects/${object}`;
        body=tool==='crm.tasks.create'?{Subject:input.subject,WhatId:input.accountId,ActivityDate:input.dueDate}:{Name:input.name};
      }
      const response=await request(url,{method:body?'POST':'GET',headers:{...await auth(context),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:context.signal,redirect:'error'});
      if(!response.ok) throw new MarketingError('CONNECTOR',`Salesforce HTTP ${response.status}`,!body&&(response.status===429||response.status>=500));
      const result=await response.json() as Record<string,unknown>;
      if(body) { if(typeof result.id!=='string'||result.success!==true) throw new MarketingError('CONNECTOR','Unexpected Salesforce write response'); return {id:result.id,status:'prepared'}; }
      const records=result.records;
      if(!Array.isArray(records)||records.some(r=>!r||typeof r.Id!=='string')) throw new MarketingError('CONNECTOR','Unexpected Salesforce query response');
      if(tool==='crm.accounts.search') return {id:`salesforce-accountset-${context.correlationId}`,accounts:records.map(r=>({id:r.Id,name:r.Name,industry:r.Industry}))};
      return {id:`salesforce-opportunities-${context.correlationId}`,opportunities:records.map(r=>({id:r.Id,name:r.Name,stage:r.StageName,amount:r.Amount})),truncated:result.done===false};
    }
  } };
}
/** Workfront REST project creation. Business owners/milestones may be added by a host-specific adapter. */
export function workfrontProjects(endpoint: string, auth: AuthHeaders, request: typeof fetch = fetch): { manifest: ConnectorManifest; transport: ConnectorTransport } {
  const url = new URL(endpoint); if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new MarketingError('CONNECTOR', 'Workfront instance root must be HTTPS');
  const spec = lifecycle[1];
  const manifest = defineConnector({ id: 'adobe-workfront', platform: 'workfront', version: '1.0.0', supportedVersions: ['v19.0'], transport: { type: 'rest', endpoint }, auth: { type: 'oauth2', scopes: [] }, rateLimit: { calls: 30, windowMs: 60_000 }, capabilities: { [spec.id]: mapping(spec) } });
  return { manifest, transport: {
    async discover() { return [{ name: spec.id, inputSchema: spec.input, outputSchema: resultSchema }]; },
    async invoke(tool, input, context) {
      if (tool !== spec.id) throw new MarketingError('CONNECTOR', 'Unknown Workfront operation');
      const response = await request(new URL('/attask/api/v19.0/proj', url), { method: 'POST', headers: { ...await auth(context), 'Content-Type': 'application/json' }, redirect: 'error', signal: context.signal, body: JSON.stringify({ name: input.name, description: `GenUI account set: ${input.accountSetId}` }) });
      if (!response.ok) throw new MarketingError('CONNECTOR', `Workfront HTTP ${response.status}`);
      const result = await response.json() as { data?: { ID?: string } }; if (!result.data?.ID) throw new MarketingError('CONNECTOR', 'Unexpected Workfront response');
      return { id: result.data.ID, status: 'prepared' };
    }
  } };
}

/** Separate capabilities avoid pretending that vendor tools with similar names have equivalent semantics. */
export const extensionCapabilities: CapabilitySpec[] = [
  {id:'crm.opportunities.list',description:'List opportunities for a CRM account',platform:'salesforce',connector:'salesforce-crm',dependencies:[],input:objectSchema({accountId:text}),effects:'read',approval:false,license:'salesforce.crm'},
  {id:'crm.tasks.create',description:'Create a sales follow-up task',platform:'salesforce',connector:'salesforce-crm',dependencies:[],input:objectSchema({subject:text,accountId:text,dueDate:{type:'string',format:'date'}}),effects:'write',approval:false,license:'salesforce.crm'},
  {id:'crm.campaigns.create',description:'Create a Salesforce Campaign record',platform:'salesforce',connector:'salesforce-crm',dependencies:[],input:objectSchema({name:text}),effects:'write',approval:false,license:'salesforce.crm'},
  {id:'marketing.creative.request',description:'Request creative production',platform:'genstudio',connector:'adobe-genstudio',dependencies:[],input:objectSchema({brief:text}),effects:'write',approval:false,license:'genstudio.creative'},
  {id:'marketing.cloud.journey.prepare',description:'Prepare a licensed Marketing Cloud journey',platform:'salesforce-marketing-cloud',connector:'salesforce-marketing-cloud',dependencies:[],input:objectSchema({name:text,audienceId:text}),effects:'write',approval:false,license:'salesforce.marketing-cloud'},
  {id:'integration.records.read',description:'Read normalized custom integration records',platform:'custom',connector:'generic-mcp',dependencies:[],input:objectSchema({query:text}),effects:'read',approval:false,license:'custom.integration'}
];
export type NormalizedVendorCall = (tool: string, input: Record<string,unknown>, context: CapabilityContext, idempotencyKey: string) => Promise<Record<string,unknown>>;
/** Bind any licensed vendor SDK, REST or GraphQL implementation without changes to the kernel. */
export function createVendorConnector(config: { connectorId: string; endpoint: string; apiVersion: string; transport: 'rest' | 'graphql' | 'mcp'; scopes: string[] }, invoke: NormalizedVendorCall) {
  const specs=[...lifecycle,...extensionCapabilities].filter(s=>s.connector===config.connectorId);
  if (!specs.length) throw new MarketingError('CONNECTOR','Unknown reference connector; define a third-party manifest instead');
  const manifest=defineConnector({id:config.connectorId,platform:specs[0].platform,version:'1.0.0',supportedVersions:[config.apiVersion],transport:{type:config.transport,endpoint:config.endpoint},auth:{type:'oauth2',scopes:config.scopes},rateLimit:{calls:50,windowMs:60_000},capabilities:Object.fromEntries(specs.map(s=>[s.id,mapping(s)]))});
  const transport: ConnectorTransport={async discover(){return Object.values(manifest.capabilities).map(m=>({name:m.tool,inputSchema:m.inputSchema,outputSchema:m.outputSchema}));},invoke};
  return {manifest,transport};
}
export interface CertificationCase { capability: string; input: Record<string,unknown> }
/** Explicitly invokes supplied samples. Use sandbox tenants; write tests require allowWrites. */
export async function certifyConnector(manifest: ConnectorManifest, transport: ConnectorTransport, context: CapabilityContext, samples: CertificationCase[], allowWrites = false) {
  const {bindConnector}=await import('@genui/connector-sdk');
  const providers=await bindConnector(manifest,transport,{connectorIds:[manifest.id],endpoints:manifest.transport.endpoint?[manifest.transport.endpoint]:[],allowFixtures:manifest.transport.type==='fixture'});
  const report: {capability:string;passed:boolean;code?:string}[]=[];
  for (const sample of samples) {
    const map=manifest.capabilities[sample.capability];
    if (!map || map.effects!=='read'&&!allowWrites) throw new MarketingError('POLICY','Certification writes require explicit sandbox opt-in');
    try { const provider=providers.find(p=>p.tool===map.tool)!; await provider.execute(sample.input,context,`certification:${randomUUID()}`); report.push({capability:sample.capability,passed:true}); }
    catch(error) { report.push({capability:sample.capability,passed:false,code:error instanceof MarketingError?error.code:'VALIDATION_OR_EXECUTION'}); }
  }
  return report;
}
