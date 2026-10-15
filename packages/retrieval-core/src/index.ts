import { createHash } from 'node:crypto';
import { validate } from '@genui/schema';
export interface CapabilityRef { id: string; version: string }
export interface RetrievalScope { tenantId: string; principalId: string; roles: string[]; capabilities: CapabilityRef[] }
export interface Provenance { title: string; uri: string; updatedAt: string; expiresAt?: string }
export interface KnowledgeDocument {
  sourceId: string; version: string; tenantId: string; kind: 'system' | 'marketing'; published: boolean;
  content: string; provenance: Provenance; acl: { roles: string[]; principals: string[] };
  capabilities: CapabilityRef[]; view?: { id: string; version: string };
}
export interface KnowledgeChunk extends Omit<KnowledgeDocument,'content'> { id: string; content: string; ordinal: number; contentHash: string }
export interface Embedding { model: string; dimensions: number; values: number[] }
export interface EmbeddingProvider { model: string; dimensions: number; embed(text: string): Promise<number[]> }
export interface SearchRequest { query: string; kinds?: ('system' | 'marketing')[]; limit?: number }
export interface RetrievalHit { chunk: KnowledgeChunk; score: number; ranks: { lexical?: number; vector?: number }; method: 'lexical' | 'hybrid' }
export interface KnowledgeStore {
  insert(chunks: KnowledgeChunk[], embeddings?: Embedding[]): Promise<void>;
  resolve(scope:RetrievalScope,ids:string[]):Promise<KnowledgeChunk[]>;
  withdraw(tenantId: string, sourceId: string, version: string): Promise<void>;
  search(scope: RetrievalScope, request: SearchRequest, embedding?: Embedding): Promise<RetrievalHit[]>;
}
export class RetrievalError extends Error {
  constructor(public code: 'INVALID' | 'CONFLICT' | 'NO_EVIDENCE' | 'UNSAFE_PROPOSAL', message: string) { super(message); this.name='RetrievalError'; }
}
export function assertScope(scope: RetrievalScope) { if (!scope.tenantId || !scope.principalId || !Array.isArray(scope.roles) || !Array.isArray(scope.capabilities)) throw new RetrievalError('INVALID','Authenticated retrieval scope required'); }
export function assertRequest(request: SearchRequest) {
  validate({type:'object',properties:{query:{type:'string',minLength:1,maxLength:2000},kinds:{type:'array',minItems:1,uniqueItems:true,items:{type:'string',enum:['system','marketing']}},limit:{type:'integer',minimum:1,maximum:20}},required:['query'],additionalProperties:false},request);
  if (!request.query.trim()) throw new RetrievalError('INVALID','A nonblank retrieval query is required');
}
export function assertEmbedding(embedding: Embedding) {
  if (!embedding.model || !Number.isInteger(embedding.dimensions) || embedding.dimensions<2 || embedding.dimensions>2000 || embedding.values.length!==embedding.dimensions || !embedding.values.every(Number.isFinite) || !embedding.values.some(v=>v!==0)) throw new RetrievalError('INVALID','Invalid or incompatible embedding');
}
export function eligible(chunk: KnowledgeChunk, scope: RetrievalScope, kinds: string[] = ['system','marketing']): boolean {
  return chunk.tenantId===scope.tenantId && chunk.published && kinds.includes(chunk.kind)
    && (!chunk.provenance.expiresAt || Date.parse(chunk.provenance.expiresAt)>Date.now())
    && (chunk.acl.principals.includes(scope.principalId)||chunk.acl.roles.some(role=>scope.roles.includes(role)))
    && chunk.capabilities.every(ref=>scope.capabilities.some(allowed=>allowed.id===ref.id&&allowed.version===ref.version));
}
export function chunkDocument(document: KnowledgeDocument, size=1000, overlap=100): KnowledgeChunk[] {
  validate({type:'object',additionalProperties:false,required:['sourceId','version','tenantId','kind','published','content','provenance','acl','capabilities'],properties:{sourceId:{type:'string',minLength:1},version:{type:'string',minLength:1},tenantId:{type:'string',minLength:1},kind:{type:'string',enum:['system','marketing']},published:{type:'boolean'},content:{type:'string',minLength:1,maxLength:200000},provenance:{type:'object',additionalProperties:false,required:['title','uri','updatedAt'],properties:{title:{type:'string',minLength:1,maxLength:300},uri:{type:'string',minLength:1},updatedAt:{type:'string',format:'date-time'},expiresAt:{type:'string',format:'date-time'}}},acl:{type:'object',additionalProperties:false,required:['roles','principals'],properties:{roles:{type:'array',items:{type:'string'}},principals:{type:'array',items:{type:'string'}}}},capabilities:{type:'array',items:{type:'object',additionalProperties:false,required:['id','version'],properties:{id:{type:'string',minLength:1},version:{type:'string',minLength:1}}}},view:{type:'object',additionalProperties:false,required:['id','version'],properties:{id:{type:'string',minLength:1},version:{type:'string',minLength:1}}}}},document);
  const uri=new URL(document.provenance.uri);
  if (!['https:','genui:'].includes(uri.protocol)||uri.username||uri.password) throw new RetrievalError('INVALID','Source URI must be credential-free HTTPS or genui URI');
  if (!Number.isInteger(size)||size<100||size>5000||!Number.isInteger(overlap)||overlap<0||overlap>=size) throw new RetrievalError('INVALID','Invalid chunking configuration');
  const {content,...metadata}=structuredClone(document); const chunks: KnowledgeChunk[]=[];
  for (let start=0;start<content.length;start+=size-overlap) {
    const text=content.slice(start,start+size); const ordinal=chunks.length;
    chunks.push({...metadata,id:createHash('sha256').update(JSON.stringify([document.tenantId,document.sourceId,document.version,ordinal])).digest('hex'),content:text,ordinal,contentHash:createHash('sha256').update(JSON.stringify([metadata,text,content])).digest('hex')});
    if (start+size>=content.length) break;
  }
  return chunks;
}
export function fuse(lexical: KnowledgeChunk[], vector: KnowledgeChunk[], limit: number, hybrid: boolean): RetrievalHit[] {
  const hits=new Map<string,RetrievalHit>();
  for (const [kind,rows] of [['lexical',lexical],['vector',vector]] as const) rows.forEach((chunk,index)=>{
    const hit=hits.get(chunk.id)??{chunk,score:0,ranks:{},method:hybrid?'hybrid':'lexical'};
    hit.ranks[kind]=index+1; hit.score+=1/(60+index+1); hits.set(chunk.id,hit);
  });
  return [...hits.values()].sort((a,b)=>b.score-a.score || Date.parse(b.chunk.provenance.updatedAt)-Date.parse(a.chunk.provenance.updatedAt) || a.chunk.id.localeCompare(b.chunk.id)).slice(0,limit);
}
const words=(value:string)=>value.toLowerCase().match(/[a-z0-9]+/g)??[];
export class MemoryKnowledgeStore implements KnowledgeStore {
  private chunks=new Map<string,KnowledgeChunk>(); private embeddings=new Map<string,Embedding>();
  async insert(chunks: KnowledgeChunk[], embeddings?: Embedding[]) {
    if (embeddings && embeddings.length!==chunks.length) throw new RetrievalError('INVALID','Embedding count mismatch');
    chunks.forEach((chunk,index)=>{ const existing=this.chunks.get(chunk.id); if(existing&&existing.contentHash!==chunk.contentHash) throw new RetrievalError('CONFLICT','Source versions are immutable'); if(embeddings) assertEmbedding(embeddings[index]); });
    chunks.forEach((chunk,index)=>{const prior=this.chunks.get(chunk.id); this.chunks.set(chunk.id,structuredClone(prior??chunk));if(embeddings)this.embeddings.set(JSON.stringify([chunk.id,embeddings[index].model]),structuredClone(embeddings[index]));});
  }
  async resolve(scope:RetrievalScope,ids:string[]){assertScope(scope);return [...this.chunks.values()].filter(c=>ids.includes(c.id)&&eligible(c,scope)).map(c=>structuredClone(c));}
  async withdraw(tenant:string,source:string,version:string) { for(const chunk of this.chunks.values()) if(chunk.tenantId===tenant&&chunk.sourceId===source&&chunk.version===version)chunk.published=false; }
  async search(scope:RetrievalScope,request:SearchRequest,embedding?:Embedding):Promise<RetrievalHit[]> {
    assertScope(scope);assertRequest(request);if(embedding)assertEmbedding(embedding);
    const rows=[...this.chunks.values()].filter(chunk=>eligible(chunk,scope,request.kinds)); const query=new Set(words(request.query));
    const score=(chunk:KnowledgeChunk)=>words(chunk.provenance.title+' '+chunk.content).reduce((sum,word)=>sum+(query.has(word)?1:0),0);
    const lexical=rows.filter(row=>score(row)>0).sort((a,b)=>score(b)-score(a)||a.id.localeCompare(b.id)).slice(0,50);
    const similar=(chunk:KnowledgeChunk)=>{const stored=embedding&&this.embeddings.get(JSON.stringify([chunk.id,embedding.model]));if(!stored||stored.dimensions!==embedding!.dimensions)return -1;const dot=stored.values.reduce((s,v,i)=>s+v*embedding!.values[i],0);return dot/Math.sqrt(stored.values.reduce((s,v)=>s+v*v,0)*embedding!.values.reduce((s,v)=>s+v*v,0));};
    const vector=embedding?rows.filter(row=>similar(row)>=0.25).sort((a,b)=>similar(b)-similar(a)||a.id.localeCompare(b.id)).slice(0,50):[];
    return fuse(lexical,vector,request.limit??8,Boolean(embedding));
  }
}
export class RetrievalService {
  constructor(public store:KnowledgeStore,public embedder?:EmbeddingProvider) {}
  private async embedding(text:string):Promise<Embedding|undefined>{if(!this.embedder)return;const result={model:this.embedder.model,dimensions:this.embedder.dimensions,values:await this.embedder.embed(text)};assertEmbedding(result);return result;}
  async ingest(document:KnowledgeDocument){const chunks=chunkDocument(document);const vectors:Embedding[]|undefined=this.embedder?[]:undefined;if(vectors)for(let index=0;index<chunks.length;index+=4)vectors.push(...await Promise.all(chunks.slice(index,index+4).map(async chunk=>(await this.embedding(chunk.content))!)));await this.store.insert(chunks,vectors);return chunks;}
  async search(scope:RetrievalScope,request:SearchRequest){assertScope(scope);assertRequest(request);return this.store.search(scope,request,await this.embedding(request.query));}
}
/** Offline transport/evaluation fixture only. Hash vectors do not provide semantic understanding. */
export class FixtureHashEmbedder implements EmbeddingProvider {
  readonly model='fixture-token-hash-v1';constructor(public dimensions=64){}
  async embed(text:string){const vector=Array(this.dimensions).fill(0) as number[];for(const word of words(text)){const hash=createHash('sha256').update(word).digest();vector[hash.readUInt32LE(0)%this.dimensions]++;}if(!vector.some(v=>v))vector[0]=1;return vector;}
}

export class CallbackEmbeddingProvider implements EmbeddingProvider {
  constructor(public model:string,public dimensions:number,private generate:(text:string)=>Promise<number[]>){}
  async embed(text:string){return this.generate(text);}
}
