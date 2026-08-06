const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysqlStore = require('./database');

const ROOT = __dirname;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'));
const PORT = Number(process.env.PORT || 5000);
const clients = new Set();
const allowedOrigins=new Set(String(process.env.ALLOWED_ORIGINS||'http://localhost:5000,http://127.0.0.1:5000')
  .split(',').map(x=>x.trim().replace(/\/$/,'')).filter(Boolean));

function cors(req,res){
  const origin=String(req.headers.origin||'').replace(/\/$/,'');
  if(origin&&allowedOrigins.has(origin)){
    res.setHeader('Access-Control-Allow-Origin',origin);
    res.setHeader('Vary','Origin');
    res.setHeader('Access-Control-Allow-Credentials','true');
    res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
  }
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
function tokenHash(token){return crypto.createHash('sha256').update(token).digest('hex')}
async function sessionUser(req){
  const token=cookies(req).aviasafe_admin;if(!token)return null;
  const [rows]=await mysqlStore.db().execute(`SELECT u.id,u.name,u.email,u.role,u.avatar
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>NOW() AND u.active=1 LIMIT 1`,[tokenHash(token)]);
  return rows[0]||null;
}
function publicUser(user){return user?{id:user.id,name:user.name,email:user.email,role:user.role,avatar:user.avatar}:null}
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > 15 * 1024 * 1024) { reject(new Error('Request too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function emit(event, payload = {}) {
  const line = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach(res => res.write(line));
}
function safeName(name) {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 8);
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext || '.bin'}`;
}
function parseMultipart(buffer, boundary) {
  const marker = Buffer.from('--' + boundary);
  const parts = [];
  let start = buffer.indexOf(marker) + marker.length + 2;
  while (start > marker.length) {
    const end = buffer.indexOf(marker, start);
    if (end < 0) break;
    const part = buffer.subarray(start, end - 2);
    const split = part.indexOf(Buffer.from('\r\n\r\n'));
    if (split > 0) {
      const headers = part.subarray(0, split).toString();
      const content = part.subarray(split + 4);
      const name = headers.match(/name="([^"]+)"/)?.[1];
      const filename = headers.match(/filename="([^"]*)"/)?.[1];
      parts.push({ name, filename, headers, content });
    }
    start = end + marker.length + 2;
  }
  return parts;
}
function mime(file) {
  const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon' };
  return types[path.extname(file).toLowerCase()] || 'application/octet-stream';
}
function staticFile(req, res, pathname) {
  let requested = decodeURIComponent(pathname);
  if (requested === '/admin') requested = '/admin/';
  if (requested === '/sms' || requested === '/sms/') requested = '/sms.html';
  if (requested.endsWith('/')) requested += 'index.html';
  const absolute = path.resolve(ROOT, '.' + requested);
  if (!absolute.startsWith(ROOT)) return json(res, 403, { error: 'Forbidden' });
  const candidate = fs.existsSync(absolute) && fs.statSync(absolute).isFile() ? absolute : path.join(ROOT, 'index.html');
  fs.readFile(candidate, (err, content) => {
    if (err) return json(res, 404, { error: 'Not found' });
    const liveCode=candidate.endsWith('.html')||candidate.endsWith('content-manager.js')||candidate.endsWith('capability-search.js')||candidate.includes(path.join('admin', 'admin.js'))||candidate.includes(path.join('admin','styles.css'));
    res.writeHead(200, { 'Content-Type': mime(candidate), 'Cache-Control': liveCode ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600' });
    if (req.method === 'HEAD') res.end(); else res.end(content);
  });
}

async function pageBy(db, value) {
  const [rows] = await db.execute(
    'SELECT * FROM pages WHERE id=? OR route=? OR (route="/service/:slug" AND ? LIKE "/service/%") LIMIT 1',
    [value, value, value]
  );
  if (!rows[0]) return null;
  const page = rows[0];
  const [blocks] = await db.execute('SELECT * FROM content_blocks WHERE page_id=? ORDER BY sort_order, created_at', [page.id]);
  const [changes] = await db.execute('SELECT selector, values_json FROM content_changes WHERE page_id=?', [page.id]);
  const [elements]=await db.execute(`SELECT id,selector,element_type AS type,admin_label AS label,original_text AS originalText,
    original_html AS originalHtml,original_src AS originalSrc,original_alt AS originalAlt,original_href AS originalHref,
    sort_order AS \`order\` FROM page_elements WHERE page_id=? ORDER BY sort_order`,[page.id]);
  return {
    id:page.id,name:page.name,route:page.route,description:page.description,status:page.status,order:page.sort_order,
    updatedAt:page.updated_at,
    blocks:blocks.map(b=>({id:b.id,type:b.type,label:b.label,content:b.content||'',description:b.description||'',image:b.image||'',alt:b.alt||'',link:b.link||'',placement:b.placement||'before_footer',visible:!!b.visible,order:b.sort_order,createdAt:b.created_at,updatedAt:b.updated_at})),
    elements,
    changes:Object.fromEntries(changes.map(c=>[c.selector,typeof c.values_json==='string'?JSON.parse(c.values_json):c.values_json]))
  };
}

async function api(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;
  const sql = mysqlStore.db();
  if(pathname==='/api/auth/login'&&method==='POST'){
    const input=JSON.parse((await body(req)).toString()||'{}');
    const [rows]=await sql.execute('SELECT * FROM admin_users WHERE email=? AND active=1 LIMIT 1',[String(input.email||'').trim().toLowerCase()]);
    const user=rows[0];let valid=false;
    if(user){const [salt,stored]=user.password_hash.split(':'),calculated=crypto.scryptSync(String(input.password||''),salt,64);valid=stored&&crypto.timingSafeEqual(calculated,Buffer.from(stored,'hex'))}
    if(!valid)return json(res,401,{error:'Invalid email or password'});
    const remember=input.remember!==false,token=crypto.randomBytes(32).toString('hex'),expires=new Date(Date.now()+(remember?7*86400000:12*3600000));
    await sql.execute('INSERT INTO admin_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)',[tokenHash(token),user.id,expires]);
    await sql.execute('UPDATE admin_users SET last_login_at=NOW() WHERE id=?',[user.id]);
    const crossSite=String(req.headers.origin||'').startsWith('https://');
    res.setHeader('Set-Cookie',`aviasafe_admin=${token}; HttpOnly; SameSite=${crossSite?'None; Secure':'Lax'}; Path=/${remember?'; Max-Age=604800':''}`);
    return json(res,200,{user:publicUser(user)});
  }
  if(pathname==='/api/navigation'&&method==='GET'){
    const [rows]=await sql.query('SELECT id,label,url,target,visible,sort_order AS `order` FROM navigation_items ORDER BY sort_order');
    return json(res,200,rows);
  }
  if(pathname==='/api/v1/site'&&method==='GET'){
    const requestedPath=url.searchParams.get('path')||'/';
    const [navRows]=await sql.query('SELECT id,label,url,target,visible,sort_order AS `order` FROM navigation_items WHERE visible=1 ORDER BY sort_order');
    const page=await pageBy(sql,requestedPath);
    const [catalogRows]=await sql.query(`SELECT id,slug,title,image,tagline,description,points_json AS points,visible,sort_order AS \`order\`
      FROM service_catalog WHERE visible=1 ORDER BY sort_order`);
    const services=catalogRows.map(s=>({...s,points:typeof s.points==='string'?JSON.parse(s.points):s.points||[],link:'/service/'+s.slug}));
    const slug = requestedPath.startsWith('/service/') ? requestedPath.split('/').filter(Boolean).at(-1) : null;
    const service = slug ? services.find(s => s.slug === slug) || null : null;
    if (page) return json(res, 200, { navigation: navRows, page, services, service, realtime: '/api/events' });
    // If there's no page record but the path is a service detail, synthesize a minimal page
    if (!page && slug && service) {
      const synthesized = {
        id: 'service-detail',
        name: service.title || 'Service Detail',
        route: '/service/:slug',
        description: service.tagline || service.description || '',
        status: 'active',
        order: 0,
        updatedAt: new Date().toISOString(),
        blocks: [],
        elements: [],
        changes: {}
      };
      return json(res, 200, { navigation: navRows, page: synthesized, services, service, realtime: '/api/events' });
    }
    return json(res, 404, { error: 'Page not found' });
  }
  if(pathname==='/api/v1/search'&&method==='GET'){
    const q=`%${String(url.searchParams.get('q')||'').slice(0,100)}%`;
    const [pages]=await sql.execute('SELECT id,name AS title,route AS url,description FROM pages WHERE status="active" AND (name LIKE ? OR description LIKE ?) ORDER BY sort_order LIMIT 20',[q,q]);
    const [blocks]=await sql.execute('SELECT id,content AS title,link AS url,description FROM content_blocks WHERE visible=1 AND (content LIKE ? OR description LIKE ?) LIMIT 20',[q,q]);
    return json(res,200,[...pages,...blocks].filter(x=>x.title));
  }
  if(pathname==='/api/v1/capabilities'&&method==='GET'){
    const search=String(url.searchParams.get('q')||'').trim().slice(0,120);
    const aircraft=String(url.searchParams.get('aircraft')||'').trim().slice(0,180);
    const chapter=String(url.searchParams.get('chapter')||'').trim().slice(0,180);
    const clauses=['visible=1'],values=[];
    if(search){clauses.push('(part_number LIKE ? OR manufacturer LIKE ? OR description LIKE ?)');const like=`%${search}%`;values.push(like,like,like)}
    if(aircraft){clauses.push('aircraft=?');values.push(aircraft)}
    if(chapter){clauses.push('chapter=?');values.push(chapter)}
    const [rows]=await sql.execute(`SELECT id,part_number AS partNumber,manufacturer,description,aircraft,chapter,
      service_slug AS serviceSlug FROM capability_catalog WHERE ${clauses.join(' AND ')} ORDER BY sort_order,title LIMIT 100`.replace(',title',''),values);
    const [filterRows]=await sql.query('SELECT DISTINCT aircraft,chapter FROM capability_catalog WHERE visible=1 ORDER BY aircraft,chapter');
    return json(res,200,{results:rows,filters:{
      aircraft:[...new Set(filterRows.map(row=>row.aircraft).filter(Boolean))],
      chapters:[...new Set(filterRows.map(row=>row.chapter).filter(Boolean))]
    }});
  }
  if(pathname==='/api/services'&&method==='GET'){
    const [rows]=await sql.query('SELECT id,slug,title,image,tagline,description,points_json AS points,visible,sort_order AS `order` FROM service_catalog ORDER BY sort_order');
    return json(res,200,rows.map(s=>({...s,points:typeof s.points==='string'?JSON.parse(s.points):s.points||[]})));
  }
  if(pathname==='/api/v1/submissions'&&method==='POST'){
    const input=JSON.parse((await body(req)).toString()||'{}'),id=crypto.randomUUID();
    const type=['contact','quote','query','general'].includes(input.formType)?input.formType:'general';
    await sql.execute(`INSERT INTO form_submissions
      (id,form_type,name,email,phone,subject,service,message,payload_json,source_path)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,[id,type,input.name||'',input.email||'',input.phone||'',input.subject||'',input.service||'',input.message||'',JSON.stringify(input.payload||{}),input.sourcePath||'']);
    emit('submission',{id,type});return json(res,201,{ok:true,id,message:'Your request has been received.'});
  }
  if (pathname === '/api/health') {
    await sql.query('SELECT 1');
    return json(res, 200, { ok:true, database:'mysql', databaseName:mysqlStore.config.database, time:new Date().toISOString() });
  }
  if (pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type':'text/event-stream', 'Cache-Control':'no-cache', Connection:'keep-alive' });
    res.write('event: connected\ndata: {}\n\n'); clients.add(res);
    req.on('close', () => clients.delete(res)); return;
  }
  const authUser=await sessionUser(req);
  if(pathname==='/api/auth/me'&&method==='GET')return authUser?json(res,200,{user:publicUser(authUser)}):json(res,401,{error:'Authentication required'});
  if(pathname==='/api/auth/logout'&&method==='POST'){
    const token=cookies(req).aviasafe_admin;if(token)await sql.execute('DELETE FROM admin_sessions WHERE token_hash=?',[tokenHash(token)]);
    res.setHeader('Set-Cookie','aviasafe_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});
  }
  if(pathname==='/api/auth/profile'&&method==='PUT'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const input=JSON.parse((await body(req)).toString()||'{}');
    await sql.execute('UPDATE admin_users SET name=?,email=? WHERE id=?',[input.name||authUser.name,String(input.email||authUser.email).toLowerCase(),authUser.id]);
    if(input.password){const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(input.password,salt,64).toString('hex');await sql.execute('UPDATE admin_users SET password_hash=? WHERE id=?',[`${salt}:${hash}`,authUser.id])}
    const [updated]=await sql.execute('SELECT id,name,email,role,avatar FROM admin_users WHERE id=?',[authUser.id]);return json(res,200,{user:publicUser(updated[0])});
  }
  if(pathname==='/api/v1/submissions'&&method==='GET'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const [rows]=await sql.query(`SELECT id,form_type AS formType,name,email,phone,subject,service,message,status,source_path AS sourcePath,created_at AS createdAt
      FROM form_submissions ORDER BY created_at DESC LIMIT 500`);return json(res,200,rows);
  }
  if(pathname==='/api/capabilities'&&method==='GET'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const [rows]=await sql.query(`SELECT id,part_number AS partNumber,manufacturer,description,aircraft,chapter,
      service_slug AS serviceSlug,visible,sort_order AS \`order\`,updated_at AS updatedAt
      FROM capability_catalog ORDER BY sort_order,created_at`);
    return json(res,200,rows.map(row=>({...row,visible:!!row.visible})));
  }
  if(pathname==='/api/capabilities'&&method==='POST'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const input=JSON.parse((await body(req)).toString()||'{}');
    if(!input.partNumber||!input.manufacturer||!input.description||!input.aircraft||!input.chapter)
      return json(res,400,{error:'Part number, manufacturer, description, aircraft and chapter are required'});
    const id=crypto.randomUUID();const [[count]]=await sql.query('SELECT COUNT(*) count FROM capability_catalog');
    await sql.execute(`INSERT INTO capability_catalog
      (id,part_number,manufacturer,description,aircraft,chapter,service_slug,visible,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,input.partNumber,input.manufacturer,input.description,input.aircraft,input.chapter,input.serviceSlug||'',input.visible!==false,input.order||count.count+1]);
    emit('capability',{id,action:'created'});return json(res,201,{id,...input});
  }
  const capabilityMatch=pathname.match(/^\/api\/capabilities\/([^/]+)$/);
  if(capabilityMatch&&['PUT','DELETE'].includes(method)){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const [rows]=await sql.execute('SELECT * FROM capability_catalog WHERE id=?',[capabilityMatch[1]]);
    const old=rows[0];if(!old)return json(res,404,{error:'Capability not found'});
    if(method==='DELETE'){
      await sql.execute('DELETE FROM capability_catalog WHERE id=?',[old.id]);
      emit('capability',{id:old.id,action:'deleted'});return json(res,200,{ok:true});
    }
    const input=JSON.parse((await body(req)).toString()||'{}');
    await sql.execute(`UPDATE capability_catalog SET part_number=?,manufacturer=?,description=?,aircraft=?,chapter=?,
      service_slug=?,visible=?,sort_order=? WHERE id=?`,[
      input.partNumber??old.part_number,input.manufacturer??old.manufacturer,input.description??old.description,
      input.aircraft??old.aircraft,input.chapter??old.chapter,input.serviceSlug??old.service_slug,
      input.visible??old.visible,input.order??old.sort_order,old.id
    ]);
    emit('capability',{id:old.id,action:'updated'});return json(res,200,{ok:true});
  }
  if(pathname==='/api/services'&&method==='POST'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const input=JSON.parse((await body(req)).toString()||'{}'),id=crypto.randomUUID();
    const [[count]]=await sql.query('SELECT COUNT(*) count FROM service_catalog');
    await sql.execute(`INSERT INTO service_catalog (id,slug,title,image,tagline,description,points_json,visible,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?)`,[id,input.slug,input.title,input.image||'',input.tagline||'',input.description||'',JSON.stringify(input.points||[]),input.visible!==false,input.order||count.count+1]);
    emit('content',{serviceId:id});return json(res,201,{id,...input});
  }
  const serviceMatch=pathname.match(/^\/api\/services\/([^/]+)$/);
  if(serviceMatch&&['PUT','DELETE'].includes(method)){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    if(method==='DELETE')await sql.execute('DELETE FROM service_catalog WHERE id=?',[serviceMatch[1]]);
    else{const input=JSON.parse((await body(req)).toString()||'{}');const [rows]=await sql.execute('SELECT * FROM service_catalog WHERE id=?',[serviceMatch[1]]);if(!rows[0])return json(res,404,{error:'Service not found'});const old=rows[0];await sql.execute(`UPDATE service_catalog SET slug=?,title=?,image=?,tagline=?,description=?,points_json=?,visible=?,sort_order=? WHERE id=?`,
      [input.slug??old.slug,input.title??old.title,input.image??old.image,input.tagline??old.tagline,input.description??old.description,JSON.stringify(input.points??(typeof old.points_json==='string'?JSON.parse(old.points_json):old.points_json)),input.visible??old.visible,input.order??old.sort_order,serviceMatch[1]])}
    emit('content',{serviceId:serviceMatch[1]});return json(res,200,{ok:true});
  }
  const submissionMatch=pathname.match(/^\/api\/v1\/submissions\/([^/]+)$/);
  if(submissionMatch&&['PUT','DELETE'].includes(method)){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    if(method==='DELETE')await sql.execute('DELETE FROM form_submissions WHERE id=?',[submissionMatch[1]]);
    else{const input=JSON.parse((await body(req)).toString()||'{}');await sql.execute('UPDATE form_submissions SET status=? WHERE id=?',[input.status||'new',submissionMatch[1]])}
    emit('submission',{id:submissionMatch[1]});return json(res,200,{ok:true});
  }
  if(pathname==='/api/navigation'&&method==='POST'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const input=JSON.parse((await body(req)).toString()||'{}'),id=crypto.randomUUID();
    const [[count]]=await sql.query('SELECT COUNT(*) count FROM navigation_items');
    await sql.execute('INSERT INTO navigation_items (id,label,url,target,visible,sort_order) VALUES (?,?,?,?,?,?)',[id,input.label,input.url,input.target||'_self',input.visible!==false,input.order||count.count+1]);
    emit('navigation');return json(res,201,{id,...input});
  }
  const navMatch=pathname.match(/^\/api\/navigation\/([^/]+)$/);
  if(navMatch&&['PUT','DELETE'].includes(method)){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    if(method==='DELETE')await sql.execute('DELETE FROM navigation_items WHERE id=?',[navMatch[1]]);
    else{const input=JSON.parse((await body(req)).toString()||'{}');const [rows]=await sql.execute('SELECT * FROM navigation_items WHERE id=?',[navMatch[1]]);if(!rows[0])return json(res,404,{error:'Menu item not found'});const old=rows[0];await sql.execute('UPDATE navigation_items SET label=?,url=?,target=?,visible=?,sort_order=? WHERE id=?',[input.label??old.label,input.url??old.url,input.target??old.target,input.visible??old.visible,input.order??old.sort_order,navMatch[1]])}
    emit('navigation');return json(res,200,{ok:true});
  }
  if(method!=='GET'&&!authUser)return json(res,401,{error:'Authentication required'});
  if (pathname === '/api/pages' && method === 'GET') {
    const [rows]=await sql.query(`SELECT p.id,p.name,p.route,p.description,p.status,p.sort_order AS \`order\`,p.updated_at AS updatedAt,
      COUNT(DISTINCT b.id) AS blockCount,COUNT(DISTINCT c.id) AS changeCount
      FROM pages p LEFT JOIN content_blocks b ON b.page_id=p.id LEFT JOIN content_changes c ON c.page_id=p.id
      GROUP BY p.id ORDER BY p.sort_order`);
    return json(res,200,rows);
  }
  if (pathname === '/api/pages/by-path' && method === 'GET') {
    const page = await pageBy(sql,url.searchParams.get('path')||'/');
    return page ? json(res, 200, page) : json(res, 404, { error:'Page not found' });
  }
  const pageMatch = pathname.match(/^\/api\/pages\/([^/]+)$/);
  if (pageMatch && method === 'GET') {
    const page = await pageBy(sql,pageMatch[1]);
    return page ? json(res, 200, page) : json(res, 404, { error:'Page not found' });
  }
  if (pageMatch && method === 'PUT') {
    const page = await pageBy(sql,pageMatch[1]); if (!page) return json(res,404,{error:'Page not found'});
    const input = JSON.parse((await body(req)).toString() || '{}');
    await sql.execute('UPDATE pages SET name=?,description=?,status=? WHERE id=?',[input.name??page.name,input.description??page.description,input.status??page.status,page.id]);
    emit('content',{pageId:page.id});return json(res,200,await pageBy(sql,page.id));
  }
  const elementsMatch=pathname.match(/^\/api\/pages\/([^/]+)\/elements$/);
  if(elementsMatch&&method==='GET'){
    const page=await pageBy(sql,elementsMatch[1]);if(!page)return json(res,404,{error:'Page not found'});
    const [rows]=await sql.execute(`SELECT e.id,e.selector,e.element_type AS type,e.admin_label AS label,
      e.original_text AS originalText,e.original_html AS originalHtml,e.original_src AS originalSrc,e.original_alt AS originalAlt,e.original_href AS originalHref,
      e.sort_order AS \`order\`,c.values_json AS savedValues
      FROM page_elements e LEFT JOIN content_changes c ON c.page_id=e.page_id AND c.selector=e.selector
      WHERE e.page_id=? ORDER BY e.sort_order`,[page.id]);
    return json(res,200,rows.map(r=>({...r,savedValues:typeof r.savedValues==='string'?JSON.parse(r.savedValues):r.savedValues||{}})));
  }
  const syncMatch=pathname.match(/^\/api\/pages\/([^/]+)\/elements\/sync$/);
  if(syncMatch&&method==='POST'){
    const page=await pageBy(sql,syncMatch[1]);if(!page)return json(res,404,{error:'Page not found'});
    const input=JSON.parse((await body(req)).toString()||'{}'),elements=Array.isArray(input.elements)?input.elements:[];
    await mysqlStore.transaction(async conn=>{
      const [oldElements]=await conn.execute(`SELECT e.*,c.values_json FROM page_elements e
        LEFT JOIN content_changes c ON c.page_id=e.page_id AND c.selector=e.selector WHERE e.page_id=?`,[page.id]);
      for(const [index,e] of elements.entries()){
        const old=oldElements.find(x=>x.element_type===e.type&&(
          e.type==='image'&&x.original_src===(e.src||'') ||
          e.type!=='image'&&x.original_text===(e.text||'')
        ));
        if(old?.values_json&&old.selector!==e.selector){
          const saved=typeof old.values_json==='string'?old.values_json:JSON.stringify(old.values_json);
          await conn.execute('INSERT INTO content_changes (page_id,selector,values_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE values_json=VALUES(values_json)',[page.id,e.selector,saved]);
        }
        await conn.execute(`INSERT INTO page_elements
          (id,page_id,selector,element_type,admin_label,original_text,original_html,original_src,original_alt,original_href,sort_order)
          VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE element_type=VALUES(element_type),admin_label=VALUES(admin_label),
          original_text=VALUES(original_text),original_html=VALUES(original_html),original_src=VALUES(original_src),original_alt=VALUES(original_alt),
          original_href=VALUES(original_href),sort_order=VALUES(sort_order)`,
          [crypto.randomUUID(),page.id,e.selector,e.type,e.label,e.text||'',e.html||'',e.src||'',e.alt||'',e.href||'',index+1]);
      }
      if(elements.length){
        const selectors=elements.map(e=>e.selector);
        const placeholders=selectors.map(()=>'?').join(',');
        await conn.execute(`DELETE FROM page_elements WHERE page_id=? AND selector NOT IN (${placeholders})`,[page.id,...selectors]);
      }
    });
    return json(res,200,{ok:true,count:elements.length});
  }
  const elementMatch=pathname.match(/^\/api\/elements\/([^/]+)$/);
  if(elementMatch&&method==='PUT'){
    const [rows]=await sql.execute('SELECT * FROM page_elements WHERE id=?',[elementMatch[1]]),element=rows[0];
    if(!element)return json(res,404,{error:'Element not found'});
    const input=JSON.parse((await body(req)).toString()||'{}');
    const [saved]=await sql.execute('SELECT values_json FROM content_changes WHERE page_id=? AND selector=?',[element.page_id,element.selector]);
    const previous=saved[0]?.values_json?(typeof saved[0].values_json==='string'?JSON.parse(saved[0].values_json):saved[0].values_json):{};
    const merged={...previous,...input};
    await sql.execute('INSERT INTO content_changes (page_id,selector,values_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE values_json=VALUES(values_json)',[element.page_id,element.selector,JSON.stringify(merged)]);
    emit('content',{pageId:element.page_id});return json(res,200,merged);
  }
  const blocksMatch = pathname.match(/^\/api\/pages\/([^/]+)\/blocks$/);
  if (blocksMatch && method === 'POST') {
    const page = await pageBy(sql,blocksMatch[1]); if (!page) return json(res,404,{error:'Page not found'});
    const input = JSON.parse((await body(req)).toString() || '{}');
    const block = {
      id: crypto.randomUUID(), type: input.type || 'text', label: input.label || 'New content',
      content: input.content || '', description:input.description||'', image: input.image || '', alt: input.alt || '',
      link: input.link || '', placement:input.placement||'before_footer', visible: input.visible !== false, order: page.blocks.length + 1,
      createdAt: new Date().toISOString()
    };
    await sql.execute('INSERT INTO content_blocks (id,page_id,type,label,content,description,image,alt,link,placement,visible,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[block.id,page.id,block.type,block.label,block.content,block.description,block.image,block.alt,block.link,block.placement,block.visible,block.order]);
    emit('content',{pageId:page.id});
    return json(res, 201, block);
  }
  const blockMatch = pathname.match(/^\/api\/blocks\/([^/]+)$/);
  if (blockMatch && ['PUT','DELETE'].includes(method)) {
    const [rows]=await sql.execute('SELECT * FROM content_blocks WHERE id=?',[blockMatch[1]]);
    const old=rows[0];if(!old)return json(res,404,{error:'Block not found'});
    if(method==='DELETE'){await sql.execute('DELETE FROM content_blocks WHERE id=?',[old.id]);emit('content',{pageId:old.page_id});return json(res,200,{ok:true})}
    const input=JSON.parse((await body(req)).toString()||'{}');
    await sql.execute('UPDATE content_blocks SET type=?,label=?,content=?,description=?,image=?,alt=?,link=?,placement=?,visible=?,sort_order=? WHERE id=?',[input.type??old.type,input.label??old.label,input.content??old.content,input.description??old.description,input.image??old.image,input.alt??old.alt,input.link??old.link,input.placement??old.placement,input.visible??old.visible,input.order??old.sort_order,old.id]);
    emit('content',{pageId:old.page_id});const [updated]=await sql.execute('SELECT * FROM content_blocks WHERE id=?',[old.id]);return json(res,200,updated[0]);
  }
  if (pathname === '/api/content/change' && method === 'PUT') {
    const input=JSON.parse((await body(req)).toString()||'{}');
    const page=await pageBy(sql,input.path);if(!page)return json(res,404,{error:'Page not found'});
    const merged={...(page.changes[input.selector]||{}),...(input.values||{})};
    await sql.execute('INSERT INTO content_changes (page_id,selector,values_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE values_json=VALUES(values_json)',[page.id,input.selector,JSON.stringify(merged)]);
    emit('content',{pageId:page.id});return json(res,200,merged);
  }
  if(pathname==='/api/content/change'&&method==='DELETE'){
    const input=JSON.parse((await body(req)).toString()||'{}');
    const page=await pageBy(sql,input.path);if(!page)return json(res,404,{error:'Page not found'});
    await sql.execute('DELETE FROM content_changes WHERE page_id=? AND selector=?',[page.id,input.selector]);
    emit('content',{pageId:page.id});return json(res,200,{ok:true});
  }
  if (pathname === '/api/media' && method === 'GET') {
    const [rows]=await sql.query('SELECT id,original_name AS name,file_path AS path,file_size AS size,created_at AS createdAt FROM media ORDER BY created_at DESC');return json(res,200,rows);
  }
  if (pathname === '/api/upload' && method === 'POST') {
    const contentType=req.headers['content-type']||'', boundary=contentType.match(/boundary=(.+)$/)?.[1];
    if(!boundary)return json(res,400,{error:'Multipart image required'});
    const file=parseMultipart(await body(req),boundary).find(p=>p.filename);
    if(!file)return json(res,400,{error:'No file uploaded'});
    if(!/image\/(png|jpeg|webp|gif|svg\+xml)/.test(file.headers))return json(res,400,{error:'Only image files are allowed'});
    const filename=safeName(file.filename), target=path.join(UPLOAD_DIR,filename);
    fs.writeFileSync(target,file.content);
    const media={id:crypto.randomUUID(),name:file.filename,path:'/uploads/'+filename,size:file.content.length,createdAt:new Date().toISOString()};
    await sql.execute('INSERT INTO media (id,original_name,file_path,file_size,mime_type) VALUES (?,?,?,?,?)',[media.id,media.name,media.path,media.size,file.headers.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]||'application/octet-stream']);
    emit('media',media);return json(res,201,media);
  }
  const mediaMatch=pathname.match(/^\/api\/media\/([^/]+)$/);
  if(mediaMatch&&method==='DELETE'){
    const [rows]=await sql.execute('SELECT * FROM media WHERE id=?',[mediaMatch[1]]);const media=rows[0];if(!media)return json(res,404,{error:'Media not found'});
    const target=path.join(UPLOAD_DIR,path.basename(media.file_path));
    if(target.startsWith(UPLOAD_DIR)&&fs.existsSync(target))fs.unlinkSync(target);
    await mysqlStore.transaction(async conn=>{await conn.execute('UPDATE content_blocks SET image="" WHERE image=?',[media.file_path]);await conn.execute('DELETE FROM media WHERE id=?',[media.id])});
    emit('media',{deleted:media.id});return json(res,200,{ok:true});
  }
  // ===== SEO META API =====
  // GET /api/seo - list all SEO entries (admin)
  if(pathname==='/api/seo'&&method==='GET'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const [rows]=await sql.query('SELECT id,page_route AS pageRoute,meta_title AS metaTitle,meta_description AS metaDescription,meta_keywords AS metaKeywords,og_title AS ogTitle,og_description AS ogDescription,og_image AS ogImage,og_type AS ogType,canonical_url AS canonicalUrl,robots,structured_data AS structuredData,updated_at AS updatedAt FROM seo_meta ORDER BY page_route');
    return json(res,200,rows.map(r=>({...r,structuredData:typeof r.structuredData==='string'?JSON.parse(r.structuredData):r.structuredData||null})));
  }
  // GET /api/v1/seo?route=/about - public SEO for a page
  if(pathname==='/api/v1/seo'&&method==='GET'){
    const route=url.searchParams.get('route')||'/';
    const [rows]=await sql.execute('SELECT meta_title AS metaTitle,meta_description AS metaDescription,meta_keywords AS metaKeywords,og_title AS ogTitle,og_description AS ogDescription,og_image AS ogImage,og_type AS ogType,canonical_url AS canonicalUrl,robots,structured_data AS structuredData FROM seo_meta WHERE page_route=? LIMIT 1',[route]);
    if(!rows[0])return json(res,200,{});
    const r=rows[0];return json(res,200,{...r,structuredData:typeof r.structuredData==='string'?JSON.parse(r.structuredData):r.structuredData||null});
  }
  // POST /api/seo - create SEO entry (admin)
  if(pathname==='/api/seo'&&method==='POST'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const input=JSON.parse((await body(req)).toString()||'{}');
    if(!input.pageRoute)return json(res,400,{error:'pageRoute is required'});
    const id=crypto.randomUUID();
    await sql.execute(`INSERT INTO seo_meta (id,page_route,meta_title,meta_description,meta_keywords,og_title,og_description,og_image,og_type,canonical_url,robots,structured_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE meta_title=VALUES(meta_title),meta_description=VALUES(meta_description),meta_keywords=VALUES(meta_keywords),og_title=VALUES(og_title),og_description=VALUES(og_description),og_image=VALUES(og_image),og_type=VALUES(og_type),canonical_url=VALUES(canonical_url),robots=VALUES(robots),structured_data=VALUES(structured_data)`,[id,input.pageRoute,input.metaTitle||'',input.metaDescription||'',input.metaKeywords||'',input.ogTitle||'',input.ogDescription||'',input.ogImage||'',input.ogType||'website',input.canonicalUrl||'',input.robots||'index, follow',input.structuredData?JSON.stringify(input.structuredData):null]);
    emit('seo',{pageRoute:input.pageRoute});return json(res,201,{ok:true,id,pageRoute:input.pageRoute});
  }
  // PUT /api/seo/:id - update SEO entry (admin)
  const seoMatch=pathname.match(/^\/api\/seo\/([^/]+)$/);
  if(seoMatch&&method==='PUT'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    const [rows]=await sql.execute('SELECT * FROM seo_meta WHERE id=?',[seoMatch[1]]);
    if(!rows[0])return json(res,404,{error:'SEO entry not found'});
    const old=rows[0],input=JSON.parse((await body(req)).toString()||'{}');
    await sql.execute(`UPDATE seo_meta SET page_route=?,meta_title=?,meta_description=?,meta_keywords=?,og_title=?,og_description=?,og_image=?,og_type=?,canonical_url=?,robots=?,structured_data=? WHERE id=?`,[input.pageRoute??old.page_route,input.metaTitle??old.meta_title,input.metaDescription??old.meta_description,input.metaKeywords??old.meta_keywords,input.ogTitle??old.og_title,input.ogDescription??old.og_description,input.ogImage??old.og_image,input.ogType??old.og_type,input.canonicalUrl??old.canonical_url,input.robots??old.robots,input.structuredData?JSON.stringify(input.structuredData):(old.structured_data||null),old.id]);
    emit('seo',{pageRoute:input.pageRoute||old.page_route});return json(res,200,{ok:true});
  }
  // DELETE /api/seo/:id
  if(seoMatch&&method==='DELETE'){
    if(!authUser)return json(res,401,{error:'Authentication required'});
    await sql.execute('DELETE FROM seo_meta WHERE id=?',[seoMatch[1]]);
    emit('seo',{deleted:seoMatch[1]});return json(res,200,{ok:true});
  }
  return json(res,404,{error:'API endpoint not found'});
}

async function handleRequest(req,res){
  const url=new URL(req.url,'http://localhost');
  cors(req,res);
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  if(url.pathname.startsWith('/api/')) api(req,res,url).catch(err=>{console.error(err);if(!res.headersSent)json(res,500,{error:err.message})});
  else if(url.pathname.startsWith('/uploads/')){
    const upload=path.join(UPLOAD_DIR,path.basename(url.pathname));
    if(!upload.startsWith(UPLOAD_DIR)||!fs.existsSync(upload))return json(res,404,{error:'Not found'});
    fs.readFile(upload,(err,content)=>{if(err)return json(res,404,{error:'Not found'});res.writeHead(200,{'Content-Type':mime(upload),'Cache-Control':'public, max-age=86400'});res.end(content)});
  }
  else if(url.pathname==='/admin/login.html'){
    res.writeHead(301,{Location:'/admin/login'});res.end();
  }
  else if(url.pathname==='/admin/login'){
    sessionUser(req).then(user=>{
      if(user){res.writeHead(302,{Location:'/admin/'});res.end()}
      else staticFile(req,res,'/admin/login.html');
    }).catch(()=>staticFile(req,res,'/admin/login.html'));
  }
  else if((url.pathname==='/admin'||url.pathname==='/admin/'||url.pathname==='/admin/index.html') ){
    sessionUser(req).then(user=>{
      if(!user){res.writeHead(302,{Location:'/admin/login'});res.end()}
      else staticFile(req,res,'/admin/');
    }).catch(()=>staticFile(req,res,'/admin/login.html'));
  } else staticFile(req,res,url.pathname);
}

fs.mkdirSync(UPLOAD_DIR,{recursive:true});
let databaseReady;
function initializeDatabase(){
  if(!databaseReady) databaseReady=mysqlStore.initialize();
  return databaseReady;
}

async function handler(req,res){
  await initializeDatabase();
  return handleRequest(req,res);
}

const server=http.createServer((req,res)=>{
  handler(req,res).catch(err=>{
    console.error(err);
    if(!res.headersSent) json(res,500,{error:err.message});
  });
});

if(require.main===module){
  initializeDatabase().then(()=>{
    server.listen(PORT,'0.0.0.0',()=>console.log(`AviaSafe CMS + MySQL running at http://localhost:${PORT}`));
  }).catch(error=>{
    console.error('MySQL connection failed:',error.message);
    process.exit(1);
  });
}

module.exports={handler};
