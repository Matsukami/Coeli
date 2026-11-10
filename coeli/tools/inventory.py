"""Inventário offline: lista componentes sem atribuir licenças não verificadas."""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
rows = []
for line in (ROOT / 'backend/go.mod').read_text().splitlines():
    match = re.match(r'\s*([^\s()]+)\s+(v\S+)(?:\s+//\s+(indirect))?\s*$', line)
    if match:
        name, version, indirect = match.groups()
        rows.append({'kind': 'go-module', 'name': name, 'version': version, 'indirect': bool(indirect), 'license': 'needs-verification', 'source': 'backend/go.mod'})
lock = (ROOT / 'frontend/pnpm-lock.yaml').read_text()
packages = set()
for line in lock.splitlines():
    match = re.match(r"^  '?([^\s].*?)'?:\s*$", line)
    if match:
        key = match.group(1).split('(')[0].strip("'")
        if '@' in key[1:]:
            name, version = key.rsplit('@', 1)
            if re.match(r'^\d', version):
                packages.add((name, version))
for name, version in sorted(packages):
    rows.append({'kind': 'npm-package', 'name': name, 'version': version, 'license': 'needs-verification', 'source': 'frontend/pnpm-lock.yaml'})
for file in [*ROOT.glob('docker-compose*.yml'), ROOT / 'Dockerfile', ROOT / 'coeli/lab/Dockerfile']:
    for line in file.read_text().splitlines():
        match = re.match(r'\s*(?:image:\s*|FROM\s+)(\S+)', line)
        if match:
            rows.append({'kind': 'container-image', 'reference': match.group(1), 'digest': 'not-resolved', 'license': 'needs-image-SBOM-and-tool-licenses', 'source': str(file.relative_to(ROOT))})
rows.append({'kind': 'tool', 'name': 'git', 'version': 'distribution-dependent', 'license': 'GPL-2.0; verify Debian package notices in built lab image', 'source': 'coeli/lab/Dockerfile'})
rows.append({'kind': 'optional-reference', 'name': 'cloudflare/security-audit-skill', 'version': 'not-pinned-not-incorporated', 'license': 'MIT per official LICENSE consulted 2026-11-09', 'source': 'coeli/docs/PROVEDORES-E-LICENCAS.md'})
for row in rows:
    if row.get('name') == 'github.com/vxcontrol/cloud':
        row['license'] = 'AGPL-3.0 with official-project exception per NOTICE; applicability to fork unconfirmed'
        row['distribution'] = 'blocked-pending-resolution'
result = {'upstream_commit': 'cffed9485aa1cca70762cd08a57ac62a80406258', 'license_review_complete': False, 'new_application_dependencies': [], 'inputs': {file: hashlib.sha256((ROOT / file).read_bytes()).hexdigest() for file in ['backend/go.mod', 'backend/go.sum', 'frontend/package.json', 'frontend/pnpm-lock.yaml']}, 'components': rows}
(ROOT / 'coeli/docs/componentes.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(f'{len(rows)} referências inventariadas; licenças transitivas não verificadas.')
