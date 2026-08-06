const {spawnSync}=require('child_process');
const BASE=process.env.CMS_URL||'http://127.0.0.1:5000';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const allPages=[
  ['home','/'],['services','/services'],['approvals','/approvals'],['mro','/mro-facility'],
  ['about','/about'],['contact','/contact'],['quote','/quote'],['query','/query'],
  ['service-detail','/service/life-raft']
];
const requested=new Set(process.argv.slice(2));
const pages=requested.size?allPages.filter(([id])=>requested.has(id)):allPages;
let cookie='';
async function request(path,options={}){
  let last;
  for(let attempt=1;attempt<=3;attempt++)try{
    const response=await fetch(BASE+path,{...options,headers:{'Content-Type':'application/json',Cookie:cookie,...(options.headers||{})}});
    const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(`${path}: ${response.status} ${value.error||''}`);return value;
  }catch(error){last=error;await new Promise(r=>setTimeout(r,500*attempt))}
  throw last;
}
function decode(text){return text.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')}
function extract(id,route){
  const url=BASE+route+(route.includes('?')?'&':'?')+'adminExport=1';
  const profile=`/tmp/aviasafe-cms-migration-${id}-${Date.now()}`;
  const result=spawnSync(CHROME,['--headless=new',`--user-data-dir=${profile}`,'--disable-gpu','--no-first-run','--disable-extensions','--disable-background-networking','--disable-dev-shm-usage','--virtual-time-budget=7000','--dump-dom',url],{encoding:'utf8',maxBuffer:25*1024*1024,timeout:18000});
  if(result.status!==0)throw new Error(result.stderr||`Chrome exited ${result.status}`);
  const match=result.stdout.match(/<script id="cms-export-data" type="application\/json">([\s\S]*?)<\/script>/);
  if(!match)throw new Error('Rendered content export not found');
  return JSON.parse(decode(match[1]));
}
(async()=>{
  const login=await fetch(BASE+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@aviasafe.local',password:'Admin@123',remember:false})});
  if(!login.ok)throw new Error('Admin login failed');cookie=login.headers.get('set-cookie').split(';')[0];
  let total=0;
  for(const [id,route] of pages){
    const catalog=extract(id,route);
    const result=await request(`/api/pages/${id}/elements/sync`,{method:'POST',body:JSON.stringify({elements:catalog.elements})});
    const stored=await request(`/api/pages/${id}/elements`);
    if(stored.length!==result.count)throw new Error(`${id}: stored ${stored.length}, extracted ${result.count}`);
    total+=stored.length;console.log(`MIGRATED | ${id.padEnd(14)} | ${String(stored.length).padStart(3)} elements | ${route}`);
  }
  await request('/api/auth/logout',{method:'POST'});
  console.log(`COMPLETE | ${pages.length} pages | ${total} database-managed elements`);
})().catch(error=>{console.error('MIGRATION FAILED |',error.message);process.exitCode=1});
