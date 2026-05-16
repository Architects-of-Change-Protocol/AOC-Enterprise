import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = process.cwd();

function run(cmd, args, cwd = root) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return res;
}

test('protocol consumption guard passes', () => {
  const res = run('node', [resolve(root, 'scripts/check-protocol-consumption.mjs')]);
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
});
