#!/usr/bin/env python3
"""Build the Simorgh atlas, graph, and canon verse index from ganjoor-data.

Reads the public static API (jsDelivr). Writes compact JSON under public/data/.
Resumable: raw responses land in .cache/.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from ontology import INFLUENCE, THEME_ALIASES, THEMES, century_label, school_for
from persian import normalize, tokenize

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
OUT = ROOT / "public" / "data"
DEFAULT_BASE = "https://cdn.jsdelivr.net/gh/ganjoor/ganjoor-data@main"
UA = "simorgh-corpus-builder/1.0 (+https://github.com/zorost/simorgh)"

# Full poem fetch for these slugs (all listed categories).
CANON_FULL = {
    "hafez": {"ghazal", "robaee2", "ghete"},
    "khayyam": None,  # entire tree
    "babataher": None,
    "saadi": {"divan", "mavaez", "boostan", "golestan"},
}

# Sample N poems per poet after walking the tree.
CANON_SAMPLE = {
    "moulavi": 80,
    "attar": 40,
    "ferdousi": 24,
    "nezami": 24,
    "sanaee": 24,
    "jami": 24,
    "khaghani": 20,
    "eraghi": 20,
    "saeb": 24,
    "bidel": 20,
    "parvin": 24,
    "shahriar": 20,
    "iqbal": 20,
    "roodaki": 20,
    "naserkhosro": 16,
    "shabestari": 12,
    "abusaeed": 16,
    "hatef": 12,
    "bahar": 16,
    "iraj": 12,
}

HEADERS = {"User-Agent": UA, "Accept": "application/json"}


def cache_path(rel: str) -> Path:
    safe = rel.lstrip("/").replace("..", "")
    return CACHE / safe


def fetch_json(base: str, rel: str, retries: int = 4) -> dict | list | None:
    rel = rel.lstrip("/")
    path = cache_path(rel)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    url = f"{base.rstrip('/')}/{rel}"
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=40) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as err:
            last_err = err
            time.sleep(0.4 * (attempt + 1))
    print(f"skip {rel}: {last_err}", file=sys.stderr)
    return None


def poet_slug(full_url: str) -> str:
    return full_url.strip("/").split("/")[0]


def path_from_url(full_url: str) -> str:
    return full_url.strip("/")


def walk_categories(
    base: str,
    slug: str,
    node: dict,
    seen: set[str],
    *,
    depth: int,
    max_depth: int,
    poem_cap: int | None,
    listed: list[int],
) -> list[dict]:
    cats = []
    url = node.get("FullUrl") or f"/{slug}"
    key = path_from_url(url)
    if key in seen:
        return cats
    seen.add(key)
    cats.append(node)
    listed[0] += len(node.get("Poems") or [])
    if poem_cap is not None and listed[0] >= poem_cap:
        return cats
    if depth >= max_depth:
        return cats
    for child in node.get("ChildCats") or []:
        if poem_cap is not None and listed[0] >= poem_cap:
            break
        child_path = path_from_url(child["FullUrl"])
        child_json = fetch_json(base, f"poets/{child_path}/_cat.json")
        if child_json:
            cats.extend(
                walk_categories(
                    base,
                    slug,
                    child_json,
                    seen,
                    depth=depth + 1,
                    max_depth=max_depth,
                    poem_cap=poem_cap,
                    listed=listed,
                )
            )
    return cats


def poem_plain(poem: dict) -> str:
    sections = poem.get("Sections") or []
    if sections and sections[0].get("PlainText"):
        return sections[0]["PlainText"].replace("\r\n", "\n")
    verses = poem.get("Verses") or []
    return "\n".join(v.get("Text") or "" for v in verses)


def detect_themes(text: str) -> list[str]:
    norm = normalize(text)
    hits: set[str] = set()
    for theme_id, (_label, stems) in THEMES.items():
        for stem in stems:
            if normalize(stem) and normalize(stem) in norm:
                hits.add(theme_id)
                break
    tokens = set(tokenize(text))
    for alias, theme_id in THEME_ALIASES.items():
        if normalize(alias) in tokens or normalize(alias) in norm:
            hits.add(theme_id)
    return sorted(hits)


def metre_short(rhythm: str | None) -> str:
    if not rhythm:
        return "بی‌وزن"
    if "(" in rhythm and ")" in rhythm:
        return rhythm[rhythm.rfind("(") + 1 : rhythm.rfind(")")].strip()
    return rhythm[:48]


def should_fetch_poem(slug: str, poem_url: str, sample_budget: dict[str, int]) -> bool:
    parts = path_from_url(poem_url).split("/")
    if slug in CANON_FULL:
        allowed = CANON_FULL[slug]
        if allowed is None:
            return True
        return any(seg in allowed for seg in parts[1:])
    if slug in CANON_SAMPLE:
        if sample_budget[slug] <= 0:
            return False
        sample_budget[slug] -= 1
        return True
    return False


def build(base: str, jobs: int) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    manifest = fetch_json(base, "manifest.json")
    if not manifest:
        sys.exit("could not load manifest.json")

    poets_meta = manifest["Poets"]
    print(f"manifest: {manifest['PoetsCount']} poets, {manifest['PoemsCount']} poems")

    atlas = []
    works = []
    poems_out = []
    poet_theme = defaultdict(Counter)
    poet_metre = defaultdict(Counter)
    poet_place = {}
    poet_year = {}
    poet_school = {}
    poet_names = {}
    work_counts = Counter()

    sample_budget = {k: v for k, v in CANON_SAMPLE.items()}

    def load_poet(entry: dict) -> dict | None:
        slug = poet_slug(entry["FullUrl"])
        return fetch_json(base, f"poets/{slug}/poet.json")

    with ThreadPoolExecutor(max_workers=min(jobs, 12)) as pool:
        poet_jsons = list(pool.map(load_poet, poets_meta))

    for entry, poet in zip(poets_meta, poet_jsons):
        slug = poet_slug(entry["FullUrl"])
        if not poet:
            continue
        year = poet.get("BirthYearInLHijri") or poet.get("DeathYearInLHijri")
        school = school_for(slug, year if isinstance(year, int) else None)
        place = poet.get("BirthPlace") or poet.get("DeathPlace")
        poet_names[slug] = poet.get("Nickname") or poet.get("Name") or slug
        poet_year[slug] = year if isinstance(year, int) else None
        poet_school[slug] = school
        if place:
            poet_place[slug] = place
        atlas.append(
            {
                "id": poet["Id"],
                "slug": slug,
                "name": poet.get("Name"),
                "nickname": poet.get("Nickname"),
                "bio": poet.get("Description") or "",
                "url": poet.get("FullUrl"),
                "birth": poet.get("BirthYearInLHijri"),
                "death": poet.get("DeathYearInLHijri"),
                "place": place,
                "school": school,
                "century": century_label(year if isinstance(year, int) else None),
            }
        )

    print(f"atlas: {len(atlas)} poets")

    # Walk category trees sequentially per poet (cache makes reruns cheap).
    poem_jobs: list[tuple[str, str, str]] = []  # slug, title, full_url
    for row in atlas:
        slug = row["slug"]
        root = fetch_json(base, f"poets/{slug}/_cat.json")
        if not root:
            continue
        if slug in CANON_FULL:
            max_depth, poem_cap = 3, None
        elif slug in CANON_SAMPLE:
            max_depth, poem_cap = 2, CANON_SAMPLE[slug] * 2
        else:
            max_depth, poem_cap = 0, 0
        print(f"  walk {slug}", flush=True)
        cats = walk_categories(
            base,
            slug,
            root,
            set(),
            depth=0,
            max_depth=max_depth,
            poem_cap=poem_cap,
            listed=[0],
        )
        for cat in cats:
            cat_url = cat.get("FullUrl") or f"/{slug}"
            poems = cat.get("Poems") or []
            children = cat.get("ChildCats") or []
            if poems or (cat_url.strip("/") != slug and not children):
                works.append(
                    {
                        "poet": slug,
                        "title": cat.get("Title"),
                        "url": cat_url,
                        "poems": len(poems),
                    }
                )
                work_counts[slug] += len(poems)
            for poem in poems:
                poem_jobs.append((slug, poem.get("Title") or "", poem["FullUrl"]))

    print(f"listed poems: {len(poem_jobs)}")

    to_fetch = []
    for slug, title, url in poem_jobs:
        if should_fetch_poem(slug, url, sample_budget):
            to_fetch.append((slug, title, url))
    print(f"fetching poems: {len(to_fetch)}")

    def load_poem(item: tuple[str, str, str]) -> dict | None:
        slug, title, url = item
        rel = f"poets/{path_from_url(url)}.json"
        poem = fetch_json(base, rel)
        if not poem:
            return None
        text = poem_plain(poem)
        metre = (poem.get("Metre") or {}).get("Rhythm")
        themes = detect_themes(text + " " + (poem.get("PoemSummary") or ""))
        fmt = None
        if poem.get("Sections"):
            fmt = poem["Sections"][0].get("PoemFormat")
        return {
            "id": poem["Id"],
            "slug": slug,
            "poet": poet_names.get(slug, slug),
            "title": poem.get("Title") or title,
            "fullTitle": poem.get("FullTitle"),
            "url": poem.get("FullUrl") or url,
            "rhyme": poem.get("RhymeLetters"),
            "summary": poem.get("PoemSummary") or "",
            "metre": metre_short(metre),
            "metreFull": metre,
            "format": fmt,
            "text": text,
            "themes": themes,
            "couplets": (poem.get("Sections") or [{}])[0].get("CoupletsCount"),
        }

    done = 0
    with ThreadPoolExecutor(max_workers=min(jobs, 10)) as pool:
        futures = [pool.submit(load_poem, item) for item in to_fetch]
        for fut in as_completed(futures):
            rec = fut.result()
            done += 1
            if done % 100 == 0:
                print(f"  poems {done}/{len(to_fetch)}")
            if not rec:
                continue
            poems_out.append(rec)
            for theme in rec["themes"]:
                poet_theme[rec["slug"]][theme] += 1
            if rec["metre"]:
                poet_metre[rec["slug"]][rec["metre"]] += 1

    poems_out.sort(key=lambda p: (p["slug"], p["id"]))
    print(f"indexed poems: {len(poems_out)}")

    # Graph
    nodes = []
    edges = []
    seen_nodes = set()

    def add_node(nid: str, ntype: str, label: str, **meta):
        if nid in seen_nodes:
            return
        seen_nodes.add(nid)
        nodes.append({"id": nid, "type": ntype, "label": label, **meta})

    def add_edge(src: str, dst: str, etype: str, weight: float = 1.0):
        edges.append({"source": src, "target": dst, "type": etype, "weight": weight})

    for row in atlas:
        slug = row["slug"]
        add_node(
            f"poet:{slug}",
            "poet",
            row["nickname"] or row["name"],
            slug=slug,
            school=row["school"],
            century=row["century"],
            poems=work_counts.get(slug, 0),
        )
        if row["school"]:
            add_node(f"school:{row['school']}", "school", row["school"])
            add_edge(f"poet:{slug}", f"school:{row['school']}", "school")
        if row["century"]:
            add_node(f"century:{row['century']}", "century", row["century"])
            add_edge(f"poet:{slug}", f"century:{row['century']}", "century")
        if row["place"]:
            add_node(f"place:{row['place']}", "place", row["place"])
            add_edge(f"poet:{slug}", f"place:{row['place']}", "place")

    for theme_id, (label, _stems) in THEMES.items():
        add_node(f"theme:{theme_id}", "theme", label)

    for slug, counts in poet_theme.items():
        for theme_id, n in counts.items():
            if n >= 2:
                add_edge(f"poet:{slug}", f"theme:{theme_id}", "theme", float(n))

    metre_keep = Counter()
    for counts in poet_metre.values():
        metre_keep.update(counts)
    top_metres = {m for m, _n in metre_keep.most_common(18)}
    for slug, counts in poet_metre.items():
        for metre, n in counts.items():
            if metre in top_metres and n >= 3:
                add_node(f"metre:{metre}", "metre", metre)
                add_edge(f"poet:{slug}", f"metre:{metre}", "metre", float(n))

    for src, dst in INFLUENCE:
        if f"poet:{src}" in seen_nodes and f"poet:{dst}" in seen_nodes:
            add_edge(f"poet:{src}", f"poet:{dst}", "influence", 2.0)

    # Communities: school x century
    communities = []
    buckets = defaultdict(list)
    for row in atlas:
        key = (row["school"] or "نامشخص", row["century"] or "بی‌تاریخ")
        buckets[key].append(row)
    for (school, century), members in sorted(buckets.items(), key=lambda kv: -len(kv[1])):
        if len(members) < 2:
            continue
        slugs = [m["slug"] for m in members]
        theme_roll = Counter()
        for slug in slugs:
            theme_roll.update(poet_theme.get(slug, {}))
        top_themes = [
            THEMES[tid][0] for tid, _n in theme_roll.most_common(4) if tid in THEMES
        ]
        names = "، ".join((m["nickname"] or m["name"]) for m in members[:8])
        note = f"{school}، {century}. {len(members)} سخنور: {names}."
        if top_themes:
            note += " مضامین پرتکرار: " + "، ".join(top_themes) + "."
        communities.append(
            {
                "id": f"{school}-{century}",
                "school": school,
                "century": century,
                "size": len(members),
                "poets": slugs,
                "note": note,
            }
        )

    stats = {
        "poets": len(atlas),
        "works": len(works),
        "indexedPoems": len(poems_out),
        "nodes": len(nodes),
        "edges": len(edges),
        "communities": len(communities),
        "sourcePoets": manifest["PoetsCount"],
        "sourcePoems": manifest["PoemsCount"],
        "generatedAt": manifest.get("GeneratedAtUtc"),
        "source": "https://github.com/ganjoor/ganjoor-data",
    }

    # Search docs: drop nothing needed, keep text.
    search_docs = [
        {
            "id": str(p["id"]),
            "url": p["url"],
            "slug": p["slug"],
            "poet": p["poet"],
            "title": p["title"],
            "text": (p["text"] or "")[:1400],
            "summary": (p["summary"] or "")[:400],
            "metre": p["metre"],
            "format": p["format"],
            "themes": p["themes"],
            "rhyme": p["rhyme"],
        }
        for p in poems_out
    ]

    def dump(name: str, obj) -> None:
        dest = OUT / name
        dest.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {dest.relative_to(ROOT)} ({dest.stat().st_size // 1024} KB)")

    dump("stats.json", stats)
    dump("atlas.json", atlas)
    dump("works.json", works)
    dump("graph.json", {"nodes": nodes, "edges": edges})
    dump("communities.json", communities)
    dump("index.json", search_docs)
    dump(
        "themes.json",
        [{"id": k, "label": v[0], "stems": v[1]} for k, v in THEMES.items()],
    )
    print("stats", json.dumps(stats, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--jobs", type=int, default=8)
    args = parser.parse_args()
    build(args.base, args.jobs)


if __name__ == "__main__":
    main()
