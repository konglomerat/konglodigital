import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const helper={};runInNewContext(compile('../src/lib/oauth-client-access.ts'),{exports:helper});
const source=compile('../src/app/[lang]/oauth/consent/OAuthConsentClient.tsx');
async function run({id='inventory-id',configured='inventory-id',backend=false,redirect=false}={}) {
  const calls=[];let complete;const done=new Promise(resolve=>{complete=resolve});
  const supabase={auth:{getUser:async()=>({data:{user:{id:'member'}}}),oauth:{getAuthorizationDetails:async()=>({data:{client:{id,name:'Konglomerat Inventar'},user:{email:'member@example.test'},...(redirect?{redirect_url:'https://registered.example.test/callback'}:{})}})}}};
  const exports={};
  runInNewContext(source,{
    exports,
    require(name){
      if(name==='react')return {useMemo:fn=>fn(),useEffect:fn=>fn(),useState:initial=>[initial,value=>{if(value.status&&value.status!=='loading')complete(value)}]};
      if(name==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};
      if(name.includes('cookie-browser'))return {createSupabaseCookieBrowserClient:()=>supabase};
      if(name.includes('oauth-client-access'))return helper;
      if(name.includes('/access/access'))return {can:()=>backend};
      return {default:()=>null};
    },
    fetch:async(url)=>{calls.push(url);return {ok:true,json:async()=>({access:{}})}},
    window:{location:{assign:url=>complete({status:'redirect',url}),replace:url=>complete({status:'redirect',url})}},
  });
  exports.default({authorizationId:'authorization',inventoryClientId:configured});
  const result=await done;return {result,calls};
}
test('registered inventory client uses its own permissions, without requiring CMS access',async()=>{
 const {result,calls}=await run();assert.equal(result.status,'ready');assert.equal(calls.length,0);
});
test('a spoofed client name or missing inventory configuration does not bypass CMS access',async()=>{
 for(const options of [{id:'cms-id'},{id:'unknown'},{configured:''}]){
 const {result,calls}=await run(options);assert.equal(result.status,'denied');assert.deepEqual(calls,['/api/account/access']);}
});
test('CMS users retain their existing consent flow',async()=>{
 const {result}=await run({id:'cms-id',backend:true});assert.equal(result.status,'ready');
});
test('already approved Supabase authorizations use the provider-issued callback',async()=>{
 const {result}=await run({redirect:true});assert.equal(result.status,'redirect');assert.equal(result.url,'https://registered.example.test/callback');
});
