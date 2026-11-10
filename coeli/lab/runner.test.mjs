import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { executeStage } from './runner.mjs';
import { authorize, records } from './application.mjs';

test('deterministic audit records a hypothesis and artifact hash, and resumes idempotently', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'coeli-audit-'));
  try {
    const result = await executeStage(dir, 'audit');
    assert.equal(result.finding.status, 'hypothesis');
    assert.match(result.finding.source_sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(await executeStage(dir, 'audit'), result);
    await assert.rejects(executeStage(dir, 'audit', 'observe'), /stale stage/);
  } finally { await rm(dir, { recursive: true }); }
});
test('production and unsupported operations are refused before creating a workspace', async () => {
  await assert.rejects(executeStage('/tmp/coeli-forbidden', 'attack', 'purple', 'production'), /scope refused/);
  await assert.rejects(executeStage('/tmp/coeli-forbidden', 'shell', 'purple'), /scope refused/);
});
test('project-owned vulnerable fixture permits the cross-owner boundary violation', () => {
  assert.equal(authorize('alice', records['2']), true);
  assert.equal(authorize(undefined, records['2']), false);
});
test('maintenance prepares a real git branch and diff from a labelled test finding without changing source', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'coeli-patch-'));
  const source = await readFile(new URL('./application.mjs', import.meta.url), 'utf8');
  try {
    await writeFile(path.join(dir, 'attack.json'), JSON.stringify({ test_fixture: true, finding: { status: 'confirmed' } }));
    const result = await executeStage(dir, 'maintain');
    assert.equal(result.patch.branch, 'coeli/fix-authorization');
    assert.equal(result.patch.applied_to_main, false);
    assert.notEqual(result.patch.base_commit, result.patch.candidate_commit);
    assert.match(await readFile(path.join(dir, 'patch.diff'), 'utf8'), /record.owner === principal/);
    const fixed = await import(pathToFileURL(path.join(dir, 'patch', 'application.mjs')).href);
    assert.equal(fixed.authorize('alice', records['2']), false);
    assert.equal(fixed.authorize('alice', records['1']), true);
    assert.equal(fixed.authorize('bob', records['2']), true);
    assert.equal((await exec('git', ['-C', path.join(dir, 'patch'), 'status', '--porcelain'], { encoding: 'utf8' })).stdout, '');
    assert.equal(await readFile(new URL('./application.mjs', import.meta.url), 'utf8'), source);
  } finally { await rm(dir, { recursive: true }); }
});
