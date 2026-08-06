const BASE=process.env.CMS_URL;
const marker='cms-production-audit-'+Date.now();
let cookie='',serviceId='',submissionId='';
const results=[];
function pass(name,ok,detail=''){results.push(ok);console.log(`${ok?'PASS':'FAIL'} | ${name}${detail?' | '+detail:''}`)}
async function request(path,options={}){
  const headers={...(options.headers||{})};
  if(cookie)headers.Cookie=cookie;
  if(options.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
  const response=await fetch(BASE+path,{...options,headers});
  const text=await response.text();let value;try{value=JSON.parse(text)}catch{value=text}
  if(!response.ok)throw new Error(`${options.method||'GET'} ${path}: ${response.status} ${value?.error||text}`);
  return {response,value};
}
(async()=>{
  try{
    const login=await request('/api/auth/login',{method:'POST',body:JSON.stringify({email:'admin@aviasafe.local',password:'Admin@123',remember:false})});
    cookie=login.response.headers.get('set-cookie').split(';')[0];
    const before=(await request('/api/services')).value;
    const created=(await request('/api/services',{method:'POST',body:JSON.stringify({
      slug:marker,title:'Temporary Audit Service',image:'/img/equipment.jpg',
      tagline:'Temporary service card audit',description:'Temporary detail audit',
      points:['Create','Update','Delete'],visible:true,order:999
    })})).value;
    serviceId=created.id;
    let publicSite=(await request('/api/v1/site?path=/services')).value;
    pass('Service card add appears on website',publicSite.services.some(x=>x.id===serviceId));
    await request('/api/services/'+serviceId,{method:'PUT',body:JSON.stringify({title:'Temporary Audit Service Updated',visible:false})});
    publicSite=(await request('/api/v1/site?path=/services')).value;
    pass('Service card edit/hide updates website',!publicSite.services.some(x=>x.id===serviceId));
    await request('/api/services/'+serviceId,{method:'PUT',body:JSON.stringify({visible:true})});
    const detail=(await request('/api/v1/site?path=/service/'+marker)).value;
    pass('Dynamic service detail page works',detail.service?.id===serviceId&&detail.service.title.endsWith('Updated'));
    await request('/api/services/'+serviceId,{method:'DELETE'});serviceId='';
    const after=(await request('/api/services')).value;
    pass('Service delete restores catalog',after.length===before.length,`${before.length} → ${after.length}`);

    const submission=(await request('/api/v1/submissions',{method:'POST',body:JSON.stringify({
      formType:'contact',name:marker,email:'audit@example.test',message:'Temporary production form audit',sourcePath:'/contact'
    })})).value;
    submissionId=submission.id;
    let rows=(await request('/api/v1/submissions')).value;
    pass('Website form reaches admin',rows.some(x=>x.id===submissionId));
    await request('/api/v1/submissions/'+submissionId,{method:'PUT',body:JSON.stringify({status:'resolved'})});
    rows=(await request('/api/v1/submissions')).value;
    pass('Admin submission status update',rows.find(x=>x.id===submissionId)?.status==='resolved');
    await request('/api/v1/submissions/'+submissionId,{method:'DELETE'});submissionId='';
    rows=(await request('/api/v1/submissions')).value;
    pass('Admin submission delete',!rows.some(x=>x.name===marker));
  }catch(error){pass('Unexpected error',false,error.message)}
  finally{
    if(serviceId)try{await request('/api/services/'+serviceId,{method:'DELETE'})}catch{}
    if(submissionId)try{await request('/api/v1/submissions/'+submissionId,{method:'DELETE'})}catch{}
    try{
      const services=(await request('/api/services')).value;
      const submissions=(await request('/api/v1/submissions')).value;
      pass('Extra audit cleanup',!services.some(x=>x.slug===marker)&&!submissions.some(x=>x.name===marker));
      await request('/api/auth/logout',{method:'POST'});
    }catch(error){pass('Cleanup verification',false,error.message)}
    const passed=results.filter(Boolean).length;
    console.log(`SUMMARY | ${passed} passed | ${results.length-passed} failed | ${results.length} total`);
    process.exitCode=results.every(Boolean)?0:1;
  }
})();
