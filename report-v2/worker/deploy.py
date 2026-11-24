"""Deploy Worker "report-v2-api" ke Cloudflare melalui API (tanpa wrangler).

Worker ni KHAS untuk Report Marketing V2 sahaja — berasingan sepenuhnya drpd
"mo2-dashboard" (monitor iklan Meta Ads harian, repo lain/marketerMO).

Guna:
  CLOUDFLARE_API_TOKEN=<token> python3 worker/deploy.py
Dalam sesi Claude, token disuntik oleh proxy (nilai env "proxy-injected").
Langkah: KV namespace -> upload script (modul) -> workers.dev -> secret RV2_PASSWORD (sekali, kalau belum ada).
"""
import json
import os
import ssl
import sys
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
NAME = "report-v2-api"
API = "https://api.cloudflare.com/client/v4"
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "proxy-injected")
CTX = ssl.create_default_context(cafile=os.environ.get("CF_CA_BUNDLE")) if os.environ.get("CF_CA_BUNDLE") else ssl.create_default_context()


def call(method, path, body=None, ctype="application/json", raw=False):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
            out = r.read()
    except urllib.error.HTTPError as e:
        out = e.read()
    if raw:
        return out
    j = json.loads(out)
    if not j.get("success", False):
        raise SystemExit(f"{method} {path} gagal: {j.get('errors')}")
    return j.get("result")


def multipart(parts):
    b = "----rv2" + uuid.uuid4().hex
    out = b""
    for name, filename, ctype, content in parts:
        out += f"--{b}\r\nContent-Disposition: form-data; name=\"{name}\"".encode()
        if filename:
            out += f"; filename=\"{filename}\"".encode()
        out += f"\r\nContent-Type: {ctype}\r\n\r\n".encode() + content + b"\r\n"
    return out + f"--{b}--\r\n".encode(), f"multipart/form-data; boundary={b}"


acct = call("GET", "/accounts")[0]["id"]
print("Akaun:", acct)

# 1) KV (namespace BERASINGAN drpd mo2-dashboard)
ns = next((n for n in call("GET", f"/accounts/{acct}/storage/kv/namespaces?per_page=100") if n["title"] == NAME), None)
if not ns:
    ns = call("POST", f"/accounts/{acct}/storage/kv/namespaces", {"title": NAME})
print("KV:", ns["id"])

# 2) Script
src = HERE / "src"
meta = {"main_module": "index.js", "compatibility_date": "2025-01-01",
        "bindings": [{"type": "kv_namespace", "name": "KV", "namespace_id": ns["id"]}],
        "keep_bindings": ["secret_text"]}
body, ctype = multipart([
    ("metadata", None, "application/json", json.dumps(meta).encode()),
    ("index.js", "index.js", "application/javascript+module", (src / "index.js").read_bytes()),
])
call("PUT", f"/accounts/{acct}/workers/scripts/{NAME}", body, ctype)
print("Script dimuat naik")

# 3) workers.dev (tiada cron — worker ni reaktif sahaja, API dipanggil oleh trigger lain)
call("POST", f"/accounts/{acct}/workers/scripts/{NAME}/subdomain", {"enabled": True, "previews_enabled": False})
sub = call("GET", f"/accounts/{acct}/workers/subdomain")["subdomain"]
print("URL:", f"https://{NAME}.{sub}.workers.dev/")

# 4) RV2_PASSWORD (sekali sahaja, kalau belum ada) — guna --password <value> utk set/tukar
names = {s["name"] for s in call("GET", f"/accounts/{acct}/workers/scripts/{NAME}/secrets")}
if "--password" in sys.argv:
    pw = sys.argv[sys.argv.index("--password") + 1]
    call("PUT", f"/accounts/{acct}/workers/scripts/{NAME}/secrets", {"name": "RV2_PASSWORD", "text": pw, "type": "secret_text"})
    print("RV2_PASSWORD disimpan/dikemaskini")
elif "RV2_PASSWORD" not in names:
    print("AMARAN: RV2_PASSWORD belum ditetapkan. Jalankan semula dengan --password <value>.")
print("Secrets sedia ada:", sorted(names))
