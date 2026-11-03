import pytest
from pydantic import ValidationError

from shop_api.schemas import SellerApplicationRequest, SellerApplicationReviewRequest


def application_payload(**overrides: object) -> dict[str, object]:
    return {
        "applicant_type": "individual",
        "legal_name": "  Test   Seller  ",
        "representative_name": None,
        "store_name": "  Test   Store ",
        "contact_phone": "+905551234567",
        "city": " Istanbul ",
        "district": " Kadikoy ",
        "primary_category": " Home   Care ",
        "business_description": "  Quality home products for everyday life.  ",
        **overrides,
    }


def test_seller_application_schema_normalizes_text_and_accepts_optional_representative() -> None:
    application = SellerApplicationRequest.model_validate(application_payload())

    assert application.legal_name == "Test Seller"
    assert application.representative_name is None
    assert application.store_name == "Test Store"
    assert application.city == "Istanbul"
    assert application.primary_category == "Home Care"
    assert application.business_description == "Quality home products for everyday life."


@pytest.mark.parametrize(
    "overrides",
    [
        {"applicant_type": "company", "representative_name": "A"},
        {"legal_name": "Invalid\x00 Name"},
        {"store_name": "Invalid/Store"},
    ],
    ids=["representative-name-too-short", "non-printable-text", "invalid-store-name"],
)
def test_seller_application_schema_rejects_invalid_text(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        SellerApplicationRequest.model_validate(application_payload(**overrides))


@pytest.mark.parametrize("action", ["request_changes", "reject"])
def test_review_request_requires_applicant_note_for_non_approval_decisions(action: str) -> None:
    with pytest.raises(ValidationError, match="başvuru sahibine açıklama zorunludur"):
        SellerApplicationReviewRequest.model_validate({"action": action})


def test_approval_review_does_not_require_notes() -> None:
    request = SellerApplicationReviewRequest.model_validate({"action": "approve"})

    assert request.applicant_note is None
    assert request.admin_note is None
