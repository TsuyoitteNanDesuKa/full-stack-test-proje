import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import make_url

from shop_api.config import Settings
from shop_api.database import create_database_engine
from shop_api.main import create_app

parser = argparse.ArgumentParser()
parser.add_argument("--repo", type=Path, required=True)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
ROOT = args.repo.resolve()
OUTPUT = args.output.resolve()
if not OUTPUT.is_dir() or (OUTPUT / "sql-results.json").exists():
    raise SystemExit("Output directory must exist and must not contain sql-results.json.")
sys.path.insert(0, str(ROOT / r"apps\api\tests"))
from conftest import TEST_PRIVATE_KEY, StaticJwksClient, create_test_token  # noqa: E402

database_url = os.environ.get("SHOP_DATABASE_URL")
if not database_url:
    raise SystemExit("Explicit isolated SHOP_DATABASE_URL is required.")
url = make_url(database_url)
if (
    url.drivername != "postgresql+psycopg"
    or url.host not in ("localhost", "127.0.0.1")
    or url.port != 15432
    or url.database != "shop_perf_test"
):
    raise SystemExit("Refusing to run outside the isolated performance PostgreSQL.")

engine = create_database_engine(database_url)


@event.listens_for(engine, "connect")
def read_only(dbapi_connection, _):
    dbapi_connection.read_only = True


settings = Settings(
    database_url=database_url,
    oidc_issuer="http://127.0.0.1:18082/realms/e2e",
    oidc_audience="shop-api",
    _env_file=None,
)
app = create_app(settings=settings, db_engine=engine)
app.state.jwks_client = StaticJwksClient(TEST_PRIVATE_KEY.public_key())
app.state.test_private_key = TEST_PRIVATE_KEY
client = TestClient(app)
tokens = {
    name: create_test_token(client, subject=subject, roles=roles)
    for name, subject, roles in (
        ("buyer10", "perf-history-10", ["buyer"]),
        ("buyer100", "perf-history-100", ["buyer"]),
        ("buyer1000", "perf-history-1000", ["buyer"]),
        ("seller", "perf-seller", ["seller"]),
        ("admin", "perf-admin", ["admin"]),
    )
}
with engine.connect() as conn:
    if conn.exec_driver_sql("SELECT current_setting('transaction_read_only')").scalar_one() != "on":
        raise RuntimeError("The diagnostic connection must be read-only.")
    counts = conn.exec_driver_sql(
        "SELECT (SELECT count(*) FROM products), (SELECT count(*) FROM orders), "
        "(SELECT count(*) FROM order_fulfillments), (SELECT count(*) FROM order_items), "
        "(SELECT count(*) FROM payments), (SELECT count(*) FROM product_returns)"
    ).one()
    if tuple(counts) != (1000, 1110, 1110, 2220, 0, 0):
        raise RuntimeError("Expected the unmodified synthetic baseline dataset.")
    server_version = conn.exec_driver_sql("SELECT version()").scalar_one()
    table_statistics = (
        conn.exec_driver_sql(
            "SELECT relname, n_live_tup, last_analyze, last_autoanalyze "
            "FROM pg_stat_user_tables WHERE relname IN "
            "('orders', 'order_fulfillments', 'order_items', 'order_status_events', "
            "'order_fulfillment_events', 'product_returns', 'payments', 'seller_applications') "
            "ORDER BY relname"
        )
        .mappings()
        .all()
    )
    stats = [
        {k: str(v) if v is not None else None for k, v in row.items()} for row in table_statistics
    ]

warmup = client.get("/api/v1/orders", headers={"Authorization": f"Bearer {tokens['buyer10']}"})
if warmup.status_code != 200 or len(warmup.json()) != 10:
    raise RuntimeError(f"Warm-up failed: HTTP {warmup.status_code}")

cases = [
    ("buyer10", "/api/v1/orders", 10),
    ("buyer100", "/api/v1/orders", 100),
    ("buyer1000", "/api/v1/orders", 1000),
    ("seller", "/api/v1/seller/orders?limit=10&offset=0", 10),
    ("seller", "/api/v1/seller/orders?limit=50&offset=0", 50),
    ("seller", "/api/v1/seller/orders?limit=100&offset=0", 100),
    ("seller", "/api/v1/seller/orders?limit=50&offset=1000", 50),
    ("admin", "/api/v1/admin/orders?limit=10&offset=0", 10),
    ("admin", "/api/v1/admin/orders?limit=50&offset=0", 50),
    ("admin", "/api/v1/admin/orders?limit=100&offset=0", 100),
    ("admin", "/api/v1/admin/orders?limit=50&offset=1000", 50),
]
results = []
for name, path, expected in cases:
    groups = {}

    def before(_conn, _cursor, statement, params, context, _executemany, _groups=groups):
        if not statement.lstrip().upper().startswith("SELECT"):
            raise RuntimeError("Only SELECT statements may be analyzed.")
        context._qa026_start = time.perf_counter()
        group = _groups.setdefault(statement, {"count": 0, "execute_ms": 0.0, "params": params})
        group["count"] += 1

    def after(_conn, _cursor, statement, _params, context, _executemany, _groups=groups):
        _groups[statement]["execute_ms"] += (time.perf_counter() - context._qa026_start) * 1000

    event.listen(engine, "before_cursor_execute", before)
    event.listen(engine, "after_cursor_execute", after)
    try:
        start = time.perf_counter()
        response = client.get(path, headers={"Authorization": f"Bearer {tokens[name]}"})
        elapsed_ms = (time.perf_counter() - start) * 1000
    finally:
        event.remove(engine, "before_cursor_execute", before)
        event.remove(engine, "after_cursor_execute", after)
    if response.status_code != 200:
        raise RuntimeError(f"{path} returned HTTP {response.status_code}")
    returned = len(response.json())
    if returned != expected:
        raise RuntimeError(f"{path} returned {returned}; expected {expected}")
    plans = []
    with engine.connect() as connection:
        for statement, details in groups.items():
            plan = connection.exec_driver_sql(
                "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + statement,
                details["params"],
            ).scalar_one()
            match = re.search(r"\bFROM\s+([a-z_]+)", statement, re.I)
            plans.append(
                {
                    "table": match.group(1) if match else "(unknown)",
                    "sql": statement,
                    "count": details["count"],
                    "total_cursor_execute_ms": details["execute_ms"],
                    "example_parameters": details["params"],
                    "plan": plan,
                }
            )
    result = {
        "identity": name,
        "endpoint": path,
        "returned": returned,
        "query_count": sum(group["count"] for group in groups.values()),
        "elapsed_ms_in_process_instrumented": elapsed_ms,
        "response_bytes": len(response.content),
        "groups": plans,
    }
    results.append(result)
    print(
        f"{name} {path}: {returned} rows, {result['query_count']} queries, {elapsed_ms:.1f} ms",
        flush=True,
    )

document = {
    "postgres_version": server_version,
    "table_statistics_before_warmup": stats,
    "method": (
        "Read-only engine, single in-process TestClient request per case, real JWT signature "
        "validation with an in-memory JWKS key, lifespan worker not started, one buyer-10 warm-up. "
        "Counts are SQLAlchemy cursor executions for the request only; cursor timings exclude "
        "subsequent row fetching. EXPLAIN ANALYZE BUFFERS is a separate execution for one captured "
        "parameter set per distinct SQL statement after each request."
    ),
    "results": results,
}
with (OUTPUT / "sql-results.json").open("x", encoding="utf-8") as output:
    json.dump(document, output, indent=2, default=str)
engine.dispose()
