#!/usr/bin/env python3
"""
Cloudflare DNS updater — point a Cloudflare-managed domain at a new host
without moving the registrar. Idempotent: updates a matching record (PUT) or
creates one (POST). Prints existing records first, and final values after.

Secrets come from the environment — nothing is hardcoded:
    CLOUDFLARE_API_TOKEN   token with "Edit zone DNS" permission on this zone
    CLOUDFLARE_ZONE_ID     the zone's ID (Cloudflare dashboard → domain → API box)

Usage:
    export CLOUDFLARE_API_TOKEN=xxxxxxxx
    export CLOUDFLARE_ZONE_ID=yyyyyyyy
    python3 scripts/cf-dns-update.py            # apply changes
    python3 scripts/cf-dns-update.py --dry-run  # show plan only, change nothing
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error

# ── Config ────────────────────────────────────────────────────────────────────
DOMAIN = "visby.me"

# Toggle the orange cloud. Default True (proxied). See the IMPORTANT note below —
# for a first-time Vercel hookup you usually want this False so Vercel can issue
# its TLS cert, then flip it on later with Cloudflare SSL mode = Full (strict).
PROXIED = True

# Desired records. type "A" needs an IP in `content`; "CNAME" needs a hostname.
# Defaults below are Vercel's published targets.
DESIRED = [
    {"sub": "@",   "type": "A",     "content": "76.76.21.21"},
    {"sub": "www", "type": "CNAME", "content": "cname.vercel-dns.com"},
]
# ──────────────────────────────────────────────────────────────────────────────

API = "https://api.cloudflare.com/client/v4"
DRY_RUN = "--dry-run" in sys.argv


def fqdn(sub: str) -> str:
    return DOMAIN if sub in ("@", "", DOMAIN) else f"{sub}.{DOMAIN}"


def req(method: str, path: str, token: str, body: dict | None = None) -> dict:
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        print(f"\n! Cloudflare API {method} {path} failed ({e.code}):\n{detail}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    zone = os.environ.get("CLOUDFLARE_ZONE_ID")
    if not token or not zone:
        sys.exit("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID in your environment first.")

    # Cloudflare requires ttl=1 ("auto") for proxied records.
    ttl = 1 if PROXIED else 3600

    print(f"Zone {zone} — domain {DOMAIN}  (proxied={PROXIED}, dry_run={DRY_RUN})\n")

    existing = req("GET", f"/zones/{zone}/dns_records?per_page=100", token)["result"]
    print("── Existing records ─────────────────────────────")
    if not existing:
        print("  (none)")
    for rec in existing:
        flag = "proxied" if rec.get("proxied") else "dns-only"
        print(f"  {rec['type']:5} {rec['name']:28} -> {rec['content']:30} [{flag}] id={rec['id']}")
    print()

    by_key = {(r["type"], r["name"]): r for r in existing}

    print("── Applying desired records ─────────────────────")
    for d in DESIRED:
        name = fqdn(d["sub"])
        payload = {"type": d["type"], "name": name, "content": d["content"], "ttl": ttl, "proxied": PROXIED}
        match = by_key.get((d["type"], name))

        if match:
            action = f"UPDATE (PUT) id={match['id']}"
            if DRY_RUN:
                print(f"  would {action}: {d['type']} {name} -> {d['content']}")
                continue
            res = req("PUT", f"/zones/{zone}/dns_records/{match['id']}", token, payload)["result"]
        else:
            action = "CREATE (POST)"
            if DRY_RUN:
                print(f"  would {action}: {d['type']} {name} -> {d['content']}")
                continue
            res = req("POST", f"/zones/{zone}/dns_records", token, payload)["result"]

        flag = "proxied" if res.get("proxied") else "dns-only"
        print(f"  {action}\n    now: {res['type']} {res['name']} -> {res['content']} [{flag}]")

    if DRY_RUN:
        print("\nDry run — nothing was changed.")
        return

    print("\n── Final state ──────────────────────────────────")
    final = req("GET", f"/zones/{zone}/dns_records?per_page=100", token)["result"]
    for d in DESIRED:
        name = fqdn(d["sub"])
        for rec in final:
            if rec["type"] == d["type"] and rec["name"] == name:
                flag = "proxied" if rec.get("proxied") else "dns-only"
                print(f"  {rec['type']:5} {rec['name']:28} -> {rec['content']:30} [{flag}]")


if __name__ == "__main__":
    main()
