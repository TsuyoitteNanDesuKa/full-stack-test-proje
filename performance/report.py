import argparse
import json
from collections import Counter
from pathlib import Path

SCENARIOS = {
    "catalog": ["catalog"],
    "catalog_search": ["catalog_search"],
    "orders_10": ["orders_10"],
    "orders_100": ["orders_100"],
    "orders_1000": ["orders_1000"],
    "seller": ["seller"],
    "checkout": ["cart_read", "cart_add", "checkout", "payment_create", "payment_complete"],
}


def percentile(values: list[float], percentage: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentage
    low = int(position)
    high = min(low + 1, len(ordered) - 1)
    return ordered[low] + (ordered[high] - ordered[low]) * (position - low)


def build_report(summary: dict, raw_path: Path, scenario: str, mode: str) -> dict:
    operations = SCENARIOS[scenario]
    samples = {
        operation: {"latency": [], "bytes": [], "failures": [], "statuses": Counter()}
        for operation in operations
    }
    metric_fields = {
        "perf_latency": "latency",
        "perf_response_bytes": "bytes",
        "perf_failed": "failures",
    }
    with raw_path.open(encoding="utf-8") as raw:
        for line in raw:
            record = json.loads(line)
            if record.get("type") != "Point":
                continue
            data = record["data"]
            operation = data["tags"].get("operation")
            if operation not in samples:
                continue
            metric = record["metric"]
            if metric in metric_fields:
                samples[operation][metric_fields[metric]].append(data["value"])
            elif metric == "perf_status":
                samples[operation]["statuses"][data["tags"]["status"]] += data["value"]

    steady_seconds = 5 if mode == "smoke" else 180
    minimum_duration_ms = (9 if mode == "smoke" else 270) * 1000 - 1000
    completed = summary["state"]["testRunDurationMs"] >= minimum_duration_ms
    result = {}
    total_requests = 0
    total_failures = 0
    valid = completed
    for operation, values in samples.items():
        count = len(values["failures"])
        failures = sum(values["failures"])
        latency_p95 = percentile(values["latency"], 0.95)
        limit = 1000 if operation in ("checkout", "payment_create", "payment_complete") else 500
        operation_valid = (
            count > 0
            and len(values["bytes"]) == count
            and sum(values["statuses"].values()) == count
            and len(values["latency"]) == count - failures
        )
        valid = valid and operation_valid
        total_requests += count
        total_failures += failures
        result[operation] = {
            "requests": count,
            "requests_per_second": count / steady_seconds,
            "failures": failures,
            "status_codes": dict(values["statuses"]),
            "successful_latency_ms": {
                "p50": percentile(values["latency"], 0.50),
                "p95": latency_p95,
                "p99": percentile(values["latency"], 0.99),
            },
            "response_bytes_p50": percentile(values["bytes"], 0.50),
            "latency_target_ms": limit,
            "latency_target_passed": latency_p95 is not None and latency_p95 <= limit,
        }
    error_rate = total_failures / total_requests if total_requests else None
    return {
        "scenario": scenario,
        "mode": mode,
        "valid": valid,
        "test_duration_ms": summary["state"]["testRunDurationMs"],
        "steady_duration_seconds": steady_seconds,
        "requests": total_requests,
        "error_rate": error_rate,
        "error_target_passed": error_rate is not None and error_rate < 0.01,
        "operations": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--scenario", choices=SCENARIOS, required=True)
    parser.add_argument("--mode", choices=("smoke", "baseline"), required=True)
    args = parser.parse_args()
    summary = json.loads(args.summary.read_text(encoding="utf-8"))
    report = build_report(summary, args.raw, args.scenario, args.mode)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(f"Report written to {args.output}; valid={report['valid']}")
    if (
        not report["valid"]
        or not report["error_target_passed"]
        or not all(item["latency_target_passed"] for item in report["operations"].values())
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
