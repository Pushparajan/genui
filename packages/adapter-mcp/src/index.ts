import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { JSONSchema } from '@genui/core';
import type { ConnectorTransport, DiscoveredTool } from '@genui/connector-sdk';
import type { CapabilityContext } from '@genui/marketing-core';
import { MarketingError } from '@genui/marketing-core';
/** One authenticated MCP client per tenant/principal. No tool-provided prompts enter the planner. */
export class MCPConnectorTransport implements ConnectorTransport {
  constructor(private client: Client, private tenantId: string, private principalId: string) {}
  static async connect(endpoint: string, allowedEndpoints: string[], context: CapabilityContext, headers: Record<string, string> = {}) {
    const url = new URL(endpoint);
    if (!allowedEndpoints.includes(endpoint) || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new MarketingError('CONNECTOR', 'MCP endpoint must be explicitly trusted HTTPS');
    const client = new Client({ name: 'genui-gateway', version: '0.1.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers, redirect: 'error' } });
    try { await client.connect(transport); } catch { await client.close(); throw new MarketingError('CONNECTOR', 'MCP connection failed'); }
    return new MCPConnectorTransport(client, context.principal.tenantId, context.principal.id);
  }
  async discover(): Promise<DiscoveredTool[]> {
    const tools: DiscoveredTool[] = []; let cursor: string | undefined; const seen = new Set<string>();
    for (let page = 0; page < 100; page++) {
      const result = await this.client.listTools(cursor ? { cursor } : undefined);
      tools.push(...result.tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema as JSONSchema, outputSchema: tool.outputSchema as JSONSchema | undefined })));
      if (!result.nextCursor) return tools;
      if (seen.has(result.nextCursor)) throw new MarketingError('CONNECTOR', 'MCP discovery cursor loop');
      seen.add(result.nextCursor); cursor = result.nextCursor;
    }
    throw new MarketingError('CONNECTOR', 'MCP discovery page limit exceeded');
  }
  async invoke(tool: string, input: Record<string, unknown>, context: CapabilityContext, idempotencyKey: string) {
    if (context.principal.tenantId !== this.tenantId || context.principal.id !== this.principalId) throw new MarketingError('POLICY', 'MCP client identity mismatch');
    context.signal?.throwIfAborted();
    let result;
    try { result = await this.client.callTool({ name: tool, arguments: input, _meta: { 'genui/idempotencyKey': idempotencyKey, 'genui/correlationId': context.correlationId } }, { signal: context.signal, timeout: 30_000 }); }
    catch { throw new MarketingError('CONNECTOR', 'MCP invocation failed; reconcile possible side effects'); }
    if (result.isError) throw new MarketingError('CONNECTOR', 'MCP tool reported a failure');
    if (JSON.stringify(result).length > 1_000_000) throw new MarketingError('CONNECTOR', 'MCP result too large');
    if (result.structuredContent) return result.structuredContent;
    const texts = result.content.filter(c => c.type === 'text');
    if (texts.length === 1 && texts[0].type === 'text') { try { return JSON.parse(texts[0].text); } catch {} }
    throw new MarketingError('CONNECTOR', 'A normalized structured MCP result is required');
  }
  async close() { await this.client.close(); }
}
