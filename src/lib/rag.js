import { search } from "./search.js";
import { normalize } from "./persian.js";

/*
 * Client-side cited retrieval. Answers are assembled strictly from the
 * indexed ganjoor-data slice; nothing is generated or paraphrased.
 *
 * An optional remote endpoint may be configured in the future through
 * `window.SIMORGH_CHAT` ({ endpoint, key, model }); it is intentionally
 * absent from the public build so no key ever ships with the site.
 */

export function retrieve({ index, atlas, themes, query, limit = 5 }) {
  const q = normalize(query);

  const poets = (atlas || [])
    .filter((p) => {
      const nick = normalize(p.nickname || "");
      const name = normalize(p.name || "");
      if (!q) return false;
      return (
        (nick && (q.includes(nick) || nick.includes(q))) ||
        (name && (q.includes(name) || name.includes(q)))
      );
    })
    .sort((a, b) => normalize(b.nickname || b.name).length - normalize(a.nickname || a.name).length);

  const matchedThemes = (themes || []).filter((th) => {
    const label = normalize(th.label);
    if (label && (q.includes(label) || label.includes(q))) return true;
    return (th.stems || []).some((s) => q.includes(normalize(s)));
  });

  let hits = index ? search(index, query, limit + 3) : [];
  const poet = poets[0] || null;
  if (poet) {
    const own = hits.filter(({ doc }) => doc.slug === poet.slug);
    if (own.length >= 2) hits = own;
  }

  return { hits: hits.slice(0, limit), poet, themes: matchedThemes, query };
}

export function firstCouplet(text) {
  const lines = (text || "").split("\n").map((l) => l.trim()).filter(Boolean);
  return { right: lines[0] || "", left: lines[1] || "" };
}

export async function remoteChat(query, contextText) {
  const cfg = typeof window !== "undefined" ? window.SIMORGH_CHAT : null;
  if (!cfg || !cfg.endpoint || !cfg.key) return null;
  try {
    const res = await fetch(cfg.endpoint.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model || "",
        temperature: 0.2,
        messages: [
          { role: "system", content: "Answer only from the provided Persian poetry context. Cite couplets verbatim." },
          { role: "user", content: `QUESTION:\n${query}\n\nCONTEXT:\n${contextText}` },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}
