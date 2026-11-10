"""Verifica schemas e fixtures; não substitui teste HTTP de contrato com backend real."""
import copy
import json
import pathlib
import unittest

import jsonschema

ROOT = pathlib.Path(__file__).parent


class Contracts(unittest.TestCase):
    def schema(self, name):
        return json.loads((ROOT / f"{name}.schema.json").read_text())

    def test_schema_definitions(self):
        for file in ROOT.glob("*.schema.json"):
            jsonschema.Draft202012Validator.check_schema(json.loads(file.read_text()))

    def test_audit_candidates_require_evidence_and_cannot_self_validate(self):
        example = json.loads((ROOT / "audit.fixture.json").read_text())
        jsonschema.validate(example, self.schema("audit"))
        confirmed = copy.deepcopy(example)
        confirmed["findings"][0]["status"] = "confirmed"
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(confirmed, self.schema("audit"))
        example["findings"][0]["evidence"] = []
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(example, self.schema("audit"))

    def test_production_and_unknown_capabilities_are_refused(self):
        example = {"name": "demo", "capabilities": ["audit.v1"], "environment": "laboratory"}
        jsonschema.validate(example, self.schema("registration"))
        for key, value in [("environment", "production"), ("capabilities", ["admin.v1"])]:
            invalid = dict(example, **{key: value})
            with self.assertRaises(jsonschema.ValidationError):
                jsonschema.validate(invalid, self.schema("registration"))

    def test_lease_and_structured_result_required(self):
        example = {"lease": "a" * 48, "outcome": "succeeded", "result": {"schema_version": "coeli.result.v1", "status": "candidate"}, "receipt": "b" * 64}
        jsonschema.validate(example, self.schema("result"))
        for missing in ["lease", "receipt", "result"]:
            invalid = {k: v for k, v in example.items() if k != missing}
            with self.assertRaises(jsonschema.ValidationError):
                jsonschema.validate(invalid, self.schema("result"))

    def test_telemetry_schema_and_deduplication_key(self):
        example = {"id": "event-1", "schema_version": "coeli.telemetry.v1", "run_id": "a" * 48, "timestamp": "2026-11-09T00:00:00Z", "source": "coeli-lab", "asset": "synthetic-records", "kind": "cross_owner_access", "status": 200}
        jsonschema.validate(example, self.schema("telemetry"))
        example["asset"] = "external-target"
        with self.assertRaises(jsonschema.ValidationError):
            jsonschema.validate(example, self.schema("telemetry"))

    def test_openapi_references_and_capability_contracts(self):
        spec = json.loads((ROOT / "openapi.json").read_text())
        self.assertEqual(spec["openapi"], "3.1.0")
        for route in spec["paths"].values():
            for operation in route.values():
                if "requestBody" in operation:
                    ref = operation["requestBody"]["content"]["application/json"]["schema"]["$ref"]
                    self.assertTrue((ROOT / ref).is_file())
        self.assertEqual(len(json.loads((ROOT / "capabilities.json").read_text())["capabilities"]), 6)


if __name__ == "__main__":
    unittest.main()
