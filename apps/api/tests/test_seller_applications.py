from datetime import UTC, datetime

import pytest
from conftest import create_test_token
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from shop_api.keycloak_admin import KeycloakProvisioningError
from shop_api.models import SellerApplicationAudit


def application_payload(**overrides: object) -> dict[str, object]:
    return {
        "applicant_type": "company",
        "legal_name": "Liva Test Ticaret",
        "representative_name": "Test Yetkili",
        "store_name": f"Liva Store {int(datetime.now(UTC).timestamp() * 1000)}",
        "contact_phone": "+905551234567",
        "city": "Istanbul",
        "district": "Kadikoy",
        "primary_category": "Home Care",
        "business_description": "Quality home products for everyday life.",
        **overrides,
    }


def auth_headers(
    client: TestClient,
    subject: str,
    roles: list[str] | None = None,
) -> dict[str, str]:
    token = create_test_token(
        client,
        subject=subject,
        email=f"{subject}@example.com",
        roles=roles or ["buyer"],
    )
    return {"Authorization": f"Bearer {token}"}


def test_buyer_can_create_read_and_submit_own_application(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "buyer-one")
    response = client.post(
        "/api/v1/seller-applications",
        json={**application_payload(), "owner_subject": "attacker-subject"},
        headers=headers,
    )

    assert response.status_code == 201
    application = response.json()
    assert application["status"] == "draft"
    assert "owner_subject" not in application
    assert "admin_note" not in application
    assert (
        client.get(
            "/api/v1/seller-applications/me",
            headers=headers,
        ).json()["id"]
        == application["id"]
    )

    duplicate = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=headers,
    )
    assert duplicate.status_code == 409

    submitted = client.post(
        "/api/v1/seller-applications/me/submit",
        headers=headers,
    )
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"
    assert (
        client.put(
            "/api/v1/seller-applications/me",
            json=application_payload(),
            headers=headers,
        ).status_code
        == 404
    )


@pytest.mark.parametrize(
    "overrides",
    [
        {"applicant_type": "unknown"},
        {"applicant_type": "company", "representative_name": None},
        {"contact_phone": "05551234567"},
        {"store_name": "Bad/Store"},
        {"business_description": "too short"},
        {"legal_name": " "},
    ],
)
def test_invalid_application_fields_are_rejected_without_persistence(
    client: TestClient,
    overrides: dict[str, object],
) -> None:
    response = client.post(
        "/api/v1/seller-applications",
        json=application_payload(**overrides),
        headers=auth_headers(client, "invalid-buyer"),
    )

    assert response.status_code == 422
    assert (
        client.get(
            "/api/v1/seller-applications/me",
            headers=auth_headers(client, "invalid-buyer"),
        ).json()
        is None
    )


def test_only_authenticated_buyers_can_create_applications(client: TestClient) -> None:
    anonymous_response = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
    )
    non_buyer_response = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=auth_headers(client, "support-user", ["support"]),
    )

    assert anonymous_response.status_code == 401
    assert non_buyer_response.status_code == 401


def test_admin_review_changes_and_approval_assigns_seller_role(
    client: TestClient,
    engine,
) -> None:
    buyer_headers = auth_headers(client, "applicant-123")
    admin_headers = auth_headers(client, "reviewer-456", ["admin"])
    create_response = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=buyer_headers,
    )
    application_id = create_response.json()["id"]
    submitted_response = client.post(
        "/api/v1/seller-applications/me/submit",
        headers=buyer_headers,
    )
    assert submitted_response.json()["status"] == "submitted"

    assert (
        client.get(
            "/api/v1/seller-applications",
            headers=buyer_headers,
        ).status_code
        == 403
    )
    assert (
        client.get(
            "/api/v1/seller-applications",
            headers=admin_headers,
        ).status_code
        == 200
    )

    begin_response = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "begin_review"},
        headers=admin_headers,
    )
    assert begin_response.status_code == 200
    assert begin_response.json()["status"] == "under_review"

    requested_changes = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={
            "action": "request_changes",
            "applicant_note": "Lütfen mağaza kategorisini netleştirin.",
            "admin_note": "Manual reviewer note.",
        },
        headers=admin_headers,
    )
    assert requested_changes.status_code == 200
    assert requested_changes.json()["status"] == "changes_requested"
    assert requested_changes.json()["applicant_note"] == ("Lütfen mağaza kategorisini netleştirin.")
    buyer_application = client.get(
        "/api/v1/seller-applications/me",
        headers=buyer_headers,
    )
    assert "admin_note" not in buyer_application.json()

    updated_payload = application_payload(
        primary_category="Personal Care",
        store_name=f"Updated Store {int(datetime.now(UTC).timestamp() * 1000)}",
    )
    update_response = client.put(
        "/api/v1/seller-applications/me",
        json=updated_payload,
        headers=buyer_headers,
    )
    assert update_response.status_code == 200
    resubmitted = client.post(
        "/api/v1/seller-applications/me/submit",
        headers=buyer_headers,
    )
    assert resubmitted.json()["status"] == "submitted"
    reviewed_again = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "begin_review"},
        headers=admin_headers,
    )
    assert reviewed_again.json()["status"] == "under_review"

    assigned_subjects: list[str] = []
    client.app.state.keycloak_role_provisioner.assign_seller_role = assigned_subjects.append
    approved_response = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "approve", "admin_note": "Approved for seller workspace."},
        headers=admin_headers,
    )

    assert approved_response.status_code == 200
    assert approved_response.json()["status"] == "approved"
    assert approved_response.json()["owner_subject"] == "applicant-123"
    assert approved_response.json()["admin_note"] == "Approved for seller workspace."
    assert assigned_subjects == ["applicant-123"]
    assert (
        client.get(
            "/api/v1/seller-applications/me",
            headers=buyer_headers,
        ).json()["status"]
        == "approved"
    )

    with sessionmaker(bind=engine, class_=Session)() as session:
        audit = session.scalars(
            select(SellerApplicationAudit)
            .where(SellerApplicationAudit.application_id == application_id)
            .order_by(SellerApplicationAudit.id)
        ).all()
    assert [entry.to_status for entry in audit] == [
        "draft",
        "submitted",
        "under_review",
        "changes_requested",
        "submitted",
        "under_review",
        "approval_pending",
        "approved",
    ]


def test_keycloak_role_assignment_failure_leaves_application_pending(
    client: TestClient,
) -> None:
    buyer_headers = auth_headers(client, "pending-applicant")
    admin_headers = auth_headers(client, "pending-reviewer", ["admin"])
    application_id = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=buyer_headers,
    ).json()["id"]
    client.post(
        "/api/v1/seller-applications/me/submit",
        headers=buyer_headers,
    )
    client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "begin_review"},
        headers=admin_headers,
    )

    def fail_provisioning(_subject: str) -> None:
        raise KeycloakProvisioningError("Identity provider unavailable.")

    client.app.state.keycloak_role_provisioner.assign_seller_role = fail_provisioning
    approval_response = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )

    assert approval_response.status_code == 503
    assert (
        client.get(
            "/api/v1/seller-applications/me",
            headers=buyer_headers,
        ).json()["status"]
        == "approval_pending"
    )
    assigned_subjects: list[str] = []
    client.app.state.keycloak_role_provisioner.assign_seller_role = assigned_subjects.append
    retry_response = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert retry_response.status_code == 200
    assert retry_response.json()["status"] == "approved"
    assert assigned_subjects == ["pending-applicant"]

    duplicate_approval = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )
    assert duplicate_approval.status_code == 409
    assert assigned_subjects == ["pending-applicant"]


def test_invalid_review_transition_does_not_change_application(
    client: TestClient,
) -> None:
    buyer_headers = auth_headers(client, "draft-applicant")
    admin_headers = auth_headers(client, "draft-reviewer", ["admin"])
    application_id = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=buyer_headers,
    ).json()["id"]

    response = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "approve"},
        headers=admin_headers,
    )

    assert response.status_code == 409
    assert (
        client.get(
            "/api/v1/seller-applications/me",
            headers=buyer_headers,
        ).json()["status"]
        == "draft"
    )
