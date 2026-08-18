const PIN = "main";
export const CDN = `https://cdn.jsdelivr.net/gh/ganjoor/ganjoor-data@${PIN}`;

export function poemPath(url) {
  return `poets/${String(url).replace(/^\//, "")}.json`;
}

export async function fetchPoem(url) {
  const res = await fetch(`${CDN}/${poemPath(url)}`);
  if (!res.ok) throw new Error(`poem ${url}: ${res.status}`);
  return res.json();
}

export function coupletsFrom(poem) {
  const verses = poem.Verses || [];
  const pairs = [];
  let current = { right: "", left: "" };
  for (const v of verses) {
    if (v.Position === "Right" || v.Position === 0 || v.Position === "Centered") {
      if (current.right || current.left) pairs.push(current);
      current = { right: v.Text || "", left: "" };
    } else {
      current.left = v.Text || "";
    }
  }
  if (current.right || current.left) pairs.push(current);
  if (!pairs.length && poem.Sections?.[0]?.PlainText) {
    const lines = poem.Sections[0].PlainText.split(/\r?\n/).filter(Boolean);
    for (let i = 0; i < lines.length; i += 2) {
      pairs.push({ right: lines[i], left: lines[i + 1] || "" });
    }
  }
  return pairs;
}

export function ganjoorHref(url) {
  return `https://ganjoor.net${url.startsWith("/") ? url : `/${url}`}`;
}
