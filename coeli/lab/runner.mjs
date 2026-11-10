import { mkdir, readFile, writeFile, rename, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
import { authorize, startLab, revision } from './application.mjs';
import { evaluate } from './evaluator.mjs';

const source = fileURLToPath(new URL('./application.mjs', import.meta.url));
export const stages = ['audit', 'attack', 'defend', 'maintain', 'retest', 'evaluate', 'remember'];
const hash = (text) => createHash('sha256').update(text).digest('hex');
const git = async (dir, args) => (await exec('git', ['-C', dir, ...args], { encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024, env: { PATH: process.env.PATH, HOME: dir, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'Coeli Lab', GIT_AUTHOR_EMAIL: 'lab@invalid', GIT_COMMITTER_NAME: 'Coeli Lab', GIT_COMMITTER_EMAIL: 'lab@invalid', GIT_TERMINAL_PROMPT: '0', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' } })).stdout;

export async function executeStage(directory, stage, mode = 'purple', environment = 'laboratory') {
  if (!stages.includes(stage) || !['purple', 'observe', 'audit', 'attack', 'defense', 'maintenance', 'release'].includes(mode) || !['laboratory', 'staging'].includes(environment)) throw new Error('scope refused');
  const dir = path.resolve(directory);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if ((await lstat(dir)).isSymbolicLink() || await realpath(dir) !== dir) throw new Error('unsafe workspace');
  const cache = path.join(dir, `${stage}.json`);
  const code = await Promise.all([readFile(source, 'utf8'), readFile(fileURLToPath(import.meta.url), 'utf8'), readFile(new URL('./evaluator.mjs', import.meta.url), 'utf8')]);
  const fingerprint = hash(JSON.stringify({ mode, environment, revision, code }));
  try {
    const old = JSON.parse(await readFile(cache, 'utf8'));
    if (old.fingerprint !== fingerprint) throw new Error('stale stage');
    return old;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const result = { schema_version: 'coeli.activity.v1', stage, mode, environment, revision, fingerprint, timestamp: new Date().toISOString(), model: null, synthetic_data: true };
  if (stage === 'audit') {
    const code = await readFile(source, 'utf8');
    result.coverage = [{ unit: 'records authorization', status: 'reviewed', method: 'source inspection', artifact_sha256: hash(code) }];
    result.finding = { status: 'hypothesis', boundary: 'alice must not read bob records', category: 'CWE-639', source_sha256: hash(code), verification: 'pending HTTP reproduction' };
  }
  if (stage === 'attack') {
    const lab = await startLab();
    try {
      result.probe = await lab.request('2');
      result.legitimate = await lab.request('1');
      result.available = await lab.healthy();
      result.events = lab.events;
      await writeFile(path.join(dir, 'telemetry.json'), JSON.stringify({ events: lab.events }), { mode: 0o600 });
      result.finding = { status: result.probe.status === 200 && result.probe.body.owner === 'bob' ? 'confirmed' : 'inconclusive', category: 'CWE-639', verifier: 'HTTP response and principal boundary' };
      if (result.finding.status !== 'confirmed') throw new Error('initial reproduction failed');
    } finally { await lab.close(); }
  }
  if (stage === 'defend') {
    const telemetry = JSON.parse(await readFile(path.join(dir, 'telemetry.json'), 'utf8'));
    const detected = telemetry.events.some((event) => event.kind === 'cross_owner_access');
    const lab = await startLab();
    try {
      const observe = mode === 'observe';
      result.rule = 'cross-owner-v1';
      result.detected_at = new Date().toISOString();
      result.detected = detected;
      result.action = observe ? 'would_execute' : 'executed';
      result.procedure = 'block-cross-owner-v1';
      result.control = detected && !observe ? await lab.contain(true) : null;
      result.probe = await lab.request('2');
      result.legitimate = await lab.request('1');
      result.available = await lab.healthy();
      result.verified = detected && result.available && result.legitimate.status === 200 && result.probe.status === (observe ? 200 : 403);
      result.containment_verified = !observe && result.verified;
      result.contained_at = !observe && result.verified ? new Date().toISOString() : null;
      result.reversal = !observe ? await lab.contain(false) : null;
      result.after_reversal = await lab.request('2');
      result.containment_closed = !observe && result.after_reversal.status === 200;
      if (!observe && !result.containment_closed) throw new Error('containment reversal failed');
      result.cause_eliminated = false;
      if (!result.verified) throw new Error('defense verification failed');
    } finally { await lab.close(); }
  }
  if (stage === 'maintain') {
    const attack = JSON.parse(await readFile(path.join(dir, 'attack.json'), 'utf8'));
    if (attack.finding.status !== 'confirmed') throw new Error('confirmed finding required');
    const repo = path.join(dir, 'patch');
    await mkdir(repo, { recursive: true, mode: 0o700 });
    if ((await lstat(repo)).isSymbolicLink()) throw new Error('unsafe patch path');
    const original = await readFile(source, 'utf8');
    // Only this project-owned fixture is patched; arbitrary repository code is never executed.
    const fixed = original.replace('return Boolean(principal && record); // COELI_LAB_VULNERABILITY', 'return Boolean(principal && record && record.owner === principal);');
    if (fixed === original) throw new Error('fixture patch no longer applies');
    try { await git(repo, ['rev-parse', '--git-dir']); } catch { await git(repo, ['init', '-b', 'baseline']); }
    try { await git(repo, ['rev-parse', '--verify', 'baseline']); } catch {
      await writeFile(path.join(repo, 'application.mjs'), original, { mode: 0o600 });
      await git(repo, ['add', 'application.mjs']); await git(repo, ['commit', '-m', 'Synthetic vulnerable baseline']);
    }
    const baseline = (await git(repo, ['rev-parse', 'baseline'])).trim();
    await git(repo, ['checkout', '-B', 'coeli/fix-authorization', 'baseline']);
    await writeFile(path.join(repo, 'application.mjs'), fixed, { mode: 0o600 });
    const diff = await git(repo, ['diff', '--', 'application.mjs']);
    await writeFile(path.join(dir, 'patch.diff'), diff, { mode: 0o600 });
    await git(repo, ['add', 'application.mjs']); await git(repo, ['commit', '-m', 'Enforce record ownership']);
    const candidate = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    result.patch = { status: 'prepared', branch: 'coeli/fix-authorization', base_commit: baseline, candidate_commit: candidate, diff_sha256: hash(diff), source_sha256: hash(fixed), applied_to_main: false, migrations: 'none' };
    const candidateModule = await import(pathToFileURL(path.join(repo, 'application.mjs')).href);
    const testsPassed = candidateModule.authorize('alice', { owner: 'alice' }) && !candidateModule.authorize('alice', { owner: 'bob' }) && !candidateModule.authorize(undefined, { owner: 'alice' });
    if (!testsPassed) throw new Error('maintainer authorization checks failed');
    result.tests = { author: 'internal-maintainer', passed: testsPassed, cases: 3, method: 'authorization function checks; independent HTTP retest pending' };
  }
  if (stage === 'retest' || stage === 'evaluate') {
    const prepared = JSON.parse(await readFile(path.join(dir, 'maintain.json'), 'utf8'));
    const file = path.join(dir, 'patch', 'application.mjs');
    const actual = await readFile(file, 'utf8');
    const trusted = (await readFile(source, 'utf8')).replace('return Boolean(principal && record); // COELI_LAB_VULNERABILITY', 'return Boolean(principal && record && record.owner === principal);');
    if (hash(actual) !== prepared.patch.source_sha256 || actual !== trusted) throw new Error('untrusted or changed artifact');
    const module = await import(pathToFileURL(file).href);
    result.evaluation = await evaluate(module.authorize);
    result.patch = prepared.patch;
    const attack = JSON.parse(await readFile(path.join(dir, 'attack.json'), 'utf8'));
    const defense = JSON.parse(await readFile(path.join(dir, 'defend.json'), 'utf8'));
    result.metrics = {
      detected: defense.detected ? 1 : 0,
      attacks_not_detected: defense.detected ? 0 : 1,
      containment_ms: defense.contained_at ? Date.parse(defense.contained_at) - Date.parse(defense.detected_at) : null,
      false_blocks: defense.legitimate.status === 200 ? 0 : 1,
      legitimate_operations_completed: Number(attack.legitimate.status === 200) + Number(result.evaluation.legitimate_status === 200) + Number(result.evaluation.second_principal_status === 200),
      corrections_confirmed: Number(result.evaluation.correction_confirmed),
      model_calls: 0,
      model_cost: 0,
      duration_ms: Date.now() - Date.parse(attack.timestamp),
      conditions: { fixture: revision, rules: 'cross-owner-v1', criteria: 'release-v1', model: null, environment, mode },
    };
    if (result.evaluation.decision !== 'approved') throw new Error('independent evaluation rejected');
  }
  if (stage === 'remember') {
    const evaluation = JSON.parse(await readFile(path.join(dir, 'evaluate.json'), 'utf8'));
    if (!evaluation.evaluation.correction_confirmed) throw new Error('validated result required');
    if (hash(await readFile(path.join(dir, 'patch', 'application.mjs'), 'utf8')) !== evaluation.patch.source_sha256) throw new Error('evaluated artifact is stale');
    result.knowledge = { status: 'validated', category: 'CWE-639', valid_for_commit: evaluation.patch.candidate_commit, artifact_sha256: evaluation.patch.source_sha256, environment, criteria: 'release-v1', invalidation: 'commit, artifact, rules or environment change' };
  }
  const temporary = `${cache}.tmp`;
  await writeFile(temporary, JSON.stringify(result, null, 2), { mode: 0o600 });
  await rename(temporary, cache);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , directory, stage, mode = 'purple', environment = 'laboratory'] = process.argv;
  try {
    if (stage === 'all') {
      const results = [];
      for (const step of stages) results.push(await executeStage(directory, step, mode, environment));
      process.stdout.write(`${JSON.stringify({ results })}\n`);
    } else process.stdout.write(`${JSON.stringify(await executeStage(directory, stage, mode, environment))}\n`);
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
