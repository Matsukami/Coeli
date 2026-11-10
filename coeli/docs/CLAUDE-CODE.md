# Guia para o futuro conector Claude Code

**Não implementado nesta entrega.** `sdk/demo-worker.mjs` é um worker genérico, sem chamadas Claude. Não deve ser renomeado ou apresentado como integração real.

## Contrato de transporte já preparado

1. O operador autenticado abre `/coeli`, seção Workers, escolhe nome, capacidade e ambiente, e registra o worker. O backend retorna o token Coeli uma única vez e guarda somente SHA-256. A API humana usa o cookie PentAGI, não credenciais Claude. Para trocar o token, revogue o worker e registre outro.
2. O usuário guarda `COELI_WORKER_TOKEN`, `COELI_WORKER` e `COELI_OWNER` no próprio ambiente ou gerenciador de segredos. Use TLS fora de loopback. Não envie esses valores a modelos ou inclua-os em relatórios.
3. O cliente abre conexão de saída e faz `POST /api/v1/coeli-worker/{owner}/claim`, com Bearer Coeli e header `X-Coeli-Worker`. Sem tarefa, a resposta contém `task: null`; faça polling com atraso/jitter. A demonstração faz apenas uma reivindicação.
4. Uma tarefa contém ID, campanha, estágio, capacidade, ambiente, dependência e prazo do lease; `lease` é retornado separadamente. O conector deve manter heartbeat em intervalo menor que 45 segundos, por exemplo 10 segundos, e impor o deadline da campanha. Rejeição 401, 403 ou 409 significa parar e descartar efeitos ainda não confirmados. Progresso máximo de 240 caracteres, sem segredos.
5. Envie evidência JSON até 64 KiB e resultado estruturado (`coeli.result.v1` ou candidato `coeli.audit.v1`). O receipt é SHA-256 dos bytes JSON exatos do campo `result`. Repetir conclusão idêntica é idempotente; um lease vencido não autoriza completar tarefa recuperada.
6. O worker não muda escopo, políticas, critérios, produção ou memória validada. Resultados enviados continuam candidatos. Avaliação final permanece interna. Contratos de banco e infraestrutura descrevem propostas; execução privilegiada externa não está habilitada.

Os arquivos em `contracts/` e o SDK mínimo documentam rotas e schemas. Para experimentar transporte com um backend real, registre capacidade `infrastructure.v1`, crie campanha Ataque com executor externo, e rode:

```bash
export COELI_URL=https://localhost:8443
export COELI_OWNER=1
export COELI_WORKER=<id-retornado>
read -rsp 'Token Coeli: ' COELI_WORKER_TOKEN
export COELI_WORKER_TOKEN
node coeli/sdk/demo-worker.mjs
unset COELI_WORKER_TOKEN
```

Configure uma cadeia TLS confiável no cliente. Não desative validação TLS para resolver certificados. A demonstração conclui uma tarefa candidata, sem comprovar exploração ou correção. O transporte genérico autenticado foi demonstrado com o backend real em 10/11/2026. Isso não valida um conector Claude Code.

## Trabalho que o desenvolvedor do conector precisa realizar

- Verificar a documentação atual do Claude Code e as condições da modalidade escolhida: [documentação](https://code.claude.com/docs/en/overview) e [condições](https://code.claude.com/docs/en/legal-and-compliance). Não presumir uma API oficial de gerenciamento do time.
- Conectar a instalação original do usuário usando um mecanismo documentado e permitido. A autenticação Claude deve ficar na instalação do usuário. Não copiar sessão para a Coeli, alterar binário, restringir autenticação ou intermediar assinatura.
- Mapear capacidades para funções do time, criar workspaces isolados, impor sandbox/rede/recursos, recusar escopo incompatível, supervisionar subprocessos e cancelar cooperativamente.
- Implementar coleta de diff/testes/artefatos e um importador validado de patches para a avaliação interna. O executor atual só aceita a fixture própria do projeto; não há importação funcional de um patch externo arbitrário.
- Preservar separação autor/verificador; não entregar critérios privados ou credenciais a agentes avaliados. Não promover a concordância de modelos a fato.
- Adicionar reconexão com jitter, heartbeat contínuo, sinalização de cancelamento, recuperação de lease, rotação de credenciais, redação de logs e testes reais com a instalação/autenticação do usuário.
- Executar testes de contrato HTTP, abandono, concorrência, revogação, replay, isolamento de organizações e avaliação de resultados maliciosos.

A plataforma não fornece nem revende assinatura e não alega parceria ou endosso Anthropic.
