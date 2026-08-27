"""Extended tests for config.py — targeting uncovered branches."""

import importlib
import os
from unittest.mock import patch
import pytest

import config as config_module
from config import Settings, _load_provider_defaults


# ---------------------------------------------------------------------------
# _load_provider_defaults — file resolution
# ---------------------------------------------------------------------------

class TestLoadProviderDefaults:
    def test_missing_file_raises_with_checked_paths(self):
        with patch("config.Path.exists", return_value=False):
            with pytest.raises(FileNotFoundError, match="LLM provider defaults not found"):
                _load_provider_defaults()

    def test_successful_load_returns_dict(self):
        result = _load_provider_defaults()
        assert "openrouter" in result
        assert "smart" in result["openrouter"]
        assert "fast" in result["openrouter"]


# ---------------------------------------------------------------------------
# Settings.get_temperature
# ---------------------------------------------------------------------------

class TestGetTemperature:
    def test_none_model_returns_default(self):
        s = Settings()
        result = s.get_temperature(None)
        assert result == s.DEFAULT_TEMPERATURE

    def test_empty_string_returns_default(self):
        s = Settings()
        result = s.get_temperature("")
        assert result == s.DEFAULT_TEMPERATURE

    def test_gpt5_returns_reasoning_temp(self):
        s = Settings()
        result = s.get_temperature("gpt-5-turbo")
        assert result == s.REASONING_TEMPERATURE

    def test_o1_variant_returns_reasoning_temp(self):
        s = Settings()
        result = s.get_temperature("o1-mini")
        assert result == s.REASONING_TEMPERATURE

    def test_gpt4o_exact_returns_reasoning_temp(self):
        s = Settings()
        result = s.get_temperature("gpt-4o")
        assert result == s.REASONING_TEMPERATURE

    def test_gemini_pro_returns_reasoning_temp(self):
        s = Settings()
        result = s.get_temperature("gemini-1.5-pro")
        assert result == s.REASONING_TEMPERATURE

    def test_gemini_flash_returns_default(self):
        s = Settings()
        result = s.get_temperature("gemini-1.5-flash")
        assert result == s.DEFAULT_TEMPERATURE

    def test_smart_model_alias_returns_reasoning_temp(self):
        s = Settings()
        # Directly set the alias so MODEL_ALIAS_SMART matches the name
        s.MODEL_ALIAS_SMART = "my-custom-smart-model"
        result = s.get_temperature("my-custom-smart-model")
        assert result == s.REASONING_TEMPERATURE

    def test_regular_model_returns_default(self):
        s = Settings()
        result = s.get_temperature("gpt-4o-mini")
        assert result == s.DEFAULT_TEMPERATURE


# ---------------------------------------------------------------------------
# Settings.MODEL_SMART / MODEL_FAST — core model resolution
# ---------------------------------------------------------------------------

class TestModelSmartFast:
    @pytest.mark.parametrize(
        ("supabase_url", "jwt_secret", "expected"),
        [
            ("https://example.supabase.co", "", "jwks"),
            ("https://example.supabase.co", "legacy-secret", "jwks+hs256"),
            ("", "legacy-secret", "hs256"),
            ("", "", "missing"),
        ],
    )
    def test_jwt_verification_mode(
        self,
        supabase_url: str,
        jwt_secret: str,
        expected: str,
    ):
        s = Settings()
        s.SUPABASE_URL = supabase_url
        s.SUPABASE_JWT_SECRET = jwt_secret

        assert s.JWT_VERIFICATION_MODE == expected

    def test_openrouter_runtime_contract_uses_shared_defaults(self):
        s = Settings()
        s.OPENAI_BASE_URL = None
        s.MODEL_ALIAS_SMART = None
        s.MODEL_ALIAS_FAST = None
        s.LLM_PROVIDER = None

        assert s.LLM_PROVIDER == "openrouter"
        assert s.MODEL_SMART == "openai/gpt-5.6-luna"
        assert s.MODEL_FAST == "openai/gpt-5.6-luna"

    def test_custom_runtime_contract_uses_shared_defaults(self):
        s = Settings()
        s.OPENAI_BASE_URL = "http://localhost:8317/v1"
        s.MODEL_ALIAS_SMART = None
        s.MODEL_ALIAS_FAST = None
        s.LLM_PROVIDER = None

        assert s.LLM_PROVIDER == "custom"
        assert s.MODEL_SMART == "gpt-5.6-luna"
        assert s.MODEL_FAST == "gpt-5.6-luna"

    def test_explicit_openai_provider_uses_luna_defaults(self):
        s = Settings()
        s.LLM_RUNTIME = "api"
        s.LLM_PROVIDER_ENV = "openai"
        s.MODEL_ALIAS_SMART = None
        s.MODEL_ALIAS_FAST = None

        assert s.LLM_PROVIDER == "openai"
        assert s.MODEL_SMART == "gpt-5.6-luna"
        assert s.MODEL_FAST == "gpt-5.6-luna"

    def test_local_codex_runtime_uses_shared_luna_defaults(self):
        s = Settings()
        s.LLM_RUNTIME = "codex_local"
        s.MODEL_ALIAS_SMART = None
        s.MODEL_ALIAS_FAST = None

        assert s.LLM_PROVIDER == "codex_local"
        assert s.MODEL_SMART == "gpt-5.6-luna"
        assert s.MODEL_FAST == "gpt-5.6-luna"

    def test_local_codex_runtime_is_rejected_in_production(self):
        s = Settings()
        s.LLM_RUNTIME = "codex_local"

        with patch.dict(os.environ, {"RAILWAY_PROJECT_ID": "production-project"}):
            with pytest.raises(RuntimeError, match="only allowed on trusted private"):
                s._validate_required_env()

    def test_trusted_codex_worker_is_allowed_on_non_railway_private_runner(self):
        s = Settings()
        s.LLM_RUNTIME = "codex_local"

        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "WORKER_PROFILE": "trusted_codex",
                "RAILWAY_PROJECT_ID": "",
                "DEV_AUTH_BYPASS": "false",
                "MOCK_MODE": "false",
            },
            clear=False,
        ):
            s._validate_required_env()

    def test_production_application_accepts_jwks_without_legacy_jwt_secret(self):
        s = Settings()
        s.SUPABASE_URL = "https://example.supabase.co"
        s.SUPABASE_SERVICE_KEY = "service-key"
        s.SUPABASE_JWT_SECRET = ""
        s.OPENAI_API_KEY = "api-key"
        s.LLM_RUNTIME = "api"

        with patch.dict(
            os.environ,
            {
                "APP_ENV": "production",
                "DATABASE_URL": "postgresql://example",
                "DEV_AUTH_BYPASS": "false",
                "MOCK_MODE": "false",
                "OPENROUTER_API_KEY": "",
                "PYTEST_CURRENT_TEST": "",
                "RAILWAY_PROJECT_ID": "",
                "VIBEDIGEST_PROCESS_ROLE": "application",
            },
            clear=False,
        ), patch.dict(config_module.sys.modules, clear=False):
            config_module.sys.modules.pop("pytest", None)
            s._validate_required_env()

    def test_podcast_discovery_process_does_not_require_an_llm_api_key(self):
        s = Settings()
        s.SUPABASE_URL = "https://example.supabase.co"
        s.SUPABASE_SERVICE_KEY = "service-key"
        s.SUPABASE_JWT_SECRET = "jwt-secret"
        s.OPENAI_API_KEY = None
        s.LLM_RUNTIME = "api"

        with patch.dict(
            os.environ,
            {
                "VIBEDIGEST_PROCESS_ROLE": "podcast_discovery",
                "DATABASE_URL": "postgresql://example",
                "OPENROUTER_API_KEY": "",
            },
            clear=False,
        ):
            s._validate_required_env()

    def test_unknown_process_role_is_rejected(self):
        s = Settings()

        with patch.dict(
            os.environ,
            {"VIBEDIGEST_PROCESS_ROLE": "mystery"},
            clear=False,
        ):
            with pytest.raises(RuntimeError, match="VIBEDIGEST_PROCESS_ROLE"):
                s._validate_required_env()

    def test_default_provider_is_openrouter_when_no_custom_base_url(self):
        original = os.environ.get("OPENAI_BASE_URL")
        try:
            os.environ.pop("OPENAI_BASE_URL", None)
            reloaded = importlib.reload(config_module)
            assert reloaded.settings.LLM_PROVIDER == "openrouter"
        finally:
            if original is None:
                os.environ.pop("OPENAI_BASE_URL", None)
            else:
                os.environ["OPENAI_BASE_URL"] = original
            importlib.reload(config_module)

    def test_provider_resolves_to_custom_when_base_url_is_present(self):
        s = Settings()
        s.OPENAI_BASE_URL = "http://localhost:8317/v1"
        s.LLM_PROVIDER = None
        assert s.LLM_PROVIDER == "custom"

    def test_alias_overrides_provider_default(self):
        s = Settings()
        s.MODEL_ALIAS_SMART = "my-custom-model"
        assert s.MODEL_SMART == "my-custom-model"

    def test_no_alias_uses_provider_default(self):
        s = Settings()
        s.MODEL_ALIAS_SMART = None
        s.OPENAI_BASE_URL = None
        s.LLM_PROVIDER = None
        assert s.MODEL_SMART == "openai/gpt-5.6-luna"

    def test_fast_alias_overrides_default(self):
        s = Settings()
        s.MODEL_ALIAS_FAST = "my-fast-model"
        assert s.MODEL_FAST == "my-fast-model"

    def test_fast_no_alias_uses_provider_default(self):
        s = Settings()
        s.MODEL_ALIAS_FAST = None
        s.OPENAI_BASE_URL = None
        s.LLM_PROVIDER = None
        assert s.MODEL_FAST == "openai/gpt-5.6-luna"

    def test_custom_provider_defaults_come_from_shared_registry(self):
        s = Settings()
        s.MODEL_ALIAS_SMART = None
        s.MODEL_ALIAS_FAST = None
        s.OPENAI_BASE_URL = "http://localhost:8317/v1"
        s.LLM_PROVIDER = None
        assert s.MODEL_SMART == "gpt-5.6-luna"
        assert s.MODEL_FAST == "gpt-5.6-luna"

    def test_unknown_provider_override_raises(self):
        s = Settings()
        try:
            s.LLM_PROVIDER = "unknown_provider"
        except ValueError as exc:
            assert "Unsupported provider override" in str(exc)
        else:
            raise AssertionError("Expected unsupported provider to raise ValueError")


# ---------------------------------------------------------------------------
# Backward-compatible aliases
# ---------------------------------------------------------------------------

class TestBackwardCompatAliases:
    def test_comprehension_models_returns_smart_list(self):
        s = Settings()
        assert s.OPENAI_COMPREHENSION_MODELS == [s.MODEL_SMART]

    def test_summary_models_returns_smart_list(self):
        s = Settings()
        assert s.OPENAI_SUMMARY_MODELS == [s.MODEL_SMART]

    def test_translation_model_returns_fast(self):
        s = Settings()
        assert s.OPENAI_TRANSLATION_MODEL == s.MODEL_FAST

    def test_helper_model_returns_fast(self):
        s = Settings()
        assert s.OPENAI_HELPER_MODEL == s.MODEL_FAST

    def test_alias_set_flows_through(self):
        s = Settings()
        s.MODEL_ALIAS_FAST = "fast-model"
        assert s.OPENAI_TRANSLATION_MODEL == "fast-model"
        assert s.OPENAI_HELPER_MODEL == "fast-model"


# ---------------------------------------------------------------------------
# Settings._fix_docker_host_for_local_dev
# ---------------------------------------------------------------------------

class TestFixDockerHostForLocalDev:
    def test_no_base_url_does_nothing(self):
        s = Settings()
        s.OPENAI_BASE_URL = None
        # Should not raise
        s._fix_docker_host_for_local_dev()
        assert s.OPENAI_BASE_URL is None

    def test_url_without_docker_internal_unchanged(self):
        s = Settings()
        s.OPENAI_BASE_URL = "http://localhost:11434/v1"
        s._fix_docker_host_for_local_dev()
        assert s.OPENAI_BASE_URL == "http://localhost:11434/v1"

    def test_docker_internal_url_swapped_when_not_in_docker(self):
        s = Settings()
        s.OPENAI_BASE_URL = "http://host.docker.internal:11434/v1"

        # Simulate NOT running in Docker: no /.dockerenv file, no /proc/1/cgroup
        with patch("os.path.exists", return_value=False):
            s._fix_docker_host_for_local_dev()

        assert "127.0.0.1" in s.OPENAI_BASE_URL
        assert "host.docker.internal" not in s.OPENAI_BASE_URL

    def test_docker_internal_url_unchanged_when_inside_docker(self):
        s = Settings()
        original_url = "http://host.docker.internal:11434/v1"
        s.OPENAI_BASE_URL = original_url

        # Simulate running inside Docker: /.dockerenv exists
        def mock_exists(path):
            return path == "/.dockerenv"

        with patch("os.path.exists", side_effect=mock_exists):
            s._fix_docker_host_for_local_dev()

        assert s.OPENAI_BASE_URL == original_url

    def test_docker_detected_via_cgroup(self):
        # Covers lines 198-203: /.dockerenv absent, but /proc/1/cgroup present
        # and contains "docker" → URL is NOT replaced.
        from unittest.mock import mock_open as _mock_open
        s = Settings()
        original_url = "http://host.docker.internal:11434/v1"
        s.OPENAI_BASE_URL = original_url

        def mock_exists(path):
            return path == "/proc/1/cgroup"

        with patch("os.path.exists", side_effect=mock_exists):
            with patch("builtins.open", _mock_open(read_data="12:devices:/docker-abc123\n")):
                s._fix_docker_host_for_local_dev()

        assert s.OPENAI_BASE_URL == original_url

    def test_cgroup_read_raises_exception_handled(self):
        # Covers lines 202-203: except Exception: pass
        # /proc/1/cgroup exists but open() raises → exception swallowed →
        # is_docker stays False → URL is replaced with 127.0.0.1.
        s = Settings()
        s.OPENAI_BASE_URL = "http://host.docker.internal:11434/v1"

        def mock_exists(path):
            return path == "/proc/1/cgroup"

        with patch("os.path.exists", side_effect=mock_exists):
            with patch("builtins.open", side_effect=OSError("permission denied")):
                s._fix_docker_host_for_local_dev()

        # is_docker never got set → URL was replaced
        assert "127.0.0.1" in s.OPENAI_BASE_URL
        assert "host.docker.internal" not in s.OPENAI_BASE_URL


# ---------------------------------------------------------------------------
# Settings.get_price_by_id
# ---------------------------------------------------------------------------

class TestGetPriceById:
    def test_known_price_id_returns_config(self):
        result = Settings.get_price_by_id("prod_5VVI5ldN9dtI7tbHaST5OB")
        assert result is not None
        assert result.name == "50 Credits Top-up (One-time)"

    def test_unknown_price_id_returns_none(self):
        result = Settings.get_price_by_id("nonexistent_product_id")
        assert result is None


class TestGetPriceByPlanKey:
    def test_known_plan_key_returns_config_case_insensitively(self):
        result = Settings.get_price_by_plan_key("pro_monthly")
        assert result is not None
        assert result.name == "Pro Plan (1 Month)"

    def test_unknown_plan_key_returns_none(self):
        assert Settings.get_price_by_plan_key("no_such_plan") is None
