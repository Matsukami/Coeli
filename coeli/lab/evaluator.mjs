import { startLab } from './application.mjs';

export const criteria = Object.freeze({ version: 'release-v1', unauthorized_status: 403, legitimate_status: 200, availability_required: true });
export async function evaluate(authorizeRequest) {
  const lab = await startLab({ authorizeRequest });
  try {
    const unauthorized = await lab.request('2');
    const legitimate = await lab.request('1');
    const bob = await lab.request('2', 'lab-bob');
    const available = await lab.healthy();
    const passed = unauthorized.status === 403 && legitimate.status === 200 && bob.status === 200 && available;
    return { author: 'internal-maintainer', evaluator: 'deterministic-independent-verifier', criteria, unauthorized_status: unauthorized.status, legitimate_status: legitimate.status, second_principal_status: bob.status, available, decision: passed ? 'approved' : 'rejected', correction_confirmed: passed };
  } finally { await lab.close(); }
}
