import json
import re
import subprocess
import sys
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch

import auth_hook
import run
from run import TARGET, buyer_openapi, redact_token, safe_openapi, validate_report
from run import run as run_command


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

    def test_buyer_openapi_contains_only_allowlisted_secured_get_operations(self):
        source = {
            "openapi": "3.1.0",
            "security": [{"HTTPBearer": []}],
            "paths": {
                "/api/v1/auth/me": {"get": {"security": [{"HTTPBearer": []}]}},
                "/api/v1/addresses": {"get": {}, "post": {}},
                "/api/v1/products": {
                    "get": {
                        "parameters": [
                            {"name": "min_price", "in": "query"},
                            {"name": "max_price", "in": "query"},
                            {"name": "limit", "in": "query"},
                        ]
                    },
                },
                "/api/v1/admin/orders": {"get": {}},
                "/api/v1/seller/orders": {"get": {}},
                "/api/v1/public": {"get": {"security": []}},
            },
        }
        result = buyer_openapi(source)
        self.assertEqual(
            list(result["paths"]),
            ["/api/v1/auth/me", "/api/v1/addresses", "/api/v1/products"],
        )
        self.assertEqual(
            result["paths"]["/api/v1/addresses"],
            {"get": {}},
        )
        self.assertEqual(
            result["paths"]["/api/v1/products"]["get"]["parameters"],
            [{"name": "limit", "in": "query"}],
        )

    def test_buyer_openapi_fails_closed_without_allowlisted_auth_operations(self):
        with self.assertRaisesRegex(ValueError, "No allowlisted buyer-authenticated GET"):
            buyer_openapi({"paths": {"/api/v1/admin/orders": {"get": {}}}})

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

    def test_authenticated_report_rejects_unauthorized_responses(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text(
                json.dumps(
                    {
                        "site": [
                            {
                                "@name": TARGET,
                                "alerts": [
                                    {
                                        "instances": [
                                            {
                                                "method": "GET",
                                                "uri": f"{TARGET}/api/v1/auth/me",
                                                "evidence": "401",
                                            }
                                        ]
                                    }
                                ],
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            for status in ("401", "422", "500"):
                with self.subTest(status=status):
                    report = json.loads(path.read_text(encoding="utf-8"))
                    report["site"][0]["alerts"][0]["instances"][0]["evidence"] = status
                    path.write_text(json.dumps(report), encoding="utf-8")
                    with self.assertRaisesRegex(ValueError, f"HTTP {status}"):
                        run.validate_authenticated_report(path)

    def test_authenticated_report_requires_all_2xx_responses(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text(
                json.dumps(
                    {
                        "site": [{"@name": TARGET, "alerts": []}],
                        "insights": [
                            {
                                "site": TARGET,
                                "key": "insight.code.2xx",
                                "statistic": "85",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "2xx for every"):
                run.validate_authenticated_report(path)

    def test_report_redaction_removes_synthetic_token(self):
        token = "synthetic.jwt.token"
        report = redact_token(f"Authorization: Bearer {token}".encode(), token)
        self.assertEqual(report, b"Authorization: Bearer [REDACTED]")
        self.assertNotIn(token.encode(), report)

    def test_redacted_command_does_not_log_token_even_on_failure(self):
        token = "synthetic.jwt.token"
        output = StringIO()
        errors = StringIO()
        with (
            patch.object(
                run.subprocess,
                "run",
                return_value=SimpleNamespace(
                    returncode=3,
                    stdout=f"stdout {token}",
                    stderr=f"stderr {token}",
                ),
            ),
            redirect_stdout(output),
            redirect_stderr(errors),
        ):
            with self.assertRaisesRegex(RuntimeError, "exit code 3"):
                run_command("scanner", token, redact=(token,))
        self.assertNotIn(token, output.getvalue())
        self.assertNotIn(token, errors.getvalue())

    def test_auth_hook_reads_token_from_private_work_file(self):
        token = "synthetic.jwt.token"
        with TemporaryDirectory() as directory:
            path = Path(directory) / "buyer-token"
            path.write_text(token, encoding="utf-8")
            zap = Mock()
            with patch.object(auth_hook, "TOKEN_PATH", path):
                auth_hook.zap_started(zap, TARGET)
        zap.replacer.add_rule.assert_called_once_with(
            description="qa044-buyer-auth",
            enabled="true",
            matchtype="REQ_HEADER",
            matchregex="false",
            matchstring="Authorization",
            replacement=f"Bearer {token}",
            url=auth_hook.BUYER_GET_URL_PATTERN,
            method="GET",
        )

    def test_auth_hook_url_pattern_is_limited_to_buyer_get_allowlist(self):
        pattern = auth_hook.BUYER_GET_URL_PATTERN
        allowed = (
            "/api/v1/auth/me",
            "/api/v1/addresses",
            "/api/v1/cart",
            "/api/v1/favorites?limit=20&offset=0",
            "/api/v1/home",
            "/api/v1/orders/page?limit=20&offset=0",
            "/api/v1/products?limit=20&offset=0",
        )
        for path in allowed:
            with self.subTest(path=path):
                self.assertIsNotNone(re.fullmatch(pattern, f"http://dast-target:8000{path}"))
        for path in ("/api/v1/admin/orders", "/api/v1/seller/orders", "/api/v1/orders"):
            with self.subTest(path=path):
                self.assertIsNone(re.fullmatch(pattern, f"http://dast-target:8000{path}"))

    def test_scanner_failure_retains_partial_reports_and_cleans_up(self):
        def fake_run(*args, **kwargs):
            if "zap-baseline.py" in args:
                work = Path(args[args.index("-v") + 1].removesuffix(":/zap/wrk:rw"))
                (work / "web.html").write_text("report", encoding="utf-8")
                (work / "web.json").write_text("{}", encoding="utf-8")
            elif args[:2] == ("docker", "cp"):
                Path(args[-1]).write_text("synthetic.jwt.token", encoding="utf-8")
            elif "zap-api-scan.py" in args:
                if kwargs.get("redact"):
                    raise subprocess.CalledProcessError(3, args)
                work = Path(args[args.index("-v") + 1].removesuffix(":/zap/wrk:rw"))
                (work / "api.html").write_text("report", encoding="utf-8")
                (work / "api.json").write_text("{}", encoding="utf-8")

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
