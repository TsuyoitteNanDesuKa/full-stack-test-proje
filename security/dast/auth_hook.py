from pathlib import Path

TOKEN_PATH = Path("/zap/wrk/buyer-token")
BUYER_GET_URL_PATTERN = (
    r"^http://dast-target:8000/api/v1/"
    r"(?:auth/me|addresses|cart|favorites|home|orders/page|products)(?:\?.*)?$"
)


def zap_started(zap, _target):
    token = TOKEN_PATH.read_text(encoding="utf-8").strip()
    if not token:
        raise RuntimeError("The synthetic buyer token is empty.")
    zap.replacer.add_rule(
        description="qa044-buyer-auth",
        enabled="true",
        matchtype="REQ_HEADER",
        matchregex="false",
        matchstring="Authorization",
        replacement=f"Bearer {token}",
        url=BUYER_GET_URL_PATTERN,
        method="GET",
    )
