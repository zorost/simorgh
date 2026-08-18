# DESIGN.md

Recorded from the shipped night-atlas surface.

## World

An astrolabe laid on indigo chart paper. The graph is the object. Chrome recedes.

## Palette

| Token | OKLCH | Role |
|---|---|---|
| `--paper` | 19% 0.038 262 | page |
| `--paper-2` | 23% 0.04 262 | panel |
| `--ink` | 96% 0.018 92 | body |
| `--ink-2` | 84% 0.03 92 | secondary, still ≥ 4.5:1 on paper |
| `--saffron` | 78% 0.155 78 | selection, influence |
| `--verdigris` | 74% 0.09 188 | theme, links |
| `--rose` | 72% 0.11 18 | school marks |

## Type

- UI: Vazirmatn
- Verse: Scheherazade New
- No italic headings
- Measure for bios stays inside the panel

## Motion

Pan and zoom on the chart. Buttons scale to 0.97 on press. No entrance stagger. `prefers-reduced-motion` kills transitions.

## Contrast

Ink on paper is the reading pair. Saffron is only used as a large fill (mode on, primary ask) so the dark text-on-saffron pair is not required; those controls flip to `--paper` text.

## Provenance

`public/og.png` is a fal.ai Flux schnell still, generated 2026-08-17, no watermark, no personal handle.
