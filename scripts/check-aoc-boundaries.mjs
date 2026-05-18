import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const violations = [];

async function walk(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

for (const file of await walk('src')) {
  const rel = file.replace(/\\/g, '/');
  const text = await readFile(file, 'utf8');
  if (rel.startsWith('src/runtime/') && rel !== 'src/runtime/composition.ts' && text.includes('getAocAdapter(')) {
    violations.push(`${rel}: runtime registry access is only allowed in src/runtime/composition.ts`);
  }
}

for (const file of await walk('examples/enterprise-runtime-host')) {
  const rel = file.replace(/\\/g, '/');
  const text = await readFile(file, 'utf8');
  if (/@\/lib|@\/app|@\/sdk|PMFreak|pmfreak/.test(text)) {
    violations.push(`${rel}: starter host must not import PMFreak app/lib/sdk internals`);
  }
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
for (const key of ['.', './runtime', './runtime-host', './authorization', './audit', './crypto', './adapters']) {
  if (packageJson.exports[key] === undefined) violations.push(`package.json: missing export ${key}`);
}

if (violations.length > 0) {
  console.error('AOC boundary check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('AOC boundary check passed');
