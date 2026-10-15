import type { JSONSchema } from '@genui/core';
import { validate, assertSchema } from '@genui/schema';
import { MarketingError, PolicyEngine, type CapabilityContext, type CapabilityProvider, type Effect, type ProviderResult } from '@genui/marketing-core';
export interface ToolMapping {
  tool: string; inputSchema: JSONSchema; outputSchema: JSONSchema; effects: Effect;
  requiresConfirmation: boolean; prerequisites: string[]; pagination: 'none' | 'cursor';
  idempotent: boolean; resultIdField: string;
}
export interface ConnectorManifest {
  id: string; platform: string; version: string; supportedVersions: string[];
  transport: { type: 'mcp' | 'rest' | 'graphql' | 'fixture'; endpoint?: string };
  auth: { type: 'oauth2' | 'bearer' | 'none'; scopes: string[] };
  rateLimit: { calls: number; windowMs: number };
  capabilities: Record<string, ToolMapping>;
}
const manifestSchema: JSONSchema = {
  type:'object',additionalProperties:false,required:['id','platform','version','supportedVersions','transport','auth','rateLimit','capabilities'],
  properties:{
    id:{type:'string',pattern:'^[a-z][a-z0-9-]+$'},platform:{type:'string',minLength:1},version:{type:'string',pattern:'^\\d+\\.\\d+\\.\\d+$'},
    supportedVersions:{type:'array',minItems:1,items:{type:'string',minLength:1}},
    transport:{type:'object',additionalProperties:false,required:['type'],properties:{type:{type:'string',enum:['mcp','rest','graphql','fixture']},endpoint:{type:'string',minLength:1}}},
    auth:{type:'object',additionalProperties:false,required:['type','scopes'],properties:{type:{type:'string',enum:['oauth2','bearer','none']},scopes:{type:'array',items:{type:'string'}}}},
    rateLimit:{type:'object',additionalProperties:false,required:['calls','windowMs'],properties:{calls:{type:'integer',minimum:1,maximum:1000000},windowMs:{type:'integer',minimum:1,maximum:86400000}}},
    capabilities:{type:'object',minProperties:1,propertyNames:{pattern:'^[a-z][a-z0-9.]+$'},patternProperties:{'.*':{
      type:'object',additionalProperties:false,required:['tool','inputSchema','outputSchema','effects','requiresConfirmation','prerequisites','pagination','idempotent','resultIdField'],
      properties:{tool:{type:'string',minLength:1},inputSchema:{type:'object'},outputSchema:{type:'object'},effects:{type:'string',enum:['read','write','external']},requiresConfirmation:{type:'boolean'},prerequisites:{type:'array',items:{type:'string'}},pagination:{type:'string',enum:['none','cursor']},idempotent:{type:'boolean'},resultIdField:{type:'string',minLength:1}}
    }},additionalProperties:false}
  }
};
export function defineConnector(manifest: ConnectorManifest): ConnectorManifest {
  validate(manifestSchema,manifest);
  if (!/^[a-z][a-z0-9-]+$/.test(manifest.id) || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new MarketingError('CONNECTOR', 'Invalid connector identity/version');
  if (!manifest.supportedVersions.length || !manifest.platform || !Object.keys(manifest.capabilities).length) throw new MarketingError('CONNECTOR', 'Connector must declare versions, platform and capabilities');
  if (!Number.isInteger(manifest.rateLimit.calls) || manifest.rateLimit.calls < 1 || !Number.isFinite(manifest.rateLimit.windowMs) || manifest.rateLimit.windowMs < 1) throw new MarketingError('CONNECTOR', 'Invalid rate limits');
  for (const mapping of Object.values(manifest.capabilities)) {
    if (!mapping.tool || !mapping.resultIdField || mapping.effects === 'external' && !mapping.requiresConfirmation) throw new MarketingError('CONNECTOR', 'Incomplete or unsafe capability mapping');
    assertSchema(mapping.inputSchema); assertSchema(mapping.outputSchema);
  }
  return structuredClone(manifest);
}
export interface DiscoveredTool { name: string; inputSchema: JSONSchema; outputSchema?: JSONSchema }
export interface ConnectorTransport {
  discover(): Promise<DiscoveredTool[]>;
  invoke(tool: string, input: Record<string, unknown>, context: CapabilityContext, idempotencyKey: string): Promise<unknown>;
  close?(): Promise<void>;
}
export interface ConnectorTrust { connectorIds: string[]; endpoints: string[]; allowFixtures?: boolean }
export function assertTrusted(manifest: ConnectorManifest, trust: ConnectorTrust): void {
  if (!trust.connectorIds.includes(manifest.id)) throw new MarketingError('CONNECTOR', 'Connector is not trusted');
  if (manifest.transport.type === 'fixture') { if (!trust.allowFixtures) throw new MarketingError('CONNECTOR', 'Fixtures are disabled'); return; }
  const endpoint = manifest.transport.endpoint;
  if (!endpoint || !trust.endpoints.includes(endpoint)) throw new MarketingError('CONNECTOR', 'Endpoint is not explicitly trusted');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new MarketingError('CONNECTOR', 'A credential-free HTTPS endpoint is required');
}
// Descriptions and annotations from remote tools are not used for policy or model instructions.
export async function bindConnector(manifest: ConnectorManifest, transport: ConnectorTransport, trust: ConnectorTrust): Promise<CapabilityProvider[]> {
  manifest = defineConnector(manifest); assertTrusted(manifest, trust);
  const tools = await transport.discover(); const policy = new PolicyEngine();
  for (const mapping of Object.values(manifest.capabilities)) {
    const tool = tools.find(t => t.name === mapping.tool);
    if (!tool) throw new MarketingError('CONNECTOR', `Missing mapped tool: ${mapping.tool}`);
    const stable = (v: unknown): string => JSON.stringify(v, (_k, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
    if (stable(tool.inputSchema) !== stable(mapping.inputSchema) || tool.outputSchema && stable(tool.outputSchema) !== stable(mapping.outputSchema)) throw new MarketingError('CONNECTOR', `Schema drift: ${mapping.tool}`);
  }
  const buckets = new Map<string, { start: number; count: number }>();
  return Object.entries(manifest.capabilities).map(([capability, mapping]) => ({
    id: `${manifest.id}:${capability}`, platform: manifest.platform, tool: mapping.tool, version: manifest.version,
    async supports(context: CapabilityContext) {
      try { policy.identity(context, manifest.platform); return mapping.prerequisites.every(p => context.licenses.includes(p)); } catch { return false; }
    },
    async execute(input: Record<string, unknown>, context: CapabilityContext, idempotencyKey: string): Promise<ProviderResult> {
      const identity = policy.identity(context, manifest.platform);
      if (!context.principal.permissions.includes(capability) || !mapping.prerequisites.every(p => context.licenses.includes(p))) throw new MarketingError('POLICY', 'Missing capability permission or license');
      context.signal?.throwIfAborted(); validate(mapping.inputSchema, input);
      const tenant = identity.tenantId; const now = Date.now(); let bucket = buckets.get(tenant);
      if (!bucket || now - bucket.start >= manifest.rateLimit.windowMs) { bucket = { start: now, count: 0 }; buckets.set(tenant, bucket); }
      if (bucket.count >= manifest.rateLimit.calls) throw new MarketingError('RATE_LIMIT', 'Connector rate limit exceeded', true);
      bucket.count++;
      const result = await transport.invoke(mapping.tool, input, context, idempotencyKey);
      validate(mapping.outputSchema, result);
      const record = result as Record<string, unknown>; const objectId = record[mapping.resultIdField];
      if (typeof objectId !== 'string' || !objectId) throw new MarketingError('CONNECTOR', 'Provider did not return an object identifier');
      return { objectId, platform: manifest.platform, correlationId: context.correlationId, data: record };
    }
  }));
}
export interface HttpOperation { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; path: string; query?: string }
/** Credentials are obtained just-in-time and never stored in the manifest or registry. */
export class HttpConnectorTransport implements ConnectorTransport {
  private endpoint: URL;
  constructor(private manifest: ConnectorManifest, private operations: Record<string, HttpOperation>, private headers: (context: CapabilityContext) => Promise<Record<string, string>>, private request: typeof fetch = fetch) {
    if (!manifest.transport.endpoint) throw new MarketingError('CONNECTOR', 'Endpoint required');
    this.endpoint = new URL(manifest.transport.endpoint);
    if (this.endpoint.protocol !== 'https:' || this.endpoint.username || this.endpoint.password) throw new MarketingError('CONNECTOR', 'HTTPS endpoint required');
  }
  async discover() { return Object.values(this.manifest.capabilities).map(m => ({ name: m.tool, inputSchema: m.inputSchema, outputSchema: m.outputSchema })); }
  async invoke(tool: string, input: Record<string, unknown>, context: CapabilityContext, key: string): Promise<unknown> {
    const operation = this.operations[tool]; if (!operation) throw new MarketingError('CONNECTOR', 'Operation is not mapped');
    const url = new URL(operation.path, this.endpoint);
    if (url.origin !== this.endpoint.origin || !url.pathname.startsWith(this.endpoint.pathname)) throw new MarketingError('CONNECTOR', 'Operation escapes configured endpoint');
    if (operation.method === 'GET') for (const [key, value] of Object.entries(input)) url.searchParams.set(key, String(value));
    const response = await this.request(url, { method: operation.method, redirect: 'error', signal: context.signal ? AbortSignal.any([context.signal,AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000), headers: { ...await this.headers(context), 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: operation.method === 'GET' ? undefined : JSON.stringify(operation.query ? { query: operation.query, variables: input } : input) });
    if (!response.ok) throw new MarketingError('CONNECTOR', `Provider HTTP ${response.status}`, response.status === 429 || response.status >= 500);
    const text = await response.text(); if (text.length > 1_000_000) throw new MarketingError('CONNECTOR', 'Provider response too large');
    try { const result = JSON.parse(text); if (operation.query) { if (result.errors) throw new Error(); return result.data; } return result; } catch { throw new MarketingError('CONNECTOR', 'Invalid provider response'); }
  }
}
