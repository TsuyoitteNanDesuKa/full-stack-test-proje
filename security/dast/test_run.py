import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import run
from run import TARGET, safe_openapi, validate_report


class SafeOpenApiTests(unittest.TestCase):
    def test_only_api_get_operations_and_local_target_are_retained(self):
        source = {
            "openapi": "3.1.0",
            "servers": [{"url": "https://example.invalid"}],
            "paths": {
                "/api/v1/items/{id}": {
                    "parameters": [{"name": "id", "in": "path"}],
                    "servers": [{"url": "https://example.invalid"}],
                    "get": {"servers": [{"url": "https://example.invalid"}]},
                    "delete": {},
                },
                "/api/v1/items": {"post": {}},
                "/outside": {"get": {}},
            },
        }
        result = safe_openapi(source)
        self.assertEqual(result["servers"], [{"url": TARGET}])
        self.assertEqual(list(result["paths"]), ["/api/v1/items/{id}"])
        self.assertEqual(
            result["paths"]["/api/v1/items/{id}"],
            {"get": {}, "parameters": [{"name": "id", "in": "path"}]},
        )
        self.assertIn("servers", source["paths"]["/api/v1/items/{id}"]["get"])

    def test_rejects_external_references_and_missing_get(self):
        with self.assertRaisesRegex(ValueError, "External OpenAPI reference"):
            safe_openapi({"paths": {"/api/v1/items": {"get": {"$ref": "https://x"}}}})
        with self.assertRaisesRegex(ValueError, "No API GET"):
            safe_openapi({"paths": {"/api/v1/items": {"post": {}}}})

    def test_report_must_include_the_expected_target(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text('{"site": []}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "expected site"):
                validate_report(path, TARGET)
            path.write_text('{"site": [{"@name": "http://dast-target:8000"}]}', encoding="utf-8")
            validate_report(path, TARGET)

    def test_scanner_failure_retains_partial_reports_and_cleans_up(self):
        def fake_run(*args):
            if "zap-baseline.py" in args:
                work = Path(args[args.index("-v") + 1].removesuffix(":/zap/wrk:rw"))
                (work / "web.html").write_text("report", encoding="utf-8")
                (work / "web.json").write_text("{}", encoding="utf-8")
            elif "zap-api-scan.py" in args:
                raise subprocess.CalledProcessError(3, args)

        with TemporaryDirectory() as directory:
            output = Path(directory) / "reports"
            with (
                patch.object(sys, "argv", ["run.py", "--output-dir", str(output)]),
                patch.object(run, "run", side_effect=fake_run),
                patch.object(run, "wait_for_target"),
                patch.object(run.subprocess, "run") as cleanup,
            ):
                cleanup.return_value.returncode = 0
                with self.assertRaises(subprocess.CalledProcessError):
                    run.main()
            self.assertTrue((output / "web.html").is_file())
            self.assertTrue((output / "web.json").is_file())
            self.assertEqual(cleanup.call_count, 3)


if __name__ == "__main__":
    unittest.main()
