import importlib.util
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "ops_audit.py"
spec = importlib.util.spec_from_file_location("vibedigest_ops_audit", SCRIPT_PATH)
ops_audit = importlib.util.module_from_spec(spec)
assert spec.loader is not None
sys.modules[spec.name] = ops_audit
spec.loader.exec_module(ops_audit)


def test_parse_env_file_ignores_comments_and_strips_quotes(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "# ignored",
                "OPENAI_BASE_URL='http://localhost:8317/v1'",
                'MODEL_ALIAS_FAST="gpt-5.4"',
                "MALFORMED",
            ]
        )
    )

    assert ops_audit.parse_env_file(env_file) == {
        "OPENAI_BASE_URL": "http://localhost:8317/v1",
        "MODEL_ALIAS_FAST": "gpt-5.4",
    }


def test_redact_env_value_hides_sensitive_keys():
    assert ops_audit.redact_env_value("OPENAI_API_KEY", "sk-secret") == "<redacted:set>"
    assert ops_audit.redact_env_value("DATABASE_URL", "postgres://user:pass@host/db") == (
        "postgres://***@host/db"
    )
    assert ops_audit.redact_env_value("NEXT_PUBLIC_API_URL", "http://localhost:16081") == (
        "http://localhost:16081"
    )


def test_build_env_snapshot_redacts_selected_values(tmp_path):
    env_file = tmp_path / ".env.local"
    env_file.write_text(
        "\n".join(
            [
                "OPENAI_API_KEY=sk-secret",
                "OPENAI_BASE_URL=http://localhost:8317/v1",
                "SUPABASE_URL=https://example.supabase.co",
            ]
        )
    )

    snapshot = ops_audit.build_env_snapshot([env_file])

    assert snapshot[str(env_file)] == {
        "OPENAI_API_KEY": "<redacted:set>",
        "OPENAI_BASE_URL": "http://localhost:8317/v1",
        "SUPABASE_URL": "https://example.supabase.co",
    }


def test_describe_backend_url_roles_accepts_public_api_with_railway_origin():
    lines = ops_audit.describe_backend_url_roles(
        {
            "NEXT_PUBLIC_API_URL": "https://api.vibedigest.io",
            "BACKEND_API_URL": "https://api.vibedigest.io",
            "BACKEND_ORIGIN_URL": "https://vibedigest-production.up.railway.app",
        }
    )

    assert "public API role: OK canonical api.vibedigest.io" in lines
    assert "server backend role: OK Railway origin" in lines


def test_describe_backend_url_roles_warns_when_server_uses_public_api_domain():
    lines = ops_audit.describe_backend_url_roles(
        {
            "NEXT_PUBLIC_API_URL": "https://api.vibedigest.io",
            "BACKEND_API_URL": "https://api.vibedigest.io",
        }
    )

    assert any("WARN set BACKEND_ORIGIN_URL" in line for line in lines)
