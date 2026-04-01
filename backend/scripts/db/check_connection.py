import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = ROOT / "backend"

for env_file in (
    ROOT / ".env",
    ROOT / ".env.local",
    ROOT / "frontend" / ".env",
    ROOT / "frontend" / ".env.local",
    ROOT / "backend" / ".env",
    ROOT / "backend" / ".env.local",
):
    load_dotenv(env_file, override=False)

sys.path.append(str(ROOT))
sys.path.append(str(BACKEND_ROOT))

from backend.db_client import DBClient


def _project_ref_from_supabase_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    host = parsed.hostname or ""
    return host.split(".")[0] if host else None


def _project_ref_from_database_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    username = parsed.username or ""
    if "." not in username:
        return None
    return username.split(".", 1)[1]


def _test_supabase_key(url: str, key: str, label: str) -> tuple[bool, str]:
    try:
        from supabase import create_client

        client = create_client(url, key)
        response = client.table("chat_threads").select("id", count="exact").limit(1).execute()
        return True, f"{label} REST check ok (visible rows={len(response.data or [])}, count={getattr(response, 'count', None)})"
    except Exception as error:
        return False, f"{label} REST check failed: {type(error).__name__}: {str(error).splitlines()[0]}"


def _test_database_url() -> tuple[bool, str]:
    client = DBClient()
    if not client.engine:
        return False, "DATABASE_URL missing or SQLAlchemy engine initialization failed"

    try:
        client._execute_query("SELECT 1")
        return True, "DATABASE_URL Postgres check ok"
    except Exception as error:
        return False, f"DATABASE_URL Postgres check failed: {type(error).__name__}: {str(error).splitlines()[0]}"


def main():
    database_url = os.environ.get("DATABASE_URL")
    supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY")
    anon_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")

    db_ref = _project_ref_from_database_url(database_url)
    supabase_ref = _project_ref_from_supabase_url(supabase_url)

    print("Supabase connection diagnostics")
    print(f"- SUPABASE_URL present: {bool(supabase_url)} ref={supabase_ref}")
    print(f"- DATABASE_URL present: {bool(database_url)} ref={db_ref}")
    print(f"- SUPABASE_SERVICE_KEY present: {bool(service_key)}")
    print(f"- NEXT_PUBLIC_SUPABASE_ANON_KEY present: {bool(anon_key)}")

    if db_ref and supabase_ref and db_ref != supabase_ref:
        print("ERROR: DATABASE_URL and SUPABASE_URL point to different Supabase projects.")
        return 1

    if not supabase_url:
        print("ERROR: Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL.")
        return 1

    if anon_key:
        anon_ok, anon_message = _test_supabase_key(supabase_url, anon_key, "Anon key")
        print(f"- {anon_message}")
    else:
        anon_ok = False
        print("- Anon key missing; skipped public REST check")

    if service_key:
        service_ok, service_message = _test_supabase_key(supabase_url, service_key, "Service key")
        print(f"- {service_message}")
    else:
        service_ok = False
        print("- Service key missing; skipped admin REST check")

    db_ok, db_message = _test_database_url()
    print(f"- {db_message}")

    if anon_ok and not service_ok and not db_ok:
        print(
            "LIKELY ROOT CAUSE: public project config is correct, but admin credentials in .env.local are stale. "
            "Refresh SUPABASE_SERVICE_KEY and DATABASE_URL from Supabase Dashboard -> Settings -> API / Database."
        )
        return 1

    if service_ok and not db_ok:
        print(
            "LIKELY ROOT CAUSE: service key is valid but DATABASE_URL is stale or the DB password/pooler connection is invalid."
        )
        return 1

    if not anon_ok and not service_ok:
        print("LIKELY ROOT CAUSE: SUPABASE_URL is wrong or all configured API keys are stale.")
        return 1

    if db_ok:
        print("Database connectivity is healthy.")
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
