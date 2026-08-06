(function () {
  const API_BASE=String(window.AVIASAFE_API_BASE||'').replace(/\/$/,'');
  const apiUrl=url=>API_BASE+url;
  const assetUrl=url=>url&&url.startsWith('/uploads/')?API_BASE+url:url;
  const editing = new URLSearchParams(location.search).get('adminEdit') === '1';
  const params=new URLSearchParams(location.search);
  const exportMode=params.get('adminExport')==='1';
  const scanning = params.get('adminScan') === '1'||exportMode;
  const pathNow = () => location.pathname.replace(/\/$/, '') || '/';
  let activePath = pathNow();
  let selected = null, currentPage = null, currentSite=null, applying = false, renderedBlockSignature = '';

  const api = async (url, options) => {
    const response = await fetch(apiUrl(url), { headers: { 'Content-Type':'application/json', ...(options?.headers || {}) }, ...options });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'API error');
    return response.json();
  };
  function managedCandidates() {
    const root=document.querySelector('main')||document.querySelector('#root')||document.body;
    return [...root.querySelectorAll('h1,h2,h3,h4,h5,h6,p,img,a,button')]
      .filter(el=>!el.closest('.cms-added-content,.cms-service-card')&&!el.closest('script,style')&&(el.tagName==='IMG'||el.textContent.trim().length>1));
  }
  function assignStableKeys() {
    const counts={heading:0,text:0,image:0,button:0,link:0};
    managedCandidates().forEach(el=>{
      const tag=el.tagName.toLowerCase();
      const type=el.closest('.hero-d')&&el.classList.contains('hero-b-btn')?'button':
        tag==='img'?'image':/^h[1-6]$/.test(tag)?'heading':tag==='button'?'button':tag==='a'?'link':'text';
      counts[type]++;el.dataset.cmsKey=`${type}-${counts[type]}`;
    });
  }
  function selectorFor(el) {
    if(el.dataset.cmsKey)return `[data-cms-key="${CSS.escape(el.dataset.cmsKey)}"]`;
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    while (el && el !== document.body && parts.length < 9) {
      let part = el.tagName.toLowerCase();
      const stable = [...el.classList].filter(x => !x.startsWith('admin-') && x !== 'cms-managed').slice(0, 2);
      if (stable.length) part += '.' + stable.map(CSS.escape).join('.');
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === el.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      parts.unshift(part); el = parent;
    }
    return parts.join(' > ');
  }
  function editableTarget(el) {
    return el.closest('img, h1, h2, h3, h4, h5, h6, p, a, button, li, label, span') || el;
  }
  function applyChanges(page) {
    if (!page || applying) return;
    applying = true;
    assignStableKeys();
    (page.elements||[]).forEach(item=>{
      let el;try{el=document.querySelector(item.selector)}catch(_){}
      if(!el)return;
      if(el.closest('.hero-d'))return;
      if(item.type==='image'){
        if(item.originalSrc&&el.getAttribute('src')!==assetUrl(item.originalSrc))el.setAttribute('src',assetUrl(item.originalSrc));
        if(item.originalAlt!==undefined)el.alt=item.originalAlt||'';
      }else if(item.originalHtml!==null&&item.originalHtml!==undefined&&el.innerHTML!==item.originalHtml){
        el.innerHTML=item.originalHtml;
      }
      if(item.type==='link'&&item.originalHref)el.setAttribute('href',item.originalHref);
      el.dataset.cmsDatabase='true';
    });
    renderApiServices();
    Object.entries(page.changes || {}).forEach(([selector, change]) => {
      let el; try { el = document.querySelector(selector); } catch (_) {}
      if (!el) return;
      if (change.text !== undefined && el.tagName !== 'IMG' && el.textContent !== change.text) el.textContent = change.text;
      if (change.src !== undefined && el.tagName === 'IMG' && el.getAttribute('src') !== assetUrl(change.src)) el.setAttribute('src', assetUrl(change.src));
      if (change.alt !== undefined && el.tagName === 'IMG') el.alt = change.alt;
      if (change.href !== undefined && el.tagName === 'A') el.setAttribute('href', change.href);
      el.style.setProperty('display', change.hidden ? 'none' : '', 'important');
      el.classList.add('cms-managed');
    });
    renderBlocks(page.blocks || []);
    applying = false;
  }
  function renderBlocks(blocks) {
    const signature=activePath+JSON.stringify(blocks.map(b=>[b.id,b.type,b.content,b.image,b.alt,b.link,b.placement,b.visible,b.order]));
    if(signature===renderedBlockSignature&&(document.querySelector('.cms-added-content')||document.querySelector('.cms-service-card')))return;
    renderedBlockSignature=signature;
    document.querySelectorAll('.cms-added-content').forEach(el=>el.remove());
    document.querySelectorAll('.cms-service-card').forEach(el=>el.remove());
    const visible = blocks.filter(b => b.visible).sort((a,b) => a.order-b.order);
    if (!visible.length) return;
    const groups = Object.groupBy ? Object.groupBy(visible,b=>b.placement||'before_footer') :
      visible.reduce((all,b)=>{(all[b.placement||'before_footer']||=[]).push(b);return all},{});
    Object.entries(groups).forEach(([placement,items])=>{
      if(placement==='service_grid'){renderServiceCards(items);return}
      const section=document.createElement('section');
      section.className=`cms-added-content cms-placement-${placement}`;
      section.dataset.placement=placement;
      section.innerHTML=`<div class="cms-added-inner">${items.map(blockHtml).join('')}</div>`;
      insertAt(section,placement);
    });
  }
  function renderServiceCards(items) {
    const grid=document.querySelector('.mro-grid')||document.querySelector('.svc2-grid');
    if(!grid)return;
    items.forEach(b=>{
      const card=document.createElement('article');
      card.className=grid.classList.contains('mro-grid')?'mro-card cms-service-card':'cms-service-card svc2-card';
      card.dataset.cmsBlock=b.id;
      if(grid.classList.contains('mro-grid')){
        card.innerHTML=`<div class="mro-media"><img src="${esc(assetUrl(b.image))}" alt="${esc(b.alt||b.content)}" loading="lazy"></div><div class="mro-body"><h3>${esc(b.content)}</h3><p>${esc(b.description)}</p><a href="${esc(b.link||'/contact')}" class="mro-enquire">Enquire Now <span>→</span></a></div>`;
      }else{
        card.innerHTML=`<div class="svc2-media"><img src="${esc(assetUrl(b.image))}" alt="${esc(b.alt||b.content)}" loading="lazy"></div><div class="svc2-text"><h3>${esc(b.content)}</h3></div>`;
        card.onclick=()=>location.href=b.link||'/contact';
      }
      grid.appendChild(card);
    });
  }
  function insertAt(section,placement) {
    const main=document.querySelector('main')||document.querySelector('#root > div')||document.body;
    const header=document.querySelector('header');
    const footer=document.querySelector('footer');
    const sections=[...main.querySelectorAll(':scope > section')].filter(x=>!x.classList.contains('cms-added-content'));
    if(placement==='page_top') {
      if(header?.parentNode) header.parentNode.insertBefore(section,header.nextSibling); else main.prepend(section);
    } else if(placement==='after_hero') {
      const hero=sections[0];if(hero?.parentNode)hero.parentNode.insertBefore(section,hero.nextSibling);else main.prepend(section);
    } else if(placement==='after_content') {
      const last=sections.at(-1);if(last?.parentNode)last.parentNode.insertBefore(section,last.nextSibling);else (footer?.parentNode||main).insertBefore(section,footer||null);
    } else {
      (footer?.parentNode||main).insertBefore(section,footer||null);
    }
  }
  function esc(value='') {
    const div=document.createElement('div'); div.textContent=value; return div.innerHTML;
  }
  function blockHtml(b) {
    if (b.type === 'heading') return `<h2 data-cms-block="${b.id}">${esc(b.content)}</h2>`;
    if (b.type === 'image') return `<figure data-cms-block="${b.id}"><img src="${esc(assetUrl(b.image))}" alt="${esc(b.alt)}"><figcaption>${esc(b.content)}</figcaption></figure>`;
    if (b.type === 'button') return `<a class="cms-button" data-cms-block="${b.id}" href="${esc(b.link || '#')}">${esc(b.content)}</a>`;
    return `<div class="cms-text" data-cms-block="${b.id}">${esc(b.content).replace(/\n/g,'<br>')}</div>`;
  }
  async function refresh() {
    try { activePath=pathNow();document.body?.setAttribute('data-cms-path',activePath);const site=await api('/api/v1/site?path='+encodeURIComponent(activePath));currentSite=site;currentPage=site.page;applyChanges(currentPage);renderNavigation(site.navigation); }
    catch (error) { console.warn('CMS:', error.message); }
  }
  function renderApiServices(){
    if(!currentSite)return;
    if(activePath==='/services'){
      const grid=document.querySelector('.mro-grid');if(!grid)return;
      const signature=JSON.stringify(currentSite.services.map(s=>[s.id,s.title,s.image,s.description,s.visible]));
      if(grid.dataset.apiCatalog!==signature){
        grid.dataset.apiCatalog=signature;
        grid.innerHTML=currentSite.services.filter(s=>s.visible).map(s=>`<article class="mro-card" data-service-id="${s.id}"><div class="mro-media"><img src="${esc(assetUrl(s.image))}" alt="${esc(s.title)}" loading="lazy"></div><div class="mro-body"><h3>${esc(s.title)}</h3><p>${esc(s.tagline||s.description)}</p><a href="/service/${esc(s.slug)}" class="mro-enquire">View Service <span>→</span></a></div></article>`).join('');
      }
    }
    if(activePath.startsWith('/service/')&&currentSite.service){
      const main=document.querySelector('main');if(!main)return;const s=currentSite.service;
      const signature=JSON.stringify([s.id,s.title,s.image,s.tagline,s.description,s.points]);
      if(main.dataset.apiService===signature)return;
      main.dataset.apiService=signature;
      main.innerHTML=`<section class="api-service-hero"><div><a href="/services">Services</a><span> / ${esc(s.title)}</span><h1>${esc(s.title)}</h1><p>${esc(s.tagline)}</p><a class="cms-button" href="/contact">Request a Quote</a></div><img src="${esc(assetUrl(s.image))}" alt="${esc(s.title)}"></section><section class="api-service-body"><div><p class="api-kicker">SERVICE OVERVIEW</p><h2>Professional ${esc(s.title)} Services</h2><p>${esc(s.description)}</p><h3>Service capabilities</h3><ul>${(s.points||[]).map(point=>`<li><span>✓</span>${esc(point)}</li>`).join('')}</ul><a class="cms-button" href="/contact">Enquire Now</a></div><aside><img src="${esc(assetUrl(s.image))}" alt="${esc(s.title)}"><b>DGCA Approved Facility</b><small>Inspection, overhaul and certification by qualified aviation technicians.</small></aside></section>`;
    }
  }
  function renderNavigation(items){
    const nav=document.querySelector('.navbar-links');if(!nav)return setTimeout(()=>renderNavigation(items),250);
    const visible=items.filter(x=>x.visible).sort((a,b)=>a.order-b.order),signature=JSON.stringify(visible.map(x=>[x.id,x.label,x.url,x.target]));
    if(nav.dataset.cmsNavigation===signature)return;nav.dataset.cmsNavigation=signature;
    nav.innerHTML=visible.map(item=>`<a href="${esc(item.url)}" target="${esc(item.target)}" class="${pathNow()===item.url?'active':''}" data-menu-id="${item.id}">${esc(item.label)}</a>`).join('')+
      (visible.some(item=>item.url==='/capability-search')?'':'<a href="/capability-search" id="cap-link">Capability Search</a>');
  }
  async function refreshNavigation(){
    try{const site=await api('/api/v1/site?path='+encodeURIComponent(pathNow()));renderNavigation(site.navigation)}
    catch(error){console.warn('Navigation:',error.message)}
  }
  function submissionType(){return activePath==='/quote'?'quote':activePath==='/query'?'query':activePath==='/contact'?'contact':'general'}
  function fieldKey(control,index){
    const explicit=control.name||control.id;if(explicit)return explicit;
    const label=control.closest('label')?.childNodes?.[0]?.textContent||control.placeholder||`field_${index+1}`;
    return label.trim().toLowerCase().replace(/\*/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
  }
  function normalizeSubmission(payload){
    const find=(...names)=>{const key=Object.keys(payload).find(k=>names.some(n=>k.includes(n)));return key?payload[key]:''};
    return {formType:submissionType(),name:find('name'),email:find('email'),phone:find('phone','mobile'),subject:find('subject','company'),service:find('service','requirement'),message:find('message','query','details','description'),payload,sourcePath:activePath};
  }
  function siteToast(message,error=false){
    let toast=document.querySelector('#cms-site-toast');if(!toast){toast=document.createElement('div');toast.id='cms-site-toast';document.body.appendChild(toast)}
    toast.textContent=message;toast.className=error?'error show':'show';setTimeout(()=>toast.classList.remove('show'),3500);
  }
  function connectForms(){
    document.addEventListener('submit',async event=>{
      const form=event.target;if(!(form instanceof HTMLFormElement)||form.closest('.cms-added-content'))return;
      if(!form.checkValidity())return;
      event.preventDefault();event.stopImmediatePropagation();
      const controls=[...form.querySelectorAll('input,select,textarea')].filter(x=>!['submit','button'].includes(x.type));
      const payload=Object.fromEntries(controls.map((x,i)=>[fieldKey(x,i),x.type==='checkbox'?x.checked:x.value]));
      const button=form.querySelector('button[type="submit"],input[type="submit"]'),oldText=button?.textContent;
      if(button){button.disabled=true;if(button.tagName==='BUTTON')button.textContent='Sending…'}
      try{await api('/api/v1/submissions',{method:'POST',body:JSON.stringify(normalizeSubmission(payload))});form.reset();siteToast('Thank you! Your request has been received.')}
      catch(error){siteToast('Unable to submit. Please try again.',true)}
      finally{if(button){button.disabled=false;if(button.tagName==='BUTTON')button.textContent=oldText}}
    },true);
  }
  function details(el) {
    const selector=selectorFor(el), saved=currentPage?.changes?.[selector] || {};
    return {
      type:'aviasafe:selected', path:activePath, selector, tag:el.tagName.toLowerCase(),
      text:saved.text ?? (el.tagName==='IMG'?'':el.textContent.trim()),
      src:saved.src ?? (el.tagName==='IMG'?el.getAttribute('src')||'':''),
      alt:saved.alt ?? (el.tagName==='IMG'?el.alt:''),
      href:saved.href ?? (el.tagName==='A'?el.getAttribute('href')||'':''),
      hidden:!!saved.hidden
    };
  }
  function scanPage() {
    assignStableKeys();
    const elements=managedCandidates()
      .map((el,index)=>{
        const tag=el.tagName.toLowerCase();
        const type=el.closest('.hero-d')&&el.classList.contains('hero-b-btn')?'button':
          tag==='img'?'image':/^h[1-6]$/.test(tag)?'heading':tag==='button'?'button':tag==='a'?'link':'text';
        const text=tag==='img'?'':el.textContent.trim().replace(/\s+/g,' ');
        return {selector:selectorFor(el),type,label:tag==='img'?(el.alt||`Image ${index+1}`):(text.slice(0,55)||`${type} ${index+1}`),text,html:tag==='img'?'':el.innerHTML,src:tag==='img'?el.getAttribute('src')||'':'',alt:tag==='img'?el.alt:'',href:tag==='a'?el.getAttribute('href')||'':''};
      });
    if(exportMode&&elements.length){
      const output=document.createElement('script');output.id='cms-export-data';output.type='application/json';output.textContent=JSON.stringify({path:activePath,elements});document.body.appendChild(output);
    }else if(elements.length)parent.postMessage({type:'aviasafe:catalog',path:activePath,elements},location.origin);
  }
  function initEditor() {
    document.documentElement.classList.add('admin-editing');
    const style=document.createElement('style');
    style.textContent='.admin-editing body *{cursor:crosshair!important}.admin-editing .admin-current{outline:3px solid #ffb000!important;outline-offset:3px}.admin-editing .admin-hover{outline:2px dashed #176bff!important;outline-offset:2px}';
    document.head.appendChild(style);
    document.addEventListener('mouseover',e=>{const el=editableTarget(e.target);document.querySelector('.admin-hover')?.classList.remove('admin-hover');if(el!==selected)el.classList.add('admin-hover')},true);
    document.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();document.querySelector('.admin-current')?.classList.remove('admin-current');selected=editableTarget(e.target);selected.classList.remove('admin-hover');selected.classList.add('admin-current');parent.postMessage(details(selected),location.origin)},true);
    window.addEventListener('message',async e=>{
      if(e.origin!==location.origin||e.data?.type!=='aviasafe:update')return;
      try {
        await api('/api/content/change',{method:'PUT',body:JSON.stringify({path:activePath,selector:e.data.selector,values:e.data.values})});
        await refresh(); parent.postMessage({type:'aviasafe:saved'},location.origin);
      } catch(error) { parent.postMessage({type:'aviasafe:error',message:error.message},location.origin); }
    });
    parent.postMessage({type:'aviasafe:ready',path:activePath},location.origin);
  }
  const css=document.createElement('style');
  css.textContent='.cms-added-content{padding:72px 20px;background:#f7f9fc}.cms-added-inner{max-width:1180px;margin:auto}.cms-added-inner h2{font-size:36px;margin:0 0 24px}.cms-text{font-size:17px;line-height:1.8;margin:20px 0}.cms-added-inner figure{margin:30px 0}.cms-added-inner figure img{width:100%;max-height:560px;object-fit:cover;border-radius:16px}.cms-added-inner figcaption{margin-top:9px;color:#64748b}.cms-button{display:inline-block;background:#1667e8;color:#fff!important;text-decoration:none;padding:13px 22px;border-radius:8px;margin:12px 0}';
  css.textContent+='#cms-site-toast{position:fixed;left:50%;bottom:28px;transform:translate(-50%,80px);opacity:0;background:#123b2b;color:#fff;padding:13px 20px;border-radius:9px;z-index:99999;font:600 13px system-ui;box-shadow:0 12px 30px #0003;transition:.3s}#cms-site-toast.error{background:#a92720}#cms-site-toast.show{transform:translate(-50%,0);opacity:1}';
  css.textContent+='.api-service-hero{min-height:480px;padding:110px max(6vw,30px) 70px;background:#071a35;color:#fff;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:55px}.api-service-hero>div{max-width:650px}.api-service-hero>a,.api-service-hero span{color:#8da4c4}.api-service-hero h1{font-size:54px;line-height:1.08;margin:22px 0 16px}.api-service-hero p{font-size:18px;line-height:1.7;color:#c0cde0}.api-service-hero>img{width:100%;height:340px;object-fit:cover;border-radius:18px}.api-service-body{max-width:1180px;margin:auto;padding:80px 25px;display:grid;grid-template-columns:1fr 360px;gap:70px}.api-service-body h2{font-size:38px;margin:8px 0 20px}.api-service-body p{font-size:16px;line-height:1.8;color:#5e6b7c}.api-kicker{font-size:11px!important;color:#1769e8!important;font-weight:700;letter-spacing:1.5px}.api-service-body ul{list-style:none;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:12px}.api-service-body li{padding:13px;background:#f5f8fc;border-radius:8px}.api-service-body li span{color:#1769e8;margin-right:8px}.api-service-body aside{border:1px solid #e1e7ef;border-radius:15px;padding:16px;height:max-content}.api-service-body aside img{width:100%;height:220px;object-fit:cover;border-radius:10px}.api-service-body aside b,.api-service-body aside small{display:block}.api-service-body aside b{margin:16px 4px 8px}.api-service-body aside small{color:#788596;line-height:1.6;margin:0 4px 8px}@media(max-width:800px){.api-service-hero,.api-service-body{grid-template-columns:1fr}.api-service-hero h1{font-size:40px}.api-service-body ul{grid-template-columns:1fr}}';
  document.head.appendChild(css);
  const observer=new MutationObserver(()=>{
    if(applying)return;
    clearTimeout(observer.timer);
    observer.timer=setTimeout(()=>{
      if(pathNow()!==activePath){activePath=pathNow();currentPage=null;refresh();refreshNavigation()}
      else applyChanges(currentPage);
    },100);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('DOMContentLoaded',async()=>{
    await refresh();refreshNavigation();connectForms();assignStableKeys();if(editing)initEditor();
    if(scanning){(exportMode?[3500]:[1000,2500,5000]).forEach(delay=>setTimeout(scanPage,delay))}
  });
  const events=exportMode?null:new EventSource(apiUrl('/api/events'));
  events?.addEventListener('content',()=>refresh());
  events?.addEventListener('navigation',()=>refreshNavigation());
  window.addEventListener('popstate',()=>setTimeout(refresh,0));
  ['pushState','replaceState'].forEach(method=>{
    const original=history[method];
    history[method]=function(){const value=original.apply(this,arguments);setTimeout(()=>{if(pathNow()!==activePath)refresh()},0);return value};
  });
})();
