import { randomUUID } from 'node:crypto';
import { validate } from '@genui/schema';
import { CapabilityRegistry, PolicyEngine, MarketingError, type CampaignPlan, type CapabilityContext, type ProviderResult, type NormalizedEvent } from '@genui/marketing-core';
export interface StepState {
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'compensated'; attempts: number;
  operation?: 'execute' | 'compensate'; reconciled?: boolean;
  result?: ProviderResult; error?: { code: string; message: string; recoverable: boolean };
  approval?: { by: string; at: string }; nextRetryAt?: number;
}
export interface WorkflowRun {
  id: string; tenantId: string; revision: number; plan: CampaignPlan;
  status: 'pending' | 'running' | 'awaiting_approval' | 'retrying' | 'completed' | 'failed' | 'reconciliation_required' | 'compensated' | 'rejected';
  steps: Record<string, StepState>; events: NormalizedEvent[]; createdAt: string;
}
export interface WorkflowStore {
  create(run: WorkflowRun): Promise<void>;
  get(tenantId: string, id: string): Promise<WorkflowRun | undefined>;
  list(tenantId: string, statuses?: WorkflowRun['status'][]): Promise<WorkflowRun[]>;
  save(run: WorkflowRun, expectedRevision: number): Promise<void>;
}
export class MemoryWorkflowStore implements WorkflowStore {
  private runs = new Map<string, WorkflowRun>();
  private key(tenant: string, id: string) { return JSON.stringify([tenant, id]); }
  async create(run: WorkflowRun) { const key = this.key(run.tenantId, run.id); if (this.runs.has(key)) throw new MarketingError('CONFLICT', 'Workflow exists'); this.runs.set(key, structuredClone(run)); }
  async get(tenant: string, id: string) { const run = this.runs.get(this.key(tenant, id)); return run ? structuredClone(run) : undefined; }
  async list(tenant: string, statuses?: WorkflowRun['status'][]) { return [...this.runs.values()].filter(r => r.tenantId === tenant && (!statuses || statuses.includes(r.status))).slice(0,100).map(r => structuredClone(r)); }
  async save(run: WorkflowRun, expected: number) { const key = this.key(run.tenantId, run.id); if (this.runs.get(key)?.revision !== expected) throw new MarketingError('CONFLICT', 'Workflow changed concurrently'); run.revision = expected + 1; this.runs.set(key, structuredClone(run)); }
}
export class WorkflowEngine {
  constructor(private registry: CapabilityRegistry, public store: WorkflowStore, private policy = new PolicyEngine()) {}
  private event(run: WorkflowRun, type: string, metadata: NormalizedEvent['metadata'] = {}) { run.events.push({ id: randomUUID(), tenantId: run.tenantId, correlationId: run.plan.correlationId, type, occurredAt: new Date().toISOString(), metadata }); }
  private async save(run: WorkflowRun) { await this.store.save(run, run.revision); }
  private async get(id: string, context: CapabilityContext) { const run = await this.store.get(context.principal.tenantId, id); if (!run) throw new MarketingError('POLICY', 'Workflow not found in tenant'); return run; }
  async create(plan: CampaignPlan, context: CapabilityContext) {
    if (plan.tenantId !== context.principal.tenantId || plan.createdBy !== context.principal.id) throw new MarketingError('POLICY', 'Plan identity mismatch');
    const seen = new Set<string>();
    for (const step of plan.steps) {
      const cap = this.registry.get(step.capability); this.policy.assert(context, cap);
      if (seen.has(cap.id) || cap.dependencies.some(id => !seen.has(id)) || JSON.stringify(cap.dependencies) !== JSON.stringify(step.dependencies)) throw new MarketingError('GRAPH', 'Invalid plan dependencies');
      if (cap.version !== step.version || cap.requiresConfirmation !== step.requiresApproval || this.registry.provider(cap.id, step.provider).version !== step.providerVersion) throw new MarketingError('GRAPH', 'Plan contract drift');
      for (const binding of Object.values(step.bindings)) if (!cap.dependencies.includes(binding.step) || !binding.field || ['__proto__', 'constructor', 'prototype'].includes(binding.field)) throw new MarketingError('GRAPH', 'Invalid input binding');
      seen.add(cap.id);
    }
    if (!seen.size) throw new MarketingError('GRAPH', 'Empty workflow');
    const run: WorkflowRun = { id: plan.id, tenantId: plan.tenantId, revision: 0, plan: structuredClone(plan), status: 'pending', steps: Object.fromEntries(plan.steps.map(s => [s.capability, { status: 'pending', attempts: 0 }])), events: [], createdAt: new Date().toISOString() };
    this.event(run, 'workflow.created', { actor: context.principal.id }); await this.store.create(run); return run;
  }
  async approve(id: string, context: CapabilityContext) {
    const run = await this.get(id, context); this.policy.approve(context, run.tenantId);
    if (run.plan.createdBy === context.principal.id) throw new MarketingError('APPROVAL', 'An independent approver is required');
    const step = run.plan.steps.find(s => run.steps[s.capability].status !== 'completed');
    if (run.status !== 'awaiting_approval' || !step || !step.requiresApproval) throw new MarketingError('APPROVAL', 'No pending approval');
    run.steps[step.capability].approval = { by: context.principal.id, at: new Date().toISOString() };
    run.status = 'pending'; this.event(run, 'approval.granted', { actor: context.principal.id, capability: step.capability }); await this.save(run); return run;
  }
  async reject(id: string, context: CapabilityContext) {
    const run = await this.get(id, context); this.policy.approve(context, run.tenantId);
    if (run.status !== 'awaiting_approval') throw new MarketingError('APPROVAL', 'No pending approval');
    run.status = 'rejected'; this.event(run, 'approval.rejected', { actor: context.principal.id }); await this.save(run); return run;
  }
  async resume(id: string, context: CapabilityContext) {
    const run = await this.get(id, context);
    if (['completed', 'compensated', 'failed', 'reconciliation_required', 'rejected'].includes(run.status)) return run;
    if (Object.values(run.steps).some(s => s.status === 'compensated')) throw new MarketingError('RECONCILE','Compensated workflows cannot resume forward execution');
    for (const step of run.plan.steps) {
      const state = run.steps[step.capability]; if (state.status === 'completed') continue;
      if (state.status === 'executing') throw new MarketingError('RECONCILE', 'An in-flight step must be reconciled before resuming');
      const capability = this.registry.get(step.capability); const provider = this.registry.provider(capability.id, step.provider);
      this.policy.assert(context, capability); this.policy.identity(context, provider.platform);
      if (capability.version !== step.version || provider.version !== step.providerVersion || capability.requiresConfirmation !== step.requiresApproval) throw new MarketingError('GRAPH', 'Pinned workflow contract changed');
      if (!await provider.supports(context)) throw new MarketingError('NO_PROVIDER', 'Provider prerequisites changed');
      if (capability.requiresConfirmation && !state.approval) { run.status = 'awaiting_approval'; this.event(run, 'approval.requested', { capability: capability.id }); await this.save(run); return run; }
      if (state.nextRetryAt && state.nextRetryAt > Date.now()) return run;
      const input = structuredClone(step.input);
      for (const [field, binding] of Object.entries(step.bindings)) {
        const prior = run.steps[binding.step];
        if (prior?.status !== 'completed' || !prior.result || !Object.hasOwn(prior.result.data, binding.field)) throw new MarketingError('GRAPH', 'Input dependency not satisfied');
        Object.defineProperty(input, field, { value: prior.result.data[binding.field], enumerable: true, writable: true, configurable: true });
      }
      validate(capability.inputSchema, input);
      state.status = 'executing'; state.operation = 'execute'; state.attempts++; run.status = 'running'; this.event(run, 'step.started', { capability: capability.id, attempt: state.attempts });
      await this.save(run); // CAS checkpoint before invoking the external side effect.
      let output: ProviderResult;
      try {
        output = await provider.execute(input, { ...context, correlationId: run.plan.correlationId }, `${run.id}:${step.capability}`);
        validate(capability.outputSchema, output.data);
      } catch (error) {
        const retryable = error instanceof MarketingError && error.retryable;
        const safe = capability.effects === 'read' || capability.retry.idempotent;
        state.error = { code: error instanceof MarketingError ? error.code : 'EXECUTION', message: 'Provider operation failed; inspect provider using the correlation ID', recoverable: retryable && safe };
        if (retryable && safe && state.attempts < capability.retry.maxAttempts) {
          state.status = 'pending'; state.nextRetryAt = Date.now() + 1000 * 2 ** (state.attempts - 1); run.status = 'retrying';
        } else { state.status = 'failed'; run.status = capability.effects === 'read' ? 'failed' : 'reconciliation_required'; }
        this.event(run, 'step.failed', { capability: capability.id, retryable: state.error.recoverable }); await this.save(run); return run;
      }
      state.result = output; state.status = 'completed'; delete state.operation; delete state.error; delete state.nextRetryAt;
      this.event(run, 'step.completed', { capability: capability.id, platform: output.platform, objectId: output.objectId });
      await this.save(run); // A failure here leaves executing persisted; never blindly invoke again.
    }
    run.status = 'completed'; this.event(run, 'workflow.completed'); await this.save(run); return run;
  }
  /** Operator verifies provider state externally before supplying a normalized result or permitting a retry. */
  async reconcile(id: string, capabilityId: string, context: CapabilityContext, resolution: { output: ProviderResult } | { retry: true } | { notApplied: true } | { compensated: true }) {
    const run = await this.get(id, context);
    if (['completed','rejected','compensated'].includes(run.status)) throw new MarketingError('RECONCILE','Terminal workflows cannot be reconciled');
    if (!context.principal.roles.includes('operator')) throw new MarketingError('POLICY', 'Operator role required');
    const state = run.steps[capabilityId]; const step = run.plan.steps.find(s => s.capability === capabilityId);
    if (!state || !step || !['executing', 'failed'].includes(state.status)) throw new MarketingError('RECONCILE', 'Step is not reconcilable');
    if ('output' in resolution) {
      if (state.operation === 'compensate') throw new MarketingError('RECONCILE', 'Compensation requires its own resolution');
      const provider = this.registry.provider(capabilityId, step.provider);
      if (resolution.output.platform !== provider.platform || !resolution.output.objectId || resolution.output.correlationId !== run.plan.correlationId) throw new MarketingError('RECONCILE', 'Reconciled result identity mismatch');
      validate(this.registry.get(capabilityId).outputSchema, resolution.output.data);
      state.result = structuredClone(resolution.output); state.status = 'completed';
    } else if ('compensated' in resolution) {
      if (state.operation !== 'compensate') throw new MarketingError('RECONCILE', 'No compensation to reconcile');
      state.status = 'compensated';
    } else if ('notApplied' in resolution) {
      state.status = state.operation === 'compensate' ? 'completed' : 'failed'; state.reconciled = true;
    } else { state.status = state.operation === 'compensate' ? 'completed' : 'pending'; delete state.approval; delete state.nextRetryAt; }
    run.status = state.operation === 'compensate' ? 'reconciliation_required' : 'notApplied' in resolution ? 'failed' : 'pending';
    delete state.operation; this.event(run, 'step.reconciled', { actor: context.principal.id, capability: capabilityId }); await this.save(run); return run;
  }
  async compensate(id: string, context: CapabilityContext) {
    const run = await this.get(id, context);
    if (!context.principal.permissions.includes('workflow.compensate') || !['failed', 'reconciliation_required'].includes(run.status)) throw new MarketingError('POLICY', 'Compensation requires permission and a failed workflow');
    if (Object.entries(run.steps).some(([id, s]) => s.status === 'executing' || s.status === 'failed' && this.registry.get(id).effects !== 'read' && !s.reconciled)) throw new MarketingError('RECONCILE', 'Reconcile in-flight operations before compensation');
    for (const step of [...run.plan.steps].reverse()) {
      const state = run.steps[step.capability]; if (state.status !== 'completed' || !state.result) continue;
      const cap = this.registry.get(step.capability); if (cap.effects === 'read') continue;
      this.policy.assert(context, cap); const provider = this.registry.provider(cap.id, step.provider);
      this.policy.identity(context, provider.platform);
      if (provider.version !== step.providerVersion || !await provider.supports(context)) throw new MarketingError('NO_PROVIDER','Compensation provider contract or prerequisites changed');
      if (!provider.compensate) { run.status = 'reconciliation_required'; this.event(run, 'compensation.unsupported', { capability: cap.id }); await this.save(run); return run; }
      state.status = 'executing'; state.operation = 'compensate'; this.event(run, 'compensation.started', { capability: cap.id }); await this.save(run);
      try { await provider.compensate(state.result, context, `${run.id}:${cap.id}:compensate`); state.status = 'compensated'; delete state.operation; }
      catch { run.status = 'reconciliation_required'; await this.save(run); return run; }
      this.event(run, 'compensation.completed', { capability: cap.id }); await this.save(run);
    }
    run.status = 'compensated'; await this.save(run); return run;
  }
}

/** A durable host scheduler can call tick for each authorized tenant context; approval is never automatic. */
export class WorkflowWorker {
  constructor(private engine: WorkflowEngine) {}
  async tick(context: CapabilityContext): Promise<{id: string; status: string}[]> {
    const results: {id:string;status:string}[]=[];
    for (const run of await this.engine.store.list(context.principal.tenantId,['pending','retrying'])) {
      if (!['pending','retrying'].includes(run.status)) continue;
      try { const result=await this.engine.resume(run.id,context); results.push({id:run.id,status:result.status}); }
      catch (error) { results.push({id:run.id,status:error instanceof MarketingError ? error.code : 'ERROR'}); }
    }
    return results;
  }
}
