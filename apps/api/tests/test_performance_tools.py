import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

PERFORMANCE = Path(__file__).resolve().parents[3] / "performance"


@pytest.mark.regression
def test_seed_refuses_nonisolated_database(tmp_path: Path) -> None:
    result = subprocess.run(
        [sys.executable, str(PERFORMANCE / "seed.py"), "--output-dir", str(tmp_path)],
        env={**os.environ, "SHOP_DATABASE_URL": "postgresql+psycopg://user:pass@remote/db"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode != 0
    assert "isolated local PostgreSQL" in result.stderr
    assert not list(tmp_path.iterdir())


@pytest.mark.regression
def test_report_counts_failed_responses_and_successful_latency(tmp_path: Path) -> None:
    summary = tmp_path / "summary.json"
    raw = tmp_path / "raw.jsonl"
    output = tmp_path / "report.json"
    summary.write_text(json.dumps({"state": {"testRunDurationMs": 9000}}), encoding="utf-8")
    points = [
        ("perf_status", 1, {"operation": "catalog", "status": "200"}),
        ("perf_status", 1, {"operation": "catalog", "status": "500"}),
        ("perf_failed", 0, {"operation": "catalog"}),
        ("perf_failed", 1, {"operation": "catalog"}),
        ("perf_latency", 100, {"operation": "catalog"}),
        ("perf_response_bytes", 10, {"operation": "catalog"}),
        ("perf_response_bytes", 20, {"operation": "catalog"}),
    ]
    raw.write_text(
        "\n".join(
            json.dumps({"type": "Point", "metric": metric, "data": {"value": value, "tags": tags}})
            for metric, value, tags in points
        ),
        encoding="utf-8",
    )
    result = subprocess.run(
        [
            sys.executable,
            str(PERFORMANCE / "report.py"),
            "--summary",
            str(summary),
            "--raw",
            str(raw),
            "--output",
            str(output),
            "--scenario",
            "catalog",
            "--mode",
            "smoke",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    report = json.loads(output.read_text(encoding="utf-8"))
    assert result.returncode == 1
    assert report["valid"]
    assert report["error_rate"] == 0.5
    assert report["operations"]["catalog"]["status_codes"] == {"200": 1, "500": 1}
    assert report["operations"]["catalog"]["successful_latency_ms"]["p95"] == 100
