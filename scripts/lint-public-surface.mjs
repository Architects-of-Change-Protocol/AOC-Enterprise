import { existsSync, readFileSync } from 'node:fs';

const entrypoints = [
  'src/index.ts',
  'src/runtime/index.ts',
  'src/runtime/authorization/index.ts',
  'src/runtime/audit/index.ts',
  'src/runtime/crypto/index.ts',
  'src/runtime/adapters/index.ts',
];

const violations = [];

for (const file of entrypoints) {
  if (!existsSync(file)) {
    violations.push(`${file}: missing required public entrypoint`);
    continue;
  }

  const source = readFileSync(file, 'utf8');
  if (/\bexport\s*\*/.test(source)) violations.push(`${file}: wildcard exports are forbidden`);
  if (/from ['\"]\.\/runtime\//.test(source) || /from ['\"]\.\.\/runtime\//.test(source)) {
    violations.push(`${file}: deep runtime export path leak detected`);
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
for (const key of Object.keys(packageJson.exports ?? {})) {
  if (key.includes('*')) violations.push(`package.json exports.${key}: wildcard subpath exports are forbidden`);
  if (key.startsWith('./src')) violations.push(`package.json exports.${key}: src paths cannot be public`);
  if (key.startsWith('./runtime/')) violations.push(`package.json exports.${key}: runtime deep paths cannot be public`);
}

if (violations.length > 0) {
  console.error('Public surface lint violations:');
  for (const v of violations) console.error(`- ${v}`);
  process.exit(1);
}

console.log('Public surface lint passed');
