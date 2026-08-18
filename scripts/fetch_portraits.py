#!/usr/bin/env python3
"""Download poet portraits from the Ganjoor API into public/data/poets/.

Skips files that already exist. Unknown poets 404 and are skipped, so every
file on disk is a genuine portrait from the source.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "poets"
API = "https://api.ganjoor.net/api/ganjoor/poet/image"
UA = "simorgh-portraits/1.0 (+https://github.com/zorost/simorgh)"


def fetch(slug: str) -> str:
    dest = OUT / f"{slug}.gif"
    if dest.exists() and dest.stat().st_size > 0:
        return "cached"
    req = urllib.request.Request(f"{API}/{slug}.gif", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = resp.read()
        if not data.startswith(b"GIF"):
            return "not-gif"
        dest.write_bytes(data)
        return "ok"
    except urllib.error.HTTPError as err:
        return f"http-{err.code}"
    except Exception as err:  # noqa: BLE001 - report and continue
        return f"err-{type(err).__name__}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    atlas = json.loads((ROOT / "public" / "data" / "atlas.json").read_text(encoding="utf-8"))
    slugs = [row["slug"] for row in atlas]
    counts: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        for slug, status in zip(slugs, pool.map(fetch, slugs)):
            counts[status] = counts.get(status, 0) + 1
            if status not in ("ok", "cached"):
                print(f"  skip {slug}: {status}", file=sys.stderr)
    print("portraits:", counts)


if __name__ == "__main__":
    main()
