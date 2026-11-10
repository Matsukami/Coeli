import { createHash } from 'node:crypto';

export class CoeliWorkerClient {
  constructor({ base, owner, worker, token }) {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('HTTPS or loopback required');
    if (!/^[1-9][0-9]*$/.test(String(owner)) || !/^[a-f0-9]{48}$/.test(worker) || !/^[a-f0-9]{48}$/.test(token)) throw new Error('invalid worker credentials');
    this.base = `${base.replace(/\/$/, '')}/api/v1/coeli-worker/${owner}`;
    this.worker = worker; this.token = token;
  }
  async request(route, body = {}) {
    const response = await fetch(this.base + route, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}`, 'x-coeli-worker': this.worker }, body: JSON.stringify(body) });
    if (!response.ok) { const error = new Error(`Coeli worker HTTP ${response.status}`); error.status = response.status; throw error; }
    return response.json();
  }
  async claim() { return this.request('/claim'); }
  async heartbeat(task, lease, progress) { return this.request(`/tasks/${encodeURIComponent(task)}/heartbeat`, { lease, progress }); }
  async evidence(task, lease, content) { return this.request(`/tasks/${encodeURIComponent(task)}/evidence`, { lease, content }); }
  async complete(task, lease, outcome, result) {
    const text = JSON.stringify(result);
    const receipt = createHash('sha256').update(text).digest('hex');
    return this.request(`/tasks/${encodeURIComponent(task)}/result`, { lease, outcome, result, receipt });
  }
  async telemetry(event) { return this.request('/telemetry', event); }
}
