import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {migrateRetrieval,PostgresKnowledgeStore,PostgresViewCatalog} from '@genui/retrieval-postgres';
import {RetrievalService,FixtureHashEmbedder,type KnowledgeDocument,type RetrievalScope} from '@genui/retrieval-core';
const url=process.env.TEST_RAG_DATABASE_URL;
describe.skipIf(!url)('real pgvector and RLS retrieval',()=>{
 it('migrates twice, persists immutable views/chunks, fuses FTS/vector ranks, and enforces RLS under a restricted role',async()=>{
  const pool=new Pool({connectionString:url});const tenant=randomUUID();const other=randomUUID();const role='rag_test_'+randomUUID().replaceAll('-','');const embedder=new FixtureHashEmbedder(32);const config={model:embedder.model,dimensions:32};let roleCreated=false;
  try{
    await migrateRetrieval(pool,config);await migrateRetrieval(pool,config);
    const store=new PostgresKnowledgeStore(pool,config);const service=new RetrievalService(store,embedder);const views=new PostgresViewCatalog(pool);
    const scope:RetrievalScope={tenantId:tenant,principalId:'alice',roles:['marketer'],capabilities:[{id:'accounts.search',version:'1'}]};
    const document:KnowledgeDocument={tenantId:tenant,sourceId:'accounts',version:'1',kind:'system',published:true,content:'Search eligible finance accounts and consent.',provenance:{title:'Finance accounts',uri:'genui://accounts/1',updatedAt:'2026-10-15T00:00:00Z'},acl:{roles:['marketer'],principals:[]},capabilities:scope.capabilities,view:{id:'accounts-form',version:'1'}};
    await service.ingest(document);await service.ingest(document);await service.ingest({...document,tenantId:other});
    await service.ingest({...document,sourceId:'restricted',acl:{roles:['admin'],principals:[]}});
    await service.ingest({...document,sourceId:'old-version',capabilities:[{id:'accounts.search',version:'0'}]});
    await service.ingest({...document,sourceId:'expired',provenance:{...document.provenance,expiresAt:'2000-01-01T00:00:00Z'}});
    await expect(service.ingest({...document,content:'changed content'})).rejects.toMatchObject({code:'CONFLICT'});
    const hits=await service.search(scope,{query:'finance accounts'});expect(hits).toHaveLength(1);expect(hits[0].ranks).toEqual({lexical:1,vector:1});
    await expect(store.search(scope,{query:'finance'},{model:'other-model',dimensions:32,values:Array(32).fill(1)})).rejects.toMatchObject({code:'INVALID'});
    const view={tenantId:tenant,id:'accounts-form',version:'1',published:true,title:'Search accounts',type:'form' as const,capability:scope.capabilities[0],fields:['industry'],acl:document.acl};
    await views.publish(view);await views.publish(view);await expect(views.publish({...view,title:'changed'})).rejects.toMatchObject({code:'CONFLICT'});expect(await views.list({...scope,tenantId:other})).toEqual([]);
    const indexes=await pool.query("SELECT indexdef FROM pg_indexes WHERE tablename='genui_knowledge_embeddings'");expect(indexes.rows.some(r=>r.indexdef.includes('hnsw'))).toBe(true);
    await pool.query(`CREATE ROLE ${role} NOLOGIN`);roleCreated=true;await pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);await pool.query(`GRANT SELECT,INSERT ON genui_knowledge_chunks,genui_knowledge_embeddings,genui_published_views TO ${role}`);
    const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);const unset=await client.query('SELECT id FROM genui_knowledge_chunks');expect(unset.rows).toEqual([]);await client.query("SELECT set_config('genui.tenant_id',$1,true)",[tenant]);const crossed=await client.query('SELECT id FROM genui_knowledge_chunks WHERE tenant_id=$1',[other]);expect(crossed.rows).toEqual([]);const own=await client.query('SELECT id FROM genui_knowledge_chunks');expect(own.rows.length).toBeGreaterThan(0);await expect(client.query('INSERT INTO genui_knowledge_chunks(tenant_id,id,source_id,source_version,content_hash,body) VALUES($1,$2,$3,$4,$5,$6)',[other,'forbidden','x','1','x',{}])).rejects.toMatchObject({code:'42501'});}finally{await client.query('ROLLBACK');client.release();}
    await store.withdraw(tenant,'accounts','1');await service.ingest(document);expect(await service.search(scope,{query:'finance accounts'})).toEqual([]);await views.withdraw(tenant,view.id,view.version);await views.publish(view);expect(await views.list(scope)).toEqual([]);
  }finally{
    for(const table of ['genui_knowledge_embeddings','genui_knowledge_chunks','genui_published_views'])await pool.query(`DELETE FROM ${table} WHERE tenant_id=ANY($1::text[])`,[[tenant,other]]);
    if(roleCreated){await pool.query(`DROP OWNED BY ${role}`);await pool.query(`DROP ROLE ${role}`);}await pool.end();
  }
 });
});
