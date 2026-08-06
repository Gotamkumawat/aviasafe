const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'out');

const copyTargets = [
  'package.json',
  'package-lock.json',
  '.env.example',
  '_redirects',
  'api-config.js',
  'content-manager.js',
  'capability-search.js',
  'database.js',
  'index.html',
  'netlify.toml',
  'railway.json',
  'schema.sql',
  'sms.html',
  'server.js',
  'serve_spa.py'
];

const copyDirs = [
  'admin',
  'assets',
  'data',
  'img',
  'logos',
  'scripts',
  'uploads'
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const name of copyTargets) {
  const source = path.join(root, name);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(output, name), { recursive: true });
}

for (const name of copyDirs) {
  const source = path.join(root, name);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(output, name), { recursive: true });
}

const apiBase = String(process.env.PUBLIC_API_BASE || 'https://api-production-60ff8.up.railway.app').replace(/\/$/, '');
if (/^https:\/\/[^/]+/.test(apiBase)) {
  fs.writeFileSync(path.join(output, 'api-config.js'), `window.AVIASAFE_API_BASE=${JSON.stringify(apiBase)};\n`);
}

console.log('Deployment bundle created at out/');
