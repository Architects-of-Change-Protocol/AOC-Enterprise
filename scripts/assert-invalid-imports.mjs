import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cases = [
  "@aoc-enterprise/runtime/src/runtime/index",
  "@aoc-enterprise/runtime/runtime/orchestration/pipelines/authorization-orchestrator",
  "@aoc-enterprise/runtime/evaluators/authorization-evaluator",
  "@aoc-enterprise/runtime/*",
];

const run = (cmd, args, cwd) => {
  const result = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  return result;
};

const workspace = await mkdtemp(join(tmpdir(), 'aoc-invalid-imports-'));
await writeFile(
  join(workspace, 'tsconfig.json'),
  JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
    },
    include: ['index.ts'],
  }, null, 2),
);

for (const specifier of cases) {
  await writeFile(join(workspace, 'index.ts'), `import '${specifier}';\n`);
  const result = run('npx', ['tsc', '--pretty', 'false', '-p', 'tsconfig.json'], workspace);
  if (result.status === 0) {
    throw new Error(`Expected import to fail but it succeeded: ${specifier}`);
  }
}

console.log(`Validated ${cases.length} invalid import cases.`);
