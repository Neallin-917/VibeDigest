"""Extended tests for config.py — targeting uncovered branches."""

import importlib
import os
from unittest.mock import patch

import config as config_module
from config import Settings


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
    def test_default_provider_is_openrouter(self):
        original = os.environ.get("LLM_PROVIDER")
        try:
            os.environ["LLM_PROVIDER"] = ""
            reloaded = importlib.reload(config_module)
            assert reloaded.settings.LLM_PROVIDER == "openrouter"
        finally:
            if original is None:
                os.environ.pop("LLM_PROVIDER", None)
            else:
                os.environ["LLM_PROVIDER"] = original
            importlib.reload(config_module)

    def test_alias_overrides_provider_default(self):
        s = Settings()
        s.MODEL_ALIAS_SMART = "my-custom-model"
        assert s.MODEL_SMART == "my-custom-model"

    def test_no_alias_uses_provider_default(self):
        s = Settings()
        s.MODEL_ALIAS_SMART = None
        s.LLM_PROVIDER = "openrouter"
        assert s.MODEL_SMART == "google/gemini-3-pro-preview"

    def test_fast_alias_overrides_default(self):
        s = Settings()
        s.MODEL_ALIAS_FAST = "my-fast-model"
        assert s.MODEL_FAST == "my-fast-model"

    def test_fast_no_alias_uses_provider_default(self):
        s = Settings()
        s.MODEL_ALIAS_FAST = None
        s.LLM_PROVIDER = "openai"
        assert s.MODEL_FAST == "gpt-5-mini"

    def test_unknown_provider_raises(self):
        s = Settings()
        s.MODEL_ALIAS_SMART = None
        s.LLM_PROVIDER = "unknown_provider"
        try:
            _ = s.MODEL_SMART
        except ValueError as exc:
            assert "Unsupported provider" in str(exc)
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
