# Componentes, licenças e integrações opcionais

Consulta: 09/11/2026. Este documento registra constatações e impedimentos técnicos, não autorização jurídica definitiva. A versão incorporada do PentAGI é `cffed9485aa1cca70762cd08a57ac62a80406258`. Nenhum commit da skill Cloudflare foi incorporado. A consulta web ao endpoint de commit não foi concluída; sua revisão permanece não fixada e não distribuída.

## Inventário

O arquivo `componentes.json` é gerado por leitura de `go.mod`, `pnpm-lock.yaml`, Dockerfiles e Compose, sem executar dependências. Inclui versões declaradas/pinadas e estado de verificação de licença. Licenças transitivas **não foram verificadas integralmente**, pois as dependências não estavam instaladas e a rede do executor falhou. Não tratar o inventário como SBOM jurídico completo. Nenhuma dependência de aplicação foi acrescentada aos manifests pela extensão Coeli. O teste Python de contratos usa jsonschema do ambiente de desenvolvimento; não entra no backend.

| Componente | Licença/condição observada | Tratamento |
| --- | --- | --- |
| PentAGI | MIT; autoria PentAGI Development Team; EULA adicional para uso e distribuição | LICENSE, NOTICE e EULA preservados. |
| VXControl Cloud SDK v1.0.1 | NOTICE declara AGPL-3.0 com exceção específica para o projeto oficial | Continua transitivamente no código upstream; **não há distribuição binária padrão Coeli autorizada por esta entrega**. Remover/substituir integrações ou obter condições aplicáveis antes de distribuir. Desabilitar uma variável não remove o SDK. |
| vxcontrol/langchaingo v0.1.14-update.8 e graphiti-go-client v0.9.0 | Licenças dos módulos específicos precisam de confirmação nos arquivos baixados | Listados no inventário com pendência; não inferir MIT pela licença principal. |
| Go, Gin, pgx, React, Vite e demais dependências | Verificação por versão pendente | Gerar relatórios upstream com `scripts/generate-licenses.sh` quando a toolchain e dependências estiverem disponíveis. |
| Imagens upstream PentAGI, pgvector, scraper, Kali e observabilidade | Imagens e ferramentas têm termos e componentes próprios; tags podem ser mutáveis | Inventário de referências disponível; digests e SBOMs não obtidos. Não redistribuir como se tudo fosse MIT. |
| Laboratório Node 24.17.0-slim e pacote Debian git | Node e pacotes Debian têm avisos próprios | Dockerfile de laboratório separado, sem SDK VXControl; imagem construída apenas localmente para validação em 10/11/2026, sem distribuição. Fixar digest e coletar `/usr/share/doc/*/copyright` e avisos Node na distribuição aprovada. |
| Cloudflare security-audit-skill | MIT, copyright Cloudflare, Inc. 2025–2026 | Referência de projeto; não copiada nem executada. Adaptador e fixture Coeli próprios. |

O texto de `licenses/README.md` do upstream afirma compatibilidade geral, mas isso não resolve a exceção específica expressa no NOTICE. O build upstream também permite continuar quando a coleta de licenças Go falha; um build concluído não é prova de inventário completo. O bloqueio de distribuição está explicitamente registrado aqui; não foi criado um novo pacote binário que esconda essas condições.

## Cloudflare

Fontes: [repositório](https://github.com/cloudflare/security-audit-skill), [licença](https://github.com/cloudflare/security-audit-skill/blob/main/LICENSE) e [contrato da skill](https://github.com/cloudflare/security-audit-skill/blob/main/skills/security-audit/SKILL.md). A skill distingue reconhecimento, cobertura, descoberta e verificação independente; exige sandbox OS com rede externa negada, ambiente reduzido, alvo somente leitura, scratch exclusivo e limites de recursos para executar código do alvo. Não instalar dependências durante a auditoria nem expor credenciais, sockets e artefatos de outros agentes.

O adaptador `ImportAuditCandidate` aceita `coeli.audit.v1` com referência de commit, cobertura, fronteira e evidências, sempre como hipótese. Não alega compatibilidade direta com todos os arquivos nativos/validadores da skill. Conversão completa, pin de commit e execução dos validadores oficiais estão pendentes. Sem sandbox adequado, o estado deve permanecer pendente/inconclusivo. A fixture é identificada e não representa resultado da Cloudflare nem sua plataforma interna completa.

## GPT Cyber

Fontes oficiais consultadas: [catálogo de modelos](https://developers.openai.com/api/docs/models), [GPT-6-Cyber](https://developers.openai.com/api/docs/models/gpt-6-cyber) e [Models and Trusted Access](https://learn.chatgpt.com/docs/cyber-safety).

A documentação consultada lista GPT-6-Cyber e exige aprovação Daybreak Red para a organização. A referência de Trusted Access vincula aprovação à identidade/organização/projeto, oferta/modelo e superfície de produto permitida. Isso não confirma autorização para esta instalação ou para oferecimento hospedado a terceiros. Não foi validada autenticação de uma organização aprovada nem o contrato específico dessa modalidade.

Portanto, `CyberAdapter` implementa somente a interface substituível e retorna indisponível. `cyber.fixture.json` declara explicitamente que nenhuma chamada ocorreu. Não há endpoint inventado, segredo Cyber, teste de conexão real ou acesso funcional a clientes. A API Coeli também recusa vínculos com nomes contendo Cyber; isso é uma defesa adicional de interface, não uma classificação de modelos por segurança. Um provedor com outro nome não deve ser usado para contornar aprovação do modelo configurado.

Antes de um adaptador real, confirmar separadamente: uso interno aprovado da própria organização; instalação do cliente com identidade/projeto próprios; serviço hospedado multi-organização e permissões contratuais específicas. Credenciais pessoais do desenvolvedor não devem atender clientes. Implementar isolamento/segredos/revogação, medição, testes de conexão e políticas de dados somente após confirmar a modalidade. O laboratório determinístico não depende desse acesso.

## Provedores gerais e dados

Os provedores PentAGI existentes são reutilizados; a Coeli não armazena cópias de suas chaves. O teste de conectividade é opcional, usa mensagem sintética fixa, cota de chamadas, timeout e `WithoutFailover`. Ele pode gerar cobrança na conta configurada pelo operador. Não há fallback automático Coeli. O código não transmite código do alvo, logs, segredos ou prompts livres. Configurações de modelo por função estão preparadas; uso de IA na geração geral e investigação continua pendente. Não há treinamento automático nem coleta de pesos, prompts privados ou raciocínio interno.

## Claude Code

Fonte oficial: [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance), consultada em 09/11/2026. As condições tratam a modalidade comercial, a preservação do binário e de seus métodos de autenticação e a autenticação/cobrança próprias do usuário. Restrições de OAuth e de intermediação exigem analisar a modalidade concreta; ter uma assinatura não autoriza automaticamente qualquer serviço de terceiros.

A Coeli não autentica em Claude, não solicita senha/cookie, não recebe tokens de sessão e não revende assinatura. Não há API de administração de equipes presumida. O conector real está deliberadamente pendente. O desenvolvedor que o implementar precisa verificar novamente documentação e termos aplicáveis à execução local do usuário e, se houver, à modalidade hospedada. O token de worker Coeli é exclusivo para a API Coeli, sem relação com credenciais Anthropic.
