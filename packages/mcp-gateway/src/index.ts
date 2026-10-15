import { bindConnector, type ConnectorManifest, type ConnectorTransport, type ConnectorTrust } from '@genui/connector-sdk';
import type { CapabilityProvider } from '@genui/marketing-core';
export { MCPConnectorTransport } from '@genui/adapter-mcp';
export class MCPGateway {
  private transports: ConnectorTransport[] = [];
  private ids = new Set<string>();
  constructor(private trust: ConnectorTrust) {}
  async register(manifest: ConnectorManifest, transport: ConnectorTransport): Promise<CapabilityProvider[]> {
    if (this.ids.has(manifest.id)) throw new Error('Connector already registered in this tenant gateway');
    const providers = await bindConnector(manifest, transport, this.trust);
    this.ids.add(manifest.id); this.transports.push(transport); return providers;
  }
  async close(): Promise<void> { const results = await Promise.allSettled(this.transports.map(t => t.close?.())); this.transports = []; this.ids.clear(); if (results.some(r => r.status === 'rejected')) throw new Error('Connector cleanup failed'); }
}
