import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool, migrate, PostgresActionRegistry, PostgresWorkflowStore, PostgresIdentityStore } from '@genui/registry-postgres';
import { WorkflowEngine } from '@genui/workflow-engine';
import { defineAction } from '@genui/core';
import { lifecycleInputs } from '@genui/marketing-connectors';
import { createReferenceSystem } from '../apps/studio/reference.js';
describe.skipIf(!process.env.TEST_DATABASE_URL)('real PostgreSQL persistence', () => {
  it('migrates repeatably, binds metadata only to matching code, and isolates tenants', async () => {
    const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL}); const tenant=randomUUID();
    try {
      await migrate(pool); await migrate(pool);
      const registry=new PostgresActionRegistry(pool); const action=defineAction({name:'test.read',description:'read',input:{type:'object'},execute:()=>42});
      await registry.register(tenant,action); expect((await registry.load(tenant,[action])).get('test.read').execute({}, {services:{}})).toBe(42);
      expect((await registry.load('other',[])).list()).toHaveLength(0);
      await expect(registry.load(tenant,[{...action,confirmation:true}])).rejects.toMatchObject({code:'CONFLICT'});
      await expect(registry.load(tenant,[])).rejects.toMatchObject({code:'CONFLICT'});
      const identities=new PostgresIdentityStore(pool); const binding={issuer:'https://issuer.example',subject:tenant,principal:{id:'user',tenantId:tenant,roles:[],permissions:[]},identities:[],enabledPlatforms:[],licenses:[]};
      await identities.enroll(binding); expect((await identities.find(binding.issuer,tenant))?.principal.tenantId).toBe(tenant);
      await expect(identities.enroll({...binding,principal:{...binding.principal,tenantId:'other'}})).rejects.toMatchObject({code:'POLICY'});
    } finally { await pool.query('DELETE FROM genui_action_metadata WHERE tenant_id=$1',[tenant]); await pool.query('DELETE FROM genui_identity_bindings WHERE tenant_id=$1',[tenant]); await pool.end(); }
  });
  it('resumes a durable workflow after reconnect, persists mappings/audit, and rejects stale updates', async () => {
    const connectionString=process.env.TEST_DATABASE_URL; const first=new Pool({connectionString}); const second=new Pool({connectionString}); const tenant=randomUUID();
    try {
      await migrate(first); const store=new PostgresWorkflowStore(first); const system=await createReferenceSystem(store);
      const context={...system.context,principal:{...system.context.principal,tenantId:tenant},identities:system.context.identities.map(i=>({...i,tenantId:tenant})),correlationId:randomUUID()};
      const reviewer={...context,principal:{...context.principal,id:'independent-reviewer',roles:['approver']}};
      const args=lifecycleInputs('Durable campaign'); const plan=await system.planner.plan(['marketing.analytics.report'],context,args.inputs,args.bindings);
      await system.engine.create(plan,context); expect((await system.engine.resume(plan.id,context)).status).toBe('awaiting_approval');
      await first.end();
      const reconnected=new PostgresWorkflowStore(second); const engine=new WorkflowEngine(system.registry,reconnected);
      expect(await reconnected.get('other',plan.id)).toBeUndefined();
      const stale=(await reconnected.get(tenant,plan.id))!;
      await engine.approve(plan.id,reviewer); await expect(reconnected.save(stale,stale.revision)).rejects.toMatchObject({code:'CONFLICT'});
      expect((await engine.resume(plan.id,context)).status).toBe('completed');
      expect(await reconnected.identities(tenant,plan.campaignId)).toHaveLength(7);
      expect((await reconnected.audit(tenant,plan.id)).some(e=>e.type==='approval.granted')).toBe(true);
      expect(await reconnected.identities('other',plan.campaignId)).toHaveLength(0);
    } finally {
      for (const table of ['genui_audit_events','genui_campaign_objects','genui_workflow_runs']) await second.query(`DELETE FROM ${table} WHERE tenant_id=$1`,[tenant]);
      if (!first.ended) await first.end(); await second.end();
    }
  });
});
