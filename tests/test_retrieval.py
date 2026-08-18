#!/usr/bin/env python3
"""Known-line retrieval. Fails if the Hafez opening couplet is not first."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from persian import normalize  # noqa: E402

INDEX = ROOT / "public" / "data" / "index.json"

QUERIES = [
    ("که عشق آسان نمود اول ولی افتاد مشکلها", "/hafez/ghazal/sh1"),
    ("الا یا ایها الساقی", "/hafez/ghazal/sh1"),
]


def score(doc: dict, query: str) -> float:
    nq = normalize(query)
    blob = normalize(f"{doc.get('text', '')} {doc.get('title', '')} {doc.get('summary', '')}")
    if nq and nq in blob:
        return 20
    hits = sum(1 for t in nq.split() if t and t in blob)
    return hits


def main() -> int:
    if not INDEX.exists():
        print("skip: public/data/index.json missing (run scripts/build_corpus.py)")
        return 0
    docs = json.loads(INDEX.read_text(encoding="utf-8"))
    failed = 0
    for query, expected in QUERIES:
        ranked = sorted(docs, key=lambda d: score(d, query), reverse=True)
        top = ranked[0]["url"] if ranked else None
        ok = top == expected
        print(("ok " if ok else "FAIL "), query, "->", top)
        if not ok:
            failed += 1
    if failed:
        print(f"test_retrieval: {failed} failed")
        return 1
    print("test_retrieval: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
