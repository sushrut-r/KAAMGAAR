#!/usr/bin/env bash
# Applies a SQL migration to the linked InsForge project.
# Credentials are read from ~/.secrets/insforge.env — never committed, never in source.
set -euo pipefail
set -a; source "$HOME/.secrets/insforge.env"; set +a
FILE="$1"
NAME="$(basename "$FILE" .sql)"
NAME="${NAME//_/-}"
VERSION="$(basename "$FILE" .sql)"; VERSION="${VERSION%%_*}"
python3 - "$FILE" "$VERSION" "$NAME" <<'PY'
import json, os, sys, urllib.request, urllib.error
path, version, name = sys.argv[1], sys.argv[2], sys.argv[3]
sql = open(path).read()
req = urllib.request.Request(
    os.environ["INSFORGE_BASE_URL"] + "/api/database/migrations",
    data=json.dumps({"version": version, "name": name, "sql": sql}).encode(),
    headers={"Authorization": "Bearer " + os.environ["INSFORGE_ADMIN_KEY"],
             "Content-Type": "application/json"},
    method="POST")
try:
    r = urllib.request.urlopen(req, timeout=300)
    print(name, "-> OK", r.status)
except urllib.error.HTTPError as e:
    print(name, "-> FAILED", e.code, e.read().decode()[:3000]); sys.exit(1)
PY
