import importlib.util
import json
import sys
from pathlib import Path

import pytest

script = Path(__file__).resolve().parents[1] / "scripts" / "openapi_contract.py"
spec = importlib.util.spec_from_file_location("openapi_contract", script)
assert spec is not None and spec.loader is not None
openapi_contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(openapi_contract)


def test_contract_is_deterministic_and_contains_operations() -> None:
    first = openapi_contract.generate_contract()
    assert first == openapi_contract.generate_contract()
    contract = json.loads(first)
    assert "get" in contract["paths"]["/api/v1/auth/me"]
    assert "post" in contract["paths"]["/api/v1/orders"]


def test_contract_check_accepts_matching_snapshot(tmp_path, monkeypatch, capsys) -> None:
    snapshot = tmp_path / "openapi.json"
    monkeypatch.setattr(openapi_contract, "CONTRACT_PATH", snapshot)
    monkeypatch.setattr(sys, "argv", ["openapi_contract.py"])
    assert openapi_contract.main() == 0

    monkeypatch.setattr(sys, "argv", ["openapi_contract.py", "--check"])
    assert openapi_contract.main() == 0
    assert "matches the backend" in capsys.readouterr().out


@pytest.mark.parametrize("change", ["path", "header", "response"])
def test_contract_check_rejects_changed_snapshot(tmp_path, monkeypatch, capsys, change) -> None:
    snapshot = tmp_path / "openapi.json"
    contract = json.loads(openapi_contract.generate_contract())
    if change == "path":
        del contract["paths"]["/api/v1/orders"]
    elif change == "header":
        contract["paths"]["/api/v1/orders"]["post"]["parameters"][0]["required"] = False
    else:
        contract["components"]["schemas"]["OrderResponse"]["properties"]["id"]["type"] = "string"
    snapshot.write_text(
        json.dumps(contract, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(openapi_contract, "CONTRACT_PATH", snapshot)
    monkeypatch.setattr(sys, "argv", ["openapi_contract.py", "--check"])
    assert openapi_contract.main() == 1
    assert "Run uv run python scripts/openapi_contract.py" in capsys.readouterr().err


def test_contract_check_rejects_missing_snapshot(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setattr(openapi_contract, "CONTRACT_PATH", tmp_path / "missing.json")
    monkeypatch.setattr(sys, "argv", ["openapi_contract.py", "--check"])
    assert openapi_contract.main() == 1
    assert "not found" in capsys.readouterr().err
