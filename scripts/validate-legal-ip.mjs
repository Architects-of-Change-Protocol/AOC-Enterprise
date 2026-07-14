// Non-destructive legal/IP governance validator for AOC Enterprise.
//
// Modes:
//   --mode=report  (default) — prints all findings, always exits 0 unless
//                    the script itself errors. Safe for CI on every PR.
//   --mode=strict  — exits 1 if any finding classified as blocking exists.
//                    Not wired into CI as a blocking gate yet; run manually
//                    via `npm run legal:check:strict` until the current
//                    findings are triaged.
//
// This script only reads the repository. It never writes, deletes, or
// modifies any file, dependency, or package metadata.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const strict = args.includes('--mode=strict') || args.includes('--strict');

const findings = { blocking: [], advisory: [] };

function block(message) {
  findings.blocking.push(message);
}
function advise(message) {
  findings.advisory.push(message);
}

// ---------------------------------------------------------------------------
// 1. Required legal documents exist
// ---------------------------------------------------------------------------

const REQUIRED_ROOT_FILES = [
  'LICENSE',
  'NOTICE.md',
  'COPYRIGHT.md',
  'TRADEMARKS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
];

const REQUIRED_LEGAL_DOCS = [
  'docs/legal/IP_OVERVIEW.md',
  'docs/legal/PROTOCOL_ENTERPRISE_BOUNDARY.md',
  'docs/legal/OPEN_SOURCE_DEPENDENCIES.md',
  'docs/legal/THIRD_PARTY_NOTICES.md',
  'docs/legal/IP_DUE_DILIGENCE_CHECKLIST.md',
];

for (const file of [...REQUIRED_ROOT_FILES, ...REQUIRED_LEGAL_DOCS]) {
  if (!existsSync(join(ROOT, file))) {
    block(`Missing required legal document: ${file}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Ownership entity present; no contradictory entity/license claims
// ---------------------------------------------------------------------------

const OWNER_ENTITY = 'Onchainfest LLC';
const CONTRADICTORY_LICENSE_MARKERS = [
  /\bMIT License\b/,
  /\bApache License,? Version 2\.0\b/,
  /\bGNU GENERAL PUBLIC LICENSE\b/i,
  /\bBSD 3-Clause License\b/,
  /\bBSD 2-Clause License\b/,
];

for (const file of ['LICENSE', 'NOTICE.md', 'COPYRIGHT.md']) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue; // already reported above
  const text = await readFile(path, 'utf8');
  if (!text.includes(OWNER_ENTITY)) {
    block(`${file} does not mention the declared owner ("${OWNER_ENTITY}")`);
  }
  for (const marker of CONTRADICTORY_LICENSE_MARKERS) {
    if (marker.test(text)) {
      block(`${file} contains a contradictory open-source license grant matching ${marker}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 2b. Founder-designated institutional contact channels are present
// ---------------------------------------------------------------------------

const INSTITUTIONAL_EMAIL = 'vicvalch@onchainfest.xyz';
const OBSOLETE_SECURITY_PLACEHOLDER = 'Security reporting channel: pending formal designation';

const CONTACT_REQUIREMENTS = [
  { file: 'SECURITY.md', prefix: '[SECURITY REPORT]' },
  { file: 'LICENSE', prefix: '[COMMERCIAL LICENSE]' },
  { file: 'TRADEMARKS.md', prefix: '[TRADEMARK REQUEST]' },
  { file: 'CONTRIBUTING.md', prefix: '[CONTRIBUTOR GOVERNANCE]' },
];

for (const { file, prefix } of CONTACT_REQUIREMENTS) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue; // already reported above
  const text = await readFile(path, 'utf8');
  if (!text.includes(INSTITUTIONAL_EMAIL)) {
    block(`${file} does not mention the designated institutional contact ("${INSTITUTIONAL_EMAIL}")`);
  }
  if (!text.includes(prefix)) {
    block(`${file} does not mention its required subject prefix ("${prefix}")`);
  }
}

const securityPath = join(ROOT, 'SECURITY.md');
if (existsSync(securityPath)) {
  const text = await readFile(securityPath, 'utf8');
  if (text.includes(OBSOLETE_SECURITY_PLACEHOLDER)) {
    block(`SECURITY.md still contains the obsolete placeholder: "${OBSOLETE_SECURITY_PLACEHOLDER}"`);
  }
}

// Registered-trademark symbol must not be used to mark a name (e.g. "AOC®")
// without verified registration evidence. A bare prose mention of the
// symbol itself (e.g. explaining that it is not used) is not a violation —
// only flag ® directly attached to a word, which would assert registration.
const REGISTERED_MARK_USAGE = /\w®/;
for (const file of [...REQUIRED_ROOT_FILES, ...REQUIRED_LEGAL_DOCS]) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  const text = await readFile(path, 'utf8');
  if (REGISTERED_MARK_USAGE.test(text)) {
    block(`${file} uses the ® symbol attached to a name, which asserts registration; remove unless registration is verified`);
  }
}

// ---------------------------------------------------------------------------
// 3. Internal markdown links resolve
// ---------------------------------------------------------------------------

const LINK_CHECK_FILES = [...REQUIRED_ROOT_FILES, ...REQUIRED_LEGAL_DOCS, 'README.md'].filter((f) =>
  existsSync(join(ROOT, f)),
);

const MARKDOWN_LINK = /\]\(([^)]+)\)/g;

for (const file of LINK_CHECK_FILES) {
  const path = join(ROOT, file);
  const text = await readFile(path, 'utf8');
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const target = match[1].split('#')[0].trim();
    if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) {
      continue;
    }
    const resolved = normalize(join(dirname(path), target));
    if (!existsSync(resolved)) {
      advise(`${file}: internal link target does not exist: ${target}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Package metadata — private flag on workspace members
// ---------------------------------------------------------------------------

async function findWorkspacePackageJsonFiles() {
  const rootPkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const patterns = rootPkg.workspaces ?? [];
  const results = [join(ROOT, 'package.json')];
  const { readdir } = await import('node:fs/promises');
  for (const pattern of patterns) {
    const base = pattern.replace(/\/\*$/, '');
    const baseDir = join(ROOT, base);
    if (!existsSync(baseDir)) continue;
    for (const entry of await readdir(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(baseDir, entry.name, 'package.json');
      if (existsSync(candidate)) results.push(candidate);
    }
  }
  return results;
}

const publishableWithoutFlag = [];
const unnamedWorkspaceMembers = [];

for (const pkgPath of await findWorkspacePackageJsonFiles()) {
  const rel = relative(ROOT, pkgPath);
  let pkg;
  try {
    pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  } catch {
    advise(`${rel}: could not parse as JSON`);
    continue;
  }
  if (!pkg.name) {
    unnamedWorkspaceMembers.push(rel);
    continue;
  }
  const hasPrivateFlag = pkg.private === true;
  const hasPublishConfig = pkg.publishConfig !== undefined;
  if (!hasPrivateFlag && !hasPublishConfig) {
    publishableWithoutFlag.push(rel);
  }
}

if (publishableWithoutFlag.length > 0) {
  block(
    `Packages with a "name" but neither "private": true nor "publishConfig" (accidental-publish risk): ${publishableWithoutFlag.join(', ')}`,
  );
}
if (unnamedWorkspaceMembers.length > 0) {
  advise(
    `Workspace members with no "name" field (cannot be published as-is, but incomplete manifests): ${unnamedWorkspaceMembers.join(', ')}`,
  );
}

// ---------------------------------------------------------------------------
// 5. Dependency license coverage (best-effort, from package-lock.json)
// ---------------------------------------------------------------------------

const lockPath = join(ROOT, 'package-lock.json');
if (existsSync(lockPath)) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  const packages = lock.packages ?? {};
  const unknownLicense = [];
  for (const [path, info] of Object.entries(packages)) {
    if (path === '') continue;
    if (info.link === true) continue; // npm workspace symlink entry, not a real dependency
    const name = path.replace(/^node_modules\//, '');
    const isWorkspaceInternal =
      name.startsWith('@aoc-enterprise/') ||
      name === '@aoc/protocol' ||
      name.startsWith('packages/') ||
      name.startsWith('apps/') ||
      name.startsWith('../'); // sibling file: link (AOC Protocol checkout)
    if (isWorkspaceInternal) continue;
    if (!info.license) unknownLicense.push(`${name}@${info.version ?? '?'}`);
  }
  if (unknownLicense.length > 0) {
    const message = `Dependencies with no recorded license in package-lock.json (License status requires manual verification): ${unknownLicense.join(', ')}`;
    if (strict) block(message);
    else advise(message);
  }
} else {
  advise('package-lock.json not found — dependency license check skipped');
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`Legal/IP validation — mode: ${strict ? 'strict' : 'report'}`);
console.log('');

if (findings.blocking.length === 0 && findings.advisory.length === 0) {
  console.log('No findings. All required legal/IP documentation is present and consistent.');
  process.exit(0);
}

if (findings.blocking.length > 0) {
  console.log(`Blocking findings (${findings.blocking.length}):`);
  for (const f of findings.blocking) console.log(`  - ${f}`);
  console.log('');
}

if (findings.advisory.length > 0) {
  console.log(`Advisory findings (${findings.advisory.length}):`);
  for (const f of findings.advisory) console.log(`  - ${f}`);
  console.log('');
}

if (strict && findings.blocking.length > 0) {
  console.error(`legal:check:strict failed with ${findings.blocking.length} blocking finding(s).`);
  process.exit(1);
}

console.log(
  strict
    ? 'No blocking findings in strict mode.'
    : 'Report mode: findings are informational only and do not fail the build. Run `npm run legal:check:strict` to see what would block.',
);
process.exit(0);
