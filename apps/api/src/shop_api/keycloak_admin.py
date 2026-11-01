import json
import logging
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from shop_api.config import Settings

logger = logging.getLogger(__name__)


class KeycloakProvisioningError(Exception):
    pass


class KeycloakRoleProvisioner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def assign_seller_role(self, subject: str) -> None:
        client_secret = self.settings.keycloak_admin_client_secret
        if not client_secret:
            logger.error("Keycloak seller role provisioning is not configured.")
            raise KeycloakProvisioningError("Keycloak role provisioning is not configured.")

        issuer = self.settings.oidc_issuer.rstrip("/")
        realm = issuer.rsplit("/", 1)[-1]
        token_url = f"{issuer}/protocol/openid-connect/token"
        admin_url = f"{issuer.rsplit('/realms/', 1)[0]}/admin/realms/{quote(realm, safe='')}"

        try:
            token_response = self._send(
                token_url,
                method="POST",
                data=urlencode(
                    {
                        "grant_type": "client_credentials",
                        "client_id": self.settings.keycloak_admin_client_id,
                        "client_secret": client_secret,
                    }
                ).encode(),
                content_type="application/x-www-form-urlencoded",
            )
            token = json.loads(token_response)
            if not isinstance(token, dict):
                raise KeycloakProvisioningError("Keycloak service account response is invalid.")
            access_token = token.get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise KeycloakProvisioningError(
                    "Keycloak service account returned no access token."
                )

            headers = {"Authorization": f"Bearer {access_token}"}
            role_path = f"{admin_url}/roles/seller"
            role_response = self._send(role_path, headers=headers)
            role = json.loads(role_response)
            if not isinstance(role, dict) or not isinstance(role.get("id"), str):
                raise KeycloakProvisioningError("Keycloak seller role response is invalid.")

            user_path = f"{admin_url}/users/{quote(subject, safe='')}"
            mapping_path = f"{user_path}/role-mappings/realm"
            role_body = json.dumps([role]).encode()
            self._send(
                mapping_path,
                method="POST",
                data=role_body,
                headers=headers,
                content_type="application/json",
            )

            mappings_response = self._send(mapping_path, headers=headers)
            mappings = json.loads(mappings_response)
            if not isinstance(mappings, list) or not any(
                isinstance(mapping, dict) and mapping.get("name") == "seller"
                for mapping in mappings
            ):
                raise KeycloakProvisioningError(
                    "Keycloak seller role assignment could not be verified."
                )
        except KeycloakProvisioningError:
            raise
        except HTTPError as error:
            logger.exception(
                "Keycloak seller role provisioning returned HTTP %s from %s.",
                error.code,
                error.url,
            )
            raise KeycloakProvisioningError("Keycloak seller role provisioning failed.") from error
        except (URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
            logger.exception("Keycloak seller role provisioning failed.")
            raise KeycloakProvisioningError("Keycloak seller role provisioning failed.") from error

    @staticmethod
    def _send(
        url: str,
        *,
        method: str = "GET",
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        content_type: str | None = None,
    ) -> bytes:
        request_headers = dict(headers or {})
        if content_type:
            request_headers["Content-Type"] = content_type
        request = Request(url, data=data, headers=request_headers, method=method)
        with urlopen(request, timeout=5) as response:
            return response.read()
