# Contributing

## Data

Do not commit `.cache/` or a fresh dump of ganjoor-data. Rebuild with:

```bash
python3 scripts/build_corpus.py
```

If you add a poet to the canon sample list, keep `public/data/index.json` small enough for GitHub Pages.

## Search

Persian normalization lives in `scripts/persian.py` and `src/lib/persian.js`. Change both. `tests/test_persian.py` must stay green.

## Chat

No key in the repo. No proxy that logs prompts. If you add a provider, keep it BYOK.

## Copy

Persian UI follows living engineer Persian: ی and ک, نیم‌فاصله, no administrative fillers. English UI is short and literal.
