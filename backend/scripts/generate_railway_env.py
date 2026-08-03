from pathlib import Path


def generate_railway_vars():
    # 1. Path to .env.local (The source of secrets)
    # We run this from backend/scripts/ or root, so let's find root reliably.
    # Assuming this script is at backend/scripts/generate_railway_env.py
    current_file = Path(__file__).resolve()
    project_root = current_file.parent.parent.parent
    env_local_path = project_root / ".env.local"

    if not env_local_path.exists():
        print(f"❌ Error: {env_local_path} not found.")
        return

    print(f"# Reading secrets from: {env_local_path}")
    print("# Generating Railway-safe variables (Filtering out localhost)...\n")

    print("--- COPY BELOW THIS LINE ---")

    with open(env_local_path, "r") as f:
        lines = f.readlines()

    for line in lines:
        line = line.strip()
        # Skip empty lines and comments
        if not line or line.startswith("#"):
            continue

        # Split key=value
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        # --- FILTERING LOGIC ---

        # 1. Skip Localhost URLs (These should be set in Railway Variables Dashboard manually if needed, or rely on internal DNS)
        if "localhost" in value or "127.0.0.1" in value:
            continue

        # 2. Skip Dev Flags that should be False in Prod
        if key in ["DEV_AUTH_BYPASS", "MOCK_MODE"] and value.lower() == "true":
            # Don't copy 'true' bypasses to prod
            continue

        # 3. Skip local file paths
        if value.startswith("/") or value.startswith("./"):
            if (
                key != "LOG_FILE"
            ):  # LOG_FILE might be okay if path exists, but usually stick to stdout in prod
                continue

        # 4. Output the rest (Secrets, Keys, External DSNs)
        print(f"{key}={value}")

    print("--- COPY ABOVE THIS LINE ---")
    print("\n✅ Instructions:")
    print("1. Go to Railway Dashboard -> Your Project -> Variables")
    print("2. Click 'Raw Editor' (usually top right)")
    print("3. Paste the content above.")
    print(
        "4. IMPORTANT: Manually add/verify 'FRONTEND_URL' and 'NEXT_PUBLIC_API_URL' with your real Railway Domains!"
    )


if __name__ == "__main__":
    generate_railway_vars()
