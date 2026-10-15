import { CapabilityRegistry, CapabilityPlanner, type CapabilityContext } from '@genui/marketing-core';
import { MCPGateway } from '@genui/mcp-gateway';
import { lifecycle, extensionCapabilities, referenceManifests, FixtureConnectorTransport, resultSchema } from '@genui/marketing-connectors';
import { WorkflowEngine, MemoryWorkflowStore, type WorkflowStore } from '@genui/workflow-engine';
export async function createReferenceSystem(store: WorkflowStore = new MemoryWorkflowStore()) {
  const manifests = referenceManifests();
  const gateway = new MCPGateway({ connectorIds: manifests.map(m => m.id), endpoints: [], allowFixtures: true });
  const registry = new CapabilityRegistry(); const transports = new Map<string, FixtureConnectorTransport>(); const providers = [];
  for (const manifest of manifests) { const transport = new FixtureConnectorTransport(manifest); transports.set(manifest.id, transport); providers.push(...await gateway.register(manifest, transport)); }
  for (const spec of [...lifecycle,...extensionCapabilities]) registry.register({ id: spec.id, version: '1.0.0', description: spec.description, inputSchema: spec.input, outputSchema: resultSchema, effects: spec.effects, requiresConfirmation: spec.approval, dependencies: spec.dependencies, providers: providers.filter(p => p.tool === spec.id), retry: { maxAttempts: spec.effects === 'read' ? 3 : 1, idempotent: spec.effects === 'read' } });
  const context: CapabilityContext = { principal: { id: 'demo-requester', tenantId: 'demo-tenant', roles: ['marketer'], permissions: [...[...lifecycle,...extensionCapabilities].map(s => s.id), 'workflow.compensate'] }, enabledPlatforms: [...new Set(manifests.map(m => m.platform))], licenses: [...lifecycle,...extensionCapabilities].map(s => s.license), identities: manifests.map(m => ({ platform: m.platform, subject: `fixture-${m.platform}-user`, tenantId: 'demo-tenant' })), correlationId: 'studio-demo' };
  const reviewer: CapabilityContext = { ...context, principal: { ...context.principal, id: 'demo-reviewer', roles: ['approver'] } };
  return { registry, manifests, transports, context, reviewer, planner: new CapabilityPlanner(registry), engine: new WorkflowEngine(registry, store), gateway };
}
