# Evidências de verificação

## Validação integrada de 10/11/2026

**Laboratório determinístico validado com serviços reais.** A validação cobre a fixture sintética própria, sem modelos, credenciais pessoais ou alvos externos. Os bloqueios de sockets descritos no histórico abaixo pertencem ao sandbox restrito: repetindo os comandos com aprovação no executor real, Docker Server e loopback funcionaram. Não foi encontrado AGENTS.md aplicável na raiz nem nos diretórios ancestrais consultados; CLAUDE.md e a documentação Coeli foram lidos. Branch `feat/coeli-purple-team`, origin `Matsukami/Coeli`, upstream `vxcontrol/pentagi`; alterações locais preservadas e nenhum push realizado.

Toolchains obtidas sem mudar requisitos/lockfiles: Go **1.26.5** selecionado por `GOTOOLCHAIN=go1.26.5`, Node **24.17.0** e pnpm **11.8.0** instalados em `/tmp/coeli-tools`. Docker Client e Server **29.9.3**; abertura real de socket em `127.0.0.1` passou. O Go inicial do PATH é 1.27.3; o relatório final usa a seleção explícita da toolchain, inclusive ao consultar os caminhos alternativos. Corepack não estava no PATH; o pnpm fixado foi instalado diretamente em `/tmp`. Não foram lidos arquivos de credenciais pessoais para configurar serviços.

Banco exclusivo: container `coeli-validation-db`, imagem `pgvector/pgvector:pg16`, PostgreSQL 16, porta `127.0.0.1:55439`, sem volume de dados da instalação. A imagem resolvida foi `sha256:0dd3149a06e4579a0d70d8fef9945636cd514005e7237deb27f9b67886f8dc4f`. A suíte Coeli usa schemas temporários; as suites upstream usam seus próprios schemas. O servidor completo aplicou todas as migrações pelo goose, incluindo a Coeli; a regressão de migrações também passou por Down/Up. Uma conta administrativa sintética foi configurada somente neste banco.

Comandos concluídos com **exit code 0** (PATH com Node/pnpm pinados e `GOTOOLCHAIN=go1.26.5`; DSNs apontaram somente ao banco descartável):

| Verificação | Comando / resultado |
| --- | --- |
| Backend | `go generate ./cmd/installer/files/`; `go build -mod=readonly -o /tmp/pentagi-coeli-verified ./cmd/pentagi` |
| Regressão Go | `GOMAXPROCS=2 go test -p 1 -race ./...`: 77 pacotes com testes passaram; 43 pacotes sem testes |
| PostgreSQL upstream | `GOMAXPROCS=2 PENTAGI_TEST_DSN=… go test -p 1 -tags postgres ./pkg/database/... ./pkg/timezone/... ./migrations/`: passou |
| Coeli integrada | `COELI_TEST_DSN=… go test -p 1 -race -tags postgres -v ./pkg/coeli`: 8 testes passaram, incluindo HTTP, PostgreSQL e executor Node reais |
| Docker upstream | `GOMAXPROCS=2 go test -p 1 -race -v ./pkg/docker`: passou com dois skips explícitos descritos abaixo |
| Frontend | `pnpm install --frozen-lockfile`; `pnpm run build` (inclui `tsc -b`); `pnpm run lint`: passaram |
| Vitest | `pnpm run test --maxWorkers=2`: 118 arquivos, **2.539 testes** passaram |
| Playwright upstream | `pnpm exec playwright test -c e2e/playwright.config.ts specs/smoke.spec.ts --workers=1`: **4 passaram**, `.last-run.json` com `status: passed` |
| HTTP Node | `node --test --test-isolation=none coeli/lab/integration.test.mjs`: **2 passaram** |
| Contratos/offline | `bash coeli/tools/check.sh`: **5 Node e 6 contratos Python** passaram; checks de sintaxe passaram |
| Compose real | `docker compose --env-file /dev/null -p coeli-validation -f coeli/compose.lab.yml run --build --rm exercise`: sete estágios, avaliação aprovada, memória validada, rede externa desativada |
| Servidor real | `python3 coeli/tools/demo-http.py` com URL e conta sintéticas no ambiente: Purple/laboratory, observe/laboratory e release/staging, 16 downloads com SHA-256 conferido, worker autenticado, heartbeat, replay e revogação |

O binário completo foi iniciado de `/tmp` com `env -i`, banco e runtime exclusivos, sem chaves de provedores, escutando apenas `127.0.0.1:18087`. Login PentAGI real retornou 200; Coeli sem sessão retornou 403; worker sem token/revogado retornou 401. Na suíte HTTP Coeli, o UID humano é fornecido pelo harness, mas o transporte HTTP, worker Bearer, banco e subprocesso Node são reais. A demonstração do binário e do navegador complementa isso verificando autenticação PentAGI real.

Uma campanha Purple Team foi pausada e persistida; o processo foi encerrado com SIGTERM e iniciado novamente com o mesmo banco/runtime. Após novo login, a campanha continuava pausada, foi retomada e concluiu sete atividades. A suíte DB verificou claims concorrentes, recuperação de lease expirado e isolamento entre proprietários; a suíte HTTP verificou recusa de heartbeat em pausa/cancelamento, upload/download de candidato do worker e recusa de resultado adulterado com receipt anterior.

Um script temporário Playwright abriu Chromium headless **149.0.7827.55 / revisão 1228**, fez login pela interface e navegou em Coeli, Contenções, Correções e retestes e Workers contra o backend real. Os rótulos e dados persistidos ficaram visíveis e não ocorreram erros JavaScript. Não foram salvos cookies, traces, screenshots ou senhas dessa navegação. O script foi apenas uma verificação ad hoc; os smoke tests upstream permanecem reproduzíveis pelo comando acima. O navegador exigido não estava instalado inicialmente; foi obtido com `pnpm exec playwright install chromium --only-shell` e a execução foi repetida.

### Problemas encontrados e corrigidos

- A suíte PostgreSQL Coeli não compilava: `err` era usado sem declaração. Declarações corrigidas e helper compartilhado movido para `fixtures_test.go` com tag postgres.
- Repetir uma conclusão de worker após persistir retornava 409: JSONB normaliza os bytes de `result`, invalidando a comparação com o hash dos bytes originais. A idempotência agora confere o conteúdo recebido contra o receipt persistido. O teste HTTP integrado falhou antes da correção e passou depois; alterar o conteúdo mantendo o receipt é recusado com 403.
- A fixture upstream de numeração antiga apagava versões recentes sem desfazer o schema; ao reaplicar a migração Coeli, a tabela já existia. A preparação agora usa `goose.DownTo(20260720)` antes de registrar a numeração antiga. O teste falhou antes e passou após a correção, sem tornar a migração de produção permissiva.
- A página Coeli tinha 68 erros de lint, incluindo `Date.now()` durante render. Ordenação/formatação corrigidas e expiração exibida pelo estado `stale` retornado pelo servidor no polling.
- A primeira execução concorrente das suites completas esgotou o disco e causou ENOSPC/timeouts. Somente temporários Go e o arquivo Node baixado desta sessão foram removidos; as suites foram repetidas com `GOMAXPROCS=2`, `-p 1` e dois workers Vitest. Os resultados interrompidos não foram considerados aprovação. O host continua com pouco espaço livre; builds novos podem precisar de limpeza administrativa adicional.

### Limitações reais da validação

- Dois casos Docker foram ignorados: sweep no namespace PID exige executar dentro de container; o subcaso `debian:latest` exige essa imagem local. O caso busybox e os demais testes Docker reais passaram. Não se conclui isolamento forte apenas pelo daemon estar acessível.
- A suíte completa Playwright, tiers local/stand e snapshots visuais não foram executados; somente quatro smoke tests mock e navegação Coeli com backend real. Emergência durante efeitos, HA, carga e pentest abrangente de isolamento não foram demonstrados.
- Sem chaves de modelo por escolha de isolamento do teste: o servidor registrou ausência de embedder OpenAI. Nenhuma chamada real de provedor, flow ofensivo PentAGI, Claude Code, Cyber ou alvo empresarial foi validado. Isso não bloqueou os exercícios determinísticos.
- Os avisos de tamanho de chunks e migração sugerida dos plugins Vite são upstream; o build final passou. Vitest emitiu avisos jsdom sobre canvas/scrollTo e passou.
- Licença do SDK, SBOM completo e autorização para distribuir o fork permanecem pendentes conforme PROVEDORES-E-LICENCAS.md. Nenhum push, publicação ou deploy foi realizado.

Evidências revisadas em [`../evidence/validation-20261110/`](../evidence/validation-20261110/), com hashes em `manifest.json`. Os logs antigos abaixo são histórico, não o resultado atual. O servidor temporário foi encerrado e o container PostgreSQL descartável removido com seu volume anônimo ao terminar. Binários, node_modules, arquivos gerados do instalador, banco/runtime e relatórios Playwright completos não entram nos commits.

## Histórico anterior à validação integrada

## Rechecagem após instalação de ferramentas no Ubuntu

Os requisitos do checkout/CI foram conferidos: Go **1.26.5** (`backend/go.mod`, sem diretiva `toolchain`; CI fixa a mesma versão), Node **24.17.0** (`frontend/.nvmrc` e CI; nenhum `.node-version`) e pnpm **11.8.0** (`packageManager`, consumido pelo CI). Nenhum requisito ou lockfile foi alterado.

Nesta sessão, o PATH ainda usa Node 24.19.0 e não contém Go/pnpm. Foram localizados Go 1.27.3 em `~/.local/opt/go1.27.3/go/bin/go`, Node 26.13.0 e pnpm standalone 12.18.0 sob `~/.nvm/versions/node/v26.13.0/bin`. São versões diferentes das fixadas. A tentativa de seleção/download de Go 1.26.5 com `GOTOOLCHAIN=go1.26.5` foi recusada pela rede do executor; o Corepack também não conseguiu obter pnpm 11.8.0. A versão Node exigida não está instalada nem no cache inspecionado. Não foram alterados aliases, requisitos ou lockfiles para acomodar essas diferenças.

Resultados adicionais:

- `gofmt` executado nos fontes Coeli e pontos Go alterados com o binário disponível, sem mudanças de lógica.
- **6 testes Go isolados passaram com `-race` e Go 1.27.3**. A invocação selecionou somente `types.go`, `workflow.go`, `optional.go` e seus testes, sem dependências externas. Isso **não** compila nem valida HTTP, executor, store PostgreSQL, provedores ou servidor completo; não substitui o build Go 1.26.5.
- Build do backend com a toolchain exigida: bloqueado no download por `socket: operation not permitted` no DNS.
- Instalação frontend com pnpm 11.8.0 e `--frozen-lockfile`: bloqueada por `EAI_AGAIN registry.npmjs.org`. Build/typecheck não executados.
- Docker Client **29.9.3** disponível; Docker Server não foi verificado, pois o socket recusa acesso. A configuração `coeli/compose.lab.yml` passou em `docker compose config --quiet`, o que não inicia containers.
- **2 testes HTTP novamente falharam** em `listen EPERM` antes de qualquer requisição. Migrações em PostgreSQL descartável e demonstração integrada continuam não executadas. Não há PostgreSQL local acessível para substituir o container.

Logs da rechecagem em `evidence/environment-recheck.json`, `go-logic-recheck.txt`, `backend-build-recheck.txt`, `frontend-install-recheck.txt` e `http-recheck.txt`. A checagem `python3 coeli/tools/check-environment.py` recusa versões divergentes, Docker inacessível e loopback bloqueado antes da suíte integrada. Ela não altera a instalação nem concede aprovação: mesmo com pré-requisitos corretos ainda faltam builds, banco, HTTP e demonstração do backend/workers.

**Aceitação permanece bloqueada.** Instalar ferramentas no Ubuntu não remove as restrições de rede e sockets do executor desta sessão.

## Histórico da primeira execução

Data: 09/11/2026. Base: `cffed9485aa1cca70762cd08a57ac62a80406258`. Node disponível: v24.19.0; Git: 2.43.0. Não foram usados credenciais de modelo, contas Claude, GPT Cyber ou alvos externos.

## Executados com sucesso

```text
node --test --test-isolation=none coeli/lab/runner.test.mjs coeli/sdk/client.test.mjs
5 testes passaram, 0 falharam

python3 coeli/contracts/test_contracts.py
6 testes passaram
```

Os cinco testes Node verificam: hipótese de auditoria com hash e checkpoint idempotente; recusa de produção/ação desconhecida; comportamento vulnerável da fixture; preparação de branch Git e diff reais com autorização corrigida e checkout principal preservado; validação de credenciais e URL do SDK. O teste de manutenção usa **achado fixture rotulado**, não comprova exploração HTTP integrada.

Uma mutação em cópia descartável trocou a comparação de titular por uma comparação invertida; o teste de manutenção falhou como esperado. O código original foi preservado, e a suíte íntegra passou novamente. Output: `evidence/mutation-session.txt`.

Os seis testes de contrato verificam schemas, evidências obrigatórias, recusa de autoconfirmação, capacidades/ambientes permitidos, lease/receipt/resultado obrigatório, telemetria e referências OpenAPI. São testes offline de contrato de dados; não comprovam autenticação ou conclusão HTTP no backend.

O TypeScript instalado em outro projeto foi usado somente para parse/transpilação TSX dos três arquivos alterados de interface; o Prettier local da extensão VS Code formatou a nova página. Isso não substitui `pnpm run typescript`, lint, build ou teste visual da versão pinada. `node --check` verificou a sintaxe dos arquivos MJS. `git diff --check` não encontrou whitespace inválido nos arquivos rastreados alterados.

## Tentados, sem demonstração integrada

```text
node --test --test-isolation=none coeli/lab/integration.test.mjs
2 testes falharam antes de executar requisições:
Error: listen EPERM: operation not permitted 127.0.0.1
```

O executor da sessão não permite abrir socket loopback. Não houve exploração, contenção HTTP, reteste HTTP ou geração de métricas/memória integrada nesta sessão. Não foram substituídos por respostas simuladas. O runner standalone também encontrou o mesmo erro. O conteúdo da falha está em `evidence/integration-session.txt`.

## Checks indisponíveis

- `go version`: `go: command not found`. Build, gofmt, Go/race, suites upstream e migrações/testes PostgreSQL **não executados**. O código Go requer validação com a toolchain pinada antes de uso.
- `pnpm --version`: ausente. `COREPACK_HOME=/tmp/coeli-corepack corepack pnpm --version` falhou ao resolver `registry.npmjs.org`. Sem node_modules do frontend, não foram executados typecheck, build, Vitest ou Playwright.
- `docker info`: permissão negada no socket Docker. Nenhuma imagem/Compose foi construída ou executada. Isso não foi contornado.
- `git ls-remote` upstream: resolução de `github.com` indisponível no terminal. O checkout fornecido pelo usuário foi inspecionado localmente; documentação externa foi consultada por ferramenta web separada.
- Sem PostgreSQL acessível e toolchain Go: suite de isolamento/reinício/concorrência `store_live_test.go` incluída, mas não executada.
- Sem provedores configurados: teste real de modelo, execução de flow ofensivo PentAGI e regressões funcionais originais não executados.

## Comandos pendentes de aceitação

Execute no ambiente preparado os comandos do README Coeli e `CLAUDE.md`. Preserve outputs e exit codes separadamente. Os testes integrados não devem ser marcados como sucesso apenas porque um comando posterior (`cat`, por exemplo) terminou com exit code zero. Só promover a entrega a laboratório funcional aceito depois de passar os testes reais com backend/DB/HTTP e corrigir as falhas observadas.
