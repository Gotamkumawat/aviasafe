const fs=require('fs');
const BASE=process.env.CMS_URL||'http://127.0.0.1:5000';
const marker='__CMS_TEST__'+Date.now();
let cookie='',sseController,events=0;
const cleanup={blocks:[],media:[],nav:[],changes:[],pages:[]};
const results=[];
function record(scope,test,ok,detail=''){results.push({scope,test,ok,detail});console.log(`${ok?'PASS':'FAIL'} | ${scope} | ${test}${detail?' | '+detail:''}`)}
async function request(path,options={}){
  const headers={...(options.headers||{})};if(cookie)headers.Cookie=cookie;
  if(options.body&&!(options.body instanceof FormData)&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const response=await fetch(BASE+path,{...options,headers});
  const text=await response.text();let value;try{value=JSON.parse(text)}catch{value=text}
  if(!response.ok)throw new Error(`${options.method||'GET'} ${path}: ${response.status} ${value?.error||text}`);
  return {response,value};
}
async function login(){
  const {response,value}=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'admin@aviasafe.local',password:'Admin@123',remember:false})});
  cookie=response.headers.get('set-cookie').split(';')[0];record('Auth','Login API',!!value.user,value.user.email);
}
async function startSse(){
  sseController=new AbortController();
  const response=await fetch(BASE+'/api/events',{signal:sseController.signal});
  (async()=>{try{const reader=response.body.getReader(),decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;events+=(decoder.decode(value).match(/event: (content|navigation|media)/g)||[]).length}}catch{}})();
}
async function pageAudit(page){
  const route=page.route.includes(':slug')?'/service/life-raft':page.route;
  const publicResponse=await fetch(BASE+route);record(page.id,'Public route',publicResponse.ok,`${publicResponse.status}`);
  cleanup.pages.push({id:page.id,name:page.name,description:page.description,status:page.status});
  const testDescription=`${page.description} ${marker}`;
  await request(`/api/pages/${page.id}`,{method:'PUT',body:JSON.stringify({description:testDescription})});
  let current=(await request(`/api/pages/${page.id}`)).value;
  record(page.id,'Page update API',current.description===testDescription);
  await request(`/api/pages/${page.id}`,{method:'PUT',body:JSON.stringify({name:page.name,description:page.description,status:page.status})});
  const created=(await request(`/api/pages/${page.id}/blocks`,{method:'POST',body:JSON.stringify({type:'text',label:marker,content:'Temporary audit content',placement:'before_footer',visible:true})})).value;
  cleanup.blocks.push(created.id);
  await request(`/api/blocks/${created.id}`,{method:'PUT',body:JSON.stringify({content:'Updated temporary audit content',visible:false})});
  current=(await request(`/api/pages/${page.id}`)).value;
  const updated=current.blocks.find(b=>b.id===created.id);
  record(page.id,'Block add/update/hide',updated?.content==='Updated temporary audit content'&&updated.visible===false);
  await request(`/api/blocks/${created.id}`,{method:'DELETE'});cleanup.blocks=cleanup.blocks.filter(x=>x!==created.id);
  current=(await request(`/api/pages/${page.id}`)).value;
  record(page.id,'Block delete',!current.blocks.some(b=>b.id===created.id));
  const selector=`[data-cms-audit="${page.id}-${marker}"]`;
  await request('/api/content/change',{method:'PUT',body:JSON.stringify({path:route,selector,values:{text:'Temporary override',hidden:false}})});
  cleanup.changes.push({path:route,selector});
  current=(await request('/api/pages/by-path?path='+encodeURIComponent(route))).value;
  record(page.id,'Existing content override',current.changes[selector]?.text==='Temporary override');
  await request('/api/content/change',{method:'DELETE',body:JSON.stringify({path:route,selector})});cleanup.changes=cleanup.changes.filter(x=>x.selector!==selector);
}
async function mediaAudit(){
  const before=(await request('/api/media')).value.length;
  const data=new FormData(),file=fs.readFileSync('img/equipment.jpg');data.append('image',new Blob([file],{type:'image/jpeg'}),`${marker}.jpg`);
  const created=(await request('/api/upload',{method:'POST',body:data})).value;cleanup.media.push(created.id);
  const fileResponse=await fetch(BASE+created.path);record('Media','Upload + public file',fileResponse.ok,created.path);
  await request('/api/media/'+created.id,{method:'DELETE'});cleanup.media=[];const after=(await request('/api/media')).value.length;
  record('Media','Delete + count restore',after===before,`${before} → ${after}`);
}
async function navAudit(){
  const before=(await request('/api/navigation')).value;
  const created=(await request('/api/navigation',{method:'POST',body:JSON.stringify({label:marker,url:'/cms-audit',target:'_self',visible:true,order:999})})).value;cleanup.nav.push(created.id);
  await request('/api/navigation/'+created.id,{method:'PUT',body:JSON.stringify({label:marker+' Updated',visible:false})});
  let nav=(await request('/api/navigation')).value.find(x=>x.id===created.id);
  record('Navigation','Add/update/hide',nav?.label.endsWith('Updated')&&!nav.visible);
  await request('/api/navigation/'+created.id,{method:'DELETE'});cleanup.nav=[];
  nav=(await request('/api/navigation')).value;record('Navigation','Delete + count restore',nav.length===before.length);
}
async function profileAudit(){
  const me=(await request('/api/auth/me')).value.user;
  const updated=(await request('/api/auth/profile',{method:'PUT',body:JSON.stringify({name:me.name,email:me.email,password:''})})).value.user;
  record('Profile','Read/update API',updated.name===me.name&&updated.email===me.email);
}
async function finalCleanup(){
  for(const id of cleanup.blocks)try{await request('/api/blocks/'+id,{method:'DELETE'})}catch{}
  for(const id of cleanup.media)try{await request('/api/media/'+id,{method:'DELETE'})}catch{}
  for(const id of cleanup.nav)try{await request('/api/navigation/'+id,{method:'DELETE'})}catch{}
  for(const change of cleanup.changes)try{await request('/api/content/change',{method:'DELETE',body:JSON.stringify(change)})}catch{}
  for(const p of cleanup.pages)try{await request('/api/pages/'+p.id,{method:'PUT',body:JSON.stringify(p)})}catch{}
}
async function verifyClean(){
  const pages=(await request('/api/pages')).value,media=(await request('/api/media')).value,nav=(await request('/api/navigation')).value;
  const dirtyBlocks=pages.reduce((n,p)=>n,0)+(await Promise.all(pages.map(p=>request('/api/pages/'+p.id)))).map(x=>x.value.blocks.filter(b=>b.label.includes(marker)).length).reduce((a,b)=>a+b,0);
  record('Cleanup','No temporary blocks',dirtyBlocks===0);
  record('Cleanup','No temporary media',!media.some(x=>x.name.includes(marker)));
  record('Cleanup','No temporary menu',!nav.some(x=>x.label.includes(marker)));
}
(async()=>{
  try{
    await login();await startSse();
    const pages=(await request('/api/pages')).value;record('Pages','All masters discovered',pages.length===9,`${pages.length} pages`);
    for(const page of pages)await pageAudit(page);
    await mediaAudit();await navAudit();await profileAudit();
    await new Promise(r=>setTimeout(r,400));record('Realtime','SSE mutation events',events>=30,`${events} events received`);
  }catch(error){record('Audit','Unexpected error',false,error.message)}
  finally{
    await finalCleanup();
    try{await verifyClean()}catch(error){record('Cleanup','Verification',false,error.message)}
    try{await request('/api/auth/logout',{method:'POST'});const response=await fetch(BASE+'/api/auth/me',{headers:{Cookie:cookie}});record('Auth','Logout invalidates session',response.status===401,`${response.status}`)}catch(error){record('Auth','Logout',false,error.message)}
    sseController?.abort();
    const passed=results.filter(x=>x.ok).length,failed=results.length-passed;
    console.log(`SUMMARY | ${passed} passed | ${failed} failed | ${results.length} total`);
    process.exitCode=failed?1:0;
  }
})();
