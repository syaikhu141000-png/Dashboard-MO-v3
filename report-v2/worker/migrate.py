"""Migrate locks/notes dari artifact 'Report Marketing V2' (B) ke KV Worker "report-v2-api".

SEKALI SAHAJA (one-off). Tulis terus ke KV keys rv2:locks / rv2:notes guna Cloudflare API
(bukan Worker REST) — paling mudah & cepat. Tak sentuh rv2:meta (meta cache akan diisi semula
oleh scheduled task harian).

Guna:
  CLOUDFLARE_API_TOKEN=<token> python3 worker/migrate.py
Dalam GitHub Actions, token disuntik dari secret.
"""
import json
import os
import ssl
import urllib.request
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


acct = call("GET", "/accounts")[0]["id"]
ns = next((n for n in call("GET", f"/accounts/{acct}/storage/kv/namespaces?per_page=100") if n["title"] == NAME), None)
if not ns:
    raise SystemExit(f"KV namespace '{NAME}' tak jumpa — deploy.py kena jalan dulu.")
print("KV:", ns["id"])

# Baca existing (kalau ada) supaya kita MERGE, bukan overwrite — newest 'at' menang, selaras
# dgn arahan owner "jangan padam, transfer semua".
def get_existing(key):
    out = call("GET", f"/accounts/{acct}/storage/kv/namespaces/{ns['id']}/values/{key}", raw=True)
    try:
        return json.loads(out)
    except Exception:
        return {}

for key, localfile in (("rv2:locks", "migrate_locks.json"), ("rv2:notes", "migrate_notes.json")):
    incoming = json.loads((HERE / localfile).read_text())
    existing = get_existing(key)
    merged = dict(existing)
    added, updated, kept = 0, 0, 0
    for k, v in incoming.items():
        if k not in merged:
            merged[k] = v
            added += 1
        else:
            old_at = merged[k].get("at") or ""
            new_at = v.get("at") or ""
            if new_at >= old_at:
                merged[k] = v
                updated += 1
            else:
                kept += 1
    body = json.dumps(merged).encode()
    call("PUT", f"/accounts/{acct}/storage/kv/namespaces/{ns['id']}/values/{key}", body, "application/octet-stream", raw=True)
    print(f"{key}: existing={len(existing)} incoming={len(incoming)} -> final={len(merged)} (added={added}, updated={updated}, kept_old={kept})")

print("Migrate selesai — tiada data dipadam, hanya digabung (merge).")
