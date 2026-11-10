# Coeli — extensão de laboratório do PentAGI

Esta implementação acrescenta código de coordenação Purple Team à base PentAGI. **O laboratório determinístico foi validado com backend, PostgreSQL, HTTP, workers e navegador reais em 10/11/2026.** Os testes executados e as limitações estão em [TESTES.md](docs/TESTES.md); a matriz completa está em [MATRIZ.md](docs/MATRIZ.md). Não usar como proteção de uma empresa real e não interpretar uma avaliação aprovada como ausência de vulnerabilidades.

## O que foi acrescentado

- Backend Go no servidor Gin existente; migração no PostgreSQL existente, estado persistente, scheduler, dependências de tarefas, lease, heartbeat, expiração, cancelamento, orçamento de atividades e evidências autenticadas.
- Página `/coeli` no React existente, acessível pelo menu. Campanhas, incidentes, resultados, contenções, patches, retestes, memória por versão, workers, provedores e comparação.
- Laboratório próprio de autorização entre titulares, com HTTP local, telemetria, controle temporário autenticado, reversão, workspace Git separado, patch determinístico, checks de autorização, reteste e critérios independentes.
- API de workers pull, OpenAPI, JSON Schemas, SDK Node sem dependências e worker genérico de demonstração. Conector Claude Code pendente, deliberadamente.
- Interface Cyber indisponível por padrão, fixture identificada e condições documentadas. O laboratório não depende de modelo nem de chave.

Builds Go/React, regressões upstream e demonstração integrada passaram com as versões pinadas. Isso valida a fixture sintética; não certifica integrações externas, modelos reais ou uso em produção.

## Instalação e execução com o backend

Requisitos: Go **1.26.5** conforme `backend/go.mod`, Node **24.17.0** conforme `frontend/.nvmrc` e CI, pnpm **11.8.0** conforme o frontend, Git e o PostgreSQL/pgvector da instalação PentAGI. Configure o PentAGI conforme o README upstream e `.env.example`, com contas e segredos próprios da instalação. Não compartilhe credenciais pessoais do desenvolvedor entre clientes.

Antes de empacotar ou distribuir qualquer binário/imagem do fork, resolva o impedimento do VXControl Cloud SDK descrito em [PROVEDORES-E-LICENCAS.md](docs/PROVEDORES-E-LICENCAS.md). A imagem upstream não inclui esta extensão, e simplesmente usar a imagem remota existente não executará o novo backend. Esta entrega compilou binários temporários e construiu somente a imagem local do laboratório, sem publicar imagens ou binários Coeli.

A partir da raiz do checkout `pentagi/`, em uma máquina de laboratório preparada:

```bash
export COELI_ENABLED=true
export COELI_ROOT="$PWD/coeli"
export COELI_RUNTIME="$PWD/coeli/.runtime"
mkdir -p "$COELI_RUNTIME"
chmod 700 "$COELI_RUNTIME"
cd backend
go mod download
go generate ./cmd/installer/files/
go build -o /tmp/pentagi-coeli ./cmd/pentagi
```

Inicie o binário com as configurações PostgreSQL, autenticação, TLS, Docker do controlador original e demais requisitos upstream. A migração goose Coeli é aplicada pelo mecanismo existente do PentAGI. O executor Node executa apenas a fixture própria; não entregue o Docker socket a agentes ou workers externos.

Para o frontend, em outro terminal, a partir do checkout:

```bash
cd frontend
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```

Use `STATIC_DIR`/servidor de desenvolvimento conforme configuração upstream e faça login normalmente. Abra `/coeli`. Um backend sem as três variáveis/Node disponíveis exibe a Coeli como indisponível, preservando as rotas originais.

## Demonstração pela interface

1. Crie campanha **Purple Team / Laboratório / Interno determinístico**, sem ID de flow. O escopo é fixo em `synthetic-records`, loopback, até duas tentativas por tarefa, uma tarefa ativa por campanha, 30 atividades e 10 minutos.
2. Observe auditoria → reprodução HTTP → detecção por telemetria → contenção/verificação/reversão → preparação Git → reteste → avaliação → memória. A aplicação vulnerável não publica portas. Cada atividade HTTP usa uma instância efêmera local.
3. Em Achados, o candidato de auditoria é hipótese; a reprodução observa dados sintéticos de outro titular. Em Contenções, a ação precisa mostrar bloqueio, acesso legítimo e disponibilidade, seguida de reversão. Healthcheck indisponível reprova a verificação.
4. Em Correções, a branch própria e o diff não significam aplicação na principal. O reteste HTTP independente verifica o patch. O caso de memória vale apenas para commit e artefato registrados.
5. Execute **Observação**: o registro deve ser `would_execute`, controle nulo e acesso indevido ainda possível. A observação não faz contenção.
6. Execute **Validação de release / Homologação sintética**: os mesmos critérios explícitos avaliam a fixture corrigida; não representa homologação de um produto externo.
7. Pause, retome, cancele ou use emergência. Ao reiniciar o backend, o scheduler recupera leases vencidos e checkpoints. Um processo em andamento pode levar até 30 segundos para terminar; cancelamento invalida a conclusão.

Para vincular um ataque PentAGI real, crie/execute o flow pelos recursos originais com seu provedor e escopo autorizado, depois crie uma campanha Coeli **Ataque** e informe o ID de um flow seu já finalizado. A ponte consulta o registro real, identifica modelo/provedor e produz evidência. Não gera nova campanha ofensiva automaticamente, não injeta controles Coeli nos flows existentes e não confirma os achados do flow apenas pelo status `finished`. Falta comprovar essa integração com modelo/Docker reais.

## Demonstração isolada do laboratório

Sem backend, PostgreSQL ou modelo, em uma máquina que permita loopback:

```bash
node coeli/lab/runner.mjs /tmp/coeli-demo-round all purple laboratory
node coeli/lab/runner.mjs /tmp/coeli-demo-observe attack observe laboratory
node coeli/lab/runner.mjs /tmp/coeli-demo-observe defend observe laboratory
node coeli/lab/runner.mjs /tmp/coeli-demo-staging all release staging
```

A saída é JSON de evidências reais das requisições, sem agente simulado. Os diretórios são exclusivos da rodada; não reutilize depois de modificar código/modo/ambiente. O runner recusa fingerprints incompatíveis.

Alternativa com isolamento de rede e recursos, sem publicar portas ou montar socket Docker:

```bash
docker compose -f coeli/compose.lab.yml run --build --rm exercise
```

Esse Compose executa somente o laboratório, não o servidor PentAGI. O scratch é efêmero; a saída JSON é a evidência exportada. A construção requer rede para obter imagem/pacotes; a execução usa `network_mode: none` e loopback dentro do namespace. A imagem e o exercício foram construídos e executados nesta sessão; veja os resultados em TESTES.md.

## Demonstração HTTP do servidor real

Com o backend iniciado e uma conta exclusiva de laboratório, configure `COELI_DEMO_URL` (por exemplo, `http://127.0.0.1:8080/api/v1`), `COELI_DEMO_MAIL` e `COELI_DEMO_PASSWORD` no ambiente e execute:

```bash
python3 coeli/tools/demo-http.py
```

O script cria três campanhas sintéticas, confere evidências por SHA-256 e testa autenticação, heartbeat, replay e revogação do worker. Tokens e cookies ficam em memória; o relatório não contém credenciais. Ele altera o banco de laboratório e mantém as campanhas/evidências para revisão. Não aponte para uma instalação com dados que precisem ser preservados. TLS é obrigatório fora de loopback. Reinício do processo e navegação no navegador são verificações separadas, documentadas em TESTES.md.

## Testar e restaurar

```bash
node --test --test-isolation=none coeli/lab/runner.test.mjs coeli/sdk/client.test.mjs
python3 coeli/contracts/test_contracts.py
node --test --test-isolation=none coeli/lab/integration.test.mjs
cd backend
go test -race ./pkg/coeli ./pkg/providers/provider ./pkg/server
go test ./...
COELI_TEST_DSN=postgres://usuario:senha@localhost:5432/laboratorio go test -p 1 -tags postgres ./pkg/coeli
```

O comando de contratos Python exige `jsonschema` no ambiente de desenvolvimento; não é dependência do produto. Não use o DSN de produção. A suíte PostgreSQL cria e remove um schema temporário próprio. Execute também typecheck, build e suites upstream descritos em `CLAUDE.md`.

Restauração de cenário não aplica patch na principal: inicie uma rodada em um diretório novo, e a fixture vulnerável original volta deterministicamente. O controle temporário é revertido e possui TTL. Pela interface, crie outra campanha com nova chave. Para remover evidências físicas após retenção, pare a instalação e use o procedimento administrativo da sua instalação; coleta automática ainda pendente. Não faça TRUNCATE ou migração Down em dados que precisam ser preservados. Reverter código não reverte o banco, e migração Down remove dados Coeli.

## Documentação

- [Arquitetura, diagrama e modelo de dados](docs/ARQUITETURA.md)
- [Componentes, licenças e provedores opcionais](docs/PROVEDORES-E-LICENCAS.md)
- [Inventário offline por versão](docs/componentes.json)
- [Guia do futuro conector Claude Code](docs/CLAUDE-CODE.md)
- [Contratos OpenAPI](contracts/openapi.json)
- [Capacidades versionadas](contracts/capabilities.json)
- [Testes e evidências desta sessão](docs/TESTES.md)
- [Matriz de limitações e pendências](docs/MATRIZ.md)
