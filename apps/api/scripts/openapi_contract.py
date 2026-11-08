"""Export or verify the API's deterministic OpenAPI contract."""

import argparse
import difflib
import json
import sys
from pathlib import Path

from shop_api.config import Settings
from shop_api.main import create_app

CONTRACT_PATH = Path(__file__).resolve().parents[3] / "docs" / "openapi.json"


def generate_contract() -> str:
    app = create_app(settings=Settings(database_url="sqlite://"))
    try:
        return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    finally:
        app.state.session_factory.kw["bind"].dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if the saved contract differs.")
    args = parser.parse_args()
    generated = generate_contract()
    if not args.check:
        CONTRACT_PATH.write_text(generated, encoding="utf-8", newline="\n")
        print(f"Updated {CONTRACT_PATH}")
        return 0

    if not CONTRACT_PATH.exists():
        print(f"OpenAPI contract not found: {CONTRACT_PATH}", file=sys.stderr)
        print(
            "Run uv run python scripts/openapi_contract.py to update the contract.", file=sys.stderr
        )
        return 1
    saved = CONTRACT_PATH.read_text(encoding="utf-8")
    if saved != generated:
        print(
            "".join(
                difflib.unified_diff(
                    saved.splitlines(keepends=True),
                    generated.splitlines(keepends=True),
                    fromfile="saved OpenAPI contract",
                    tofile="generated OpenAPI contract",
                )
            ),
            file=sys.stderr,
        )
        print(
            "Run uv run python scripts/openapi_contract.py to update the contract.", file=sys.stderr
        )
        return 1
    print("OpenAPI contract matches the backend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
