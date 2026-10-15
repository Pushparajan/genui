import type {Pool} from 'pg';
import {MemoryKnowledgeStore,RetrievalService,FixtureHashEmbedder,type RetrievalScope,type KnowledgeStore,type EmbeddingProvider} from '@genui/retrieval-core';
import {migrateRetrieval,PostgresKnowledgeStore,PostgresViewCatalog} from '@genui/retrieval-postgres';
import {MemoryViewCatalog,RAGUIService,type ViewCatalog,type UIActionContract,type UIProposalProvider} from '@genui/ui-compiler';
import {PolicyEngine,type CapabilityContext,type CapabilityRegistry} from '@genui/marketing-core';
export async function createStudioRAG(registry:CapabilityRegistry,context:CapabilityContext,pool?:Pool,hybridFixture=false,adapters?:{embedder?:EmbeddingProvider;proposalProvider?:UIProposalProvider}){
  const embedder=adapters?.embedder??(hybridFixture?new FixtureHashEmbedder():undefined);
  const vector=embedder?{model:embedder.model,dimensions:embedder.dimensions}:undefined;
  if(pool)await migrateRetrieval(pool,vector);
  const knowledge:KnowledgeStore=pool?new PostgresKnowledgeStore(pool,vector):new MemoryKnowledgeStore();
  const views:ViewCatalog=pool?new PostgresViewCatalog(pool):new MemoryViewCatalog();
  const retrieval=new RetrievalService(knowledge,embedder);const compiler=new RAGUIService(retrieval,views,adapters?.proposalProvider);
  // Fixture publication is trusted server-side setup, not an unauthenticated ingestion endpoint.
  for(const cap of registry.list()){
    const view={id:`view.${cap.id}`,version:'1.0.0',tenantId:context.principal.tenantId,published:true,title:cap.description,type:'form' as const,capability:{id:cap.id,version:cap.version},fields:Object.keys(cap.inputSchema.properties??{}),acl:{roles:['marketer'],principals:[]}};
    await views.publish(view);
    await retrieval.ingest({sourceId:`system.${cap.id}`,version:'1.0.0',tenantId:context.principal.tenantId,kind:'system',published:true,content:`${cap.description}. Capability ${cap.id} version ${cap.version}. Published form fields: ${view.fields.join(', ')}. ${cap.requiresConfirmation?'Human approval is required before execution.':'Execution is still governed by capability policy.'}`,provenance:{title:cap.description,uri:`genui://capabilities/${cap.id}/1.0.0`,updatedAt:'2026-10-15T00:00:00Z'},acl:view.acl,capabilities:[view.capability],view:{id:view.id,version:view.version}});
  }
  await retrieval.ingest({sourceId:'marketing.finance-playbook',version:'1.0.0',tenantId:context.principal.tenantId,kind:'marketing',published:true,content:'Finance campaign playbook: establish the campaign project, verify account eligibility and consent, prepare creative assets and an AEP audience, review the journey and obtain independent approval before activation. Numerical performance metrics must be read from the provider at query time, not inferred from this playbook.',provenance:{title:'Approved finance campaign playbook (fixture)',uri:'genui://playbooks/finance/1.0.0',updatedAt:'2026-10-15T00:00:00Z'},acl:{roles:['marketer'],principals:[]},capabilities:[{id:'marketing.campaign.plan',version:'1.0.0'}]});
  async function scope(current:CapabilityContext):Promise<RetrievalScope>{
    const capabilities=[];const policy=new PolicyEngine();
    for(const cap of registry.list()){
      try{policy.assert(current,cap);let available=false;for(const provider of cap.providers)if(await provider.supports(current)){available=true;break;}if(available)capabilities.push({id:cap.id,version:cap.version});}catch{}
    }
    return {tenantId:current.principal.tenantId,principalId:current.principal.id,roles:[...current.principal.roles],capabilities};
  }
  function contracts():UIActionContract[]{return registry.list().map(c=>({id:c.id,version:c.version,inputSchema:c.inputSchema,requiresApproval:c.requiresConfirmation}));}
  return {retrieval,views,knowledge,scope,compose:async(prompt:string,current:CapabilityContext,capabilityIds?:string[])=>{const allowed=await scope(current);if(capabilityIds)allowed.capabilities=allowed.capabilities.filter(c=>capabilityIds.includes(c.id));return compiler.compose(prompt,allowed,contracts());},mode:embedder?(embedder.model==='fixture-token-hash-v1'?'hybrid-fixture':'hybrid'):'lexical',embeddingModel:embedder?.model};
}
