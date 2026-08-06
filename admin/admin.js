let pages=[],current=null,selected=null,media=[],currentElements=[],editingElement=null,elementFilter='all',adminUser=null,menuItems=[],submissions=[],catalog=[],capabilities=[];
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const apiBase=String(window.AVIASAFE_API_BASE||'').replace(/\/$/,'');
const apiUrl=url=>apiBase+url;
const setText=(selector,value)=>{const element=$(selector);if(element)element.textContent=value};
const api=async(url,options={})=>{const r=await fetch(apiUrl(url),{credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});const v=await r.json().catch(()=>({}));if(r.status===401){location.href='/admin/login';throw new Error('Session expired')}if(!r.ok)throw new Error(v.error||'API request failed');return v};
function toast(msg,error=false){const t=$('#toast');if(!t){console.warn(msg);return}t.textContent=msg;t.style.background=error?'#b42318':'#152239';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2400)}
function show(id){$$('.view').forEach(v=>v.classList.toggle('active',v.id===id));$$('.nav-item').forEach(n=>{const active=n.dataset.view===id;n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current')});if(id!=='pageManager')$$('.master-link').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-current')});setText('#crumb',id==='pageManager'?'Page Master':id==='pages'?'Page Masters':id[0].toUpperCase()+id.slice(1))}
const iconFor=id=>({home:'⌂',services:'⚙',approvals:'✓',mro:'⌁',about:'ⓘ',contact:'✉',quote:'₹',query:'?','service-detail':'▦'}[id]||'▤');
const placementName={page_top:'Top of page',after_hero:'After hero banner',after_content:'After main content',before_footer:'Before footer'};
const adminDestinations=[
 {label:'Dashboard',description:'Website overview',view:'dashboard',icon:'◫'},
 {label:'Page Masters',description:'Manage all website pages',view:'pages',icon:'▤'},
 {label:'Media Library',description:'Images and uploads',view:'media',icon:'▧'},
 {label:'Service Catalog',description:'Services and detail pages',view:'catalog',icon:'⚙'},
 {label:'Capability Master',description:'Capability Search records',view:'capabilities',icon:'⌕'},
 {label:'Header Menu',description:'Website navigation',view:'navigation',icon:'☷'},
 {label:'Enquiries',description:'Form submissions',view:'submissions',icon:'✉'},
 {label:'Backup & Restore',description:'Content backup',view:'backup',icon:'↻'},
 {label:'My Profile',description:'Account and password',view:'profile',icon:'♙'}
];
function pageCard(p){return `<article class="page-card" data-id="${p.id}"><div class="page-icon">${iconFor(p.id)}</div><div><b>${p.name}</b><small>${p.blockCount} added · ${p.changeCount} edited</small></div><em>›</em></article>`}
async function loadPages(){
 pages=await api('/api/pages');
 $('#pageGrid').innerHTML=pages.slice(0,6).map(pageCard).join('');
 $('#pageTable').innerHTML=pages.map(p=>`<div class="page-row" data-name="${p.name.toLowerCase()}"><div class="page-icon">${iconFor(p.id)}</div><div><b>${p.name}</b><small>${p.description}</small></div><small>${p.route}</small><span class="badge ${p.status!=='active'?'hidden':''}">${p.status}</span><button class="edit-btn" data-id="${p.id}">Manage →</button></div>`).join('');
 $('#masterMenu').innerHTML=pages.map(p=>`<button type="button" class="master-link" data-id="${p.id}" aria-label="Manage ${p.name}"><span>${iconFor(p.id)}</span><div><b>${p.name}</b><small>${p.route}</small></div><i>›</i></button>`).join('');
 if($('#changeCount'))$('#changeCount').textContent=pages.reduce((n,p)=>n+p.blockCount+p.changeCount,0);
 const services=pages.find(p=>p.id==='services');if($('#serviceCount'))$('#serviceCount').textContent=6+(services?.blockCount||0);
 $$('.page-card,.edit-btn,.master-link').forEach(el=>el.onclick=()=>openManager(el.dataset.id));
}
async function openManager(id){
 current=await api('/api/pages/'+id);
 $('#managerTitle').textContent=current.name;$('#managerRoute').textContent=`${current.route} · ${current.description}`;
 const route=current.route.includes(':slug')?'/service/aircraft-life-vest':current.route;
 $('#managerPreview').href=route;$('#settingName').value=current.name;$('#settingDescription').value=current.description;$('#settingStatus').value=current.status;
 const services=current.id==='services';$('#pageHelpTitle').textContent=services?'Manage your Services cards':'How to add content on this page';$('#pageHelpText').textContent=services?'Add a complete card inside the existing services grid. It will appear after the current cards—not as a separate banner.':'Click “Add content”, choose Image or Text, then select exactly where it should appear.';$('#helpAddImage').textContent=services?'+ Add Service Card':'+ Add an image';
 $$('.master-link').forEach(x=>{const active=x.dataset.id===id;x.classList.toggle('active',active);if(active)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});renderBlocks();show('pageManager');
 await loadElements();$('#syncState').textContent='Reading live page…';$('#pageScanner').src=route+(route.includes('?')?'&':'?')+'adminScan=1&t='+Date.now();
}
async function loadElements(){currentElements=await api('/api/pages/'+current.id+'/elements');renderElements();$('#syncState').textContent=currentElements.length?'Synced':'Waiting for sync'}
function renderElements(){
 const list=currentElements.filter(e=>elementFilter==='all'||e.type===elementFilter);
 $('#elementTotal').textContent=`${currentElements.length} fields`;
 $('#elementList').innerHTML=list.length?list.map(e=>{const value=e.type==='image'?(e.savedValues.src||e.originalSrc):(e.savedValues.text??e.originalText);return `<article class="element-row ${e.savedValues.hidden?'is-hidden':''}" data-type="${e.type}"><div class="element-preview">${e.type==='image'?`<img src="${e.savedValues.src||e.originalSrc}">`:`<span>${e.type==='heading'?'H':e.type==='link'?'↗':'¶'}</span>`}</div><div><div class="element-meta"><b>${e.label}</b><em>${e.type}</em>${e.savedValues.hidden?'<i>Hidden</i>':''}</div><p>${(value||'Empty content').slice(0,115)}</p></div><button class="edit-existing" data-id="${e.id}">Edit</button></article>`}).join(''):`<div class="block-empty"><strong>No ${elementFilter==='all'?'content':elementFilter+'s'} found</strong><p>The live page scanner will update this list automatically.</p></div>`;
 $$('.edit-existing').forEach(b=>b.onclick=()=>openElementModal(b.dataset.id));
}
function openElementModal(id){
 editingElement=currentElements.find(e=>e.id===id);const e=editingElement,s=e.savedValues||{},image=e.type==='image';
 $('#elementId').value=e.id;$('#elementModalTitle').textContent=`Edit ${e.type}`;$('#existingType').textContent=e.type.toUpperCase();$('#existingLabel').textContent=e.label;$('#existingSelector').textContent=e.selector;
 $('#existingTextField').hidden=image;$('#existingImageFields').hidden=!image;$('#existingLinkField').hidden=e.type!=='link';
 $('#existingText').value=s.text??e.originalText??'';$('#existingSrc').value=s.src??e.originalSrc??'';$('#existingAlt').value=s.alt??e.originalAlt??'';$('#existingHref').value=s.href??e.originalHref??'';$('#existingVisible').checked=!s.hidden;
 if(image){$('#existingThumb').src=s.src||e.originalSrc}$('#elementModal').hidden=false;
}
function renderBlocks(){
 const blocks=[...(current.blocks||[])].sort((a,b)=>a.order-b.order);$('#blockTotal').textContent=`${blocks.length} block${blocks.length===1?'':'s'}`;
 $('#blockList').innerHTML=blocks.length?blocks.map(b=>`<article class="block-item"><div class="block-type-icon">${b.type==='service_card'?'▦':b.type==='image'?'▧':b.type==='heading'?'H':b.type==='button'?'↗':'¶'}</div><div><b>${b.label}</b><small>${b.type.replace('_',' ').toUpperCase()} · ${(b.content||b.image||'No content').slice(0,75)}</small><em class="placement-badge">⌖ ${b.placement==='service_grid'?'Inside Services card grid':placementName[b.placement]||placementName.before_footer}</em></div><span class="badge ${!b.visible?'hidden':''}">${b.visible?'Published':'Hidden'}</span><div class="block-actions"><button class="icon-btn block-toggle" data-id="${b.id}">${b.visible?'◉':'○'}</button><button class="icon-btn block-edit" data-id="${b.id}">✎</button><button class="icon-btn delete block-delete" data-id="${b.id}">⌫</button></div></article>`).join(''):`<div class="block-empty"><span>＋</span><strong>This page has no custom content</strong><p>Choose exactly what to add and where it should appear.</p><button class="primary" onclick="openBlockModal()">+ Add content</button></div>`;
 $$('.block-edit').forEach(b=>b.onclick=()=>openBlockModal(b.dataset.id));
 $$('.block-toggle').forEach(b=>b.onclick=async()=>{const x=current.blocks.find(v=>v.id===b.dataset.id);await api('/api/blocks/'+x.id,{method:'PUT',body:JSON.stringify({visible:!x.visible})});await openManager(current.id);toast('Visibility updated on website')});
 $$('.block-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this content from the website?'))return;await api('/api/blocks/'+b.dataset.id,{method:'DELETE'});await openManager(current.id);await loadPages();toast('Content deleted')});
}
window.openBlockModal=id=>{const b=id?current.blocks.find(x=>x.id===id):null,defaultType=current.id==='services'?'service_card':'image';$('#modalTitle').textContent=b?'Edit content':current.id==='services'?'Add 7th Service Card':`Add content to ${current.name}`;$('#blockId').value=b?.id||'';$('#blockType').value=b?.type||defaultType;$('#blockLabel').value=b?.label||'';$('#blockContent').value=b?.content||'';$('#blockDescription').value=b?.description||'';$('#blockImage').value=b?.image||'';$('#blockAlt').value=b?.alt||'';$('#blockLink').value=b?.link||'/contact';$('#blockVisible').checked=b?.visible!==false;const placement=document.querySelector(`input[name="placement"][value="${b?.placement||'after_hero'}"]`);if(placement)placement.checked=true;$('#blockThumb').hidden=!b?.image;if(b?.image)$('#blockThumb').src=b.image;updateTypeFields();$('#contentModal').hidden=false};
function updateTypeFields(){const type=$('#blockType').value,card=type==='service_card',image=type==='image'||card;$('#blockImageFields').hidden=!image;$('#blockLinkField').hidden=!(type==='button'||card);$('#blockDescriptionField').hidden=!card;$('.placement-field').hidden=card;$('#serviceGridNotice').hidden=!card;$('#blockContentLabel').firstChild.textContent=card?'Service title':type==='image'?'Image caption':'Content'}
async function upload(file){const fd=new FormData();fd.append('image',file);const r=await fetch(apiUrl('/api/upload'),{method:'POST',credentials:'include',body:fd}),v=await r.json();if(!r.ok)throw new Error(v.error);return v}
function closeModal(){$('#contentModal').hidden=true}
$('#blockForm').onsubmit=async e=>{e.preventDefault();try{const id=$('#blockId').value,type=$('#blockType').value,p={type,label:$('#blockLabel').value,content:$('#blockContent').value,description:$('#blockDescription').value,image:$('#blockImage').value,alt:$('#blockAlt').value,link:$('#blockLink').value,placement:type==='service_card'?'service_grid':$('input[name="placement"]:checked').value,visible:$('#blockVisible').checked};if(['image','service_card'].includes(p.type)&&!p.image)throw new Error('Please choose and upload an image');if(p.type==='service_card'&&!p.content)throw new Error('Please enter the service title');await api(id?'/api/blocks/'+id:'/api/pages/'+current.id+'/blocks',{method:id?'PUT':'POST',body:JSON.stringify(p)});closeModal();await openManager(current.id);await loadPages();toast(id?'Card updated in real time':p.type==='service_card'?'New card added inside Services grid':`${placementName[p.placement]} content published`)}catch(e){toast(e.message,true)}};
$('#closeModal').onclick=$('#cancelModal').onclick=closeModal;$('#blockType').onchange=updateTypeFields;$('#addContentBtn').onclick=()=>openBlockModal();
$('#helpAddImage').onclick=()=>openBlockModal();
$('#blockUpload').onchange=async e=>{try{const item=await upload(e.target.files[0]);$('#blockImage').value=item.path;$('#blockThumb').src=item.path;$('#blockThumb').hidden=false;toast('Image uploaded')}catch(e){toast(e.message,true)}};
$('#saveSettings').onclick=async()=>{try{const id=current.id;await api('/api/pages/'+id,{method:'PUT',body:JSON.stringify({name:$('#settingName').value,description:$('#settingDescription').value,status:$('#settingStatus').value})});await loadPages();await openManager(id);toast('Page master updated')}catch(e){toast(e.message,true)}};
$('#visualEditBtn').onclick=()=>{const route=current.route.includes(':slug')?'/service/aircraft-life-vest':current.route;openEditor(route)};
function openEditor(path){const p=pages.find(x=>x.route===path)||(path.startsWith('/service/')?pages.find(x=>x.id==='service-detail'):pages[0]);current=p;selected=null;$('#editorTitle').textContent=p.name;$('#previewUrl').textContent=location.origin+path;$('#openPage').href=path;$('#preview').src=path+'?adminEdit=1&t='+Date.now();$('#emptyInspector').hidden=false;$('#editForm').hidden=true;show('editor')}
window.addEventListener('message',async e=>{if(e.origin!==location.origin)return;if(e.data?.type==='aviasafe:selected'){selected=e.data;fillForm(selected)}if(e.data?.type==='aviasafe:saved'){toast('Website content updated');$('#saveState').textContent='Published through API';loadPages()}if(e.data?.type==='aviasafe:error')toast(e.data.message,true);if(e.data?.type==='aviasafe:catalog'&&current&&(current.route===e.data.path||current.route.includes(':slug')&&e.data.path.startsWith('/service/'))){try{$('#syncState').textContent='Saving inventory…';await api('/api/pages/'+current.id+'/elements/sync',{method:'POST',body:JSON.stringify({elements:e.data.elements})});await loadElements();$('#syncState').textContent='Live page synced';toast(`${e.data.elements.length} page fields ready to manage`)}catch(error){toast(error.message,true)}}});
function fillForm(v){$('#emptyInspector').hidden=true;$('#editForm').hidden=false;$('#elementTag').textContent=v.tag.toUpperCase();$('#elementSelector').textContent=v.selector;const img=v.tag==='img';$('#textField').hidden=img;$('#srcField').hidden=!img;$('#altField').hidden=!img;$('#hrefField').hidden=v.tag!=='a';$('#fieldText').value=v.text||'';$('#fieldSrc').value=v.src||'';$('#fieldAlt').value=v.alt||'';$('#fieldHref').value=v.href||'';$('#fieldVisible').checked=!v.hidden}
$('#editForm').onsubmit=e=>{e.preventDefault();if(!selected)return;const values=selected.tag==='img'?{src:$('#fieldSrc').value,alt:$('#fieldAlt').value,hidden:!$('#fieldVisible').checked}:{text:$('#fieldText').value,href:$('#fieldHref').value,hidden:!$('#fieldVisible').checked};$('#preview').contentWindow.postMessage({type:'aviasafe:update',selector:selected.selector,values},location.origin)};
$('#deleteElement').onclick=()=>selected&&$('#preview').contentWindow.postMessage({type:'aviasafe:update',selector:selected.selector,values:{hidden:true}},location.origin);$('#restoreElement').onclick=()=>selected&&$('#preview').contentWindow.postMessage({type:'aviasafe:update',selector:selected.selector,values:{hidden:false}},location.origin);
async function loadMedia(){media=await api('/api/media');const built=['air.png','about-hero.jpg','mro-hero.jpg','hero.jpg','equipment.jpg','svc-lifevest.jpg','svc-liferaft.jpg'].map((x,i)=>({id:'built-'+i,path:'/img/'+x,built:true}));if($('#dashboardMediaCount'))$('#dashboardMediaCount').textContent=63+media.length;$('#mediaGrid').innerHTML=[...media,...built].map(m=>`<div class="media-item"><img src="${m.path}" loading="lazy"><div class="media-copy" data-path="${m.path}">${m.path}</div>${m.built?'':`<button class="media-delete" data-id="${m.id}">⌫</button>`}</div>`).join('');$$('.media-copy').forEach(x=>x.onclick=()=>navigator.clipboard.writeText(x.dataset.path).then(()=>toast('Image path copied')));$$('.media-delete').forEach(x=>x.onclick=async()=>{if(confirm('Delete this uploaded image?')){await api('/api/media/'+x.dataset.id,{method:'DELETE'});loadMedia();toast('Image deleted')}})}
$('#mediaUpload').onchange=async e=>{try{await upload(e.target.files[0]);await loadMedia();toast('Image uploaded through API')}catch(e){toast(e.message,true)}};
$$('.content-filters button').forEach(b=>b.onclick=()=>{$$('.content-filters button').forEach(x=>x.classList.remove('active'));b.classList.add('active');elementFilter=b.dataset.filter;renderElements()});
function closeElementModal(){$('#elementModal').hidden=true;editingElement=null}
$('#closeElementModal').onclick=$('#cancelElementModal').onclick=closeElementModal;
$('#existingUpload').onchange=async e=>{try{const item=await upload(e.target.files[0]);$('#existingSrc').value=item.path;$('#existingThumb').src=item.path;toast('Replacement image uploaded')}catch(error){toast(error.message,true)}};
$('#elementForm').onsubmit=async e=>{e.preventDefault();if(!editingElement)return;const image=editingElement.type==='image',values=image?{src:$('#existingSrc').value,alt:$('#existingAlt').value,hidden:!$('#existingVisible').checked}:{text:$('#existingText').value,href:editingElement.type==='link'?$('#existingHref').value:undefined,hidden:!$('#existingVisible').checked};await api('/api/elements/'+editingElement.id,{method:'PUT',body:JSON.stringify(values)});closeElementModal();await loadElements();toast('Existing website content updated')};
$('#hideExisting').onclick=async()=>{if(!editingElement)return;await api('/api/elements/'+editingElement.id,{method:'PUT',body:JSON.stringify({hidden:true})});closeElementModal();await loadElements();toast('Content hidden from website')};
async function loadAdminUser(){const result=await api('/api/auth/me');adminUser=result.user;const initials=adminUser.name.split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();setText('#headerUserName',adminUser.name);setText('#headerUserRole',adminUser.role);setText('#headerAvatar',initials);setText('#profileAvatar',initials);setText('#profileDisplayName',adminUser.name);setText('#profileRole',adminUser.role);if($('#profileName'))$('#profileName').value=adminUser.name;if($('#profileEmail'))$('#profileEmail').value=adminUser.email}
async function loadNavigation(){menuItems=await api('/api/navigation');$('#menuCount').textContent=`${menuItems.length} links`;$('#menuList').innerHTML=menuItems.map(m=>`<article class="menu-row"><span class="menu-grip">⋮⋮</span><div><b>${m.label}</b><small>${m.url}</small></div><span class="badge ${!m.visible?'hidden':''}">${m.visible?'Visible':'Hidden'}</span><span class="menu-order">#${m.order}</span><button class="icon-btn menu-edit" data-id="${m.id}">✎</button><button class="icon-btn delete menu-delete" data-id="${m.id}">⌫</button></article>`).join('');$('#menuPreview').innerHTML=menuItems.filter(m=>m.visible).map(m=>`<a>${m.label}</a>`).join('');$$('.menu-edit').forEach(b=>b.onclick=()=>openMenuModal(b.dataset.id));$$('.menu-delete').forEach(b=>b.onclick=async()=>{if(confirm('Remove this link from website header?')){await api('/api/navigation/'+b.dataset.id,{method:'DELETE'});await loadNavigation();toast('Header menu updated')}})}
function openMenuModal(id){const m=id?menuItems.find(x=>x.id===id):null;$('#menuModalTitle').textContent=m?'Edit menu item':'Add menu item';$('#menuId').value=m?.id||'';$('#menuLabel').value=m?.label||'';$('#menuUrl').value=m?.url||'';$('#menuTarget').value=m?.target||'_self';$('#menuOrder').value=m?.order||menuItems.length+1;$('#menuVisible').checked=m?.visible!==false;$('#menuModal').hidden=false}
function closeMenuModal(){$('#menuModal').hidden=true}
$('#addMenuBtn').onclick=()=>openMenuModal();$('#closeMenuModal').onclick=$('#cancelMenuModal').onclick=closeMenuModal;
$('#menuForm').onsubmit=async e=>{e.preventDefault();const id=$('#menuId').value,p={label:$('#menuLabel').value,url:$('#menuUrl').value,target:$('#menuTarget').value,order:Number($('#menuOrder').value),visible:$('#menuVisible').checked};await api(id?'/api/navigation/'+id:'/api/navigation',{method:id?'PUT':'POST',body:JSON.stringify(p)});closeMenuModal();await loadNavigation();toast('Website header menu published')};
$('#profileForm').onsubmit=async e=>{e.preventDefault();const result=await api('/api/auth/profile',{method:'PUT',body:JSON.stringify({name:$('#profileName').value,email:$('#profileEmail').value,password:$('#profilePassword').value})});adminUser=result.user;$('#profilePassword').value='';await loadAdminUser();toast('Profile updated')};
async function logout(){const button=$('#logoutBtn');if(button){button.disabled=true;button.textContent='Logging out…'}try{await fetch(apiUrl('/api/auth/logout'),{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include'})}finally{localStorage.removeItem('aviasafe_content_v1');location.replace('/admin/login')}}$('#logoutBtn').onclick=logout;$('#profileShortcut').onclick=()=>show('profile');
async function loadSubmissions(){submissions=await api('/api/v1/submissions');renderSubmissions();const fresh=submissions.filter(x=>x.status==='new').length;setText('#submissionBadge',fresh);setText('#newSubmissionCount',fresh);setText('#progressSubmissionCount',submissions.filter(x=>x.status==='in_progress').length);setText('#resolvedSubmissionCount',submissions.filter(x=>x.status==='resolved').length)}
function renderSubmissions(){const query=($('#submissionSearch')?.value||'').toLowerCase(),filter=$('#submissionFilter')?.value||'all',list=submissions.filter(x=>(filter==='all'||x.formType===filter)&&`${x.name} ${x.email} ${x.subject} ${x.message}`.toLowerCase().includes(query));$('#submissionList').innerHTML=list.length?list.map(x=>`<article class="submission-row"><span>${x.formType}</span><div><b>${x.name||'Unknown visitor'}</b><small>${x.email||x.phone||'No contact'}</small></div><div><b>${x.subject||x.service||'Website enquiry'}</b><small>${(x.message||'No message').slice(0,65)}</small></div><small>${new Date(x.createdAt).toLocaleString()}</small><select class="submission-status" data-id="${x.id}"><option value="new" ${x.status==='new'?'selected':''}>New</option><option value="in_progress" ${x.status==='in_progress'?'selected':''}>In progress</option><option value="resolved" ${x.status==='resolved'?'selected':''}>Resolved</option><option value="archived" ${x.status==='archived'?'selected':''}>Archived</option></select><button class="submission-delete" data-id="${x.id}">Delete</button></article>`).join(''):'<div class="submission-empty">No website enquiries found.</div>';$$('.submission-status').forEach(s=>s.onchange=async()=>{await api('/api/v1/submissions/'+s.dataset.id,{method:'PUT',body:JSON.stringify({status:s.value})});await loadSubmissions();toast('Enquiry status updated')});$$('.submission-delete').forEach(b=>b.onclick=async()=>{if(confirm('Delete this enquiry?')){await api('/api/v1/submissions/'+b.dataset.id,{method:'DELETE'});await loadSubmissions();toast('Enquiry deleted')}})}
$('#submissionSearch').oninput=renderSubmissions;$('#submissionFilter').onchange=renderSubmissions;$('#refreshSubmissions').onclick=loadSubmissions;
async function loadCatalog(){catalog=await api('/api/services');setText('#catalogTotal',`${catalog.length} services`);$('#catalogTable').innerHTML=catalog.length?catalog.map(s=>`<article class="catalog-row"><img src="${s.image}" alt="${s.title}"><div><b>${s.title}</b><small>/service/${s.slug}</small><small>${(s.tagline||'').slice(0,90)}</small></div><span class="badge ${!s.visible?'hidden':''}">${s.visible?'Published':'Hidden'}</span><div class="catalog-actions"><button class="icon-btn catalog-edit" data-id="${s.id}">✎</button><button class="icon-btn catalog-toggle" data-id="${s.id}">${s.visible?'◉':'○'}</button></div><button class="icon-btn delete catalog-delete" data-id="${s.id}">⌫</button></article>`).join(''):'<div class="catalog-empty">No services in database.</div>';$$('.catalog-edit').forEach(b=>b.onclick=()=>editCatalog(b.dataset.id));$$('.catalog-toggle').forEach(b=>b.onclick=async()=>{const s=catalog.find(x=>x.id===b.dataset.id);await api('/api/services/'+s.id,{method:'PUT',body:JSON.stringify({visible:!s.visible})});await loadCatalog();toast('Service visibility updated')});$$('.catalog-delete').forEach(b=>b.onclick=async()=>{if(confirm('Delete this service card and detail page?')){await api('/api/services/'+b.dataset.id,{method:'DELETE'});await loadCatalog();toast('Service deleted')}})}
async function editCatalog(id){const old=id?catalog.find(x=>x.id===id):null,title=prompt('Service title',old?.title||'');if(title===null||!title.trim())return;const slug=prompt('URL slug',old?.slug||title.toLowerCase().replace(/[^a-z0-9]+/g,'-'));if(slug===null)return;const image=prompt('Image path',old?.image||'/img/equipment.jpg');if(image===null)return;const tagline=prompt('Short card description',old?.tagline||'');if(tagline===null)return;const description=prompt('Full service description',old?.description||'');if(description===null)return;const points=prompt('Service points separated with |',(old?.points||[]).join(' | '));if(points===null)return;const payload={title,slug,image,tagline,description,points:points.split('|').map(x=>x.trim()).filter(Boolean),visible:old?.visible!==false};await api(old?'/api/services/'+old.id:'/api/services',{method:old?'PUT':'POST',body:JSON.stringify(payload)});await loadCatalog();toast(old?'Service updated on website':'Service added to website')}
$('#addCatalogService').onclick=()=>editCatalog();
async function loadCapabilities(){
 capabilities=await api('/api/capabilities');
 const chapters=[...new Set(capabilities.map(x=>x.chapter).filter(Boolean))].sort(),aircraft=[...new Set(capabilities.map(x=>x.aircraft).filter(Boolean))].sort();
 setText('#capAdminTotal',capabilities.length);setText('#capAdminPublished',capabilities.filter(x=>x.visible).length);setText('#capAdminAircraft',aircraft.length);setText('#capAdminChapters',chapters.length);
 const selected=$('#capAdminFilter').value;$('#capAdminFilter').innerHTML='<option value="">All chapters</option>'+chapters.map(x=>`<option value="${x}">${x}</option>`).join('');$('#capAdminFilter').value=selected;
 $('#aircraftOptions').innerHTML=aircraft.map(x=>`<option value="${x}">`).join('');$('#chapterOptions').innerHTML=chapters.map(x=>`<option value="${x}">`).join('');
 renderCapabilities();
}
function renderCapabilities(){
 const q=($('#capAdminSearch').value||'').toLowerCase(),chapter=$('#capAdminFilter').value;
 const list=capabilities.filter(x=>(!chapter||x.chapter===chapter)&&`${x.partNumber} ${x.manufacturer} ${x.description} ${x.aircraft} ${x.chapter}`.toLowerCase().includes(q));
 setText('#capAdminCount',`${list.length} record${list.length===1?'':'s'}`);
 $('#capabilityTable').innerHTML=list.length?list.map(x=>`<article class="capability-admin-row">
   <div class="cap-part"><b>${x.partNumber}</b><small>${x.manufacturer}</small></div>
   <div class="cap-desc"><b>${x.description}</b><small>${x.aircraft} · ${x.chapter}</small></div>
   <span class="badge ${!x.visible?'hidden':''}">${x.visible?'Published':'Hidden'}</span>
   <span class="menu-order">#${x.order}</span>
   <div class="catalog-actions"><button class="icon-btn capability-edit" data-id="${x.id}" title="Edit">✎</button><button class="icon-btn capability-toggle" data-id="${x.id}" title="Show/hide">${x.visible?'◉':'○'}</button><button class="icon-btn delete capability-delete" data-id="${x.id}" title="Delete">⌫</button></div>
 </article>`).join(''):'<div class="catalog-empty">No matching capability records.</div>';
 $$('.capability-edit').forEach(button=>button.onclick=()=>openCapabilityModal(button.dataset.id));
 $$('.capability-toggle').forEach(button=>button.onclick=async()=>{const item=capabilities.find(x=>x.id===button.dataset.id);await api('/api/capabilities/'+item.id,{method:'PUT',body:JSON.stringify({visible:!item.visible})});await loadCapabilities();toast('Capability visibility updated on website')});
 $$('.capability-delete').forEach(button=>button.onclick=async()=>{const item=capabilities.find(x=>x.id===button.dataset.id);if(!confirm(`Delete ${item.partNumber} from website search?`))return;await api('/api/capabilities/'+item.id,{method:'DELETE'});await loadCapabilities();toast('Capability deleted from website search')});
}
function openCapabilityModal(id){
 const item=id?capabilities.find(x=>x.id===id):null;
 $('#capabilityModalTitle').textContent=item?'Edit capability':'Add capability';$('#capabilityId').value=item?.id||'';
 $('#capabilityPart').value=item?.partNumber||'';$('#capabilityManufacturer').value=item?.manufacturer||'';$('#capabilityDescription').value=item?.description||'';
 $('#capabilityAircraft').value=item?.aircraft||'';$('#capabilityChapter').value=item?.chapter||'';$('#capabilityServiceSlug').value=item?.serviceSlug||'';
 $('#capabilityOrder').value=item?.order||capabilities.length+1;$('#capabilityVisible').checked=item?.visible!==false;$('#capabilityModal').hidden=false;
}
function closeCapabilityModal(){$('#capabilityModal').hidden=true}
$('#addCapability').onclick=()=>openCapabilityModal();$('#closeCapabilityModal').onclick=$('#cancelCapabilityModal').onclick=closeCapabilityModal;
$('#capAdminSearch').oninput=renderCapabilities;$('#capAdminFilter').onchange=renderCapabilities;
$('#capabilityForm').onsubmit=async event=>{event.preventDefault();try{const id=$('#capabilityId').value,payload={partNumber:$('#capabilityPart').value.trim(),manufacturer:$('#capabilityManufacturer').value.trim(),description:$('#capabilityDescription').value.trim(),aircraft:$('#capabilityAircraft').value.trim(),chapter:$('#capabilityChapter').value.trim(),serviceSlug:$('#capabilityServiceSlug').value.trim(),order:Number($('#capabilityOrder').value),visible:$('#capabilityVisible').checked};await api(id?'/api/capabilities/'+id:'/api/capabilities',{method:id?'PUT':'POST',body:JSON.stringify(payload)});closeCapabilityModal();await loadCapabilities();toast(id?'Capability updated on website':'Capability added to website search')}catch(error){toast(error.message,true)}};
function setSidebarCollapsed(collapsed){document.body.classList.toggle('sidebar-collapsed',collapsed);localStorage.setItem('aviasafe_sidebar_collapsed',collapsed?'1':'0')}
setSidebarCollapsed(localStorage.getItem('aviasafe_sidebar_collapsed')==='1');
const adminSidebar=document.querySelector('.sidebar');
$('#sidebarToggle').onclick=()=>{
 if(window.matchMedia('(max-width: 680px)').matches){adminSidebar.classList.toggle('open');return}
 setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
};
adminSidebar.querySelector('nav').addEventListener('click',event=>{if(event.target.closest('button')&&window.matchMedia('(max-width: 680px)').matches)adminSidebar.classList.remove('open')});
window.addEventListener('resize',()=>{if(window.innerWidth>680)adminSidebar.classList.remove('open')});
function setAdminTheme(theme){document.body.dataset.adminTheme=theme;localStorage.setItem('aviasafe_admin_theme',theme);$('#themeToggle').textContent=theme==='dark'?'☾':'☼';$('#themeToggle').title=theme==='dark'?'Switch to light mode':'Switch to dark mode'}
setAdminTheme(localStorage.getItem('aviasafe_admin_theme')||'light');
$('#themeToggle').onclick=()=>setAdminTheme(document.body.dataset.adminTheme==='dark'?'light':'dark');
const globalSearch=$('#adminGlobalSearch'),searchResults=$('#adminSearchResults');
function renderAdminSearch(){
 const query=globalSearch.value.trim().toLowerCase();
 if(!query){searchResults.hidden=true;return}
 const matches=adminDestinations.filter(item=>`${item.label} ${item.description}`.toLowerCase().includes(query));
 searchResults.innerHTML=matches.length?matches.map(item=>`<button data-view="${item.view}"><span>${item.icon}</span><div><b>${item.label}</b><small>${item.description}</small></div><i>→</i></button>`).join(''):'<p>No admin section found.</p>';searchResults.hidden=false;
 searchResults.querySelectorAll('button').forEach(button=>button.onclick=()=>{show(button.dataset.view);searchResults.hidden=true;globalSearch.value='';if(button.dataset.view==='media')loadMedia();if(button.dataset.view==='catalog')loadCatalog();if(button.dataset.view==='capabilities')loadCapabilities();if(button.dataset.view==='navigation')loadNavigation();if(button.dataset.view==='submissions')loadSubmissions()});
}
globalSearch.oninput=renderAdminSearch;globalSearch.onkeydown=event=>{if(event.key==='Escape'){globalSearch.value='';searchResults.hidden=true}if(event.key==='Enter')searchResults.querySelector('button')?.click()};
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();globalSearch.focus();renderAdminSearch()}});
const notificationPanel=$('#notificationPanel');
$('#notificationToggle').onclick=event=>{event.stopPropagation();notificationPanel.hidden=!notificationPanel.hidden;searchResults.hidden=true};
$('#markNotificationsRead').onclick=()=>{$('#notificationCount').hidden=true;notificationPanel.querySelectorAll('article').forEach(item=>item.classList.add('read'));toast('Notifications marked as read')};
document.addEventListener('click',event=>{if(!notificationPanel.contains(event.target)&&event.target!==$('#notificationToggle'))notificationPanel.hidden=true;if(!searchResults.contains(event.target)&&event.target!==globalSearch)searchResults.hidden=true});
const adminEvents=new EventSource(apiUrl('/api/events'),{withCredentials:true});adminEvents.addEventListener('submission',()=>loadSubmissions().catch(()=>{}));
adminEvents.addEventListener('capability',()=>loadCapabilities().catch(()=>{}));
$$('.nav-item').forEach(n=>n.onclick=()=>{show(n.dataset.view);if(n.dataset.view==='media')loadMedia();if(n.dataset.view==='catalog')loadCatalog();if(n.dataset.view==='capabilities')loadCapabilities();if(n.dataset.view==='navigation')loadNavigation();if(n.dataset.view==='profile')loadAdminUser();if(n.dataset.view==='submissions')loadSubmissions()});$$('[data-go]').forEach(b=>b.onclick=()=>show(b.dataset.go));$('#quickEdit').onclick=()=>openManager('home');$('#managerBack').onclick=()=>show('pages');$('#backPages').onclick=()=>current?.id?openManager(current.id):show('pages');$('#pageSearch').oninput=e=>$$('.page-row').forEach(r=>r.hidden=!r.dataset.name.includes(e.target.value.toLowerCase()));
$('#exportBtn').onclick=async()=>{const all=await Promise.all(pages.map(p=>api('/api/pages/'+p.id))),blob=new Blob([JSON.stringify({pages:all,media},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='aviasafe-api-backup.json';a.click();toast('API backup downloaded')};$('#importFile').onchange=()=>toast('Protected API database: manual import disabled',true);$('#resetBtn').onclick=()=>toast('Reset disabled for database safety',true);
loadAdminUser().then(async()=>{for(const loader of [loadPages,loadMedia,loadCatalog,loadCapabilities,loadNavigation,loadSubmissions]){try{await loader()}catch(error){console.error(error);toast('Dashboard data issue: '+error.message,true)}}}).catch(e=>toast('Login session issue: '+e.message,true));


// ===== SEO MANAGER =====
let seoEntries=[];
async function loadSeo(){
  seoEntries=await api('/api/seo');
  $('#seoCount').textContent=`${seoEntries.length} pages`;
  renderSeo();
}
function renderSeo(){
  $('#seoList').innerHTML=seoEntries.length?seoEntries.map(s=>`<article class="submission-row" style="cursor:pointer" data-seo-id="${s.id}">
    <span style="font-weight:700;color:#8FD2F4;min-width:140px">${s.pageRoute}</span>
    <div><b>${s.metaTitle||'(no title set)'}</b><small>${(s.metaDescription||'No description').slice(0,80)}</small></div>
    <small>${s.robots||'index, follow'}</small>
    <button class="icon-btn delete seo-delete" data-id="${s.id}">⌫</button>
  </article>`).join(''):'<div class="submission-empty">No SEO entries yet. Click "+ Add Page SEO" to start.</div>';
  $$('[data-seo-id]').forEach(row=>row.onclick=e=>{if(!e.target.classList.contains('seo-delete'))openSeoModal(row.dataset.seoId)});
  $$('.seo-delete').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(confirm('Delete SEO for this page?')){await api('/api/seo/'+b.dataset.id,{method:'DELETE'});await loadSeo();toast('SEO entry deleted')}});
}
function openSeoModal(id){
  const s=id?seoEntries.find(x=>x.id===id):null;
  $('#seoModalTitle').textContent=s?'Edit SEO':'Add Page SEO';
  $('#seoId').value=s?.id||'';
  $('#seoRoute').value=s?.pageRoute||'';
  $('#seoTitle').value=s?.metaTitle||'';
  $('#seoDescription').value=s?.metaDescription||'';
  $('#seoKeywords').value=s?.metaKeywords||'';
  $('#seoOgTitle').value=s?.ogTitle||'';
  $('#seoOgDescription').value=s?.ogDescription||'';
  $('#seoOgImage').value=s?.ogImage||'';
  if(s?.ogImage){$('#seoOgPreview').src=s.ogImage;$('#seoOgPreview').style.display='block';}else{$('#seoOgPreview').style.display='none';$('#seoOgPreview').src='';}
  $('#seoMediaPicker').hidden=true;
  $('#seoCanonical').value=s?.canonicalUrl||'';
  $('#seoRobots').value=s?.robots||'index, follow';
  $('#seoModal').hidden=false;
}
$('#addSeoBtn').onclick=()=>openSeoModal(null);
$('#seoPickImage').onclick=async function(){
  const picker=$('#seoMediaPicker');
  if(!picker.hidden){picker.hidden=true;return;}
  // Load all available images
  const allMedia=await api('/api/media').catch(()=>[]);
  const builtImages=['air.png','about-hero.jpg','mro-hero.jpg','hero.jpg','equipment.jpg','newlogo1.png','hero-eng.jpg','hero-eng.png','bg.jpg'].map(x=>({path:'/img/'+x}));
  const allImages=[...allMedia,...builtImages];
  $('#seoMediaGrid').innerHTML=allImages.map(m=>`<img src="${m.path}" data-path="${m.path}" style="width:100%;height:60px;object-fit:cover;border-radius:6px;cursor:pointer;border:2px solid transparent;" loading="lazy">`).join('');
  $$('#seoMediaGrid img').forEach(img=>{
    img.onclick=function(){
      $('#seoOgImage').value=this.dataset.path;
      $('#seoOgPreview').src=this.dataset.path;
      $('#seoOgPreview').style.display='block';
      picker.hidden=true;
      toast('OG Image selected');
    };
  });
  picker.hidden=false;
};
$('#seoForm').onsubmit=async e=>{
  e.preventDefault();
  const id=$('#seoId').value;
  const payload={
    pageRoute:$('#seoRoute').value,
    metaTitle:$('#seoTitle').value,
    metaDescription:$('#seoDescription').value,
    metaKeywords:$('#seoKeywords').value,
    ogTitle:$('#seoOgTitle').value,
    ogDescription:$('#seoOgDescription').value,
    ogImage:$('#seoOgImage').value,
    canonicalUrl:$('#seoCanonical').value,
    robots:$('#seoRobots').value
  };
  if(id){await api('/api/seo/'+id,{method:'PUT',body:JSON.stringify(payload)})}
  else{await api('/api/seo',{method:'POST',body:JSON.stringify(payload)})}
  $('#seoModal').hidden=true;
  await loadSeo();
  toast(id?'SEO updated':'SEO added for '+payload.pageRoute);
};
// Add SEO to nav click handler
const origNavClick=$$('.nav-item').find(n=>n.dataset.view==='seo');
if(origNavClick)origNavClick.onclick=()=>{show('seo');loadSeo()};
// Load SEO on init
loadSeo().catch(()=>{});
adminEvents.addEventListener('seo',()=>loadSeo().catch(()=>{}));
