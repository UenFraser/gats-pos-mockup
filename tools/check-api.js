// Finds screens that call an API route the server does not have (wrong path or wrong method).
// Run from the project folder:  node tools/check-api.js
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (f.name === 'node_modules') continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(js|jsx)$/.test(f.name)) out.push(p);
  }
  return out;
}
const norm = (p) => p.split('?')[0].replace(/\$\{[^}]*\}/g, ':p').replace(/:[A-Za-z_]+/g, ':p').replace(/\/+$/, '');

const server = new Set();
for (const f of walk(path.join(__dirname, '..', 'server'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) server.add(`${m[1].toUpperCase()} ${norm(m[2])}`);
}
const missing = [];
let calls = 0;
for (const f of walk(path.join(__dirname, '..', 'client', 'src'))) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bapi\.(get|post|put|patch|del)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    calls += 1;
    const key = `${m[1] === 'del' ? 'DELETE' : m[1].toUpperCase()} ${norm(m[2])}`;
    if (!server.has(key)) missing.push(`${key}   (in ${path.relative(path.join(__dirname, '..'), f)})`);
  }
}
if (missing.length) {
  console.log(`PROBLEM: ${missing.length} of ${calls} screen calls have no matching server route:`);
  missing.forEach((m) => console.log('  ' + m));
  process.exit(1);
}
console.log(`OK: all ${calls} API calls in the screens have a matching server route.`);
