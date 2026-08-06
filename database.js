const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const config = {
  host: process.env.DB_HOST || process.env.MYSQLHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306),
  user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
  database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'aviasafe_cms',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
};

let pool;
let mode = 'mysql';
const seeds = [
  ['home', 'Home Page', '/', 'Main landing page', 1],
  ['services', 'Services', '/services', 'All repair services', 2],
  ['approvals', 'Approvals', '/approvals', 'Certificates and approvals', 3],
  ['mro', 'MRO Facility', '/mro-facility', 'Facility details', 4],
  ['about', 'About Us', '/about', 'Company information', 5],
  ['contact', 'Contact', '/contact', 'Locations and contact details', 6],
  ['quote', 'Request Quote', '/quote', 'Quote request form', 7],
  ['query', 'Query', '/query', 'Customer query form', 8],
  ['service-detail', 'Service Detail Master', '/service/:slug', 'Dynamic service detail template', 9],
  ['capability-search', 'Capability Search', '/capability-search', 'Search aircraft MRO capabilities', 10]
];

const state = {
  pages: [],
  content_blocks: [],
  content_changes: [],
  media: [],
  page_elements: [],
  admin_users: [],
  admin_sessions: [],
  navigation_items: [],
  form_submissions: [],
  service_catalog: [],
  capability_catalog: []
};

function now() { return new Date().toISOString(); }
function rid() { return crypto.randomUUID(); }
function hashToken(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function sortByOrder(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); }
function clone(row) { return row ? JSON.parse(JSON.stringify(row)) : row; }
function pick(row, mapping) { const out = {}; for (const [k, v] of Object.entries(mapping)) out[k] = typeof v === 'function' ? v(row) : row[v]; return out; }

function seedState() {
  state.pages = seeds.map(([id, name, route, description, sort_order]) => ({ id, name, route, description, status: 'active', sort_order, created_at: now(), updated_at: now() }));
  state.navigation_items = [
    ['Home', '/', 1], ['Services', '/services', 2], ['Approvals', '/approvals', 3],
    ['MRO Facility', '/mro-facility', 4], ['About Us', '/about', 5], ['Contact Us', '/contact', 6]
  ].map(([label, url, sort_order]) => ({ id: rid(), label, url, target: '_self', visible: 1, sort_order, created_at: now(), updated_at: now() }));
  state.admin_users = [{
    id: rid(),
    name: process.env.ADMIN_NAME || 'AviaSafe Admin',
    email: String(process.env.ADMIN_EMAIL || 'admin@aviasafe.local').toLowerCase(),
    password_hash: (() => {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(process.env.ADMIN_PASSWORD || 'Admin@123', salt, 64).toString('hex');
      return `${salt}:${hash}`;
    })(),
    role: 'Administrator',
    avatar: '',
    active: 1,
    last_login_at: null,
    created_at: now(),
    updated_at: now()
  }];
  state.service_catalog = [
    ['life-raft', 'Life Raft', '/img/svc-liferaft.jpg', 'Emergency flotation solutions', 'Life raft servicing and inspection', ['Inspection', 'Repair', 'Certification']],
    ['life-vest', 'Life Vest', '/img/svc-lifevest.jpg', 'Personal flotation gear support', 'Life vest maintenance and overhaul', ['Maintenance', 'Packing', 'Replacement']],
    ['oxygen-cylinder', 'Oxygen Cylinder', '/img/equipment.jpg', 'Oxygen system servicing', 'Oxygen cylinder hydrostatic testing', ['Hydrostatic test', 'Recharging']],
    ['escape-slide', 'Escape Slide', '/img/equipment.jpg', 'Evacuation system support', 'Escape slide inspection and overhaul', ['Inspection', 'Overhaul']],
    ['fire-extinguisher', 'Fire Extinguisher', '/img/equipment.jpg', 'Fire safety equipment', 'Fire extinguisher servicing and recharge', ['Inspection', 'Recharge']],
    ['hydrostatic-testing', 'Hydrostatic Testing', '/img/equipment.jpg', 'Pressure vessel testing', 'Hydrostatic testing for aircraft pressure vessels', ['Testing', 'Documentation']]
  ].map(([slug, title, image, tagline, description, points], index) => ({ id: rid(), slug, title, image, tagline, description, points_json: points, visible: 1, sort_order: index + 1, created_at: now(), updated_at: now() }));
  state.capability_catalog = [
    ['AVS-LR-737-01', 'Collins Aerospace', 'Life raft inspection, repair and overhaul', 'Boeing 737', 'Life Raft', 'life-raft'],
    ['AVS-LV-A320-02', 'Safran Aerosystems', 'Crew and passenger life vest maintenance', 'Airbus A320', 'Life Vest', 'life-vest'],
    ['AVS-OC-ATR72-03', 'Avox Systems', 'Oxygen cylinder hydrostatic testing and recharge', 'ATR 72', 'Oxygen Cylinder', 'oxygen-cylinder'],
    ['AVS-ES-B777-04', 'Collins Aerospace', 'Emergency escape slide inspection and overhaul', 'Boeing 777', 'Escape Slide', 'escape-slide'],
    ['AVS-FE-A330-05', 'Kidde Aerospace', 'Aircraft fire extinguisher inspection and servicing', 'Airbus A330', 'Fire Extinguisher', 'fire-extinguisher'],
    ['AVS-HT-737-06', 'AviaSafe Aviation', 'Hydrostatic testing for aircraft pressure vessels', 'Boeing 737', 'Hydrostatic Testing', 'hydrostatic-testing'],
    ['AVS-AH-A320-07', 'David Clark', 'Aircraft headset inspection, repair and testing', 'Airbus A320', 'Aircraft Headset', 'aircraft-headset'],
    ['AVS-LR-MI171-08', 'EAM Worldwide', 'Helicopter life raft maintenance and certification', 'MI171A2', 'Life Raft', 'life-raft'],
    ['AVS-OC-B777-09', 'Avox Systems', 'Crew oxygen mask and cylinder servicing', 'Boeing 777', 'Oxygen Cylinder', 'oxygen-cylinder']
  ].map(([part_number, manufacturer, description, aircraft, chapter, service_slug], index) => ({ id: rid(), part_number, manufacturer, description, aircraft, chapter, service_slug, visible: 1, sort_order: index + 1, created_at: now(), updated_at: now() }));
}

class MockPool {
  async query(sql, params = []) { return this._run(sql, params); }
  async execute(sql, params = []) { return this._run(sql, params); }
  async getConnection() { return this; }
  async beginTransaction() {}
  async commit() {}
  async rollback() {}
  release() {}

  async _run(sql, params) {
    sql = String(sql).trim();
    const q = sql.replace(/\s+/g, ' ');

    if (q === 'SELECT 1') return [[{ '1': 1 }]];

    if (q.startsWith('SELECT id,name,route,description,status,sort_order AS `order`,updated_at AS updatedAt, COUNT(DISTINCT b.id) AS blockCount,COUNT(DISTINCT c.id) AS changeCount FROM pages p')) {
      const rows = state.pages.map(p => ({
        id: p.id, name: p.name, route: p.route, description: p.description, status: p.status,
        order: p.sort_order, updatedAt: p.updated_at,
        blockCount: state.content_blocks.filter(b => b.page_id === p.id).length,
        changeCount: state.content_changes.filter(c => c.page_id === p.id).length
      })).sort(sortByOrder);
      return [rows];
    }
    if (q.startsWith('SELECT * FROM pages WHERE id=? OR route=?')) {
      const value = params[0];
      const page = state.pages.find(p => p.id === value || p.route === value || (p.route === '/service/:slug' && String(value).startsWith('/service/')));
      return [[clone(page)]];
    }
    if (q.startsWith('SELECT * FROM pages WHERE route=? OR id=?')) return [state.pages.filter(p => p.id === params[0] || p.route === params[1]).map(clone)];
    if (q.startsWith('SELECT id,name AS title,route AS url,description FROM pages WHERE status="active"')) {
      const like = String(params[0] || '').replace(/%/g, '').toLowerCase();
      return [state.pages.filter(p => p.status === 'active' && (p.name.toLowerCase().includes(like) || (p.description || '').toLowerCase().includes(like))).slice(0, 20).map(p => ({ id: p.id, title: p.name, url: p.route, description: p.description }))];
    }
    if (q.startsWith('SELECT id,content AS title,link AS url,description FROM content_blocks WHERE visible=1')) {
      const like = String(params[0] || '').replace(/%/g, '').toLowerCase();
      return [state.content_blocks.filter(b => b.visible && ((b.content || '').toLowerCase().includes(like) || (b.description || '').toLowerCase().includes(like))).slice(0, 20).map(b => ({ id: b.id, title: b.content, url: b.link, description: b.description }))];
    }
    if (q.startsWith('SELECT id,label,url,target,visible,sort_order AS `order` FROM navigation_items ORDER BY sort_order')) return [state.navigation_items.slice().sort(sortByOrder).map(x => ({ ...clone(x), order: x.sort_order }))];
    if (q.startsWith('SELECT id,label,url,target,visible,sort_order AS `order` FROM navigation_items WHERE visible=1 ORDER BY sort_order')) return [state.navigation_items.filter(x => x.visible).sort(sortByOrder).map(x => ({ ...clone(x), order: x.sort_order }))];
    if (q.startsWith('SELECT id,slug,title,image,tagline,description,points_json AS points,visible,sort_order AS `order` FROM service_catalog')) return [state.service_catalog.slice().sort(sortByOrder).map(s => ({ id: s.id, slug: s.slug, title: s.title, image: s.image, tagline: s.tagline, description: s.description, points: clone(s.points_json), visible: s.visible, order: s.sort_order }))];
    if (q.startsWith('SELECT id,part_number AS partNumber,manufacturer,description,aircraft,chapter, service_slug AS serviceSlug FROM capability_catalog WHERE')) {
      let rows = state.capability_catalog.filter(r => r.visible);
      const search = String(params[0] || '').replace(/%/g, '').toLowerCase();
      const aircraft = params[params.length - 2];
      const chapter = params[params.length - 1];
      if (search) rows = rows.filter(r => [r.part_number, r.manufacturer, r.description].some(v => String(v).toLowerCase().includes(search)));
      if (q.includes('aircraft=?')) rows = rows.filter(r => r.aircraft === aircraft);
      if (q.includes('chapter=?')) rows = rows.filter(r => r.chapter === chapter);
      return [rows.sort(sortByOrder).slice(0, 100).map(r => ({ id: r.id, partNumber: r.part_number, manufacturer: r.manufacturer, description: r.description, aircraft: r.aircraft, chapter: r.chapter, serviceSlug: r.service_slug }))];
    }
    if (q.startsWith('SELECT DISTINCT aircraft,chapter FROM capability_catalog WHERE visible=1')) return [[...new Map(state.capability_catalog.filter(r => r.visible).map(r => [`${r.aircraft}::${r.chapter}`, { aircraft: r.aircraft, chapter: r.chapter }])).values()].sort((a, b) => String(a.aircraft).localeCompare(String(b.aircraft)) || String(a.chapter).localeCompare(String(b.chapter)))];
    if (q.startsWith('SELECT * FROM admin_users WHERE email=? AND active=1 LIMIT 1')) return [[clone(state.admin_users.find(u => u.email === String(params[0]).toLowerCase() && u.active))]];
    if (q.startsWith('SELECT u.id,u.name,u.email,u.role,u.avatar FROM admin_sessions s JOIN admin_users u')) {
      const token = params[0];
      const sess = state.admin_sessions.find(s => s.token_hash === token && new Date(s.expires_at) > new Date());
      const user = sess && state.admin_users.find(u => u.id === sess.user_id && u.active);
      return [[user ? pick(user, { id: 'id', name: 'name', email: 'email', role: 'role', avatar: 'avatar' }) : undefined].filter(Boolean)];
    }
    if (q.startsWith('SELECT COUNT(*) count FROM capability_catalog')) return [[{ count: state.capability_catalog.length }]];
    if (q.startsWith('SELECT COUNT(*) count FROM service_catalog')) return [[{ count: state.service_catalog.length }]];
    if (q.startsWith('SELECT COUNT(*) count FROM navigation_items')) return [[{ count: state.navigation_items.length }]];
    if (q.startsWith('SELECT id FROM admin_users LIMIT 1')) return [[state.admin_users[0] ? { id: state.admin_users[0].id } : undefined].filter(Boolean)];
    if (q.startsWith('SELECT id FROM navigation_items LIMIT 1')) return [[state.navigation_items[0] ? { id: state.navigation_items[0].id } : undefined].filter(Boolean)];
    if (q.startsWith('SELECT id FROM service_catalog LIMIT 1')) return [[state.service_catalog[0] ? { id: state.service_catalog[0].id } : undefined].filter(Boolean)];
    if (q.startsWith('SELECT id FROM capability_catalog LIMIT 1')) return [[state.capability_catalog[0] ? { id: state.capability_catalog[0].id } : undefined].filter(Boolean)];
    if (q.startsWith('SELECT p.id,p.name,p.route,p.description,p.status,p.sort_order AS `order`,p.updated_at AS updatedAt, COUNT(DISTINCT b.id) AS blockCount,COUNT(DISTINCT c.id) AS changeCount FROM pages p')) return this.query('SELECT id,name,route,description,status,sort_order AS `order`,updated_at AS updatedAt, COUNT(DISTINCT b.id) AS blockCount,COUNT(DISTINCT c.id) AS changeCount FROM pages p', params);
    if (q.startsWith('SELECT id,form_type AS formType,name,email,phone,subject,service,message,status,source_path AS sourcePath,created_at AS createdAt FROM form_submissions')) return [state.form_submissions.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 500).map(clone)];
    if (q.startsWith('SELECT id,original_name AS name,file_path AS path,file_size AS size,created_at AS createdAt FROM media ORDER BY created_at DESC')) return [state.media.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(m => ({ id: m.id, name: m.original_name, path: m.file_path, size: m.file_size, createdAt: m.created_at }))];
    if (q.startsWith('SELECT * FROM capability_catalog WHERE id=?')) return [[clone(state.capability_catalog.find(r => r.id === params[0]))]];
    if (q.startsWith('SELECT * FROM service_catalog WHERE id=?')) return [[clone(state.service_catalog.find(r => r.id === params[0]))]];
    if (q.startsWith('SELECT * FROM navigation_items WHERE id=?')) return [[clone(state.navigation_items.find(r => r.id === params[0]))]];
    if (q.startsWith('SELECT * FROM form_submissions WHERE id=?')) return [[clone(state.form_submissions.find(r => r.id === params[0]))]];
    if (q.startsWith('SELECT * FROM content_blocks WHERE id=?')) return [[clone(state.content_blocks.find(r => r.id === params[0]))]];
    if (q.startsWith('SELECT values_json FROM content_changes WHERE page_id=? AND selector=?')) return [[clone(state.content_changes.find(r => r.page_id === params[0] && r.selector === params[1]))]];
    if (q.startsWith('SELECT * FROM page_elements WHERE id=?')) return [[clone(state.page_elements.find(r => r.id === params[0]))]];
    if (q.startsWith('SELECT COLUMN_NAME FROM information_schema.COLUMNS')) return [[]];

    if (q.startsWith('INSERT INTO admin_sessions')) { state.admin_sessions.push({ token_hash: params[0], user_id: params[1], expires_at: params[2], created_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE admin_users SET last_login_at=NOW() WHERE id=?')) { const u = state.admin_users.find(x => x.id === params[0]); if (u) u.last_login_at = now(); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM admin_sessions WHERE token_hash=?')) { state.admin_sessions = state.admin_sessions.filter(s => s.token_hash !== params[0]); return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO form_submissions')) { state.form_submissions.push({ id: params[0], form_type: params[1], name: params[2], email: params[3], phone: params[4], subject: params[5], service: params[6], message: params[7], payload_json: params[8], source_path: params[9], status: 'new', created_at: now(), updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE admin_users SET name=?,email=? WHERE id=?')) { const u = state.admin_users.find(x => x.id === params[2]); if (u) { u.name = params[0]; u.email = String(params[1]).toLowerCase(); u.updated_at = now(); } return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE admin_users SET password_hash=? WHERE id=?')) { const u = state.admin_users.find(x => x.id === params[1]); if (u) u.password_hash = params[0]; return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO navigation_items')) { state.navigation_items.push({ id: params[0], label: params[1], url: params[2], target: params[3], visible: params[4] ? 1 : 0, sort_order: params[5], created_at: now(), updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE navigation_items SET label=?,url=?,target=?,visible=?,sort_order=? WHERE id=?')) { const x = state.navigation_items.find(r => r.id === params[5]); if (x) Object.assign(x, { label: params[0], url: params[1], target: params[2], visible: params[3] ? 1 : 0, sort_order: params[4], updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM navigation_items WHERE id=?')) { state.navigation_items = state.navigation_items.filter(r => r.id !== params[0]); return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO capability_catalog')) { state.capability_catalog.push({ id: params[0], part_number: params[1], manufacturer: params[2], description: params[3], aircraft: params[4], chapter: params[5], service_slug: params[6], visible: params[7] ? 1 : 0, sort_order: params[8], created_at: now(), updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE capability_catalog SET part_number=?,manufacturer=?,description=?,aircraft=?,chapter=?, service_slug=?,visible=?,sort_order=? WHERE id=?')) { const x = state.capability_catalog.find(r => r.id === params[8]); if (x) Object.assign(x, { part_number: params[0], manufacturer: params[1], description: params[2], aircraft: params[3], chapter: params[4], service_slug: params[5], visible: params[6] ? 1 : 0, sort_order: params[7], updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM capability_catalog WHERE id=?')) { state.capability_catalog = state.capability_catalog.filter(r => r.id !== params[0]); return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO service_catalog')) { state.service_catalog.push({ id: params[0], slug: params[1], title: params[2], image: params[3], tagline: params[4], description: params[5], points_json: JSON.parse(params[6]), visible: params[7] ? 1 : 0, sort_order: params[8], created_at: now(), updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE service_catalog SET slug=?,title=?,image=?,tagline=?,description=?,points_json=?,visible=?,sort_order=? WHERE id=?')) { const x = state.service_catalog.find(r => r.id === params[8]); if (x) Object.assign(x, { slug: params[0], title: params[1], image: params[2], tagline: params[3], description: params[4], points_json: JSON.parse(params[5]), visible: params[6] ? 1 : 0, sort_order: params[7], updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM service_catalog WHERE id=?')) { state.service_catalog = state.service_catalog.filter(r => r.id !== params[0]); return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO content_blocks')) { state.content_blocks.push({ id: params[0], page_id: params[1], type: params[2], label: params[3], content: params[4], description: params[5], image: params[6], alt: params[7], link: params[8], placement: params[9], visible: params[10] ? 1 : 0, sort_order: params[11], created_at: now(), updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE content_blocks SET type=?,label=?,content=?,description=?,image=?,alt=?,link=?,placement=?,visible=?,sort_order=? WHERE id=?')) { const x = state.content_blocks.find(r => r.id === params[10]); if (x) Object.assign(x, { type: params[0], label: params[1], content: params[2], description: params[3], image: params[4], alt: params[5], link: params[6], placement: params[7], visible: params[8] ? 1 : 0, sort_order: params[9], updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM content_blocks WHERE id=?')) { state.content_blocks = state.content_blocks.filter(r => r.id !== params[0]); return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO content_changes')) { const existing = state.content_changes.find(r => r.page_id === params[0] && r.selector === params[1]); if (existing) existing.values_json = params[2]; else state.content_changes.push({ id: state.content_changes.length + 1, page_id: params[0], selector: params[1], values_json: params[2], created_at: now(), updated_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM content_changes WHERE page_id=? AND selector=?')) { state.content_changes = state.content_changes.filter(r => !(r.page_id === params[0] && r.selector === params[1])); return [{ affectedRows: 1 }]; }
    if (q.startsWith('INSERT INTO page_elements')) { const existing = state.page_elements.find(r => r.page_id === params[1] && r.selector === params[2]); const row = { id: params[0], page_id: params[1], selector: params[2], element_type: params[3], admin_label: params[4], original_text: params[5], original_html: params[6], original_src: params[7], original_alt: params[8], original_href: params[9], sort_order: params[10], created_at: now(), updated_at: now() }; if (existing) Object.assign(existing, row); else state.page_elements.push(row); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM page_elements WHERE page_id=? AND selector NOT IN')) { const pageId = params[0]; const keep = new Set(params.slice(1)); state.page_elements = state.page_elements.filter(r => r.page_id !== pageId || keep.has(r.selector)); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE content_changes SET values_json=VALUES(values_json)')) return [{ affectedRows: 1 }];
    if (q.startsWith('INSERT INTO media')) { state.media.push({ id: params[0], original_name: params[1], file_path: params[2], file_size: params[3], mime_type: params[4], created_at: now() }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('DELETE FROM media WHERE id=?')) { state.media = state.media.filter(r => r.id !== params[0]); return [{ affectedRows: 1 }]; }
    if (q.startsWith('UPDATE content_blocks SET image="" WHERE image=?')) { state.content_blocks.forEach(r => { if (r.image === params[0]) r.image = ''; }); return [{ affectedRows: 1 }]; }
    if (q.startsWith('SELECT values_json FROM content_changes WHERE page_id=? AND selector=?')) return [[clone(state.content_changes.find(r => r.page_id === params[0] && r.selector === params[1]))]];
    if (q.startsWith('SELECT e.id,e.selector,e.element_type AS type,e.admin_label AS label,')) {
      const pageId = params[0];
      const rows = state.page_elements.filter(r => r.page_id === pageId).sort(sortByOrder).map(e => ({ id: e.id, selector: e.selector, type: e.element_type, label: e.admin_label, originalText: e.original_text, originalHtml: e.original_html, originalSrc: e.original_src, originalAlt: e.original_alt, originalHref: e.original_href, order: e.sort_order, savedValues: JSON.parse((state.content_changes.find(c => c.page_id === pageId && c.selector === e.selector)?.values_json) || '{}') }));
      return [rows];
    }
    if (q.startsWith('SELECT id,selector,element_type AS type,admin_label AS label,original_text AS originalText')) {
      const pageId = params[0];
      const blocks = state.page_elements.filter(r => r.page_id === pageId).sort(sortByOrder).map(e => ({ id: e.id, selector: e.selector, type: e.element_type, label: e.admin_label, originalText: e.original_text, originalHtml: e.original_html, originalSrc: e.original_src, originalAlt: e.original_alt, originalHref: e.original_href, order: e.sort_order }));
      return [blocks];
    }
    if (q.startsWith('SELECT * FROM content_blocks WHERE page_id=? ORDER BY sort_order, created_at')) return [state.content_blocks.filter(r => r.page_id === params[0]).sort((a, b) => sortByOrder(a, b) || String(a.created_at).localeCompare(String(b.created_at))).map(clone)];
    if (q.startsWith('SELECT selector, values_json FROM content_changes WHERE page_id=?')) return [[...state.content_changes.filter(r => r.page_id === params[0]).map(r => ({ selector: r.selector, values_json: r.values_json }))]];
    if (q.startsWith('SELECT id,slug,title,image,tagline,description,points_json AS points,visible,sort_order AS `order` FROM service_catalog WHERE visible=1')) return [state.service_catalog.filter(r => r.visible).sort(sortByOrder).map(s => ({ id: s.id, slug: s.slug, title: s.title, image: s.image, tagline: s.tagline, description: s.description, points: clone(s.points_json), visible: s.visible, order: s.sort_order, link: '/service/' + s.slug }))];

    return [[]];
  }
}

async function initialize() {
  try {
    const managedDatabase = process.env.MYSQLDATABASE || process.env.DB_SKIP_CREATE === '1';
    if (!managedDatabase) {
      const bootstrap = await mysql.createConnection({ ...config, database: undefined });
      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${config.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await bootstrap.end();
    }
    pool = mysql.createPool(config);
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
      .replace(/^CREATE DATABASE.*?;\s*/is, '').replace(/^USE .*?;\s*/is, '');
    for (const statement of schema.split(';').map(x => x.trim()).filter(Boolean)) await pool.query(statement);
    return pool;
  } catch (error) {
    mode = 'memory';
    seedState();
    pool = new MockPool();
    console.warn(`MySQL unavailable, using local in-memory database: ${error.message}`);
    return pool;
  }
}

function db() { if (!pool) throw new Error('Database has not been initialized'); return pool; }
async function transaction(work) { const conn = await db().getConnection(); try { await conn.beginTransaction(); const value = await work(conn); await conn.commit(); return value; } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } }

module.exports = { initialize, db, transaction, config, mode: () => mode, state, hashToken };
