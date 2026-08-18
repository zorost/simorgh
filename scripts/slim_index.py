#!/usr/bin/env python3
"""Drop derived fields and cap verse length so Pages stays light."""

from __future__ import annotations

import json
from pathlib import Path

from persian import normalize

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "public" / "data" / "index.json"


def main() -> None:
    docs = json.loads(INDEX.read_text(encoding="utf-8"))
    slim = []
    for doc in docs:
        text = doc.get("text") or ""
        slim.append(
            {
                "id": doc["id"],
                "url": doc["url"],
                "slug": doc["slug"],
                "poet": doc["poet"],
                "title": doc["title"],
                "text": text[:1400],
                "summary": (doc.get("summary") or "")[:400],
                "metre": doc.get("metre"),
                "format": doc.get("format"),
                "themes": doc.get("themes") or [],
                "rhyme": doc.get("rhyme"),
            }
        )
    INDEX.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(slim)} docs, {INDEX.stat().st_size // 1024} KB")
    # sanity: Hafez opening must normalize-match a typed line
    q = normalize("که عشق آسان نمود اول ولی افتاد مشکلها")
    sh1 = next(d for d in slim if d["url"] == "/hafez/ghazal/sh1")
    assert q in normalize(sh1["text"] + " " + sh1["title"]), "hafez sh1 lost the opening line"


if __name__ == "__main__":
    main()
