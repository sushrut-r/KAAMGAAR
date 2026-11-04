#!/usr/bin/env bash
# Promote an existing user to admin (there is no self-serve path to the admin role).
# Usage: bash scripts/make-admin.sh someone@example.com
set -euo pipefail
set -a; source "$HOME/.secrets/insforge.env"; set +a
EMAIL="$1"
python3 - "$EMAIL" <<'PY'
import json, os, sys, urllib.request
email = sys.argv[1]
sql = f"UPDATE public.profiles SET role='admin', verification_status='verified' WHERE lower(email)=lower('{email}');"
import time
body = {"version": str(int(time.time())), "name": "promote-admin", "sql": sql}
req = urllib.request.Request(os.environ["INSFORGE_BASE_URL"] + "/api/database/migrations",
    data=json.dumps(body).encode(),
    headers={"Authorization": "Bearer " + os.environ["INSFORGE_ADMIN_KEY"], "Content-Type": "application/json"},
    method="POST")
print(urllib.request.urlopen(req, timeout=60).status, "->", email, "is now admin")
PY
