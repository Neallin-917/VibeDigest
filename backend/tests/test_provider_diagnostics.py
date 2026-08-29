from utils.provider_diagnostics import provider_failure_message, safe_provider_endpoint


class ProviderError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        super().__init__(message)


def test_provider_failure_message_keeps_exception_body_out_of_output():
    secret = "sk-secret-value"
    error = ProviderError(403, f"Authorization: Bearer {secret}")

    message = provider_failure_message(error)

    assert message == "Provider request failed (HTTP 403)."
    assert secret not in message
    assert "Authorization" not in message


def test_provider_failure_message_without_safe_status_is_generic():
    error = RuntimeError("api_key=sk-secret-value")

    assert provider_failure_message(error) == "Provider request failed."


def test_safe_provider_endpoint_removes_credentials_and_query_data():
    endpoint = "https://user:password@example.test/private/sk-secret-value?api_key=sk-secret-value"

    assert safe_provider_endpoint(endpoint) == "https://example.test"


def test_safe_provider_endpoint_hides_an_invalid_endpoint():
    assert safe_provider_endpoint("https://example.test:invalid?api_key=sk-secret-value") == "<configured>"
