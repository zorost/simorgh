const DIACRITICS =
  /[\u064b-\u065f\u0670\u06d6-\u06ed\u08d3-\u08e1\u08e3-\u08ff]/g;
const SPACES = /[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+/g;
const PUNCT = /[،؛؟!.:«»"'()[\]{}،,;?…ـ]+/g;

export function normalize(text) {
  if (!text) return "";
  return text
    .replace(/\u064a/g, "\u06cc")
    .replace(/\u0643/g, "\u06a9")
    .replace(/\u0622/g, "\u0627")
    .replace(/\u0623/g, "\u0627")
    .replace(/\u0625/g, "\u0627")
    .replace(/ة/g, "ه")
    .replace(DIACRITICS, "")
    .replace(/\u0640/g, "")
    .replace(/[\u200c\u200d]/g, "")
    .replace(PUNCT, " ")
    .replace(SPACES, " ")
    .replace(/\s+(ها|ای|تر|ترین)\b/g, "$1")
    .trim();
}

export function tokenize(text) {
  return normalize(text).split(" ").filter(Boolean);
}

export function snippet(text, query, width = 90) {
  const n = normalize(text);
  const q = normalize(query);
  const i = q ? n.indexOf(q) : 0;
  const start = Math.max(0, i - 20);
  const raw = text.replace(/\s+/g, " ").trim();
  const cut = raw.slice(start, start + width);
  return (start > 0 ? "…" : "") + cut + (start + width < raw.length ? "…" : "");
}
