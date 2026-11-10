"""Confere versões e serviços necessários; não instala ferramentas nem altera requisitos."""
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def command(arguments):
    try:
        result = subprocess.run(arguments, cwd=ROOT, capture_output=True, text=True, timeout=15)
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except (OSError, subprocess.TimeoutExpired) as error:
        return 1, "", str(error)


def main():
    go_mod = (ROOT / "backend/go.mod").read_text()
    minimum = re.search(r"^go\s+(\S+)", go_mod, re.MULTILINE).group(1)
    toolchain = re.search(r"^toolchain\s+go(\S+)", go_mod, re.MULTILINE)
    expected_go = toolchain.group(1) if toolchain else minimum
    expected_node = (ROOT / "frontend/.nvmrc").read_text().strip().removeprefix("v")
    manager = json.loads((ROOT / "frontend/package.json").read_text())["packageManager"]
    expected_pnpm = manager.split("@", 1)[1].split("+", 1)[0]
    report = {"acceptance": "blocked", "requirements_modified": False, "checks": {}}
    checks = report["checks"]
    for name, args, expected, pattern in [
        ("go", ["go", "version"], expected_go, r"\bgo(\d+\.\d+\.\d+)\b"),
        ("node", ["node", "--version"], expected_node, r"^v(\d+\.\d+\.\d+)$"),
        ("pnpm", ["pnpm", "--version"], expected_pnpm, r"^(\d+\.\d+\.\d+)$"),
    ]:
        code, out, err = command(args)
        match = re.search(pattern, out)
        actual = match.group(1) if match else None
        checks[name] = {"expected": expected, "actual": actual, "path": shutil.which(name), "ok": code == 0 and actual == expected, "error": err}
    alternatives = {
        "go": list((pathlib.Path.home() / ".local/opt").glob("go*/go/bin/go")),
        "node": list((pathlib.Path.home() / ".nvm/versions/node").glob("*/bin/node")),
        "pnpm": list((pathlib.Path.home() / ".nvm/versions/node").glob("*/bin/pnpm")),
    }
    for name, binaries in alternatives.items():
        checks[name]["other_installed"] = []
        for binary in sorted(binaries):
            code, out, err = command([str(binary), "version" if name == "go" else "--version"])
            checks[name]["other_installed"].append({"path": str(binary), "version_output": out, "exit_code": code})
    code, out, err = command(["docker", "version", "--format", "{{json .}}"])
    try:
        docker = json.loads(out)
    except json.JSONDecodeError:
        docker = {}
    checks["docker"] = {"client": docker.get("Client"), "server": docker.get("Server"), "ok": code == 0 and bool(docker.get("Server")), "error": err}
    code, out, err = command(["node", "--input-type=module", "-e", "import net from 'node:net';const s=net.createServer();s.once('error',e=>{console.error(e.code);process.exitCode=1});s.listen(0,'127.0.0.1',()=>s.close());"])
    checks["loopback"] = {"ok": code == 0, "error": err}
    checks["frontend_dependencies"] = {"ok": (ROOT / "frontend/node_modules").is_dir()}
    report["prerequisites_ok"] = all(item["ok"] for item in checks.values())
    if report["prerequisites_ok"]:
        report["acceptance"] = "pending-builds-database-http-and-integrated-demo"
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if report["prerequisites_ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
