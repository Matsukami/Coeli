"""Demonstrate Coeli through a running PentAGI server with synthetic data only."""
import hashlib
import http.cookiejar
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request


def main():
    base = os.environ["COELI_DEMO_URL"].rstrip("/")
    parsed = urllib.parse.urlparse(base)
    if parsed.username or parsed.password or parsed.scheme not in ("http", "https"):
        raise ValueError("HTTP(S) URL without embedded credentials required")
    if parsed.scheme == "http" and parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
        raise ValueError("TLS required outside loopback")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    report = {"acceptance": "pending", "scenarios": [], "credentials_logged": False}

    def request(path, data=None, expected=200, headers=None, authenticated=True):
        encoded = None if data is None else json.dumps(data, separators=(",", ":")).encode()
        req = urllib.request.Request(base + path, data=encoded, headers={"Content-Type": "application/json", **(headers or {})})
        transport = opener if authenticated else urllib.request.build_opener()
        try:
            response = transport.open(req, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            content = response.read()
            if response.status != expected:
                raise RuntimeError(f"{path}: HTTP {response.status}, expected {expected}")
            return json.loads(content) if content else None

    def policy(environment):
        return {"environment": environment, "asset": "synthetic-records", "network": "loopback-only", "max_attempts": 2, "max_concurrency": 1, "max_activities": 30, "duration_seconds": 600, "production_enabled": False}

    request("/coeli/state", expected=403, authenticated=False)
    request("/auth/login", {"mail": os.environ["COELI_DEMO_MAIL"], "password": os.environ["COELI_DEMO_PASSWORD"]})
    if not request("/coeli/connections")["enabled"]:
        raise RuntimeError("Coeli disabled")
    suffix = str(time.time_ns())
    for mode, environment, activities in (("purple", "laboratory", 7), ("observe", "laboratory", 2), ("release", "staging", 7)):
        run = request("/coeli/runs", {"mode": mode, "deduplication_key": suffix + mode, "policy": policy(environment)})
        deadline = time.monotonic() + 90
        while True:
            state = request("/coeli/state")
            status = state["runs"][run["id"]]["status"]
            if status in ("succeeded", "failed", "inconclusive", "cancelled"):
                break
            if time.monotonic() > deadline:
                raise TimeoutError("campaign did not finish")
            time.sleep(0.5)
        records = {r["kind"]: r["status"] for r in state["records"].values() if r["run_id"] == run["id"]}
        assert status == "succeeded", (mode, status)
        if mode == "observe":
            assert records["containment"] == "would_execute", records
        else:
            assert records["release"] == "approved" and records["knowledge"] == "validated", records
            assert records["containment"] == "verified_and_reversed", records
        artifacts = []
        for evidence in state["evidence"].values():
            if evidence["run_id"] == run["id"]:
                req = urllib.request.Request(base + "/coeli/evidence/" + evidence["id"])
                with opener.open(req, timeout=15) as response:
                    content = response.read()
                    assert hashlib.sha256(content).hexdigest() == evidence["sha256"]
                    assert response.headers["X-Content-Type-Options"] == "nosniff"
                artifacts.append(evidence["sha256"])
        assert len(artifacts) == activities, artifacts
        report["scenarios"].append({"mode": mode, "environment": environment, "status": status, "records": records, "artifact_sha256": artifacts})

    registration = request("/coeli/workers", {"name": "HTTP demonstration", "capabilities": ["infrastructure.v1"], "environment": "laboratory"})
    worker = registration["worker"]["id"]
    owner = registration["owner_id"]
    headers = {"Authorization": "Bearer " + registration["token"], "X-Coeli-Worker": worker}
    run = request("/coeli/runs", {"mode": "attack", "execution": "external", "deduplication_key": suffix + "worker", "policy": policy("laboratory")})
    path = f"/coeli-worker/{owner}"
    request(path + "/claim", {}, expected=401, authenticated=False)
    claim = request(path + "/claim", {}, headers=headers, authenticated=False)
    task = claim["task"]["id"]
    request(path + f"/tasks/{task}/heartbeat", {"lease": claim["lease"], "progress": "synthetic transport check"}, headers=headers, authenticated=False)
    result = {"schema_version": "coeli.result.v1", "candidate": True}
    receipt = hashlib.sha256(json.dumps(result, separators=(",", ":")).encode()).hexdigest()
    completion = {"lease": claim["lease"], "outcome": "succeeded", "result": result, "receipt": receipt}
    for _ in range(2):
        request(path + f"/tasks/{task}/result", completion, headers=headers, authenticated=False)
    request(f"/coeli/workers/{worker}/revoke", {})
    request(path + "/claim", {}, expected=401, headers=headers, authenticated=False)
    report["worker"] = {"authentication": "passed", "heartbeat": "passed", "completion_replay": "passed", "revocation": "passed"}
    report["acceptance"] = "deterministic-http-demonstration-passed"
    report["limitations"] = ["No live model or offensive PentAGI flow", "No browser interaction or process restart in this script"]
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
