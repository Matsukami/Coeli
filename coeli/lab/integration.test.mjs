import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executeStage, stages } from './runner.mjs';

test('real local HTTP purple exercise: exploit, telemetry, containment, reversal, patch, independent retest, memory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'coeli-integrated-'));
  try {
    const output = {};
    for (const stage of stages) output[stage] = await executeStage(dir, stage);
    assert.equal(output.attack.probe.status, 200);
    assert.equal(output.attack.probe.body.owner, 'bob');
    assert.equal(output.attack.events[0].kind, 'cross_owner_access');
    assert.equal(output.defend.containment_verified, true);
    assert.equal(output.defend.probe.status, 403);
    assert.equal(output.defend.legitimate.status, 200);
    assert.equal(output.defend.available, true);
    assert.equal(output.defend.after_reversal.status, 200);
    assert.equal(output.defend.containment_closed, true);
    assert.equal(output.defend.cause_eliminated, false);
    assert.equal(output.maintain.tests.passed, true);
    assert.equal(output.retest.evaluation.correction_confirmed, true);
    assert.equal(output.evaluate.evaluation.decision, 'approved');
    assert.equal(output.evaluate.metrics.false_blocks, 0);
    assert.equal(output.evaluate.metrics.model_calls, 0);
    assert.equal(output.remember.knowledge.status, 'validated');
    assert.equal(output.remember.knowledge.valid_for_commit, output.maintain.patch.candidate_commit);
    assert.deepEqual(await executeStage(dir, 'defend'), output.defend);
  } finally { await rm(dir, { recursive: true }); }
});
test('observation records would_execute, leaves unauthorized access possible, and preserves availability', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'coeli-observe-'));
  try {
    await executeStage(dir, 'attack', 'observe');
    const result = await executeStage(dir, 'defend', 'observe');
    assert.equal(result.action, 'would_execute');
    assert.equal(result.control, null);
    assert.equal(result.probe.status, 200);
    assert.equal(result.available, true);
    assert.equal(result.containment_verified, false);
  } finally { await rm(dir, { recursive: true }); }
});
