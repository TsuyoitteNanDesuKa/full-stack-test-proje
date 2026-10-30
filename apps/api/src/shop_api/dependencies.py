import logging
from typing import Annotated, Any

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt.exceptions import PyJWKClientConnectionError, PyJWKClientError

from shop_api.security import AuthenticatedUser

logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Kimlik doğrulaması gerekli.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> AuthenticatedUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        signing_key = request.app.state.jwks_client.get_signing_key_from_jwt(
            credentials.credentials
        )
        claims: dict[str, Any] = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=request.app.state.oidc_audience,
            issuer=request.app.state.oidc_issuer,
            options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        )
    except PyJWKClientConnectionError:
        logger.exception("Keycloak JWKS endpoint is unavailable.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kimlik sağlayıcısına şu anda ulaşılamıyor.",
        ) from None
    except (jwt.InvalidTokenError, PyJWKClientError, TypeError, ValueError):
        raise _unauthorized() from None

    subject = claims.get("sub")
    role_claim = claims.get("realm_access")
    role_values = role_claim.get("roles") if isinstance(role_claim, dict) else None
    if not isinstance(subject, str) or not subject or not isinstance(role_values, list):
        raise _unauthorized()

    roles = frozenset(role for role in role_values if isinstance(role, str))
    if not roles.intersection({"buyer", "seller", "admin"}):
        raise _unauthorized()

    email = claims.get("email")
    return AuthenticatedUser(
        subject=subject,
        email=email if isinstance(email, str) else None,
        roles=roles,
    )


def get_admin_user(
    current_user: Annotated[AuthenticatedUser, Depends(get_current_user)],
) -> AuthenticatedUser:
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bu işlem için yönetici yetkisi gereklidir.",
        )
    return current_user
