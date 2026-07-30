import pytest
from unittest.mock import MagicMock, patch
import os
from db_client import DBClient

@pytest.fixture
def mock_engine():
    return MagicMock()

@pytest.fixture
def mock_session():
    return MagicMock()

@pytest.fixture
def db_client_instance(mock_engine, mock_session):
    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://test:test@localhost/test",
            "SUPABASE_JWT_SECRET": "test-jwt-secret",
        }),
        patch("config.settings.SUPABASE_JWT_SECRET", "test-jwt-secret"),
        patch("config.settings.SUPABASE_URL", ""),
    ):
        client = DBClient()
        # Ensure session factory returns our mock session
        client.Session = MagicMock(return_value=mock_session)
        return client

def test_create_task(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    mock_result.__iter__.return_value = iter([{"id": "task_1", "user_id": "u1", "status": "pending"}])
    mock_session.execute.return_value = mock_result
    
    # Mock row mapping
    row = MagicMock()
    row._mapping = {"id": "task_1", "user_id": "u1", "status": "pending"}
    mock_result.__iter__.return_value = iter([row])

    result = db_client_instance.create_task("u1", "http://vid", "Title")
    
    assert result["id"] == "task_1"
    mock_session.execute.assert_called()
    args, _ = mock_session.execute.call_args
    assert "is_demo" in args[0].text
    assert args[1]["is_demo"] is False
    mock_session.commit.assert_called()


def test_create_task_can_mark_demo(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {
        "id": "task_demo",
        "user_id": "u1",
        "status": "pending",
        "is_demo": True,
    }
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    result = db_client_instance.create_task("u1", "http://vid", is_demo=True)

    assert result["is_demo"] is True
    args, _ = mock_session.execute.call_args
    assert args[1]["is_demo"] is True


def test_find_latest_inflight_task(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "task_inflight", "status": "processing"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    result = db_client_instance.find_latest_inflight_task("u1", "https://youtube.com/watch?v=abc")

    assert result["id"] == "task_inflight"
    args, _ = mock_session.execute.call_args
    assert "status IN ('pending', 'processing')" in args[0].text


def test_find_latest_task_with_valid_script_for_owner(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "task_cached", "status": "completed"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    result = db_client_instance.find_latest_task_with_valid_script_for_owner(
        "u1",
        "guest-1",
        "https://youtube.com/watch?v=abc",
    )

    assert result["id"] == "task_cached"
    args, _ = mock_session.execute.call_args
    assert "t.user_id = :user_id" in args[0].text
    assert "t.guest_id = :guest_id" in args[0].text
    assert args[1]["guest_id"] == "guest-1"
    assert "o.kind = 'script'" in args[0].text
    assert "CAST(o.content AS TEXT)" in args[0].text
    assert "'null'::jsonb" not in args[0].text


def test_find_latest_task_with_valid_script_uses_text_safe_content_check(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "task_cached", "status": "completed"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    result = db_client_instance.find_latest_task_with_valid_script_for_owner(
        "u1",
        None,
        "https://youtube.com/watch?v=abc",
    )

    assert result["id"] == "task_cached"
    args, _ = mock_session.execute.call_args
    assert "CAST(o.content AS TEXT)" in args[0].text
    assert "BTRIM(CAST(o.content AS TEXT)) <> 'null'" in args[0].text
    assert "'null'::jsonb" not in args[0].text

def test_get_task(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "task_1", "status": "completed"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    result = db_client_instance.get_task("task_1")
    assert result["id"] == "task_1"

def test_update_task_status(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "task_1"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    db_client_instance.update_task_status("task_1", status="processing", progress=50)
    
    # Verify execute called with update statement
    mock_session.execute.assert_called()
    args, kwargs = mock_session.execute.call_args
    sql_text = args[0].text
    assert "UPDATE tasks SET" in sql_text
    assert "status = :status" in sql_text
    assert "progress = :progress" in sql_text
    
    # Check params. They are usually the 2nd positional arg.
    if len(args) > 1:
        params = args[1]
    else:
        params = kwargs.get("params", {}) # But execute usually takes params as pos arg 2
        
    # If using text(query), parameters are passed as the second argument to execute
    assert params["status"] == "processing"
    assert params["progress"] == 50


def test_update_task_status_sanitizes_html_error(db_client_instance, mock_session):
    raw_html = (
        '<!DOCTYPE html><html><head><title>Just a moment...</title></head>'
        '<body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>'
    )

    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "task_1"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    db_client_instance.update_task_status("task_1", status="error", error=raw_html)
    args, kwargs = mock_session.execute.call_args
    params = args[1] if len(args) > 1 else kwargs.get("params", {})
    assert "blocking automated access" in params["error"]
    assert "<!DOCTYPE" not in params["error"]
    assert "challenge-platform" not in params["error"]


def test_update_task_status_fails_closed_on_missing_row(
    db_client_instance,
    mock_session,
):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    mock_result.__iter__.return_value = iter([])
    mock_session.execute.return_value = mock_result

    with pytest.raises(LookupError, match="was not updated"):
        db_client_instance.update_task_status("missing-task", status="processing")


def test_update_output_status_sanitizes_html_error(db_client_instance, mock_session):
    raw_html = (
        '<!DOCTYPE html><html><head><title>Just a moment...</title></head>'
        '<body><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></body></html>'
    )

    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "output_1"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    db_client_instance.update_output_status("output_1", status="error", error=raw_html)
    args, kwargs = mock_session.execute.call_args
    params = args[1] if len(args) > 1 else kwargs.get("params", {})
    assert "blocking automated access" in params["error"]
    assert "<!DOCTYPE" not in params["error"]


def test_update_output_status_fails_closed_on_missing_row(
    db_client_instance,
    mock_session,
):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    mock_result.__iter__.return_value = iter([])
    mock_session.execute.return_value = mock_result

    with pytest.raises(LookupError, match="was not updated"):
        db_client_instance.update_output_status(
            "missing-output",
            status="processing",
        )


def test_update_task_output_by_kind_fails_closed_on_missing_row(
    db_client_instance,
    mock_session,
):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    mock_result.__iter__.return_value = iter([])
    mock_session.execute.return_value = mock_result

    with pytest.raises(LookupError, match="was not updated"):
        db_client_instance.update_task_output_by_kind(
            "missing-task",
            "script",
            status="processing",
        )

def test_create_task_output(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row = MagicMock()
    row._mapping = {"id": "out_1", "kind": "script"}
    mock_result.__iter__.return_value = iter([row])
    mock_session.execute.return_value = mock_result

    result = db_client_instance.create_task_output("task_1", "u1", "script")
    assert result["id"] == "out_1"

def test_get_task_outputs(db_client_instance, mock_session):
    mock_result = MagicMock()
    mock_result.returns_rows = True
    row1 = MagicMock()
    row1._mapping = {"id": "out_1", "kind": "script"}
    row2 = MagicMock()
    row2._mapping = {"id": "out_2", "kind": "summary"}
    mock_result.__iter__.return_value = iter([row1, row2])
    mock_session.execute.return_value = mock_result

    results = db_client_instance.get_task_outputs("task_1")
    assert len(results) == 2

def test_validate_token_success(db_client_instance):
    with (
        patch('db_client.jwt.get_unverified_header', return_value={"alg": "HS256"}),
        patch('db_client.jwt.decode', return_value={"sub": "u1"}),
    ):
        user_id = db_client_instance.validate_token("Bearer token")
        assert user_id == "u1"

def test_validate_token_failure(db_client_instance):
    import jwt as pyjwt
    with (
        patch('db_client.jwt.get_unverified_header', return_value={"alg": "HS256"}),
        patch('db_client.jwt.decode', side_effect=pyjwt.InvalidTokenError("bad")),
    ):
        user_id = db_client_instance.validate_token("token")
        assert user_id is None


def test_validate_token_missing_secret(mock_engine, mock_session):
    """When _jwt_secret is empty and no JWKS, validate_token should return None."""
    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", ""),
        patch("config.settings.SUPABASE_URL", ""),
    ):
        client = DBClient()
        assert client.is_auth_configured() is False
        assert client.validate_token("Bearer some-token") is None


def test_validate_token_with_real_jwt(mock_engine, mock_session):
    """Use PyJWT to sign a real token and validate it end-to-end without mocking jwt.decode."""
    import jwt as pyjwt
    import time

    secret = "test-real-secret-key"
    user_id = "550e8400-e29b-41d4-a716-446655440000"
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, secret, algorithm="HS256")

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", secret),
        patch("config.settings.SUPABASE_URL", ""),
    ):
        client = DBClient()
        assert client.is_auth_configured() is True
        result = client.validate_token(f"Bearer {token}")
        assert result == user_id


def test_validate_token_expired_token(mock_engine, mock_session):
    """An expired JWT should return None."""
    import jwt as pyjwt
    import time

    secret = "test-secret-for-expiry"
    payload = {
        "sub": "some-user-id",
        "aud": "authenticated",
        "exp": int(time.time()) - 3600,  # expired 1 hour ago
        "iat": int(time.time()) - 7200,
    }
    token = pyjwt.encode(payload, secret, algorithm="HS256")

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", secret),
        patch("config.settings.SUPABASE_URL", ""),
    ):
        client = DBClient()
        assert client.validate_token(f"Bearer {token}") is None


def test_validate_token_wrong_audience(mock_engine, mock_session):
    """A token with wrong audience should return None."""
    import jwt as pyjwt
    import time

    secret = "test-secret-for-audience"
    payload = {
        "sub": "some-user-id",
        "aud": "wrong-audience",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, secret, algorithm="HS256")

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", secret),
        patch("config.settings.SUPABASE_URL", ""),
    ):
        client = DBClient()
        assert client.validate_token(f"Bearer {token}") is None


def test_validate_token_es256_via_jwks(mock_engine, mock_session):
    """Validate an ES256-signed JWT using mocked JWKS client."""
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric import ec
    import time

    # Generate an EC key pair for ES256
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    user_id = "es256-user-uuid-1234"
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, private_key, algorithm="ES256")

    # Mock PyJWKClient to return our public key
    mock_jwks_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = public_key
    mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", ""),
        patch("config.settings.SUPABASE_URL", "https://test.supabase.co"),
        patch("db_client.PyJWKClient", return_value=mock_jwks_client),
    ):
        client = DBClient()
        assert client.is_auth_configured() is True
        result = client.validate_token(f"Bearer {token}")
        assert result == user_id
        mock_jwks_client.get_signing_key_from_jwt.assert_called_once_with(token)


def test_validate_token_es256_expired(mock_engine, mock_session):
    """An expired ES256 JWT should return None."""
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric import ec
    import time

    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    payload = {
        "sub": "some-user",
        "aud": "authenticated",
        "exp": int(time.time()) - 3600,
        "iat": int(time.time()) - 7200,
    }
    token = pyjwt.encode(payload, private_key, algorithm="ES256")

    mock_jwks_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = public_key
    mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", ""),
        patch("config.settings.SUPABASE_URL", "https://test.supabase.co"),
        patch("db_client.PyJWKClient", return_value=mock_jwks_client),
    ):
        client = DBClient()
        assert client.validate_token(f"Bearer {token}") is None


def test_validate_token_hs256_fallback_when_both_configured(mock_engine, mock_session):
    """When both JWT secret and JWKS are configured, HS256 tokens use the secret (not JWKS)."""
    import jwt as pyjwt
    import time

    secret = "test-dual-config-secret"
    user_id = "dual-config-user"
    payload = {
        "sub": user_id,
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, secret, algorithm="HS256")

    mock_jwks_client = MagicMock()

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", secret),
        patch("config.settings.SUPABASE_URL", "https://test.supabase.co"),
        patch("db_client.PyJWKClient", return_value=mock_jwks_client),
    ):
        client = DBClient()
        result = client.validate_token(f"Bearer {token}")
        assert result == user_id
        # JWKS client should NOT have been called for HS256 tokens
        mock_jwks_client.get_signing_key_from_jwt.assert_not_called()


def test_validate_token_jwks_connection_error(mock_engine, mock_session):
    """When JWKS endpoint is unreachable, validate_token returns None gracefully (no 500)."""
    import jwt as pyjwt
    from cryptography.hazmat.primitives.asymmetric import ec
    from jwt.exceptions import PyJWKClientConnectionError
    import time

    private_key = ec.generate_private_key(ec.SECP256R1())
    payload = {
        "sub": "some-user",
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    token = pyjwt.encode(payload, private_key, algorithm="ES256")

    mock_jwks_client = MagicMock()
    mock_jwks_client.get_signing_key_from_jwt.side_effect = PyJWKClientConnectionError(
        'Fail to fetch data from the url, err: "HTTP Error 404: Not Found"'
    )

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", ""),
        patch("config.settings.SUPABASE_URL", "https://test.supabase.co"),
        patch("db_client.PyJWKClient", return_value=mock_jwks_client),
    ):
        client = DBClient()
        # Should return None, NOT raise an exception
        result = client.validate_token(f"Bearer {token}")
        assert result is None


def test_jwks_url_uses_auth_v1_path(mock_engine, mock_session):
    """Verify JWKS client is initialized with the correct Supabase auth/v1 path."""
    mock_jwks_constructor = MagicMock()

    with (
        patch("db_client.create_engine", return_value=mock_engine),
        patch("db_client.scoped_session", return_value=MagicMock(return_value=mock_session)),
        patch.dict(os.environ, {"DATABASE_URL": "postgresql://test:test@localhost/test"}),
        patch("config.settings.SUPABASE_JWT_SECRET", ""),
        patch("config.settings.SUPABASE_URL", "https://myproject.supabase.co"),
        patch("db_client.PyJWKClient", mock_jwks_constructor),
    ):
        DBClient()
        mock_jwks_constructor.assert_called_once_with(
            "https://myproject.supabase.co/auth/v1/.well-known/jwks.json",
            cache_keys=True,
        )


def test_check_and_consume_quota_success(db_client_instance, mock_session):
    # Mock get_profile
    mock_result_profile = MagicMock()
    mock_result_profile.returns_rows = True
    row_prof = MagicMock()
    row_prof._mapping = {"id": "u1", "usage_count": 0, "usage_limit": 3, "extra_credits": 0}
    
    # Mock update
    mock_result_update = MagicMock()
    
    mock_session.execute.side_effect = [
        mock_result_profile, # get_profile response
        mock_result_update   # update response
    ]
    mock_result_profile.__iter__.return_value = iter([row_prof])

    assert db_client_instance.check_and_consume_quota("u1") is True
    assert mock_session.commit.call_count >= 1

def test_check_and_consume_quota_failed(db_client_instance, mock_session):
    # Mock get_profile returning usage = limit
    mock_result_profile = MagicMock()
    mock_result_profile.returns_rows = True
    row_prof = MagicMock()
    row_prof._mapping = {"id": "u1", "usage_count": 3, "usage_limit": 3, "extra_credits": 0}
    mock_result_profile.__iter__.return_value = iter([row_prof])

    mock_session.execute.return_value = mock_result_profile
    
    assert db_client_instance.check_and_consume_quota("u1") is False

def test_check_and_consume_quota_extra_credits(db_client_instance, mock_session):
    # Mock get_profile returning usage = limit but extra credits
    mock_result_profile = MagicMock()
    mock_result_profile.returns_rows = True
    row_prof = MagicMock()
    row_prof._mapping = {"id": "u1", "usage_count": 3, "usage_limit": 3, "extra_credits": 1}
    mock_result_profile.__iter__.return_value = iter([row_prof])
    
    mock_session.execute.side_effect = [
        mock_result_profile, # get_profile
        MagicMock()          # update extra_credits
    ]

    assert db_client_instance.check_and_consume_quota("u1") is True
