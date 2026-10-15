import { setTimeout } from 'node:timers/promises';
import { Pool,migrate,PostgresWorkflowStore } from '@genui/registry-postgres';
import { WorkflowWorker } from '@genui/workflow-engine';
import { createReferenceSystem } from './reference.js';
if(!process.env.STUDIO_DATABASE_URL) throw new Error('STUDIO_DATABASE_URL is required for the durable fixture worker');
const pool=new Pool({connectionString:process.env.STUDIO_DATABASE_URL}); await migrate(pool);
const system=await createReferenceSystem(new PostgresWorkflowStore(pool)); const worker=new WorkflowWorker(system.engine);
const controller=new AbortController(); process.on('SIGINT',()=>controller.abort()); process.on('SIGTERM',()=>controller.abort());
try {
  while(!controller.signal.aborted) {
    for(const result of await worker.tick({...system.context,signal:controller.signal})) console.log(JSON.stringify(result));
    try {await setTimeout(1000,undefined,{signal:controller.signal});} catch {break;}
  }
} finally {await system.gateway.close(); await pool.end();}
