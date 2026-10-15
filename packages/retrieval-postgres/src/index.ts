import { createHash } from 'node:crypto';
import type { Pool,PoolClient } from 'pg';
import { assertScope,assertRequest,assertEmbedding,fuse,RetrievalError,type KnowledgeStore,type KnowledgeChunk,type Embedding,type RetrievalScope,type SearchRequest,type RetrievalHit } from '@genui/retrieval-core';
import {validate} from '@genui/schema';
import {viewSchema,type PublishedView,type ViewCatalog} from '@genui/ui-compiler';
export interface VectorConfig {model:string;dimensions:number}
const tables=['genui_knowledge_chunks','genui_published_views'];
export async function migrateRetrieval(pool:Pool,vector?:VectorConfig){
  if(vector)assertEmbedding({...vector,values:Array(vector.dimensions).fill(1)});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(745220)');
    await client.query(`CREATE TABLE IF NOT EXISTS genui_knowledge_chunks (
      tenant_id text NOT NULL,id text NOT NULL,source_id text NOT NULL,source_version text NOT NULL,
      content_hash text NOT NULL,body jsonb NOT NULL,
      search tsvector GENERATED ALWAYS AS (to_tsvector('english',coalesce(body->'provenance'->>'title','')||' '||coalesce(body->>'content',''))) STORED,
      PRIMARY KEY(tenant_id,id)
    );
    CREATE INDEX IF NOT EXISTS genui_knowledge_fts ON genui_knowledge_chunks USING gin(search);
    CREATE INDEX IF NOT EXISTS genui_knowledge_source ON genui_knowledge_chunks(tenant_id,source_id,source_version);
    CREATE TABLE IF NOT EXISTS genui_published_views(tenant_id text NOT NULL,id text NOT NULL,version text NOT NULL,content_hash text NOT NULL,body jsonb NOT NULL,PRIMARY KEY(tenant_id,id,version));`);
    const scopedTables=[...tables];
    if(vector){
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`CREATE TABLE IF NOT EXISTS genui_knowledge_embeddings(
        tenant_id text NOT NULL,chunk_id text NOT NULL,model text NOT NULL,dimensions integer NOT NULL,embedding vector NOT NULL,
        PRIMARY KEY(tenant_id,chunk_id,model),FOREIGN KEY(tenant_id,chunk_id) REFERENCES genui_knowledge_chunks(tenant_id,id),CHECK(vector_dims(embedding)=dimensions));`);
      const name='genui_vector_'+createHash('sha256').update(`${vector.model}:${vector.dimensions}`).digest('hex').slice(0,16);
      const literal="'"+vector.model.replaceAll("'","''")+"'";
      await client.query(`CREATE INDEX IF NOT EXISTS ${name} ON genui_knowledge_embeddings USING hnsw ((embedding::vector(${vector.dimensions})) vector_cosine_ops) WHERE model=${literal} AND dimensions=${vector.dimensions}`);
      scopedTables.push('genui_knowledge_embeddings');
    }
    for(const table of scopedTables){
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await client.query(`DO $policy$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='${table}' AND policyname='genui_tenant_isolation') THEN CREATE POLICY genui_tenant_isolation ON ${table} USING(tenant_id=nullif(current_setting('genui.tenant_id',true),'')) WITH CHECK(tenant_id=nullif(current_setting('genui.tenant_id',true),'')); END IF; END $policy$;`);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
async function scoped<T>(pool:Pool,tenant:string,work:(client:PoolClient)=>Promise<T>):Promise<T>{
  if(!tenant)throw new RetrievalError('INVALID','Tenant required');const client=await pool.connect();
  try{await client.query('BEGIN');await client.query("SELECT set_config('genui.tenant_id',$1,true)",[tenant]);const result=await work(client);await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
function params(scope:RetrievalScope,kinds:string[]=['system','marketing']){assertScope(scope);return [scope.tenantId,scope.principalId,scope.roles,JSON.stringify(scope.capabilities),kinds];}
// The authorization predicate executes before either ranking branch. RLS adds an independent tenant boundary.
const authorized=`c.tenant_id=$1 AND (c.body->>'published')::boolean
 AND c.body->>'kind'=ANY($5::text[])
 AND (c.body->'acl'->'principals' ? $2 OR c.body->'acl'->'roles' ?| $3::text[])
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.body->'capabilities') ref WHERE NOT ($4::jsonb @> jsonb_build_array(ref)))
 AND (c.body->'provenance'->>'expiresAt' IS NULL OR (c.body->'provenance'->>'expiresAt')::timestamptz>now())`;
export class PostgresKnowledgeStore implements KnowledgeStore{
  constructor(private pool:Pool,private vector?:VectorConfig){}
  async insert(chunks:KnowledgeChunk[],embeddings?:Embedding[]){
    if(!chunks.length)return;if(embeddings&&(!this.vector||embeddings.length!==chunks.length))throw new RetrievalError('INVALID','Vector configuration/count mismatch');
    const tenant=chunks[0].tenantId;if(chunks.some(c=>c.tenantId!==tenant))throw new RetrievalError('INVALID','Ingestion must be tenant scoped');
    if(embeddings)for(const embedding of embeddings){assertEmbedding(embedding);if(embedding.model!==this.vector!.model||embedding.dimensions!==this.vector!.dimensions)throw new RetrievalError('INVALID','Embedding model mismatch');}
    await scoped(this.pool,tenant,async client=>{
      for(let index=0;index<chunks.length;index++){
        const chunk=chunks[index];
        const {rows}=await client.query('INSERT INTO genui_knowledge_chunks(tenant_id,id,source_id,source_version,content_hash,body) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,id) DO UPDATE SET id=EXCLUDED.id RETURNING content_hash',[tenant,chunk.id,chunk.sourceId,chunk.version,chunk.contentHash,chunk]);
        if(rows[0].content_hash!==chunk.contentHash)throw new RetrievalError('CONFLICT','Source versions are immutable');
        if(embeddings){const e=embeddings[index];await client.query('INSERT INTO genui_knowledge_embeddings(tenant_id,chunk_id,model,dimensions,embedding) VALUES($1,$2,$3,$4,$5::vector) ON CONFLICT(tenant_id,chunk_id,model) DO UPDATE SET embedding=EXCLUDED.embedding,dimensions=EXCLUDED.dimensions',[tenant,chunk.id,e.model,e.dimensions,JSON.stringify(e.values)]);}
      }
    });
  }
  async withdraw(tenant:string,source:string,version:string){await scoped(this.pool,tenant,async client=>{await client.query("UPDATE genui_knowledge_chunks SET body=jsonb_set(body,'{published}','false') WHERE tenant_id=$1 AND source_id=$2 AND source_version=$3",[tenant,source,version]);});}
  async resolve(scope:RetrievalScope,ids:string[]):Promise<KnowledgeChunk[]>{return scoped(this.pool,scope.tenantId,async client=>{const {rows}=await client.query(`SELECT c.body FROM genui_knowledge_chunks c WHERE ${authorized} AND c.id=ANY($6::text[])`,[...params(scope),ids]);return rows.map(r=>r.body);});}
  async search(scope:RetrievalScope,request:SearchRequest,embedding?:Embedding):Promise<RetrievalHit[]>{
    assertScope(scope);assertRequest(request);if(embedding){assertEmbedding(embedding);if(!this.vector||this.vector.model!==embedding.model||this.vector.dimensions!==embedding.dimensions)throw new RetrievalError('INVALID','Query embedding must match configured model/dimensions');}
    return scoped(this.pool,scope.tenantId,async client=>{
      const base=params(scope,request.kinds);const lex=await client.query(`SELECT c.body FROM genui_knowledge_chunks c WHERE ${authorized} AND c.search @@ websearch_to_tsquery('english',$6) ORDER BY ts_rank_cd(c.search,websearch_to_tsquery('english',$6)) DESC,c.id LIMIT 50`,[...base,request.query]);
      let vector:KnowledgeChunk[]=[];
      if(embedding){const dimension=embedding.dimensions;const {rows}=await client.query(`SELECT c.body FROM genui_knowledge_embeddings e JOIN genui_knowledge_chunks c ON c.tenant_id=e.tenant_id AND c.id=e.chunk_id WHERE ${authorized} AND e.model=$6 AND e.dimensions=$7 AND (e.embedding::vector(${dimension}) <=> $8::vector(${dimension}))<=0.75 ORDER BY e.embedding::vector(${dimension}) <=> $8::vector(${dimension}),c.id LIMIT 50`,[...base,embedding.model,dimension,JSON.stringify(embedding.values)]);vector=rows.map(r=>r.body);}
      return fuse(lex.rows.map(r=>r.body),vector,request.limit??8,Boolean(embedding));
    });
  }
}
export class PostgresViewCatalog implements ViewCatalog{
  constructor(private pool:Pool){}
  async publish(view:PublishedView){validate(viewSchema,view);await scoped(this.pool,view.tenantId,async client=>{const hash=createHash('sha256').update(JSON.stringify(view)).digest('hex');const {rows}=await client.query('INSERT INTO genui_published_views(tenant_id,id,version,content_hash,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,id,version) DO UPDATE SET id=EXCLUDED.id RETURNING content_hash',[view.tenantId,view.id,view.version,hash,view]);if(rows[0].content_hash!==hash)throw new RetrievalError('CONFLICT','Published view versions are immutable');});}
  async withdraw(tenant:string,id:string,version:string){await scoped(this.pool,tenant,async client=>{await client.query("UPDATE genui_published_views SET body=jsonb_set(body,'{published}','false') WHERE tenant_id=$1 AND id=$2 AND version=$3",[tenant,id,version]);});}
  async list(scope:RetrievalScope):Promise<PublishedView[]>{assertScope(scope);return scoped(this.pool,scope.tenantId,async client=>{const {rows}=await client.query(`SELECT body FROM genui_published_views WHERE tenant_id=$1 AND (body->>'published')::boolean AND (body->'acl'->'principals' ? $2 OR body->'acl'->'roles' ?| $3::text[]) AND $4::jsonb @> jsonb_build_array(body->'capability') ORDER BY id,version`,params(scope).slice(0,4));return rows.map(r=>r.body);});}
}
