import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

export const revision = 'lab-idor-v1';
export const records = Object.freeze({
  '1': { id: '1', owner: 'alice', text: 'Pedido sintético Alice' },
  '2': { id: '2', owner: 'bob', text: 'Pedido sintético Bob' },
});
export function authorize(principal, record) {
  return Boolean(principal && record); // COELI_LAB_VULNERABILITY
}
export async function startLab({ authorizeRequest = authorize, events = [], blocked = false } = {}) {
  const controlSecret = randomBytes(32).toString('hex');
  let until = blocked ? Date.now() + 60_000 : 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/health') return send(200, { available: true });
    if (url.pathname === '/control') {
      const supplied = Buffer.from(req.headers['x-control-secret'] || '');
      const expected = Buffer.from(controlSecret);
      if (req.method !== 'POST' || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return send(403, {});
      until = url.searchParams.get('block') === 'true' ? Date.now() + 60_000 : 0;
      return send(200, { blocked_until: until });
    }
    const record = records[url.searchParams.get('id')];
    const principal = { 'lab-alice': 'alice', 'lab-bob': 'bob' }[req.headers['x-lab-key']];
    if (url.pathname !== '/records' || req.method !== 'GET') return send(404, {});
    const crossOwner = !!record && !!principal && record.owner !== principal;
    const denied = !record || !principal || (Date.now() < until && crossOwner) || !authorizeRequest(principal, record);
    events.push({ id: randomBytes(16).toString('hex'), schema_version: 'coeli.telemetry.v1', timestamp: new Date().toISOString(), source: 'coeli-lab', asset: 'synthetic-records', kind: crossOwner ? 'cross_owner_access' : 'legitimate_access', status: denied ? 403 : 200 });
    return send(denied ? 403 : 200, denied ? { error: 'denied' } : record);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base, events,
    request: async (id, key = 'lab-alice') => {
      const response = await fetch(`${base}/records?id=${encodeURIComponent(id)}`, { headers: { 'x-lab-key': key }, signal: AbortSignal.timeout(2000), redirect: 'error' });
      return { status: response.status, body: await response.json() };
    },
    contain: async (value) => {
      const response = await fetch(`${base}/control?block=${value}`, { method: 'POST', headers: { 'x-control-secret': controlSecret }, signal: AbortSignal.timeout(2000), redirect: 'error' });
      if (!response.ok) throw new Error('control refused');
      return response.json();
    },
    healthy: async () => (await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) })).status === 200,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }),
  };
}
