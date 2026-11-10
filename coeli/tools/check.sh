#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ "${1:-offline}" == integrated ]]; then
    python3 coeli/tools/check-environment.py
fi
node --check coeli/lab/application.mjs
node --check coeli/lab/evaluator.mjs
node --check coeli/lab/runner.mjs
node --check coeli/sdk/client.mjs
node --check coeli/sdk/demo-worker.mjs
node --test --test-isolation=none coeli/lab/runner.test.mjs coeli/sdk/client.test.mjs
python3 coeli/contracts/test_contracts.py
case "${1:-offline}" in
  offline) ;;
  integrated)
    node --test --test-isolation=none coeli/lab/integration.test.mjs
    (cd backend && go build -mod=readonly -o /tmp/pentagi-coeli ./cmd/pentagi)
    (cd backend && go test -race ./pkg/coeli ./pkg/providers/provider ./pkg/server)
    : "${COELI_TEST_DSN:?Defina COELI_TEST_DSN para banco descartável; testes offline não aprovam o laboratório}"
    (cd backend && go test -p 1 -tags postgres ./pkg/coeli)
    (cd frontend && corepack pnpm run typescript && corepack pnpm run build)
    echo "Checks de componentes concluídos. A aceitação ainda exige demonstração com backend, banco, workers e evidências reais."
    ;;
  *) echo 'Uso: bash coeli/tools/check.sh [offline|integrated]' >&2; exit 2 ;;
esac
