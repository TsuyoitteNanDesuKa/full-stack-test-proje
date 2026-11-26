import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
ZAP_IMAGE = (
    "ghcr.io/zaproxy/zaproxy@"
    "sha256:9624669db72f54d86c4b46a7064518bd9bf79d8c61a4c31befa9923489f328af"
)
TARGET = "http://dast-target:8000"
BUYER_GET_PATHS = frozenset(
    {
        "/api/v1/auth/me",
        "/api/v1/addresses",
        "/api/v1/cart",
        "/api/v1/favorites",
        "/api/v1/home",
        "/api/v1/orders/page",
        "/api/v1/products",
    }
)


def safe_openapi(schema: dict) -> dict:
    def check_references(value):
        if isinstance(value, dict):
            for key, item in value.items():
                if key == "$ref" and (not isinstance(item, str) or not item.startswith("#/")):
                    raise ValueError(f"External OpenAPI reference is not allowed: {item}")
                check_references(item)
        elif isinstance(value, list):
            for item in value:
                check_references(item)

    check_references(schema)
    paths = {}
    for path, operations in schema["paths"].items():
        if "get" not in operations:
            continue
        if not path.startswith("/api/v1/"):
            continue
        operation = dict(operations["get"])
        operation.pop("servers", None)
        paths[path] = {"get": operation}
        if "parameters" in operations:
            paths[path]["parameters"] = operations["parameters"]
    if not paths:
        raise ValueError("No API GET operations found in the OpenAPI definition.")
    return {**schema, "servers": [{"url": TARGET}], "paths": paths}


def buyer_openapi(schema: dict) -> dict:
    safe_schema = safe_openapi(schema)
    paths = {}
    for path, operations in safe_schema["paths"].items():
        if path not in BUYER_GET_PATHS:
            continue
        operation = operations["get"]
        if not operation.get("security") and not safe_schema.get("security"):
            continue
        if path == "/api/v1/products":
            operation = {
                **operation,
                "parameters": [
                    parameter
                    for parameter in operation.get("parameters", [])
                    if parameter.get("name") not in {"min_price", "max_price"}
                ],
            }
        paths[path] = {**operations, "get": operation}
    if not paths:
        raise ValueError("No allowlisted buyer-authenticated GET operations found.")
    return {**safe_schema, "paths": paths}


def validate_report(path: Path, expected_site: str):
    report = json.loads(path.read_text(encoding="utf-8"))
    sites = report.get("site")
    if not isinstance(sites, list) or not any(
        isinstance(site, dict) and site.get("@name") == expected_site for site in sites
    ):
        raise ValueError(f"DAST report does not include expected site {expected_site}: {path}")


def validate_authenticated_report(path: Path):
    report = json.loads(path.read_text(encoding="utf-8"))
    validate_report(path, TARGET)
    for site in report["site"]:
        for alert in site.get("alerts", []):
            for instance in alert.get("instances", []):
                evidence = instance.get("evidence", "")
                if instance.get("method") == "GET" and evidence.startswith(("4", "5")):
                    raise ValueError(
                        f"Authenticated DAST received non-success HTTP {evidence} for "
                        f"{urlsplit(instance.get('uri', '')).path or 'an unknown path'}."
                    )
    insights = [insight for insight in report.get("insights", []) if insight.get("site") == TARGET]
    success_rate = next(
        (
            insight.get("statistic")
            for insight in insights
            if insight.get("key") == "insight.code.2xx"
        ),
        None,
    )
    if success_rate != "100":
        raise ValueError("Authenticated DAST did not return 2xx for every scanned API request.")
    if any(
        insight.get("key") in {"insight.code.4xx", "insight.code.5xx"}
        and int(insight.get("statistic", "0")) > 0
        for insight in insights
    ):
        raise ValueError("Authenticated DAST observed a client or server error response.")


def redact_token(data: bytes, token: str) -> bytes:
    if not token:
        return data
    redacted = data.replace(token.encode(), b"[REDACTED]")
    if token.encode() in redacted:
        raise RuntimeError("A DAST report contains the synthetic buyer token.")
    return redacted


def run(*args, redact=(), **kwargs):
    displayed = " ".join(str(arg) for arg in args)
    for secret in redact:
        displayed = displayed.replace(secret, "[REDACTED]")
    print("+", displayed, flush=True)
    if redact:
        result = subprocess.run(args, check=False, capture_output=True, text=True, **kwargs)
        for secret in redact:
            result.stdout = result.stdout.replace(secret, "[REDACTED]")
            result.stderr = result.stderr.replace(secret, "[REDACTED]")
        if result.stdout:
            print(result.stdout, end="", flush=True)
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr, flush=True)
        if result.returncode:
            raise RuntimeError(
                f"DAST command failed with exit code {result.returncode}: {displayed}"
            )
        return
    subprocess.run(args, check=True, **kwargs)


def wait_for_target(container: str):
    code = (
        "import urllib.request; "
        "[urllib.request.urlopen(u, timeout=2).read(1) for u in "
        "('http://127.0.0.1:8000/openapi.json', 'http://127.0.0.1:5174/', "
        "'http://127.0.0.1:8082/realms/e2e/protocol/openid-connect/certs')]"
    )
    for _ in range(60):
        result = subprocess.run(
            ["docker", "exec", container, "python", "-c", code],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode == 0:
            return
        state = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", container],
            capture_output=True,
            text=True,
            check=True,
        )
        if state.stdout.strip() != "true":
            break
        time.sleep(2)
    subprocess.run(["docker", "logs", container], check=False)
    raise RuntimeError("The isolated DAST target did not become ready.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    filenames = ("web.html", "web.json", "api.html", "api.json", "api-auth.html", "api-auth.json")
    if any((output / name).exists() for name in filenames):
        raise FileExistsError("Refusing to overwrite an existing DAST report.")

    identifier = uuid.uuid4().hex[:12]
    network = f"liva-dast-{identifier}"
    container = f"liva-dast-target-{identifier}"
    image = f"liva-dast-target-{identifier}"
    created_network = False
    created_container = False
    built_image = False
    cleanup_errors = []
    token = ""
    try:
        run("docker", "build", "-t", image, "-f", str(ROOT / "security/dast/Dockerfile"), str(ROOT))
        built_image = True
        run("docker", "network", "create", "--internal", network)
        created_network = True
        run(
            "docker",
            "run",
            "-d",
            "--name",
            container,
            "--network",
            network,
            "--network-alias",
            "dast-target",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
            image,
        )
        created_container = True
        wait_for_target(container)

        with tempfile.TemporaryDirectory(prefix="liva-dast-") as directory:
            work = Path(directory) / "work"
            # The scanner writes here; the temporary parent stays private to the host user.
            work.mkdir(mode=0o777)
            os.chmod(work, 0o777)
            schema = json.loads((ROOT / "docs/openapi.json").read_text(encoding="utf-8"))
            (work / "get-only.json").write_text(json.dumps(safe_openapi(schema)), encoding="utf-8")
            (work / "buyer-get-only.json").write_text(
                json.dumps(buyer_openapi(schema)), encoding="utf-8"
            )
            shutil.copyfile(ROOT / "security/dast/auth_hook.py", work / "auth_hook.py")
            mount = f"{work}:/zap/wrk:rw"
            try:
                run(
                    "docker",
                    "run",
                    "--rm",
                    "--network",
                    network,
                    "--cap-drop=ALL",
                    "--security-opt=no-new-privileges",
                    "-v",
                    mount,
                    ZAP_IMAGE,
                    "zap-baseline.py",
                    "-t",
                    "http://dast-target:5174",
                    "-m",
                    "1",
                    "-T",
                    "5",
                    "-I",
                    "-r",
                    "web.html",
                    "-J",
                    "web.json",
                )
                run(
                    "docker",
                    "run",
                    "--rm",
                    "--network",
                    network,
                    "--cap-drop=ALL",
                    "--security-opt=no-new-privileges",
                    "-v",
                    mount,
                    ZAP_IMAGE,
                    "zap-api-scan.py",
                    "-S",
                    "-t",
                    "/zap/wrk/get-only.json",
                    "-f",
                    "openapi",
                    "-T",
                    "5",
                    "-I",
                    "-r",
                    "api.html",
                    "-J",
                    "api.json",
                )
                buyer_token = work / "buyer-token"
                run("docker", "cp", f"{container}:/tmp/dast-buyer-token", str(buyer_token))
                buyer_token.chmod(0o644)
                token = buyer_token.read_text(encoding="utf-8").strip()
                if not token:
                    raise RuntimeError("The isolated buyer token is empty.")
                preflight = (
                    "import json,urllib.request; "
                    "token=open('/tmp/dast-buyer-token', encoding='utf-8').read().strip(); "
                    "request=urllib.request.Request('http://127.0.0.1:8000/api/v1/auth/me', "
                    "headers={'Authorization':'Bearer '+token}); "
                    "response=json.load(urllib.request.urlopen(request, timeout=5)); "
                    "assert 'buyer' in response['roles'], 'buyer role missing from auth preflight'"
                )
                run("docker", "exec", container, "python", "-c", preflight)
                run(
                    "docker",
                    "run",
                    "--rm",
                    "--network",
                    network,
                    "--cap-drop=ALL",
                    "--security-opt=no-new-privileges",
                    "-v",
                    mount,
                    ZAP_IMAGE,
                    "zap-api-scan.py",
                    "-S",
                    "-t",
                    "/zap/wrk/buyer-get-only.json",
                    "-f",
                    "openapi",
                    "-T",
                    "5",
                    "-I",
                    "-r",
                    "api-auth.html",
                    "-J",
                    "api-auth.json",
                    "--hook=/zap/wrk/auth_hook.py",
                    redact=(token,),
                )
            finally:
                for name in filenames:
                    report = work / name
                    if report.is_file() and report.stat().st_size:
                        report_data = redact_token(report.read_bytes(), token)
                        (output / name).write_bytes(report_data)
                if token:
                    (work / "buyer-token").unlink(missing_ok=True)
            for name in filenames:
                if not (output / name).is_file():
                    raise RuntimeError(f"Missing or empty DAST report: {name}")
            validate_report(output / "web.json", "http://dast-target:5174")
            validate_report(output / "api.json", TARGET)
            validate_authenticated_report(output / "api-auth.json")
    finally:
        for enabled, command in (
            (created_container, ["docker", "rm", "-f", container]),
            (created_network, ["docker", "network", "rm", network]),
            (built_image, ["docker", "image", "rm", image]),
        ):
            if enabled and subprocess.run(command, check=False).returncode:
                cleanup_errors.append(" ".join(command))
        if cleanup_errors:
            print(f"DAST cleanup failed: {', '.join(cleanup_errors)}", file=sys.stderr)
            if sys.exc_info()[0] is None:
                raise RuntimeError("DAST cleanup failed.")


if __name__ == "__main__":
    main()
