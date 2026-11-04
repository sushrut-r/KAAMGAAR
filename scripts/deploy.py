#!/usr/bin/env python3
"""Deploy the कामगार frontend to InsForge (direct upload -> Vercel-backed build).

Usage:  set -a; source ~/.secrets/insforge.env; set +a; python3 scripts/deploy.py

Uploads app *source* (not dist), sets the two public VITE_ env vars, starts the build
and polls until the run is READY. The admin key is only used to talk to the deployment
API — it is never sent as an app env var.
"""
import hashlib, json, os, sys, time, urllib.error, urllib.request

def _load_local_env():
    """Load .env.local (if present) for any INSFORGE_* var not already set.
    Makes manual deploy possible from the owner's own machine: put the three
    INSFORGE_* values in .env.local and just run `npm run deploy`."""
    env_file = os.path.join(ROOT := os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local')
    try:
        with open(env_file, encoding='utf-8') as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except OSError:
        pass

_load_local_env()

BASE = os.environ["INSFORGE_BASE_URL"]
ADMIN = os.environ["INSFORGE_ADMIN_KEY"]
ANON = os.environ["INSFORGE_ANON_KEY"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INCLUDE_FILES = {
    'index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'vercel.json',
    'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', '.env.example', 'README.md',
}
INCLUDE_DIRS = ('src', 'public', 'insforge')
# never ship secrets or local build artefacts
EXCLUDE_NAMES = {'.env', '.env.local', '.env.production', 'node_modules', 'dist', '.git',
                 'screenshots', '.vite', 'coverage'}


def req(method, path, body=None, raw=None, headers=None, timeout=180, retries=6):
    h = {"Authorization": "Bearer " + ADMIN}
    if raw is not None:
        data = raw
        h["Content-Type"] = "application/octet-stream"
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    else:
        data = None
    h.update(headers or {})
    for attempt in range(retries):
        r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(r, timeout=timeout) as resp:
                txt = resp.read().decode()
                return json.loads(txt) if txt.strip() else None
        except urllib.error.HTTPError as e:
            msg = e.read().decode()[:600]
            if e.code == 429 and attempt < retries - 1:
                wait = 30 * (attempt + 1)
                print(f"  ⏳ 429 rate limit on {method} {path} — waiting {wait}s ({attempt + 1}/{retries - 1})")
                time.sleep(wait)
                continue
            raise RuntimeError(f"{method} {path} -> {e.code} {msg}") from None


def collect():
    files = []
    for name in sorted(INCLUDE_FILES):
        p = os.path.join(ROOT, name)
        if os.path.isfile(p):
            files.append((name, p))
    for d in INCLUDE_DIRS:
        base = os.path.join(ROOT, d)
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [x for x in dirnames if x not in EXCLUDE_NAMES]
            for fn in sorted(filenames):
                if fn in EXCLUDE_NAMES:
                    continue
                full = os.path.join(dirpath, fn)
                files.append((os.path.relpath(full, ROOT), full))
    return files


files = collect()
manifest, blobs = [], {}
for rel, full in files:
    data = open(full, 'rb').read()
    sha = hashlib.sha1(data).hexdigest()
    manifest.append({"path": rel.replace(os.sep, '/'), "size": len(data), "sha": sha})
    blobs[rel.replace(os.sep, '/')] = data

total_kb = sum(f['size'] for f in manifest) / 1024
print(f"📦 {len(manifest)} files, {total_kb:.0f} KB")
for f in manifest:
    if f['path'].count('/') == 0:
        print(f"   · {f['path']}")
print(f"   · src/… ({sum(1 for f in manifest if f['path'].startswith('src/'))} files)")

# Env vars must be registered on the deployment project BEFORE the build starts —
# passing them inside the manifest alone is not enough (the build won't see them).
print("\n0/4 setting build env vars…")
req("POST", "/api/deployments/env-vars", {"envVars": [
    {"key": "VITE_INSFORGE_BASE_URL", "value": BASE},
    {"key": "VITE_INSFORGE_ANON_KEY", "value": ANON},
]})
for v in req("GET", "/api/deployments/env-vars")["envVars"]:
    print(f"    {v['key']} ({v['type']})")

payload = {
    "files": manifest,
    "projectSettings": {
        "buildCommand": "npm run build",
        "outputDirectory": "dist",
        "installCommand": "npm install",
        "framework": "vite",
    },
    "envVars": [
        {"key": "VITE_INSFORGE_BASE_URL", "value": BASE},
        {"key": "VITE_INSFORGE_ANON_KEY", "value": ANON},
    ],
    "meta": {"source": "agent", "app": "kaamgaar"},
}

print("\n1/4 registering deployment…")
dep = req("POST", "/api/deployments/direct", payload)
dep_id = dep.get("id") or dep.get("deploymentId")
print(f"    deployment {dep_id}")

entries = dep.get("files") or []
print(f"2/4 uploading {len(entries)} files…")
for i, entry in enumerate(entries, 1):
    fid = entry.get("id") or entry.get("fileId")
    path = entry.get("path") or entry.get("file_path")
    req("PUT", f"/api/deployments/{dep_id}/files/{fid}/content", raw=blobs[path])
    if i % 10 == 0 or i == len(entries):
        print(f"    {i}/{len(entries)}")

print("3/4 starting build…")
req("POST", f"/api/deployments/{dep_id}/start", {})

print("4/4 waiting for the build…")
last, url = None, None
deadline = time.time() + 900
while time.time() < deadline:
    time.sleep(6)
    try:
        run = req("POST", f"/api/deployments/{dep_id}/sync", {})
    except RuntimeError:
        run = req("GET", f"/api/deployments/{dep_id}")
    status = (run or {}).get("status")
    url = (run or {}).get("url") or url
    if status != last:
        print(f"    {status}")
        last = status
    if status in ("READY", "ERROR", "CANCELED"):
        break

print()
if last == "READY":
    print(f"✅ live: https://{url}" if url and not str(url).startswith("http") else f"✅ live: {url}")
    sys.exit(0)
print(f"❌ deployment finished with status {last}")
print(json.dumps(run, indent=2)[:2000])
sys.exit(1)
