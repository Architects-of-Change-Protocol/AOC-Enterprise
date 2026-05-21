import fs from 'node:fs';
import path from 'node:path';

function fail(code, message, detail = '') {
  const suffix = detail ? `\nDETAIL: ${detail}` : '';
  throw new Error(`[release-integrity:${code}] ${message}${suffix}`);
}

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const requiredScripts = ['typecheck','build','test','lint','validate:release','check:protocol-consumption','check:runtime-state','check:runtime-persistence','check:runtime-vault','check:aoc-boundaries'];
for (const name of requiredScripts) {
  if (!pkg.scripts?.[name]) fail('missing_script', `Missing required script '${name}'.`);
}

const entrypoints = [
  pkg.exports['.'],
  pkg.exports['./runtime'],
  pkg.exports['./runtime-host'],
  pkg.exports['./authorization'],
  pkg.exports['./audit'],
  pkg.exports['./crypto'],
  pkg.exports['./adapters'],
];
for (const entry of entrypoints) {
  for (const key of ['types','default']) {
    const rel = entry?.[key];
    if (!rel) fail('missing_export_field', `Export missing '${key}'.`);
    const abs = path.resolve(path.dirname(new URL('../package.json', import.meta.url).pathname), rel);
    if (!fs.existsSync(abs)) fail('missing_export_target', `Export target '${rel}' does not exist.`, abs);
  }
}

const tsconfigBase = JSON.parse(fs.readFileSync(new URL('../tsconfig.base.json', import.meta.url), 'utf8'));
if (tsconfigBase.compilerOptions?.ignoreDeprecations !== '6.0') {
  fail('tsconfig_deprecation_guard_missing', 'compilerOptions.ignoreDeprecations must be set to 6.0 for TS5101 stability.');
}

console.log('release integrity check passed');
