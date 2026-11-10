import { CoeliWorkerClient } from './client.mjs';

const client = new CoeliWorkerClient({ base: process.env.COELI_URL || 'http://127.0.0.1:8080', owner: process.env.COELI_OWNER, worker: process.env.COELI_WORKER, token: process.env.COELI_WORKER_TOKEN });
try {
  const claim = await client.claim();
  if (!claim.task) console.log('Nenhuma tarefa compatível disponível.');
  else {
    const { task, lease } = claim;
    await client.heartbeat(task.id, lease, 'Demo: inspeção do contrato, sem executar código do alvo');
    const result = { schema_version: 'coeli.result.v1', demonstration: true, author: 'generic-demo-worker', status: 'candidate', task_id: task.id, stage: task.stage, note: 'Worker genérico; não é Claude Code. A demonstração valida transporte e lease, sem comprovar achado ou correção.' };
    await client.evidence(task.id, lease, result);
    await client.complete(task.id, lease, 'succeeded', result);
    console.log(`Tarefa ${task.id} concluída com resultado candidato de demonstração.`);
  }
} catch (error) {
  if ([401, 403, 409].includes(error.status)) console.error('Credencial, permissão ou lease recusado; parar trabalho e descartar efeitos pendentes.');
  else console.error(error.message);
  process.exitCode = 1;
}
