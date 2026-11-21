import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
function compile(file, mocks = {}, globals = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText, {
    exports, URL, URLSearchParams, AbortSignal, ...globals,
    require(name) { assert.ok(Object.hasOwn(mocks,name), `Unexpected import ${name}`); return mocks[name]; },
  });
  return exports;
}
const authors = compile('src/lib/showcase-authors.ts');
const links = compile('src/lib/showcase-links.ts');
const adapter = compile('src/lib/payload-showcases.ts', {'./showcase-authors':authors,'./showcase-links':links});
const post = (id=1) => ({id,title:`Post ${id}`,slug:`post-${id}`,_status:'published',content:{root:{type:'root',children:[{type:'paragraph',children:[{type:'text',text:'Aktueller CMS-Text'}]}]}},gallery:[{url:'https://media.example/old.mp4',posterUrl:'https://media.example/poster.jpg',previewUrl:'https://media.example/preview.mp4'}]});
function loader(fetcher) {
  const requests=[];
  const api=compile('src/app/[lang]/showcase/showcase-data.ts',{'server-only':{},react:{cache:fn=>fn},'@/lib/payload-cms':{getPayloadCmsBaseUrl:()=> 'https://cms.example'},'@/lib/payload-showcases':adapter},{fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:()=>fetcher(url)};}});
  return {api,requests};
}
test('migrated posts retain old IDs, gallery order, video previews, author and resource links',()=>{
  const doc={...post(),legacyResourceId:'old-id',authorName:'Ada',authorBio:'Werkstatt',tags:[{tag:'laser'}],workshop:{resourceId:'w',name:'Laser',slug:'laserraum'},resources:[{resourceId:'tool',name:'Laser'}],projectLinks:[{label:'Plan',url:'https://example.org/plan'}],socialMediaConsent:true};
  const result=adapter.toPayloadShowcase(doc,'https://cms.example');
  assert.equal(result.id,'old-id');assert.equal(result.cmsId,'1');assert.equal(result.prettyTitle,'post-1');
  assert.equal(result.description,'Aktueller CMS-Text');assert.equal(result.author.name,'Ada');assert.equal(result.author.email,null);
  assert.equal(result.workshopResource.id,'w');assert.equal(result.relatedResources[0].id,'tool');assert.equal(result.tags[0],'laser');
  assert.equal(result.mediaPosters[result.image],'https://media.example/poster.jpg');assert.equal(result.socialMediaConsent,true);
});
test('media-library replacements take precedence and unsafe URLs are rejected',()=>{
  const result=adapter.toPayloadShowcase({...post(),heroImage:{url:'/api/media/file/hero.jpg'},gallery:[{media:{url:'/api/media/file/new.jpg'},url:'https://old.example/a.jpg'},{url:'javascript:alert(1)'}]},'https://cms.example');
  assert.deepEqual(Array.from(result.images),['https://cms.example/api/media/file/hero.jpg','https://cms.example/api/media/file/new.jpg']);
});
test('drafts, missing publication status and missing slugs never become public',()=>{
  for(const patch of [{_status:'draft'},{_status:undefined},{slug:null}]) assert.equal(adapter.toPayloadShowcase({...post(),...patch},'https://cms.example'),null);
});
test('legacy news retain source provenance and an honest label when the source has no exact date',()=>{
  const result=adapter.toPayloadShowcase({...post(),sourceType:'legacy-news',originalUrl:'https://konglomerat.org/aktuelles/2020/example',legacyDateLabel:'2020 (genaues Datum nicht angegeben)'},'https://cms.example');
  assert.equal(result.isLegacyNews,true);assert.equal(result.originalUrl,'https://konglomerat.org/aktuelles/2020/example');assert.equal(result.legacyDateLabel,'2020 (genaues Datum nicht angegeben)');
  assert.equal(adapter.toPayloadShowcase(post(),'https://cms.example').isLegacyNews,false);
});
test('legacy feature writes stop before authorization or mutation for migrated projects',async()=>{
  const resourceTypes=compile('src/lib/showcase-resource-type.ts');
  const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{id:'old-id',type:'project',owner_id:'user'}};}};
  const api=compile('src/app/api/campai/resources/[id]/features/route.ts',{
    'next/cache':{},'next/server':{NextResponse:{json:(body,options)=>({body,status:options.status})}},
    '@/app/[lang]/resources/map-features':{},'@/lib/showcase-resource-type':resourceTypes,
    '@/lib/access/resource-access':{},'@/lib/access/server':{loadUserAccess:()=>{throw new Error('Must stop before the write path');}},
    '@/lib/supabase/admin':{createSupabaseAdminClient:()=>{throw new Error('Must not create writer');}},
    '@/lib/supabase/route':{createSupabaseRouteClient:()=>({supabase:{auth:{getUser:async()=>({data:{user:{id:'user'}}})},from:()=>query}})},
  });
  const response=await api.PUT({}, {params:Promise.resolve({id:'old-id'})});
  assert.equal(response.status,409);assert.match(response.body.error,/Payload-CMS/);
});
test('pagination retrieves more than one CMS page and never caches private content',async()=>{
  const {api,requests}=loader(url=>({docs:Array.from({length:url.searchParams.get('page')==='1'?100:45},(_,i)=>post(i+1)),hasNextPage:url.searchParams.get('page')==='1'}));
  assert.equal((await api.loadShowcases(145)).length,145);assert.equal(requests.length,2);
  for(const request of requests){assert.equal(request.options.cache,'no-store');assert.equal(request.url.searchParams.get('where[_status][equals]'),'published');assert.equal(request.url.searchParams.get('draft'),'false');}
});
test('old UUID links resolve to the current post without reading Supabase',async()=>{
  const {api}=loader(url=>({docs:url.searchParams.get('where[legacyResourceId][equals]')==='legacy-uuid'?[{...post(),legacyResourceId:'legacy-uuid',slug:'renamed'}]:[]}));
  assert.equal((await api.loadShowcaseByIdentifier('legacy-uuid')).prettyTitle,'renamed');
});
test('unpublished records cannot leak from a malformed CMS response; outages do not resurrect old copies',async()=>{
  const {api}=loader(()=>({docs:[{...post(),_status:'draft'}]}));assert.equal((await api.loadShowcases()).length,0);assert.equal(await api.loadShowcaseByIdentifier('post-1'),null);
  const unavailable=loader(()=>{throw new Error('offline')});await assert.rejects(()=>unavailable.api.loadShowcases(),/offline/);
});
test('workshop project grids read current Payload posts and preserve their tag filter',async()=>{
  const selection=compile('src/lib/inventory-block.ts',{'@/lib/resource-media':{isImageMediaUrl:()=>true,getResourcePosterUrl:()=>null}});
  const api=compile('src/lib/inventory-block-server.ts',{'server-only':{},'next/cache':{unstable_cache:fn=>fn},'@/lib/supabase/admin':{createSupabaseAdminClient:()=>{throw new Error('Must not read Supabase for projects');}},'./inventory-block':selection,'./payload-showcases':adapter,'@/app/[lang]/showcase/showcase-data':{loadAllShowcases:async()=>[adapter.toPayloadShowcase({...post(),tags:[{tag:'laser'}]},'https://cms.example'),adapter.toPayloadShowcase({...post(2),sourceType:'legacy-news',tags:[{tag:'laser'}]},'https://cms.example')]}},{process:{env:{NODE_ENV:'production'}}});
  const result=await api.loadInventoryBlockItems('laser','showcase');assert.equal(result.unavailable,false);assert.equal(result.items.length,1);assert.equal((await api.loadInventoryBlockItems('holz','showcase')).items.length,0);
});
