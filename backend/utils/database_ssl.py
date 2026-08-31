from __future__ import annotations

import os
import ssl
from pathlib import Path

from sqlalchemy.engine import make_url


LOCAL_DATABASE_HOSTS = {"localhost", "127.0.0.1", "::1", "host.docker.internal"}
SUPABASE_CA_PATH = (
    Path(__file__).resolve().parents[1] / "certs" / "supabase-prod-ca-2021.crt"
)


def pg8000_connect_args(database_url: str) -> dict[str, ssl.SSLContext]:
    """Return strict TLS arguments for remote pg8000 connections.

    Local development databases are allowed to run without TLS. Every remote
    pg8000 target uses certificate and hostname verification. Supabase uses its
    private production root CA, bundled from the official Studio download URL.
    """
    if "pg8000" not in database_url:
        return {}

    url = make_url(database_url)
    host = (url.host or "").lower()
    if host in LOCAL_DATABASE_HOSTS:
        return {}

    configured_ca = os.getenv("DATABASE_SSL_ROOT_CERT", "").strip()
    if configured_ca:
        ca_path = Path(configured_ca).expanduser().resolve()
    elif host.endswith(".pooler.supabase.com") or host.endswith(".supabase.co"):
        ca_path = SUPABASE_CA_PATH
    else:
        ca_path = None

    if ca_path is not None:
        if not ca_path.is_file():
            raise RuntimeError(f"Database SSL root certificate not found: {ca_path}")
        context = ssl.create_default_context(cafile=str(ca_path))
    else:
        context = ssl.create_default_context()

    context.check_hostname = True
    context.verify_mode = ssl.CERT_REQUIRED
    return {"ssl_context": context}
