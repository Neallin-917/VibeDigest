import ssl

import pytest

from utils.database_ssl import SUPABASE_CA_PATH, pg8000_connect_args


def test_supabase_pg8000_uses_strict_bundled_ca():
    connect_args = pg8000_connect_args(
        "postgresql+pg8000://user:password@aws-1.pooler.supabase.com:6543/postgres"
    )

    context = connect_args["ssl_context"]
    assert SUPABASE_CA_PATH.is_file()
    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "host.docker.internal"])
def test_local_pg8000_does_not_require_tls(host):
    assert (
        pg8000_connect_args(
            f"postgresql+pg8000://user:password@{host}:5432/postgres"
        )
        == {}
    )


def test_non_pg8000_driver_is_unchanged():
    assert pg8000_connect_args("postgresql://user:password@example.com/postgres") == {}


def test_missing_explicit_ca_fails_closed(monkeypatch, tmp_path):
    missing = tmp_path / "missing-ca.crt"
    monkeypatch.setenv("DATABASE_SSL_ROOT_CERT", str(missing))

    with pytest.raises(RuntimeError, match="root certificate not found"):
        pg8000_connect_args(
            "postgresql+pg8000://user:password@example.com/postgres"
        )
