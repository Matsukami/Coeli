import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CoeliWorkerClient } from './client.mjs';
const credentials = { owner: 1, worker: 'a'.repeat(48), token: 'b'.repeat(48) };
test('worker credentials are separate and network destination refuses cleartext remote and URL credentials', () => {
  assert.throws(() => new CoeliWorkerClient({ ...credentials, base: 'http://external.invalid' }), /HTTPS or loopback/);
  assert.throws(() => new CoeliWorkerClient({ ...credentials, base: 'https://user:password@example.invalid' }), /HTTPS or loopback/);
  assert.throws(() => new CoeliWorkerClient({ ...credentials, base: 'http://127.0.0.1', token: 'claude-session' }), /invalid worker credentials/);
  assert.equal(new CoeliWorkerClient({ ...credentials, base: 'http://127.0.0.1:8080' }).base, 'http://127.0.0.1:8080/api/v1/coeli-worker/1');
});
