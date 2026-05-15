import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = join(process.cwd(), 'node_modules', '@aoc-enterprise', 'runtime', 'dist');
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.d.ts')) files.push(file);
  }
};
walk(base);

const bad = files.filter((file) => {
  const text = readFileSync(file, 'utf8');
  return text.includes("from './src/") || text.includes("from '../src/") || text.includes("from '../../src/") || text.includes("from 'src/");
});

if (bad.length) {
  console.error(bad.join('\n'));
  process.exit(1);
}

console.log(`Declaration path leak check passed for ${files.length} files.`);
