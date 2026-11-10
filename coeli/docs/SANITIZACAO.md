# Sanitização histórica para publicação da Coeli

Data: 10/11/2026. Esta cópia foi preparada separadamente do checkout original, por autorização específica para reescrever somente a cópia. Nenhum push, bypass, reset do original ou alteração de repositório remoto foi realizado. A branch preparada é `publication/coeli-sanitized`. O destino de entrega é `/home/matsukami/IA defesa/Coeli-sanitized-20261110`.

## Preservação e escopo

O original estava limpo, com os commits Coeli `86f1f425387a9d8405f55db22033f316fe90a68b` e `b73c5103ade030af872c66a5805e6b780a5cd415`. Foram registrados hashes de conteúdo e modos dos arquivos rastreados e dos arquivos em `.git`, além de refs, HEAD e status. A comparação posterior confirmou que nada disso foi alterado. Arquivos ignorados do original não foram usados para instalar, gerar ou testar esta cópia.

A cópia foi criada com `git clone --mirror --no-local --no-hardlinks`. Não há alternates, commondir ou inodes de objetos compartilhados com o original. Foram mantidas e sanitizadas todas as refs copiadas, incluindo as referências locais de acompanhamento upstream e dez tags. Não há remotos configurados na cópia; as refs upstream aqui são referências históricas sanitizadas, não uma conexão para sincronização automática.

O git-filter-repo 2.47.0 foi usado com preservação de mensagens e encoding, sem podar commits vazios ou merges degenerados. Os 956 commits históricos, incluindo 75 merges, preservam mensagens, autores, committers, datas e ordem dos pais. As relações entre commits são verificadas pelo mapa. Um commit adicional registra esta documentação e as evidências da sanitização.

**As assinaturas criptográficas antigas não sobrevivem à reescrita.** Os 938 commits originalmente assinados ficam sem a assinatura original, pois ela não autentica os novos hashes. Autoria preservada não significa assinatura válida preservada. As dez tags mantêm nomes e alvos correspondentes pelo mapa; oito são anotadas, com mensagens e metadados preservados. Não se deve apresentar os novos hashes como os hashes oficiais upstream.

## Classificação e substituições

O par OAuth Google estava em onze versões de `backend/pkg/config/config_test.go`, desde o commit raiz upstream disponível, `b90ea4711eb236c47b8a3fe926a2b78c89092502`. Não foi introduzido pelos commits Coeli. Não havia prova local de que fosse fictício ou estivesse revogado; foi tratado como potencialmente real. Nenhuma credencial foi autenticada.

A revisão também considerou chaves Google API/Gemini e OpenAI com formato de provedor, outros literais opacos de provedores, OAuth GitHub, federação, Langfuse e licença. Sem procedência fictícia demonstrável, foram substituídos. Um identificador AWS tinha marcador explícito de teste, mas mantinha formato de provedor; também foi substituído. Tokens JWT usados em validação de formato foram trocados por fixtures lexicais de três segmentos, sem claims de identidade nem assinatura criptográfica válida.

Foram substituídos quinze literais distintos, em 26 blobs históricos. Só oito arquivos de teste mudaram no histórico reescrito: config, hardening, controller do instalador, routing de provedores, fixtures/users/api_tokens dos modelos e tools. Os demais caminhos, modos e tipos de arquivo são idênticos em cada par de commits. Isso inclui código de produção, licenças, avisos e todos os 76 arquivos Coeli que já existiam no checkout original. Nenhum arquivo foi eliminado.

As fixtures novas são explicitamente sintéticas e não usam os formatos Google/AWS/OpenAI removidos. As substituições foram aplicadas também às representações escapadas e às expectativas compartilhadas. Exemplos truncados, placeholders e casos de trim que não têm formato de credencial válida foram mantidos. Uma primeira tentativa gerou colisão em uma expectativa de regex; essa cópia foi descartada e reconstruída antes da validação final.

Se os literais originais forem reais, sua revogação/rotação depende do responsável pelo serviço. A sanitização não revoga credenciais nem remove cópias já existentes fora deste repositório. O original foi preservado conforme solicitado e deve continuar sob acesso restrito.

## Varreduras e resultados

A inspeção literal examinou os 14.033 objetos físicos da cópia reescrita, incluindo 6.612 blobs, 956 commits e oito objetos de tag. Não ficaram ocorrências dos quinze literais removidos nem correspondências com os padrões adicionais de Google OAuth, Google API, AWS access key, OpenAI project key, GitHub token e cabeçalhos de chave privada. A verificação física também cobre objetos que poderiam ter ficado fora das refs; o fsck não apontou objetos inalcançáveis após a limpeza do filtro.

Gitleaks 8.24.3 foi executado sobre todas as refs e o histórico completo, com redaction de 100%, decodificação até profundidade dois, sem `.gitleaksignore` do repositório e sem respeitar comentários de liberação. Não foram adicionadas supressões, baselines ou bypasses. O resultado foi **exit code 1, cinco achados benignos classificados**, não uma execução sem achados:

- Três referências a placeholders explícitos de Bearer no README.
- Um nonce `Sec-WebSocket-Key` de uma fixture de protocolo, que não é segredo de autenticação.
- Um literal em teste negativo de senha, rejeitado pela política de composição da aplicação.

Não ficaram achados sem classificação nesse scanner. As mensagens dos 956 commits e das oito tags anotadas também foram examinadas separadamente pelo Gitleaks via stdin: exit code 0. Nenhuma mensagem precisou ser alterada. Uma nova varredura da branch final inclui o commit de documentação desta sanitização; o relatório final de publicação é guardado fora da árvore Git para não precisar incluir recursivamente o hash de si próprio.

Esses resultados não comprovam ausência de todos os tipos de segredo, nem substituem a decisão do GitHub Push Protection. Há limites de padrões, allowlists internas padrão do scanner e decodificação. A decisão remota continua desconhecida porque nenhum push foi feito. A revisão não se restringiu aos cinco blobs do erro GH013, pois o GitHub informou varredura incompleta.

## Testes e evidências anteriores

Com Go 1.26.5 e race detector, passaram:

```text
go test -p 1 -race ./pkg/config ./cmd/installer/hardening ./cmd/installer/wizard/controller ./pkg/providers ./pkg/server/models ./pkg/tools
go test -p 1 -race ./pkg/coeli ./pkg/providers/provider ./pkg/server
```

O clone novo precisou de `go generate ./cmd/installer/files/` antes dos testes do instalador. Os arquivos gerados são ignorados e não fazem parte da publicação. Os testes atuais de trim, deduplicação e correspondência literal de GetSecretPatterns passaram. A remoção deliberada de `regexp.QuoteMeta`, por overlay externo sem editar fontes, fez os testes de escape falharem como esperado.

As onze versões históricas distintas do pacote config também passaram nos testes GetSecretPatterns, usando os fontes correspondentes de cada versão com a toolchain e dependências atuais. Isso não é uma reconstrução completa de cada release antigo. Uma tentativa inicial de overlay misturou config antigo com tenant.go atual e não compilou; a validação final extraiu o conjunto histórico correto de fontes para cada versão.

Com Node 24.17.0, passaram sete testes Node de laboratório/SDK, incluindo os dois casos HTTP reais de Purple Team e observação, além de seis testes de contratos Python. Não foram repetidos nesta sanitização os builds frontend, migrações PostgreSQL, demonstração completa do binário ou Compose; suas evidências anteriores permanecem preservadas e identificadas como anteriores.

O diretório `coeli/evidence/validation-20261110` foi mantido byte a byte. Seus hashes de commit são os **antigos**, não os hashes sanitizados. A correspondência dos commits Coeli é:

| Commit antigo | Commit sanitizado |
| --- | --- |
| `86f1f425387a9d8405f55db22033f316fe90a68b` | `b6b05e1966e7dff3c890fab4a86a882018e06f5d` |
| `b73c5103ade030af872c66a5805e6b780a5cd415` | `20bcbdd6a421882ee45f73d31ad56c9d4df93b42` |

O [mapa completo de commits](../evidence/sanitization-20261110/commit-map.tsv), o [mapa de refs e tags](../evidence/sanitization-20261110/refs-map.tsv), a [classificação sem valores](../evidence/sanitization-20261110/classification.redacted.json) e os relatórios de testes/varredura estão em `coeli/evidence/sanitization-20261110`. O manifest registra seus hashes. Relatórios brutos intermediários, cópias descartadas, snapshot do original, ferramentas, overlays e tabelas de substituição não fazem parte da árvore publicável. Não foi gravado arquivo de substituição com os valores originais.

Antes de qualquer publicação futura, revisar o estado remoto e o escopo de branches/tags. Não mesclar novamente a ancestralidade original sem repetir a sanitização: isso reintroduziria os objetos removidos. Esta preparação não autoriza push, force push ou bypass e não resolve os impedimentos de distribuição registrados em PROVEDORES-E-LICENCAS.md.
