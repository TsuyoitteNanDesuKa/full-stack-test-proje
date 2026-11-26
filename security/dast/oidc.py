import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

ISSUER = "http://127.0.0.1:8082/realms/e2e"
KEY_ID = "qa044-dast-buyer"
TOKEN_PATH = Path("/tmp/dast-buyer-token")


class JwksHandler(BaseHTTPRequestHandler):
    jwks: dict[str, list[dict[str, str]]]

    def do_GET(self):
        if self.path != "/realms/e2e/protocol/openid-connect/certs":
            self.send_error(404)
            return
        body = json.dumps(self.jwks).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format, *_args):
        return


def main():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(public_key))
    jwk.update({"alg": "RS256", "kid": KEY_ID, "use": "sig"})
    now = int(time())
    token = jwt.encode(
        {
            "aud": "shop-api",
            "exp": now + 600,
            "iat": now,
            "iss": ISSUER,
            "realm_access": {"roles": ["buyer"]},
            "sub": "qa044-dast-buyer",
        },
        private_key,
        algorithm="RS256",
        headers={"kid": KEY_ID},
    )
    TOKEN_PATH.write_text(token, encoding="utf-8")
    TOKEN_PATH.chmod(0o600)
    JwksHandler.jwks = {"keys": [jwk]}
    ThreadingHTTPServer(("0.0.0.0", 8082), JwksHandler).serve_forever()


if __name__ == "__main__":
    main()
