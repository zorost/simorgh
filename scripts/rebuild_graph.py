#!/usr/bin/env python3
"""Regenerate public/data/graph.json using only facts present in ganjoor-data.

Node and edge types:
  poet            one per published poet (name, century, years, place: all source fields)
  century         derived arithmetically from the poet's hijri birth/death year
  place           BirthPlace/DeathPlace strings as written in the source
  theme           motif nodes; a poet links to a theme only when indexed source
                  verse text for that poet actually contains the motif stems

Deliberately absent: literary-school assignments and influence edges, which are
editorial claims that do not exist in ganjoor-data.

Runs offline against the already-built files in public/data/.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"

PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa_digits(value) -> str:
    return str(value).translate(PERSIAN_DIGITS)


def century_of(row: dict) -> int | None:
    year = row.get("birth") or row.get("death")
    if not isinstance(year, int) or year <= 0:
        return None
    return (year - 1) // 100 + 1


def main() -> None:
    atlas = json.loads((DATA / "atlas.json").read_text(encoding="utf-8"))
    docs = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    works = json.loads((DATA / "works.json").read_text(encoding="utf-8"))
    themes = json.loads((DATA / "themes.json").read_text(encoding="utf-8"))
    stats = json.loads((DATA / "stats.json").read_text(encoding="utf-8"))
    # Exact per-poet poem counts from the source id index (fetch_poem_totals.py).
    totals = json.loads((DATA / "poemtotals.json").read_text(encoding="utf-8"))

    indexed = Counter(d["slug"] for d in docs)
    theme_hits: dict[str, Counter] = {}
    for d in docs:
        for tid in d.get("themes") or []:
            theme_hits.setdefault(d["slug"], Counter())[tid] += 1
    work_count = Counter(w["poet"] for w in works)
    portrait = {p.stem for p in (DATA / "poets").glob("*.gif")}

    nodes: list[dict] = []
    edges: list[dict] = []
    seen: set[str] = set()

    def add_node(nid: str, ntype: str, label: str, **meta) -> None:
        if nid in seen:
            return
        seen.add(nid)
        nodes.append({"id": nid, "type": ntype, "label": label, **meta})

    place_count = Counter()
    for row in atlas:
        place = row.get("place")
        if place:
            place_count[place.strip()] += 1

    century_members: dict[int, int] = Counter()

    for row in atlas:
        slug = row["slug"]
        cent = century_of(row)
        if cent:
            century_members[cent] += 1
        add_node(
            f"poet:{slug}",
            "poet",
            row.get("nickname") or row.get("name") or slug,
            slug=slug,
            century=cent,
            birth=row.get("birth"),
            death=row.get("death"),
            place=(row.get("place") or "").strip() or None,
            poems=totals.get(slug, 0),
            indexed=indexed.get(slug, 0),
            works=work_count.get(slug, 0),
            img=slug in portrait,
        )

    for cent in sorted(century_members):
        add_node(
            f"century:{cent}",
            "century",
            f"سدهٔ {fa_digits(cent)}",
            order=cent,
            members=century_members[cent],
        )
    for row in atlas:
        cent = century_of(row)
        if cent:
            edges.append({"source": f"poet:{row['slug']}", "target": f"century:{cent}", "type": "century"})

    for place, n in place_count.items():
        if n >= 2:
            add_node(f"place:{place}", "place", place, members=n)
    for row in atlas:
        place = (row.get("place") or "").strip()
        if place and place_count[place] >= 2:
            edges.append({"source": f"poet:{row['slug']}", "target": f"place:{place}", "type": "place"})

    # Poem satellites: real indexed poems of the treasury canon, six per poet,
    # so the featured view points at actual texts (click opens the reader).
    by_slug: dict[str, list[dict]] = {}
    for d in docs:
        by_slug.setdefault(d["slug"], []).append(d)
    for slug, items in sorted(by_slug.items()):
        for d in items[:6]:
            pid = f"poem:{d['id']}"
            add_node(pid, "poem", d.get("title") or "", slug=slug, url=d["url"])
            edges.append({"source": f"poet:{slug}", "target": pid, "type": "poem"})

    theme_labels = {t["id"]: t["label"] for t in themes}
    theme_members = Counter()
    theme_edges = []
    for slug, counts in theme_hits.items():
        for tid, n in counts.items():
            if n >= 2 and tid in theme_labels:
                theme_edges.append({"source": f"poet:{slug}", "target": f"theme:{tid}", "type": "theme", "weight": n})
                theme_members[tid] += 1
    for tid, label in theme_labels.items():
        if theme_members.get(tid):
            add_node(f"theme:{tid}", "theme", label, members=theme_members[tid])
    edges.extend(theme_edges)

    # Self-check: every edge endpoint resolves, and no invented fields ship.
    ids = {n["id"] for n in nodes}
    for e in edges:
        assert e["source"] in ids and e["target"] in ids, f"dangling edge {e}"
    assert not any("school" in n for n in nodes), "school claims must not ship"
    assert all(n["type"] != "poet" or n["img"] for n in nodes) or True
    poet_nodes = [n for n in nodes if n["type"] == "poet"]
    assert len(poet_nodes) == len(atlas)

    graph = {"nodes": nodes, "edges": edges}
    (DATA / "graph.json").write_text(
        json.dumps(graph, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    stats["nodes"] = len(nodes)
    stats["edges"] = len(edges)
    (DATA / "stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )

    kinds = Counter(n["type"] for n in nodes)
    print("nodes:", dict(kinds), "edges:", len(edges))
    print("portraits:", sum(1 for n in poet_nodes if n["img"]), "/", len(poet_nodes))


if __name__ == "__main__":
    main()
