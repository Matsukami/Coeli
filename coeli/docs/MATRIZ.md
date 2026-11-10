# Matriz de funcionalidades, verificação e pendências

**A fixture determinística foi validada em 10/11/2026 com Go 1.26.5, Node 24.17.0 e pnpm 11.8.0.** Builds, PostgreSQL descartável, HTTP, backend completo, workers, reinício real, Compose sem rede externa e navegação Chromium passaram. Regressões Go/race, PostgreSQL upstream, Vitest, lint e quatro smoke tests Playwright passaram. Veja comandos e evidências em TESTES.md. Não houve chamada a modelo real nem campanha ofensiva PentAGI; produção e integrações externas continuam fora desta validação.

| Área | Implementação disponível | Verificação nesta sessão / pendência |
| --- | --- | --- |
| Base PentAGI | Checkout identificado, mudanças modulares; controlador ofensivo original preservado no código | 77 pacotes Go com testes passaram com race detector; 2.539 testes Vitest e quatro smoke tests Playwright passaram. Não foi criado um segundo checkout para comparação de baseline |
| Interface | Rota React e menu, ações com backend e estados indisponíveis | Typecheck/build, lint e navegação Chromium contra backend real passaram; suíte visual de snapshots completa não executada |
| Persistência | Migração, JSONB por proprietário, transações, revisão e auditoria append-only | Migração Up/Down e suites PostgreSQL Coeli/upstream executadas em banco descartável; concorrência, recuperação de lease e isolamento por proprietário passaram |
| Orquestração | DAG linear por modo, scheduler, claims, lease, deadline, tentativas, pausa, cancelamento, emergência e orçamento de atividades | Go/race, sequência completa, pausa/retomada/cancelamento e reinício real passaram; HA, justiça de filas e throughput não avaliados |
| Auditoria | Cobertura/hash/candidato da fixture e reprodução HTTP para confirmação | Auditoria determinística executada; auditoria genérica de repositório e skill completa pendentes |
| Ataque PentAGI | Ponte consulta flow real do mesmo proprietário e registra modelo/provedor | Docker real verificado e regressões executadas; flow ofensivo com modelo real e criação automática pela Coeli pendentes |
| Ataque laboratório | Reprodução real de acesso indevido por HTTP local | Reprodução HTTP real passou no host, no executor do backend e no Compose sem rede externa |
| Defesa | Telemetria real da fixture, regra rápida, incidente correlacionado, contenção, healthcheck, acesso legítimo e reversão | Caminho HTTP completo passou, inclusive disponibilidade e reversão; investigação por IA pendente; ingestão externa não autoriza contenção arbitrária |
| Observação | `would_execute`, sem controle, verifica que acesso continua possível | HTTP e servidor completo comprovaram would_execute sem controle e com acesso indevido ainda possível |
| Manutenção | Repositório Git isolado, baseline, branch própria, diff, checks e commit candidato | Executado com achado fixture identificado; diff/branch e autorização corrigida verificados |
| Patch aplicado | Não aplica à principal nem produção | Deliberadamente não implementado; ausência de botão de aplicação |
| Avaliação e reteste | Verificador separado, critérios explícitos, acesso indevido, Alice/Bob e disponibilidade | Reteste HTTP e critérios executados; isolamento OS forte de autor/verificador e critérios confidenciais pendente |
| Release | Aprovação/reprovação/inconclusivo por critérios da fixture; homologação sintética | Demonstração HTTP staging passou; não aceita release de produto arbitrário |
| Métricas | Detecção, misses, duração, contenção, bloqueios indevidos, acessos legítimos, correção, zero chamadas/model cost do fluxo determinístico | Métricas reais da fixture geradas no Compose e nas evidências do backend, sem modelo |
| Comparação | Checa modo, versão e política; não atribui melhoria à IA | Comparação de modelos reais, controle experimental e intervalos estatísticos pendentes |
| Memória | Casos só após avaliação da fixture; commit/hash/ambiente/critérios; evidências expiram no acesso | Memória validada observada no backend real; revalidação geral e busca semântica não implementadas |
| Artefatos | JSON até 64 KiB fora do banco, SHA-256, acesso do proprietário, expiração de 30 dias | Downloads reais com SHA-256/nosniff e upload do worker passaram; pentest e coleta física automática pendentes |
| Workers | Registro, token separado, capacidades, lease, heartbeat, progresso, evidência, conclusão idempotente e revogação | Autenticação, heartbeat, upload, replay, recusa de adulteração, pausa/cancelamento e revogação HTTP passaram; recuperação de lease concorrente testada em PostgreSQL |
| Contratos por função | Desenvolvimento, banco, infraestrutura, auditoria, verificação e telemetria versionados | Propostas de banco/rede não se tornam execução privilegiada; importação de patch externo arbitrário pendente |
| Claude Code | Guia preciso e interface genérica independente | Conector/time real deliberadamente pendente; revalidar termos e mecanismo oficial |
| Provedores gerais | Reuso dos provedores PentAGI, vínculo função/ambiente, teste sintético, timeout/cota, sem fallback | Nenhuma chamada real; geração/investigação por modelo e orçamento monetário/token ainda pendentes |
| GPT Cyber | Interface fechada e fixture indisponível, sem chamada | Aprovação da instalação e superfície/contrato de terceiros não confirmados |
| Cloudflare | Contrato comum de candidatos, cobertura e independência como referência | Pin de versão, conversor completo e validadores oficiais pendentes; nenhum código da skill incorporado |
| Ambientes | laboratory/staging permitidos, produção recusada por código | Staging é mesma fixture; integração com homologação real pendente |
| Rede e sandbox | Operações locais fixas; Compose lab sem rede externa e limites OS | Compose construído/executado sem rede externa; backend não sandboxeia alvo arbitrário e por isso não o executa |
| Organizações | Usuário = organização pessoal; schema de instalação upstream e runtime por namespace | Isolamento entre proprietários testado no DB; equipe/RBAC compartilhado e pentest de isolamento pendentes |
| Licenças | NOTICE/EULA preservados; inventário offline por versão | 1.368 referências listadas; revisão transitiva/SBOM e digests pendentes; SDK bloqueia conclusão de distribuição padrão |

## Próximos bloqueios concretos

1. Manter ambiente com versões pinadas e espaço livre suficiente. O sandbox restrito bloqueia sockets; a execução real exigiu aprovação para sair dele. Nenhum requisito ou lockfile foi flexibilizado.
2. Ampliar a cobertura além da demonstração validada: suítes completas Playwright/local/visual, emergência durante efeitos e testes de carga/HA não foram executados.
3. Resolver a aplicabilidade da licença do SDK ao fork ou substituí-lo sem remover funções upstream; completar inventário/SBOM por digest antes de empacotar/distribuir.
4. Conectar criação/execução ofensiva real e verificações de escopo ao laboratório por um executor isolado, sem modificar a autonomia original do PentAGI.
5. Para evoluir além da fixture: sandbox OS do executor, RBAC organizacional, identidade forte de serviços, avaliador isolado, gestão de segredos, importação de patches/artefatos e telemetria/ações contínuas.
