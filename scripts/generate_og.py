#!/usr/bin/env python3
"""OG poster via fal.ai. No watermark, no personal handle."""

from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "og.png"

PROMPT = (
    "Cinematic night-sky star chart of a Persian astrolabe, deep indigo paper, "
    "saffron constellation lines, verdigris theme marks, no letters, no watermark, "
    "no logo, no calligraphy, geometric brass instrument over a dark celestial map, "
    "museum lighting, 16:9, photoreal material, not a UI screenshot"
)


def load_key() -> str:
    import os

    if os.environ.get("FAL_KEY"):
        return os.environ["FAL_KEY"]
    for parent in [ROOT, *ROOT.parents]:
        env = parent / ".env"
        if not env.is_file():
            continue
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("FAL_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("FAL_KEY missing")


def first_url(node):
    if isinstance(node, str) and node.startswith("http"):
        return node
    if isinstance(node, dict):
        for v in node.values():
            found = first_url(v)
            if found:
                return found
    if isinstance(node, list):
        for item in node:
            found = first_url(item)
            if found:
                return found
    return None


def main() -> None:
    key = load_key()
    body = json.dumps(
        {
            "prompt": PROMPT,
            "image_size": "landscape_16_9",
            "num_images": 1,
        }
    ).encode()
    req = urllib.request.Request(
        "https://fal.run/fal-ai/flux/schnell",
        data=body,
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=150) as resp:
        payload = json.loads(resp.read())
    url = first_url(payload)
    if not url:
        sys.exit("fal returned no image")
    with urllib.request.urlopen(url, timeout=150) as asset:
        OUT.write_bytes(asset.read())
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
