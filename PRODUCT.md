# PRODUCT.md

Inferred from the 2026-08-17 brief. Marked where the brief did not name a fact.

## Purpose

Simorgh is a public map of the Ganjoor Persian poetry corpus. The graph is the product. Chat is a lamp you can hang on the map, not the map.

## Users

Primary: a Persian reader who remembers a line, a poet, or a mood and wants the poem and its neighbors.

Secondary: a student or researcher who wants metre, school, place, and theme as first-class objects.

## Job

See the canon as a graph, find a poem, read it, ask a question that returns cited couplets.

## Mechanism

1. Read `ganjoor/ganjoor-data` as a static HTTPS API.
2. Build a compact atlas and a theme/metre/school graph offline.
3. Search with Persian-normalized BM25 plus graph expansion.
4. Optionally send that neighborhood to an OpenRouter-compatible model with the visitor's own key.

## What this is not

Not ganjoor.net. Not مین‌گنجور (a poet list). Not a generic chatbot that invents verses.

## Platform

web. GitHub Pages. No backend.

## Stack

Delegated: Vite, vanilla JS, Python 3.10+ for the offline build. No React.

## Voice

Persian first. Conversational-technical, not administrative. English is a second pane, not a translation of the brand.

## Constraints

- No secrets, no personal names, no analytics IDs in the repo
- Classical text is public domain; Ganjoor's compilation and summaries are theirs
- Contrast floor: body text ≥ 4.5:1

## Evidence

- ganjoor-data: 234 poets, 132591 poems, generated 2026-08-16
- Schema: `poet.json`, `_cat.json`, poem JSON with `Verses`, `Metre`, `PoemSummary`
- Plugin limitation: Markdown + QMD + MCP, no public graph
