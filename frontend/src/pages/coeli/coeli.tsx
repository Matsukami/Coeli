import { useCallback, useEffect, useState } from 'react';

import { AppHeader, AppHeaderContent, AppHeaderTitle } from '@/components/layouts/app/app-header';
import { Button } from '@/components/ui/button';
import axios from '@/lib/axios';
import { baseUrl } from '@/models/api';

type Evidence = {
    expires_at: string;
    id: string;
    run_id: string;
    sha256: string;
    status: string;
    version: string;
};
type Incident = {
    asset: string;
    detected_at: string;
    id: string;
    rule: string;
    run_id: string;
    status: string;
};
type RecordItem = { data: unknown; id: string; kind: string; run_id: string; status: string };
type Run = {
    activities: number;
    created_at: string;
    id: string;
    mode: string;
    pentagi_flow_id?: number;
    policy: { duration_seconds: number; environment: string; max_activities: number };
    status: string;
    version: string;
};
type State = {
    emergency: boolean;
    evidence: Record<string, Evidence>;
    incidents: Record<string, Incident>;
    models: Record<string, unknown>;
    records: Record<string, RecordItem>;
    runs: Record<string, Run>;
    tasks: Record<string, Task>;
    workers: Record<string, Worker>;
};
type Task = {
    attempts: number;
    id: string;
    progress?: string;
    result?: unknown;
    run_id: string;
    stage: string;
    status: string;
    worker_id?: string;
};
type Worker = {
    capabilities: string[];
    environment: string;
    id: string;
    last_seen: string;
    name: string;
    revoked: boolean;
};
const sections = [
    'Visão geral',
    'Campanhas',
    'Incidentes',
    'Achados e evidências',
    'Contenções',
    'Correções e retestes',
    'Ativos e ambientes',
    'Workers',
    'Provedores',
    'Políticas e orçamento',
    'Comparação',
    'Memória validada',
] as const;
type Section = (typeof sections)[number];
const labels: Record<string, string> = {
    approved: 'Aprovado nos critérios do laboratório',
    cancelled: 'Cancelado',
    confirmed: 'Confirmação',
    failed: 'Falhou',
    hypothesis: 'Hipótese',
    inconclusive: 'Inconclusivo',
    leased: 'Em execução com lease',
    paused: 'Pausado',
    prepared: 'Patch preparado',
    queued: 'Na fila',
    rejected: 'Reprovado',
    running: 'Em execução',
    succeeded: 'Concluído',
    validated: 'Validado para a versão registrada',
    verified_and_reversed: 'Executou, verificou e reverteu',
    would_execute: 'Teria executado',
};
const label = (status: string) => labels[status] || status;
const short = (id: string) => id.slice(0, 10);

export default function Coeli() {
    const [section, setSection] = useState<Section>('Visão geral');
    const [state, setState] = useState<null | State>(null);
    const [connections, setConnections] = useState<Record<string, unknown>>({});
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [mode, setMode] = useState('purple');
    const [environment, setEnvironment] = useState('laboratory');
    const [execution, setExecution] = useState('internal');
    const [flow, setFlow] = useState('');
    const [selected, setSelected] = useState('');
    const [workerName, setWorkerName] = useState('Worker de demonstração');
    const [capability, setCapability] = useState('audit.v1');
    const [credential, setCredential] = useState<unknown>(null);
    const [provider, setProvider] = useState('');
    const [role, setRole] = useState('audit');
    const [testConnection, setTestConnection] = useState<unknown>(null);
    const [comparison, setComparison] = useState<unknown>(null);
    const [comparisonA, setComparisonA] = useState('');
    const [comparisonB, setComparisonB] = useState('');
    const refresh = useCallback(async () => {
        const connection = await axios.get<unknown, Record<string, unknown>>('/coeli/connections');
        setConnections(connection);

        if (connection.enabled) {
            setState(await axios.get<unknown, State>('/coeli/state'));
        }
    }, []);
    useEffect(() => {
        let alive = true;

        const update = () => {
            if (alive) {
                void refresh().catch(() => {
                    if (alive) {
                        setError(
                            'Não foi possível consultar a Coeli. Verifique autenticação e configuração do servidor.',
                        );
                    }
                });
            }
        };

        update();
        const timer = setInterval(update, 3000);

        return () => {
            alive = false;
            clearInterval(timer);
        };
    }, [refresh]);

    async function action(fn: () => Promise<unknown>) {
        setBusy(true);
        setError('');

        try {
            await fn();
            await refresh();
        } catch {
            setError('Operação recusada ou indisponível. Verifique escopo, lease, orçamento e configuração.');
        } finally {
            setBusy(false);
        }
    }

    const runs = Object.values(state?.runs || {}).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const tasks = Object.values(state?.tasks || {});
    const records = Object.values(state?.records || {});
    const evidence = Object.values(state?.evidence || {});
    const incidents = Object.values(state?.incidents || {});
    const workers = Object.values(state?.workers || {});
    const inputClass = 'rounded-md border bg-background px-3 py-2 text-sm';
    const disabled = busy || !state;
    const recordList = (kinds: string[]) => (
        <div className="space-y-3">
            {records
                .filter((item) => kinds.includes(item.kind))
                .map((item) => (
                    <article
                        className="rounded-lg border p-4"
                        key={item.id}
                    >
                        <p className="font-medium">
                            {item.kind} · {label(item.status)}
                        </p>
                        <p className="text-muted-foreground text-xs">Campanha {short(item.run_id)}</p>
                        <details className="mt-2">
                            <summary className="cursor-pointer text-sm">Evidências e critérios registrados</summary>
                            <pre className="mt-2 max-h-96 overflow-auto text-xs whitespace-pre-wrap">
                                {JSON.stringify(item.data, null, 2)}
                            </pre>
                        </details>
                    </article>
                ))}
            {!records.some((item) => kinds.includes(item.kind)) && (
                <p className="text-muted-foreground">Nenhum resultado registrado nesta seção.</p>
            )}
        </div>
    );

    return (
        <>
            <AppHeader>
                <AppHeaderContent>
                    <AppHeaderTitle>Coeli · Purple Team</AppHeaderTitle>
                </AppHeaderContent>
            </AppHeader>
            <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-semibold tracking-widest text-violet-500">COELI / LABORATÓRIO</p>
                        <h1 className="mt-2 text-3xl font-semibold">Um exercício. Evidências de cada etapa.</h1>
                        <p className="text-muted-foreground mt-2 max-w-2xl">
                            Auditoria, ataque, defesa e correção coordenados. Dados sintéticos; validação limitada aos
                            critérios e à versão observada. Produção desabilitada.
                        </p>
                    </div>
                    <Button
                        disabled={disabled}
                        onClick={() =>
                            void action(() => axios.post('/coeli/emergency', { enabled: !state?.emergency }))
                        }
                        variant="destructive"
                    >
                        {state?.emergency ? 'Liberar novas campanhas' : 'Parada de emergência'}
                    </Button>
                </div>
                {error && (
                    <p
                        className="rounded border border-red-500 p-3"
                        role="alert"
                    >
                        {error}
                    </p>
                )}
                {!connections.enabled && (
                    <p
                        className="rounded border border-amber-500 p-4"
                        role="status"
                    >
                        Coeli indisponível. Configure COELI_ENABLED, COELI_ROOT e COELI_RUNTIME no servidor. As
                        integrações opcionais não estão conectadas.
                    </p>
                )}
                <nav
                    aria-label="Seções da Coeli"
                    className="flex flex-wrap gap-2"
                >
                    {sections.map((item) => (
                        <Button
                            key={item}
                            onClick={() => setSection(item)}
                            size="sm"
                            variant={section === item ? 'default' : 'outline'}
                        >
                            {item}
                        </Button>
                    ))}
                </nav>
                {(section === 'Visão geral' || section === 'Campanhas') && (
                    <>
                        <div className="grid gap-4 sm:grid-cols-4">
                            {[
                                ['Campanhas', runs.length],
                                ['Incidentes', incidents.length],
                                ['Evidências', evidence.length],
                                [
                                    'Casos validados',
                                    records.filter((r) => r.kind === 'knowledge' && r.status === 'validated').length,
                                ],
                            ].map(([title, value]) => (
                                <div
                                    className="rounded-lg border p-5"
                                    key={title}
                                >
                                    <p className="text-muted-foreground text-sm">{title}</p>
                                    <p className="mt-2 text-3xl font-semibold">{value}</p>
                                </div>
                            ))}
                        </div>
                        <section className="space-y-4 rounded-lg border p-5">
                            <h2 className="text-lg font-semibold">Iniciar exercício autorizado do laboratório</h2>
                            <p className="text-muted-foreground text-sm">
                                Escopo fixo: synthetic-records, rede local, até 30 atividades e 10 minutos. Auditoria
                                isolada registra candidato; Purple Team percorre a validação completa. Workers externos
                                devolvem candidatos.
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <label className="grid gap-1 text-sm">
                                    Modo
                                    <select
                                        className={inputClass}
                                        onChange={(e) => setMode(e.target.value)}
                                        value={mode}
                                    >
                                        {[
                                            ['purple', 'Purple Team'],
                                            ['audit', 'Auditoria'],
                                            ['attack', 'Ataque'],
                                            ['defense', 'Defesa'],
                                            ['observe', 'Observação'],
                                            ['maintenance', 'Manutenção'],
                                            ['release', 'Validação de release'],
                                        ].map(([value, text]) => (
                                            <option
                                                key={value}
                                                value={value}
                                            >
                                                {text}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="grid gap-1 text-sm">
                                    Ambiente
                                    <select
                                        className={inputClass}
                                        onChange={(e) => setEnvironment(e.target.value)}
                                        value={environment}
                                    >
                                        <option value="laboratory">Laboratório</option>
                                        <option value="staging">Homologação sintética</option>
                                    </select>
                                </label>
                                <label className="grid gap-1 text-sm">
                                    Executor
                                    <select
                                        className={inputClass}
                                        onChange={(e) => setExecution(e.target.value)}
                                        value={execution}
                                    >
                                        <option value="internal">Interno determinístico</option>
                                        <option value="external">Worker externo</option>
                                    </select>
                                </label>
                                <label className="grid gap-1 text-sm">
                                    Flow PentAGI existente (modo Ataque)
                                    <input
                                        className={inputClass}
                                        inputMode="numeric"
                                        onChange={(e) => setFlow(e.target.value)}
                                        placeholder="Opcional: ID do seu flow"
                                        value={flow}
                                    />
                                </label>
                                <Button
                                    className="self-end"
                                    disabled={disabled}
                                    onClick={() =>
                                        void action(() =>
                                            axios.post('/coeli/runs', {
                                                deduplication_key: crypto.randomUUID(),
                                                execution,
                                                mode,
                                                pentagi_flow_id: flow ? Number(flow) : 0,
                                                policy: {
                                                    asset: 'synthetic-records',
                                                    duration_seconds: 600,
                                                    environment,
                                                    max_activities: 30,
                                                    max_attempts: 2,
                                                    max_concurrency: 1,
                                                    network: 'loopback-only',
                                                    production_enabled: false,
                                                },
                                            }),
                                        )
                                    }
                                >
                                    Criar campanha
                                </Button>
                            </div>
                        </section>
                        <div className="space-y-3">
                            {runs.map((run) => (
                                <article
                                    className="rounded-lg border p-4"
                                    key={run.id}
                                >
                                    <div className="flex flex-wrap justify-between gap-3">
                                        <button
                                            className="text-left"
                                            onClick={() => setSelected(selected === run.id ? '' : run.id)}
                                        >
                                            <strong>
                                                {run.mode} · {label(run.status)}
                                            </strong>
                                            <p className="text-muted-foreground text-xs">
                                                {short(run.id)} · {run.policy.environment} · {run.version} ·{' '}
                                                {new Date(run.created_at).toLocaleString('pt-BR')}
                                            </p>
                                        </button>
                                        <div className="flex gap-2">
                                            {!['cancelled', 'failed', 'inconclusive', 'succeeded'].includes(
                                                run.status,
                                            ) && (
                                                <>
                                                    <Button
                                                        disabled={disabled}
                                                        onClick={() =>
                                                            void action(() =>
                                                                axios.post(`/coeli/runs/${run.id}/control`, {
                                                                    action:
                                                                        run.status === 'paused' ? 'resume' : 'pause',
                                                                }),
                                                            )
                                                        }
                                                        size="sm"
                                                        variant="outline"
                                                    >
                                                        {run.status === 'paused' ? 'Retomar' : 'Pausar'}
                                                    </Button>
                                                    <Button
                                                        disabled={disabled}
                                                        onClick={() =>
                                                            void action(() =>
                                                                axios.post(`/coeli/runs/${run.id}/control`, {
                                                                    action: 'cancel',
                                                                }),
                                                            )
                                                        }
                                                        size="sm"
                                                        variant="outline"
                                                    >
                                                        Cancelar
                                                    </Button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {selected === run.id && (
                                        <ol className="mt-4 space-y-2">
                                            {tasks
                                                .filter((t) => t.run_id === run.id)
                                                .map((t) => (
                                                    <li
                                                        className="bg-muted rounded p-3 text-sm"
                                                        key={t.id}
                                                    >
                                                        {t.stage} · {label(t.status)} · tentativa {t.attempts} ·{' '}
                                                        {t.worker_id || 'aguardando'}
                                                        <details>
                                                            <summary>Resultado da atividade</summary>
                                                            <pre className="max-h-80 overflow-auto text-xs whitespace-pre-wrap">
                                                                {JSON.stringify(t.result || {}, null, 2)}
                                                            </pre>
                                                        </details>
                                                    </li>
                                                ))}
                                        </ol>
                                    )}
                                </article>
                            ))}
                        </div>
                    </>
                )}
                {section === 'Incidentes' && (
                    <div className="space-y-3">
                        {incidents.length === 0 && <p>Nenhum incidente recebido.</p>}
                        {incidents.map((item) => (
                            <article
                                className="rounded border p-4"
                                key={item.id}
                            >
                                <strong>
                                    {item.asset} · {label(item.status)}
                                </strong>
                                <p>
                                    {item.rule} · {new Date(item.detected_at).toLocaleString('pt-BR')}
                                </p>
                                <p className="text-sm">
                                    Campanha {short(item.run_id)}; detecção por regra de telemetria, independente de
                                    modelo.
                                </p>
                            </article>
                        ))}
                    </div>
                )}
                {section === 'Achados e evidências' && (
                    <div className="space-y-5">
                        {recordList(['finding'])}
                        {evidence.map((item) => (
                            <article
                                className="rounded border p-4 text-sm"
                                key={item.id}
                            >
                                <p>
                                    {short(item.id)} ·{' '}
                                    {item.status === 'stale' ? 'Evidência expirada' : label(item.status)} ·{' '}
                                    {item.version}
                                </p>
                                <code className="text-xs break-all">SHA-256 {item.sha256}</code>
                                <p>
                                    <a
                                        className="underline"
                                        href={`${baseUrl}/coeli/evidence/${item.id}`}
                                    >
                                        Baixar evidência autenticada
                                    </a>
                                </p>
                            </article>
                        ))}
                    </div>
                )}
                {section === 'Contenções' && (
                    <div className="space-y-4">
                        <p>
                            O controle temporário bloqueia acesso entre titulares, verifica disponibilidade e acesso
                            legítimo, e reverte. Isso não elimina a causa; a correção exige patch e reteste.
                        </p>
                        {recordList(['containment'])}
                    </div>
                )}
                {section === 'Correções e retestes' && recordList(['patch', 'retest', 'release'])}
                {section === 'Memória validada' && (
                    <div className="space-y-4">
                        <p>
                            Casos valem somente para commit, artefato, ambiente e critérios registrados. Mudanças exigem
                            nova validação. Resultados de workers são candidatos.
                        </p>
                        {recordList(['knowledge'])}
                    </div>
                )}
                {section === 'Ativos e ambientes' && (
                    <div className="rounded-lg border p-5">
                        <h2 className="font-semibold">synthetic-records / lab-idor-v1</h2>
                        <p>
                            Aplicação HTTP Node, registros sintéticos de Alice e Bob. Sem dependências externas e sem
                            socket Docker. Laboratório e homologação usam a mesma fixture; homologação real ainda
                            precisa ser conectada.
                        </p>
                        <p className="mt-3 text-amber-600">
                            Produção desabilitada. Não há avaliação de ativos empresariais nesta versão.
                        </p>
                    </div>
                )}
                {section === 'Workers' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                            <label className="grid gap-1 text-sm">
                                Nome
                                <input
                                    className={inputClass}
                                    onChange={(e) => setWorkerName(e.target.value)}
                                    value={workerName}
                                />
                            </label>
                            <label className="grid gap-1 text-sm">
                                Capacidade
                                <select
                                    className={inputClass}
                                    onChange={(e) => setCapability(e.target.value)}
                                    value={capability}
                                >
                                    {[
                                        'audit.v1',
                                        'development.v1',
                                        'database.v1',
                                        'infrastructure.v1',
                                        'verification.v1',
                                        'telemetry.v1',
                                    ].map((c) => (
                                        <option key={c}>{c}</option>
                                    ))}
                                </select>
                            </label>
                            <Button
                                className="self-end"
                                disabled={disabled}
                                onClick={() =>
                                    void action(async () => {
                                        setCredential(
                                            await axios.post('/coeli/workers', {
                                                capabilities: [capability],
                                                environment,
                                                name: workerName,
                                            }),
                                        );
                                    })
                                }
                            >
                                Registrar worker
                            </Button>
                        </div>
                        {credential !== null && (
                            <div className="rounded border p-4">
                                <p>
                                    Credencial Coeli exibida apenas nesta resposta. Copie para o ambiente do worker; ela
                                    é independente do Claude Code.
                                </p>
                                <pre className="overflow-auto text-xs">{JSON.stringify(credential, null, 2)}</pre>
                                <Button
                                    onClick={() => setCredential(null)}
                                    size="sm"
                                    variant="outline"
                                >
                                    Ocultar credencial
                                </Button>
                            </div>
                        )}
                        {workers.map((w) => (
                            <div
                                className="flex flex-wrap justify-between gap-2 rounded border p-4"
                                key={w.id}
                            >
                                <p>
                                    {w.name} · {w.environment} · {w.capabilities.join(', ')} ·{' '}
                                    {w.revoked ? 'Revogado' : 'Registrado'}
                                </p>
                                <Button
                                    disabled={disabled || w.revoked}
                                    onClick={() => void action(() => axios.post(`/coeli/workers/${w.id}/revoke`))}
                                    size="sm"
                                    variant="outline"
                                >
                                    Revogar
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
                {section === 'Provedores' && (
                    <div className="space-y-4">
                        <pre className="overflow-auto rounded border p-4 text-sm whitespace-pre-wrap">
                            {JSON.stringify(connections, null, 2)}
                        </pre>
                        <div className="flex flex-wrap gap-3">
                            <label className="grid gap-1 text-sm">
                                Provedor já configurado no PentAGI
                                <input
                                    className={inputClass}
                                    onChange={(e) => setProvider(e.target.value)}
                                    placeholder="Nome do provedor"
                                    value={provider}
                                />
                            </label>
                            <label className="grid gap-1 text-sm">
                                Função
                                <select
                                    className={inputClass}
                                    onChange={(e) => setRole(e.target.value)}
                                    value={role}
                                >
                                    {['audit', 'defense', 'maintenance', 'verification'].map((r) => (
                                        <option key={r}>{r}</option>
                                    ))}
                                </select>
                            </label>
                            <Button
                                className="self-end"
                                disabled={disabled || !provider}
                                onClick={() =>
                                    void action(() =>
                                        axios.post('/coeli/models', {
                                            calls: 0,
                                            data_policy: 'synthetic-only',
                                            environment,
                                            fallback: 'none',
                                            max_calls: 3,
                                            provider,
                                            retries: 0,
                                            role,
                                            timeout_seconds: 20,
                                        }),
                                    )
                                }
                            >
                                Vincular configuração
                            </Button>
                            <Button
                                className="self-end"
                                disabled={disabled}
                                onClick={() =>
                                    void action(async () => {
                                        setTestConnection(
                                            await axios.post('/coeli/models/test', { environment, role }),
                                        );
                                    })
                                }
                                variant="outline"
                            >
                                Testar com mensagem sintética
                            </Button>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap">
                            {JSON.stringify(testConnection || state?.models || {}, null, 2)}
                        </pre>
                        <p className="text-sm">
                            O teste pode consumir a cota do provedor. A geração geral de patches e a investigação por
                            modelo ainda não integram o workflow determinístico.
                        </p>
                    </div>
                )}
                {section === 'Políticas e orçamento' && (
                    <div className="space-y-3">
                        <p>
                            Política Coeli separada dos flows originais. Sem ampliação de escopo por agentes. Sem
                            fallback de dados. Contenção limitada à fixture e revertida na própria atividade.
                        </p>
                        {runs.map((r) => (
                            <pre
                                className="overflow-auto rounded border p-4 text-xs"
                                key={r.id}
                            >
                                {short(r.id)} · {r.activities} atividades consumidas{'\n'}
                                {JSON.stringify(r.policy, null, 2)}
                            </pre>
                        ))}
                    </div>
                )}
                {section === 'Comparação' && (
                    <div className="space-y-3">
                        <p>
                            Comparação determinística. Não atribui melhoria à IA. Mudanças de ambiente, modo ou versão
                            impedem comparação válida.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            {[true, false].map((first) => (
                                <label
                                    className="grid gap-1 text-sm"
                                    key={String(first)}
                                >
                                    Rodada {first ? 'A' : 'B'}
                                    <select
                                        className={inputClass}
                                        onChange={(e) =>
                                            first ? setComparisonA(e.target.value) : setComparisonB(e.target.value)
                                        }
                                        value={first ? comparisonA : comparisonB}
                                    >
                                        <option value="">Selecione</option>
                                        {runs.map((r) => (
                                            <option
                                                key={r.id}
                                                value={r.id}
                                            >
                                                {short(r.id)} · {r.mode}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            ))}
                            <Button
                                disabled={disabled || !comparisonA || !comparisonB}
                                onClick={() =>
                                    void action(async () => {
                                        setComparison(
                                            await axios.get(`/coeli/compare?a=${comparisonA}&b=${comparisonB}`),
                                        );
                                    })
                                }
                            >
                                Comparar
                            </Button>
                        </div>
                        <pre className="overflow-auto text-xs whitespace-pre-wrap">
                            {JSON.stringify(comparison || {}, null, 2)}
                        </pre>
                    </div>
                )}
            </main>
        </>
    );
}
