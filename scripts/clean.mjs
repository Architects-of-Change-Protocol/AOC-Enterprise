import { rmSync, existsSync } from 'node:fs';

const targets = ['dist', '.tsbuildinfo'];
for (const t of targets) if (existsSync(t)) rmSync(t, { recursive: true, force: true });

import { readdirSync } from 'node:fs';
for (const p of readdirSync('packages')) {
  const base = `packages/${p}`;
  for (const t of ['dist', 'tsconfig.tsbuildinfo']) {
    const path = `${base}/${t}`;
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
}
console.log('Clean complete');
