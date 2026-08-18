import { normalize, tokenize } from "./persian.js";

const K1 = 1.4;
const B = 0.75;

export function buildIndex(docs) {
  const df = new Map();
  const lengths = [];
  const prepared = docs.map((doc) => {
    const tokens = tokenize(`${doc.text} ${doc.title} ${doc.poet} ${doc.summary || ""}`);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    lengths.push(tokens.length || 1);
    return { doc, tf };
  });
  const avg = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1);
  const n = docs.length;
  return { prepared, df, avg, n };
}

export function search(index, query, limit = 8) {
  const qTokens = tokenize(query);
  if (!qTokens.length || !index) return [];
  const { prepared, df, avg, n } = index;
  const scores = [];
  for (const { doc, tf } of prepared) {
    let score = 0;
    for (const t of qTokens) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (n - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
      const dl = [...tf.values()].reduce((a, b) => a + b, 0) || 1;
      const tfNorm = (f * (K1 + 1)) / (f + K1 * (1 - B + B * (dl / avg)));
      score += idf * tfNorm;
    }
    const nq = normalize(query);
    const ntext = normalize(`${doc.text} ${doc.title} ${doc.summary || ""}`);
    if (nq && ntext.includes(nq)) score += 4;
    if (normalize(doc.poet).includes(nq) || normalize(doc.title).includes(nq)) score += 2;
    if (score > 0) scores.push({ doc, score });
  }
  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, limit);
}

export function byPoet(docs, slug) {
  return docs.filter((d) => d.slug === slug);
}

export function byTheme(docs, themeId) {
  return docs.filter((d) => (d.themes || []).includes(themeId));
}
