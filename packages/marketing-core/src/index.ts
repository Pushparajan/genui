import { randomUUID } from 'node:crypto';
import type { JSONSchema } from '@genui/core';
import { validate, assertSchema } from '@genui/schema';
export type Effect = 'read' | 'write' | 'external';
export interface Principal { id: string; tenantId: string; roles: string[]; permissions: string[] }
export interface ProviderIdentity { platform: string; subject: string; tenantId: string }
export interface CapabilityContext {
  principal: Principal; enabledPlatforms: string[]; licenses: string[];
  identities: ProviderIdentity[]; correlationId: string; signal?: AbortSignal;
}
export interface ProviderResult { objectId: string; platform: string; correlationId: string; data: Record<string, unknown> }
export interface CapabilityProvider {
  id: string; platform: string; tool: string; version: string;
  supports(context: CapabilityContext): Promise<boolean>;
  execute(input: Record<string, unknown>, context: CapabilityContext, idempotencyKey: string): Promise<ProviderResult>;
  compensate?(result: ProviderResult, context: CapabilityContext, idempotencyKey: string): Promise<void>;
}
export interface MarketingCapability {
  id: string; version: string; description: string; inputSchema: JSONSchema; outputSchema: JSONSchema;
  effects: Effect; requiresConfirmation: boolean; dependencies: string[]; providers: CapabilityProvider[];
  retry: { maxAttempts: number; idempotent: boolean };
}
export class MarketingError extends Error {
  constructor(public code: 'POLICY' | 'MISSING_CAPABILITY' | 'NO_PROVIDER' | 'AMBIGUOUS_PROVIDER' | 'GRAPH' | 'CONFLICT' | 'APPROVAL' | 'RECONCILE' | 'CONNECTOR' | 'RATE_LIMIT', message: string, public retryable = false) { super(message); this.name = 'MarketingError'; }
}
export class PolicyEngine {
  assert(context: CapabilityContext, capability: MarketingCapability): void {
    const { principal } = context;
    if (!principal.id || !principal.tenantId || !principal.permissions.includes(capability.id)) throw new MarketingError('POLICY', `Permission required: ${capability.id}`);
    if (capability.effects === 'external' && !capability.requiresConfirmation) throw new MarketingError('POLICY', 'External effects require approval');
    context.signal?.throwIfAborted();
  }
  identity(context: CapabilityContext, platform: string): ProviderIdentity {
    const identity = context.identities.find(i => i.platform === platform && i.tenantId === context.principal.tenantId);
    if (!context.enabledPlatforms.includes(platform) || !identity) throw new MarketingError('POLICY', `No tenant identity or entitlement for ${platform}`);
    return identity;
  }
  approve(context: CapabilityContext, tenantId: string): void {
    if (context.principal.tenantId !== tenantId || !context.principal.roles.includes('approver')) throw new MarketingError('APPROVAL', 'A tenant approver is required');
  }
}
export class CapabilityRegistry {
  private capabilities = new Map<string, MarketingCapability>();
  register(capability: MarketingCapability): void {
    if (!/^[a-z][a-z0-9.]+$/.test(capability.id) || this.capabilities.has(capability.id)) throw new MarketingError('GRAPH', 'Invalid or duplicate capability');
    if (capability.retry.maxAttempts < 1 || capability.retry.maxAttempts > 5 || !Number.isInteger(capability.retry.maxAttempts)) throw new MarketingError('GRAPH', 'Retry attempts must be 1..5');
    assertSchema(capability.inputSchema); assertSchema(capability.outputSchema);
    this.capabilities.set(capability.id, capability);
  }
  get(id: string): MarketingCapability { const value = this.capabilities.get(id); if (!value) throw new MarketingError('MISSING_CAPABILITY', `Missing capability: ${id}`); return value; }
  list(): MarketingCapability[] { return [...this.capabilities.values()]; }
  provider(capability: string, id: string): CapabilityProvider { const provider = this.get(capability).providers.find(p => p.id === id); if (!provider) throw new MarketingError('NO_PROVIDER', `Provider unavailable: ${id}`); return provider; }
}
export interface InputBinding { step: string; field: string }
export interface PlanStep { capability: string; version: string; provider: string; providerVersion: string; dependencies: string[]; input: Record<string, unknown>; bindings: Record<string, InputBinding>; requiresApproval: boolean }
export interface CampaignPlan { id: string; campaignId: string; tenantId: string; createdBy: string; correlationId: string; steps: PlanStep[] }
export class CapabilityPlanner {
  constructor(private registry: CapabilityRegistry, private policy = new PolicyEngine()) {}
  async plan(targets: string[], context: CapabilityContext, inputs: Record<string, Record<string, unknown>>, bindings: Record<string, Record<string, InputBinding>> = {}, preferences: Record<string, string> = {}): Promise<CampaignPlan> {
    if (!targets.length) throw new MarketingError('GRAPH', 'At least one target is required');
    const visiting = new Set<string>(); const done = new Set<string>(); const steps: PlanStep[] = [];
    const visit = async (id: string) => {
      if (done.has(id)) return;
      if (visiting.has(id)) throw new MarketingError('GRAPH', `Cyclic dependency: ${id}`);
      visiting.add(id); const capability = this.registry.get(id); this.policy.assert(context, capability);
      for (const dep of capability.dependencies) await visit(dep);
      const candidates = [];
      for (const provider of capability.providers) if (await provider.supports(context)) candidates.push(provider);
      const preferred = preferences[id]; const selected = preferred ? candidates.find(p => p.id === preferred) : candidates.length === 1 ? candidates[0] : undefined;
      if (!selected) throw new MarketingError(candidates.length > 1 ? 'AMBIGUOUS_PROVIDER' : 'NO_PROVIDER', `Select an available provider for ${id}`);
      this.policy.identity(context, selected.platform);
      for (const binding of Object.values(bindings[id] ?? {})) if (!capability.dependencies.includes(binding.step)) throw new MarketingError('GRAPH', 'Bindings must reference direct dependencies');
      const input = structuredClone(inputs[id] ?? {});
      if (!Object.keys(bindings[id] ?? {}).length) validate(capability.inputSchema, input);
      steps.push({ capability: id, version: capability.version, provider: selected.id, providerVersion: selected.version, dependencies: [...capability.dependencies], input, bindings: structuredClone(bindings[id] ?? {}), requiresApproval: capability.requiresConfirmation });
      visiting.delete(id); done.add(id);
    };
    for (const target of targets) await visit(target);
    return { id: randomUUID(), campaignId: randomUUID(), tenantId: context.principal.tenantId, createdBy: context.principal.id, correlationId: context.correlationId, steps };
  }
}
export interface Campaign { id: string; tenantId: string; name: string; objective: string; status: 'draft' | 'prepared' | 'active' | 'completed' }
export interface Audience { accountIds: string[]; consentVerified: boolean; eligibilityVerified: boolean }
export interface Asset { campaignId: string; providerId: string; kind: 'brief' | 'content' }
export interface Journey { campaignId: string; providerId: string; status: 'draft' | 'active' }
export interface AnalyticsReport { campaignId: string; metrics: Record<string, number> }
export interface CanonicalIdentity { tenantId: string; campaignId: string; platform: string; objectId: string; capability: string }
export interface NormalizedEvent { id: string; tenantId: string; correlationId: string; type: string; occurredAt: string; metadata: Record<string, string | number | boolean> }

export interface IdentityBinding {
  issuer: string; subject: string; principal: Principal; identities: ProviderIdentity[];
  enabledPlatforms: string[]; licenses: string[];
}
export interface IdentityStore { find(issuer: string, subject: string): Promise<IdentityBinding | undefined> }
