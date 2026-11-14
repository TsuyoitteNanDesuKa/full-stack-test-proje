import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jwks", type=Path)
    args = parser.parse_args()
    jwks = args.jwks.read_bytes()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path != "/realms/e2e/protocol/openid-connect/certs":
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(jwks)

    HTTPServer(("127.0.0.1", 18082), Handler).serve_forever()


if __name__ == "__main__":
    main()
