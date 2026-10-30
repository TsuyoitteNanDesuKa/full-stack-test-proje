from shop_api.security import AuthenticatedUser


def test_admin_role_is_derived_from_verified_identity_roles() -> None:
    identity = AuthenticatedUser(
        subject="keycloak-admin-subject",
        email="admin@example.com",
        roles=frozenset({"buyer", "admin"}),
    )

    assert identity.is_admin


def test_buyer_role_does_not_grant_admin_access() -> None:
    identity = AuthenticatedUser(
        subject="keycloak-buyer-subject",
        email="customer@example.com",
        roles=frozenset({"buyer"}),
    )

    assert not identity.is_admin
