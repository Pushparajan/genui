import { Pool, type PoolClient } from 'pg';
import type { AnyAction } from '@genui/core';
import { InMemoryActionRegistry } from '@genui/registry';
import { MarketingError, type CanonicalIdentity, type IdentityBinding, type IdentityStore, type NormalizedEvent } from '@genui/marketing-core';
import type { WorkflowRun, WorkflowStore } from '@genui/workflow-engine';
export { Pool } from 'pg';
export const migrationSQL = `
CREATE TABLE IF NOT EXISTS genui_identity_bindings (
 issuer text NOT NULL, subject text NOT NULL, tenant_id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY (issuer, subject)
);
CREATE TABLE IF NOT EXISTS genui_action_metadata (
 tenant_id text NOT NULL, name text NOT NULL, metadata jsonb NOT NULL, PRIMARY KEY (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS genui_workflow_runs (
 tenant_id text NOT NULL, id text NOT NULL, revision integer NOT NULL, body jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS genui_campaign_objects (
 tenant_id text NOT NULL, campaign_id text NOT NULL, capability text NOT NULL, platform text NOT NULL,
 object_id text NOT NULL, PRIMARY KEY (tenant_id, campaign_id, capability)
);
CREATE TABLE IF NOT EXISTS genui_audit_events (
 tenant_id text NOT NULL, id text NOT NULL, run_id text NOT NULL, body jsonb NOT NULL,
 PRIMARY KEY (tenant_id, id)
);
CREATE INDEX IF NOT EXISTS genui_audit_run ON genui_audit_events (tenant_id, run_id);
`;
export async function migrate(pool: Pool) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(745219)'); await client.query(migrationSQL); await client.query('COMMIT'); }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
const metadata = (action: AnyAction) => JSON.parse(JSON.stringify({ name: action.name, description: action.description, input: action.input, outputSchema: action.outputSchema, ui: action.ui, confirmation: action.confirmation ?? false }));
const stable = (value: unknown): string => JSON.stringify(value, (_k, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
/** Only metadata is serialized. Implementations and authorization policies remain trusted application code. */
export class PostgresActionRegistry {
  constructor(private pool: Pool) {}
  async register(tenant: string, action: AnyAction) {
    if (!tenant) throw new Error('Tenant is required');
    await this.pool.query('INSERT INTO genui_action_metadata (tenant_id,name,metadata) VALUES ($1,$2,$3) ON CONFLICT (tenant_id,name) DO UPDATE SET metadata=EXCLUDED.metadata', [tenant, action.name, metadata(action)]);
  }
  async load(tenant: string, implementations: AnyAction[]): Promise<InMemoryActionRegistry> {
    const { rows } = await this.pool.query('SELECT name,metadata FROM genui_action_metadata WHERE tenant_id=$1 ORDER BY name', [tenant]);
    const actions = rows.map(row => {
      const action = implementations.find(a => a.name === row.name);
      if (!action || stable(metadata(action)) !== stable(row.metadata)) throw new MarketingError('CONFLICT', 'Action metadata and trusted implementation do not match');
      return action;
    });
    return new InMemoryActionRegistry(actions);
  }
}
export class PostgresWorkflowStore implements WorkflowStore {
  constructor(private pool: Pool) {}
  private async record(client: PoolClient, run: WorkflowRun) {
    for (const event of run.events) await client.query('INSERT INTO genui_audit_events (tenant_id,id,run_id,body) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [run.tenantId, event.id, run.id, event]);
    for (const [capability, state] of Object.entries(run.steps)) if (state.result) await client.query('INSERT INTO genui_campaign_objects (tenant_id,campaign_id,capability,platform,object_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,campaign_id,capability) DO UPDATE SET platform=EXCLUDED.platform,object_id=EXCLUDED.object_id', [run.tenantId, run.plan.campaignId, capability, state.result.platform, state.result.objectId]);
  }
  async create(run: WorkflowRun) {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); await client.query('INSERT INTO genui_workflow_runs (tenant_id,id,revision,body) VALUES ($1,$2,$3,$4)', [run.tenantId, run.id, run.revision, run]); await this.record(client, run); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async get(tenant: string, id: string): Promise<WorkflowRun | undefined> { const { rows } = await this.pool.query('SELECT body FROM genui_workflow_runs WHERE tenant_id=$1 AND id=$2', [tenant, id]); return rows[0]?.body; }
  async list(tenant: string, statuses?: WorkflowRun['status'][]): Promise<WorkflowRun[]> {
    const query = statuses ? "SELECT body FROM genui_workflow_runs WHERE tenant_id=$1 AND body->>'status'=ANY($2::text[]) ORDER BY created_at ASC LIMIT 100" : 'SELECT body FROM genui_workflow_runs WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 100';
    const {rows}=await this.pool.query(query,statuses?[tenant,statuses]:[tenant]); return rows.map(r=>r.body);
  }
  async save(run: WorkflowRun, expectedRevision: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN'); const next = { ...run, revision: expectedRevision + 1 };
      const { rowCount } = await client.query('UPDATE genui_workflow_runs SET revision=$3,body=$4 WHERE tenant_id=$1 AND id=$2 AND revision=$5', [run.tenantId, run.id, next.revision, next, expectedRevision]);
      if (!rowCount) throw new MarketingError('CONFLICT', 'Workflow changed concurrently');
      await this.record(client, next); await client.query('COMMIT'); run.revision = next.revision;
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async identities(tenant: string, campaign: string): Promise<CanonicalIdentity[]> {
    const { rows } = await this.pool.query('SELECT tenant_id AS "tenantId",campaign_id AS "campaignId",capability,platform,object_id AS "objectId" FROM genui_campaign_objects WHERE tenant_id=$1 AND campaign_id=$2', [tenant, campaign]); return rows;
  }
  async audit(tenant: string, run: string): Promise<NormalizedEvent[]> { const { rows } = await this.pool.query("SELECT body FROM genui_audit_events WHERE tenant_id=$1 AND run_id=$2 ORDER BY body->>'occurredAt',id", [tenant, run]); return rows.map(r => r.body); }
}

/** Enrollment is an administrative operation and must only be exposed by an authenticated trusted host. */
export class PostgresIdentityStore implements IdentityStore {
  constructor(private pool: Pool) {}
  async enroll(binding: IdentityBinding) {
    if (!binding.principal.tenantId || binding.identities.some(i => i.tenantId !== binding.principal.tenantId)) throw new MarketingError('POLICY','Invalid tenant identity mapping');
    const {rowCount} = await this.pool.query('INSERT INTO genui_identity_bindings (issuer,subject,tenant_id,body) VALUES ($1,$2,$3,$4) ON CONFLICT (issuer,subject) DO UPDATE SET body=EXCLUDED.body WHERE genui_identity_bindings.tenant_id=EXCLUDED.tenant_id', [binding.issuer,binding.subject,binding.principal.tenantId,binding]);
    if (!rowCount) throw new MarketingError('POLICY','An enrolled external identity cannot change tenants');
  }
  async find(issuer: string, subject: string): Promise<IdentityBinding | undefined> { const {rows} = await this.pool.query('SELECT body FROM genui_identity_bindings WHERE issuer=$1 AND subject=$2',[issuer,subject]); return rows[0]?.body; }
}
