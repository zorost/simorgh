#!/usr/bin/env python3
"""Count every poem in ganjoor-data per poet, from the source's own id index.

The repo publishes index/poems-by-id/{bucket}.json shards mapping poem id to
its URL; the first path segment is the poet slug. Summing those gives the
exact corpus size per poet with no sampling and no editorial judgement.

Writes public/data/poemtotals.json ({slug: count}) for rebuild_graph.py.
"""

from __future__ import annotations

import json
import sys
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "poemtotals.json"
CDN = "https://cdn.jsdelivr.net/gh/ganjoor/ganjoor-data@main"
LISTING = "https://api.github.com/repos/ganjoor/ganjoor-data/contents/index/poems-by-id"
HEADERS = {"User-Agent": "simorgh-corpus-builder/1.0", "Accept": "application/json"}


def get_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    manifest = get_json(f"{CDN}/manifest.json")
    expected = manifest["PoemsCount"]

    shards = [e["name"] for e in get_json(LISTING) if e["name"].endswith(".json")]
    print(f"shards: {len(shards)}, expecting {expected} poems", file=sys.stderr)

    totals: Counter[str] = Counter()

    def load(name: str) -> Counter:
        c: Counter[str] = Counter()
        for url in get_json(f"{CDN}/index/poems-by-id/{name}").values():
            c[url.strip("/").split("/")[0]] += 1
        return c

    with ThreadPoolExecutor(max_workers=8) as pool:
        for c in pool.map(load, shards):
            totals.update(c)

    counted = sum(totals.values())
    assert counted == expected, f"counted {counted}, manifest says {expected}"

    OUT.write_text(
        json.dumps(dict(sorted(totals.items())), ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    top = ", ".join(f"{s}:{n}" for s, n in totals.most_common(8))
    print(f"wrote {OUT.relative_to(ROOT)} ({len(totals)} poets, {counted} poems). top: {top}")


if __name__ == "__main__":
    main()
