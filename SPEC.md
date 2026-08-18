# Simorgh

## User

A Persian reader, student, or researcher who already knows a line, a poet, or a feeling, and wants to see where it sits in the canon.

## Job to be done

Open a map of the Ganjoor corpus, find the poem that answers the question, read it, and (optionally) talk to the map with citations. Success is a cited couplet, not a vibe.

## Business context

`ganjoor/ganjoor-data` published 234 poets and ~132,591 poems as a static JSON API. Simorgh creates a browser-native knowledge graph that reads the data over HTTPS and ships an instant, cited retrieval layer with Persian-normalized search and historical astrolabe visualization.

## In scope

- Consume `ganjoor-data` live via jsDelivr (never fork the 2 GB tree)
- Poet atlas for every published poet
- Obsidian-style graph: poet, work, theme, metre, place, century, school
- Persian-normalized lexical search over a shipped canon index
- On-demand poem fetch from the official JSON
- Optional BYOK chat (OpenRouter-compatible) grounded in retrieved verses + graph neighborhood
- GitHub Pages site with no server and no secrets
- Evals for the retrieval path

## Out of scope

- Hosting API keys or a backend
- Fine-tuning a model
- Embedding all 132k poems
- Comments, accounts, bookmarks (Ganjoor excludes them; we do too)
- Replacing ganjoor.net as a reading site
- English enrichment crawls of the full corpus

## Constraint that will not move

The public site works with no key. Search, graph, and reading are local. Chat is optional and the key never leaves the browser.

## Tradeoff we refuse

We refuse snippet-only answers. If the model cannot cite a poem that the retriever actually returned, it must say it does not know.

## Pace

Careful MVP. The data contract is real and public. The first ship is a working atlas + graph + cited search + optional chat, not a throwaway prototype.

## Building blocks

- Context engineering: system prompt + retrieved verses + graph neighborhood + community notes
- RAG: hybrid BM25 + theme lexicon + graph expansion
- GraphRAG-lite: precomputed communities (school × century) with extractive notes
- LLM: only for optional chat, user-supplied key
- Evals: known-line retrieval, empty-retrieval refusal

## Live tradeoffs

- Cost: static hosting, user pays their own chat tokens
- Scale: full poet graph (234); verse index is a canon slice, full poems load on demand
- Reliability: jsDelivr can lag `@main` by a few days; pin a commit in the client
- Speed: first paint is the graph from local JSON; poems stream later
- Security: no secrets in the repo; keys in `localStorage` only
- Privacy: no analytics, no accounts
