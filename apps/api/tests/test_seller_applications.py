from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from conftest import create_test_token
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from shop_api.keycloak_admin import KeycloakProvisioningError
from shop_api.models import SellerApplicationAudit
from shop_api.routes.seller_applications import review_application
from shop_api.schemas import SellerApplicationReviewRequest


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
    seller_response = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=auth_headers(client, "seller-user", ["seller"]),
    )

    assert anonymous_response.status_code == 401
    assert non_buyer_response.status_code == 401
    assert seller_response.status_code == 403


def test_update_rejects_a_store_name_used_by_another_active_application(
    client: TestClient,
) -> None:
    first_headers = auth_headers(client, "first-applicant")
    second_headers = auth_headers(client, "second-applicant")
    first_payload = application_payload(store_name="First Test Store")
    second_payload = application_payload(store_name="Second Test Store")
    first_application = client.post(
        "/api/v1/seller-applications",
        json=first_payload,
        headers=first_headers,
    )
    client.post(
        "/api/v1/seller-applications",
        json=second_payload,
        headers=second_headers,
    )

    response = client.put(
        "/api/v1/seller-applications/me",
        json={**first_payload, "store_name": "Second Test Store"},
        headers=first_headers,
    )

    assert first_application.status_code == 201
    assert response.status_code == 409
    assert (
        client.get("/api/v1/seller-applications/me", headers=first_headers).json()["store_name"]
        == "First Test Store"
    )


def test_submit_and_withdraw_return_not_found_when_no_editable_application_exists(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "no-application")

    submit_response = client.post("/api/v1/seller-applications/me/submit", headers=headers)
    withdraw_response = client.post("/api/v1/seller-applications/me/withdraw", headers=headers)

    assert submit_response.status_code == 404
    assert withdraw_response.status_code == 404


def test_buyer_can_withdraw_draft_and_cannot_submit_or_withdraw_it_again(
    client: TestClient,
) -> None:
    headers = auth_headers(client, "withdrawing-applicant")
    created = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=headers,
    )
    application_id = created.json()["id"]

    withdrawn = client.post("/api/v1/seller-applications/me/withdraw", headers=headers)
    submit_again = client.post("/api/v1/seller-applications/me/submit", headers=headers)
    withdraw_again = client.post("/api/v1/seller-applications/me/withdraw", headers=headers)

    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "withdrawn"
    assert submit_again.status_code == 404
    assert withdraw_again.status_code == 404
    assert client.get("/api/v1/seller-applications/me", headers=headers).json() is None
    assert application_id == withdrawn.json()["id"]


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


@pytest.mark.parametrize(
    "action",
    ["begin_review", "request_changes", "reject"],
)
def test_review_actions_reject_draft_applications(
    client: TestClient,
    action: str,
) -> None:
    buyer_headers = auth_headers(client, f"draft-{action}-applicant")
    admin_headers = auth_headers(client, f"draft-{action}-reviewer", ["admin"])
    application_id = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=buyer_headers,
    ).json()["id"]
    payload: dict[str, str] = {"action": action}
    if action in {"request_changes", "reject"}:
        payload["applicant_note"] = "Please provide more application details."

    response = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json=payload,
        headers=admin_headers,
    )

    assert response.status_code == 409
    assert (
        client.get("/api/v1/seller-applications/me", headers=buyer_headers).json()["status"]
        == "draft"
    )


def test_admin_can_reject_application_and_review_missing_application_is_not_found(
    client: TestClient,
) -> None:
    buyer_headers = auth_headers(client, "rejected-applicant")
    admin_headers = auth_headers(client, "rejecting-admin", ["admin"])
    application_id = client.post(
        "/api/v1/seller-applications",
        json=application_payload(),
        headers=buyer_headers,
    ).json()["id"]
    client.post("/api/v1/seller-applications/me/submit", headers=buyer_headers)
    client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={"action": "begin_review"},
        headers=admin_headers,
    )

    rejected = client.post(
        f"/api/v1/seller-applications/{application_id}/review",
        json={
            "action": "reject",
            "applicant_note": "Please revise the application before applying again.",
            "admin_note": "Required details were not provided.",
        },
        headers=admin_headers,
    )
    missing = client.post(
        "/api/v1/seller-applications/999999/review",
        json={"action": "approve"},
        headers=admin_headers,
    )

    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["applicant_note"] == (
        "Please revise the application before applying again."
    )
    assert rejected.json()["admin_note"] == "Required details were not provided."
    assert missing.status_code == 404


def test_review_handler_rejects_an_invalid_internal_action_value() -> None:
    class ExistingApplicationDatabase:
        def get(self, _model: object, _application_id: int) -> SimpleNamespace:
            return SimpleNamespace(status="draft")

    payload = SellerApplicationReviewRequest.model_construct(action="unsupported")

    with pytest.raises(HTTPException) as error:
        review_application(
            application_id=1,
            payload=payload,
            request=SimpleNamespace(),
            admin=SimpleNamespace(subject="admin-user"),
            db=ExistingApplicationDatabase(),
        )

    assert error.value.status_code == 422
