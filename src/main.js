import ForceGraph from "force-graph";
import { forceCollide, forceX, forceY } from "d3-force";
import { copy, faNum } from "./i18n.js";
import { coupletsFrom, fetchPoem, ganjoorHref } from "./lib/ganjoor.js";
import { normalize, snippet } from "./lib/persian.js";
import { firstCouplet, retrieve } from "./lib/rag.js";
import { buildIndex, byPoet, byTheme, search } from "./lib/search.js";

/* ————————————————— palette (mirrors styles.css) ————————————————— */

const C = {
  gold: "#c8a24b",
  goldBright: "#e9cd8a",
  ivory: "#f1e9d6",
  turquoise: "#46b5a7",
  turquoiseBright: "#7fd8ca",
  azure: "#8fa8d9",
  azureBright: "#b7c8ee",
  disc: "#1a2340",
  pill: "rgba(6, 9, 18, 0.78)",
  ring: "rgba(200, 162, 75, 0.85)",
  ringDim: "rgba(200, 162, 75, 0.5)",
  link: {
    century: "rgba(200, 162, 75, 0.15)",
    theme: "rgba(70, 181, 167, 0.11)",
    place: "rgba(143, 168, 217, 0.13)",
  },
  linkActive: {
    century: "rgba(233, 205, 138, 0.85)",
    theme: "rgba(127, 216, 202, 0.85)",
    place: "rgba(183, 200, 238, 0.85)",
  },
  linkFaded: "rgba(80, 90, 120, 0.03)",
};

/* ————————————————— state ————————————————— */

const state = {
  lang: "fa",
  mode: "graph",
  filter: "all",
  atlas: [],
  themes: [],
  works: [],
  stats: null,
  nodes: [],
  links: [],
  docs: [],
  index: null,
  adj: new Map(),
  poemCounts: new Map(),
  selectedId: null,
  hoverNode: null,
  activeIds: null,
  images: new Map(),
  atlasQuery: "",
  atlasCentury: "all",
  chatStarted: false,
  fitted: false,
  zoomK: 1,
};

let graph = null;

const $ = (id) => document.getElementById(id);
const t = (key) => (copy[state.lang] || copy.fa)[key] ?? key;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const poetBySlug = (slug) => state.atlas.find((p) => p.slug === slug);
const themeById = (id) => state.themes.find((th) => th.id === id);
const poemsOf = (slug) => state.poemCounts.get(slug) || 0;
const idOf = (end) => (typeof end === "object" ? end.id : end);
const isTouch = matchMedia("(pointer: coarse)").matches;

/* ————————————————— i18n ————————————————— */

function applyLang() {
  document.documentElement.lang = state.lang;
  document.documentElement.dir = state.lang === "fa" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const v = (copy[state.lang] || {})[el.dataset.i18n];
    if (typeof v === "string") el.textContent = v;
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  $("lang").textContent = state.lang === "fa" ? "EN" : "فا";
  renderStatus();
  renderChatPrompts();
  const welcome = $("chat-log").querySelector("[data-welcome]");
  if (welcome) {
    welcome.innerHTML = `
    <div class="cite-head">${t("chatWelcomeTitle")}</div>
    <p class="lead" style="margin-top:7px">${t("chatWelcome")}</p>
  `;
  }
  if (state.mode === "atlas") renderAtlas();
}

function renderStatus() {
  if (!state.stats) return;
  const ready = t("ready");
  $("status").textContent = faNum(typeof ready === "function" ? ready(state.stats) : "", state.lang);
}

/* ————————————————— images ————————————————— */

function poetImg(slug) {
  if (state.images.has(slug)) return state.images.get(slug);
  const img = new Image();
  img.src = `./data/poets/${slug}.gif`;
  img.onload = () => redraw();
  state.images.set(slug, img);
  return img;
}

function redraw() {
  if (graph) graph.nodeRelSize(graph.nodeRelSize());
}

/* ————————————————— graph geometry ————————————————— */

function nodeR(n) {
  // The treasury view carries always-on labels, so its shapes stay small and fine.
  const fine = state.filter === "featured";
  // Poet size follows the poet's full corpus in ganjoor-data (log scale keeps
  // Saeb's 9877 poems from dwarfing everyone while epics still read large).
  if (n.type === "poet") return Math.min(16, 3.2 + Math.log2(1 + (n.poems || 0)) * 1.05) * (fine ? 0.85 : 1);
  if (n.type === "century") return Math.min(17, 9 + (n.members || 0) * 0.16) * (fine ? 0.62 : 1);
  if (n.type === "theme") return Math.min(9.5, 3.6 + (n.members || 0) * 0.32) * (fine ? 0.8 : 1);
  if (n.type === "poem") return 2.1;
  return Math.min(7, 2.8 + (n.members || 0) * 0.45);
}

function seedPositions() {
  const cents = state.nodes.filter((n) => n.type === "century").sort((a, b) => a.order - b.order);
  const slots = new Map();
  cents.forEach((c, i) => {
    const k = cents.length > 1 ? i / (cents.length - 1) : 0.5;
    c.slotX = (0.5 - k) * 1500;
    c.slotY = -Math.sin(k * Math.PI) * 150;
    c.x = c.slotX;
    c.y = c.slotY;
    slots.set(c.order, c);
  });
  for (const n of state.nodes) {
    if (n.type === "poet") {
      const hub = slots.get(n.century);
      n.slotX = hub ? hub.slotX : 0;
      n.slotY = hub ? hub.slotY : 120;
      n.x = n.slotX + (Math.random() - 0.5) * 220;
      n.y = n.slotY + (Math.random() - 0.5) * 220;
    } else if (n.type === "theme") {
      n.x = (Math.random() - 0.5) * 500;
      n.y = 240 + Math.random() * 200;
    } else if (n.type === "place") {
      n.x = (Math.random() - 0.5) * 900;
      n.y = -220 - Math.random() * 160;
    }
  }
  // Poems start beside their poet so the treasury settles into tight orbits.
  const poetPos = new Map(state.nodes.filter((n) => n.type === "poet").map((n) => [n.slug, n]));
  for (const n of state.nodes) {
    if (n.type === "poem") {
      const host = poetPos.get(n.slug);
      n.x = (host ? host.x : 0) + (Math.random() - 0.5) * 60;
      n.y = (host ? host.y : 0) + (Math.random() - 0.5) * 60;
    }
  }
}

function filteredData() {
  const f = state.filter;
  let nodes;
  let links;
  if (f === "poets") {
    nodes = state.nodes.filter((n) => n.type === "poet" || n.type === "century");
    links = state.links.filter((l) => l.type === "century");
  } else if (f === "themes") {
    const withTheme = new Set(state.links.filter((l) => l.type === "theme").map((l) => idOf(l.source)));
    nodes = state.nodes.filter((n) => n.type === "theme" || (n.type === "poet" && withTheme.has(n.id)));
    links = state.links.filter((l) => l.type === "theme");
  } else if (f === "places") {
    const withPlace = new Set(state.links.filter((l) => l.type === "place").map((l) => idOf(l.source)));
    nodes = state.nodes.filter((n) => n.type === "place" || (n.type === "poet" && withPlace.has(n.id)));
    links = state.links.filter((l) => l.type === "place");
  } else if (f === "featured") {
    const keep = new Set(
      state.nodes
        .filter(
          (n) =>
            n.type === "century" ||
            n.type === "theme" ||
            n.type === "poem" ||
            (n.type === "poet" && (n.indexed || 0) > 0),
        )
        .map((n) => n.id),
    );
    nodes = state.nodes.filter((n) => keep.has(n.id));
    links = state.links.filter((l) => keep.has(idOf(l.source)) && keep.has(idOf(l.target)) && l.type !== "place");
  } else {
    nodes = state.nodes.filter((n) => n.type !== "poem");
    links = state.links.filter((l) => l.type !== "poem");
  }
  const ids = new Set(nodes.map((n) => n.id));
  links = links.filter((l) => ids.has(idOf(l.source)) && ids.has(idOf(l.target)));
  return { nodes, links };
}

function rebuildAdjacency(data) {
  state.adj = new Map();
  for (const l of data.links) {
    const s = idOf(l.source);
    const d = idOf(l.target);
    if (!state.adj.has(s)) state.adj.set(s, new Set());
    if (!state.adj.has(d)) state.adj.set(d, new Set());
    state.adj.get(s).add(d);
    state.adj.get(d).add(s);
  }
}

function computeActive() {
  const focus = state.selectedId || (state.hoverNode && state.hoverNode.id);
  state.activeIds = focus ? new Set([focus, ...(state.adj.get(focus) || [])]) : null;
}

function linkTouchesFocus(l) {
  const focus = state.selectedId || (state.hoverNode && state.hoverNode.id);
  if (!focus) return false;
  return idOf(l.source) === focus || idOf(l.target) === focus;
}

/* ————————————————— canvas painting ————————————————— */

function labelText(n) {
  const s = n.label || "";
  return n.type === "poem" && s.length > 22 ? `${s.slice(0, 21)}…` : s;
}

function drawLabel(n, ctx, k, r, forced) {
  const isCentury = n.type === "century";
  let base = isCentury ? Math.max(5, r * 0.58) : n.type === "poem" ? 3.1 : Math.max(2.9, r * 0.55);
  const px = base * k;
  const gate = isCentury ? 4.5 : n.type === "poet" ? 7.5 : n.type === "poem" ? 6.4 : 8;
  if (!forced && px < gate) return;
  // Forced labels are the point of the treasury view: keep them readable
  // on screen no matter how far out the fit lands.
  if (forced) base = Math.max(base, (isCentury ? 11 : n.type === "poet" ? 10.5 : 9.5) / k);

  const size = base;
  const family = isCentury ? '"Scheherazade New", serif' : '"Vazirmatn", sans-serif';
  const weight = isCentury || (forced && n.type !== "poem") ? "700" : "500";
  ctx.font = `${weight} ${size}px ${family}`;
  const text = labelText(n);
  const w = ctx.measureText(text).width;
  const padX = size * 0.42;
  const padY = size * 0.24;
  const y = n.y + r + size * 0.62 + 1.5;

  ctx.fillStyle = C.pill;
  ctx.beginPath();
  ctx.roundRect(n.x - w / 2 - padX, y - size / 2 - padY, w + padX * 2, size + padY * 2, size * 0.45);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle =
    n.type === "poet" ? (forced ? C.goldBright : C.ivory)
    : isCentury ? C.goldBright
    : n.type === "theme" ? C.turquoiseBright
    : n.type === "poem" ? "rgba(233, 205, 138, 0.92)"
    : C.azureBright;
  ctx.fillText(text, n.x, y);
}

function paintNode(n, ctx, k) {
  const r = nodeR(n);
  const focusActive = !!state.activeIds;
  const isActive = !focusActive || state.activeIds.has(n.id);
  const isFocus = state.selectedId === n.id || (state.hoverNode && state.hoverNode.id === n.id);
  ctx.globalAlpha = isActive ? 1 : 0.13;

  if (isFocus) {
    const halo = ctx.createRadialGradient(n.x, n.y, r * 0.6, n.x, n.y, r * 2.4);
    halo.addColorStop(0, "rgba(233, 205, 138, 0.28)");
    halo.addColorStop(1, "rgba(233, 205, 138, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  if (n.type === "poet") {
    const img = poetImg(n.slug);
    const showImg = img && img.complete && img.naturalWidth > 0 && r * k >= (state.filter === "featured" ? 5.5 : 8);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = C.disc;
    ctx.fill();
    if (showImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, Math.max(0.4, r - 0.7), 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, n.x - r, n.y - r, r * 2, r * 2);
      ctx.restore();
    } else if (r * k >= 5.5) {
      ctx.fillStyle = C.gold;
      ctx.font = `600 ${r * 1.02}px "Scheherazade New", serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((n.label || "")[0] || "", n.x, n.y + r * 0.08);
    }
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.lineWidth = isFocus ? Math.max(1.6, 2.4 / k) : (n.indexed || 0) > 0 ? 1.1 : 0.7;
    ctx.strokeStyle = isFocus ? C.goldBright : (n.indexed || 0) > 0 ? C.ring : C.ringDim;
    ctx.stroke();
  } else if (n.type === "century") {
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20, 28, 52, 0.55)";
    ctx.fill();
    ctx.lineWidth = isFocus ? 2 : 1.1;
    ctx.strokeStyle = isFocus ? C.azureBright : "rgba(143, 168, 217, 0.6)";
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(n.x, n.y, r * 0.72, 0, Math.PI * 2);
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = "rgba(143, 168, 217, 0.3)";
    ctx.stroke();
    const inner = Math.max(4, r * 0.52);
    ctx.font = `700 ${inner}px "Scheherazade New", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.goldBright;
    ctx.fillText(labelText(n), n.x, n.y);
    ctx.globalAlpha = 1;
    return;
  } else if (n.type === "theme") {
    ctx.save();
    ctx.translate(n.x, n.y);
    ctx.rotate(Math.PI / 4);
    const s = r * 1.35;
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s / 2, s, s, s * 0.18);
    ctx.fillStyle = "rgba(70, 181, 167, 0.2)";
    ctx.fill();
    ctx.lineWidth = isFocus ? 1.8 : 1;
    ctx.strokeStyle = isFocus ? C.turquoiseBright : C.turquoise;
    ctx.stroke();
    ctx.restore();
  } else if (n.type === "poem") {
    // A mote of gold: one indexed poem, clickable into the reader.
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isFocus ? C.goldBright : "rgba(233, 205, 138, 0.78)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = isFocus ? 0.9 : 0.5;
    ctx.strokeStyle = isFocus ? "rgba(233, 205, 138, 0.75)" : "rgba(200, 162, 75, 0.3)";
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(143, 168, 217, 0.55)";
    ctx.fill();
    ctx.lineWidth = isFocus ? 1.6 : 0.8;
    ctx.strokeStyle = isFocus ? C.azureBright : "rgba(143, 168, 217, 0.8)";
    ctx.stroke();
  }

  const neighborOfFocus = focusActive && isActive;
  const forced =
    isFocus ||
    (neighborOfFocus && k > 0.55) ||
    (state.filter === "featured" && n.type !== "poem");
  drawLabel(n, ctx, k, r, forced);
  ctx.globalAlpha = 1;
}

function paintRings(ctx) {
  ctx.save();
  ctx.lineWidth = 1;
  for (let i = 1; i <= 5; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 40, 190 * i, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(200, 162, 75, ${0.05 - i * 0.006})`;
    ctx.stroke();
  }
  ctx.setLineDash([3, 9]);
  ctx.beginPath();
  ctx.arc(0, 40, 1080, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(200, 162, 75, 0.05)";
  ctx.stroke();
  ctx.restore();
}

/* ————————————————— graph init ————————————————— */

function graphSize() {
  const el = $("graph-wrap");
  return { w: el.clientWidth, h: el.clientHeight };
}

function initGraph() {
  seedPositions();
  const mount = $("graph-mount");
  const { w, h } = graphSize();

  graph = new ForceGraph(mount)
    .width(w)
    .height(h)
    .backgroundColor("rgba(0,0,0,0)")
    .minZoom(0.25)
    .maxZoom(10)
    .nodeId("id")
    .nodeVal((n) => nodeR(n))
    .nodeCanvasObject((n, ctx, k) => paintNode(n, ctx, k))
    .nodePointerAreaPaint((n, color, ctx, k) => {
      const r = Math.max(nodeR(n), 13 / k);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
    })
    .onRenderFramePre((ctx) => paintRings(ctx))
    .linkColor((l) => {
      if (linkTouchesFocus(l)) return C.linkActive[l.type] || C.linkActive.century;
      if (state.activeIds) return C.linkFaded;
      if (l.type === "theme" && state.filter === "featured") return "rgba(70, 181, 167, 0.09)";
      if (l.type === "theme" && state.zoomK < 0.6) return "rgba(70, 181, 167, 0.05)";
      return C.link[l.type] || C.link.century;
    })
    .linkWidth((l) => {
      let base = l.type === "theme" ? 0.35 + Math.sqrt(l.weight || 1) * 0.22 : l.type === "century" ? 0.8 : 0.65;
      if (l.type === "theme" && state.filter === "featured") base = Math.min(base, 1);
      return linkTouchesFocus(l) ? base * 2.4 + 0.6 : base;
    })
    .linkDirectionalParticles((l) => (state.selectedId && linkTouchesFocus(l) ? 2 : 0))
    .linkDirectionalParticleWidth(2.3)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleColor(() => C.goldBright)
    .autoPauseRedraw(false)
    .cooldownTime(9000)
    .onNodeHover((n) => {
      state.hoverNode = n || null;
      computeActive();
      $("graph-mount").style.cursor = n ? "pointer" : "grab";
      renderHoverCard(n);
    })
    .onNodeClick((n) => selectNode(n))
    .onNodeDragEnd((n) => {
      n.fx = undefined;
      n.fy = undefined;
    })
    .onBackgroundClick(() => {
      clearSelection();
      closeInspector();
    })
    .onZoom(({ k }) => {
      state.zoomK = k;
      if (state.hoverNode) renderHoverCard(null);
    })
    .onEngineStop(() => {
      if (!state.fitted) {
        state.fitted = true;
        // The treasury frames its poets and poems; centuries may rest offstage.
        if (state.filter === "featured") graph.zoomToFit(700, 70, (n) => n.type !== "century");
        else graph.zoomToFit(700, 60);
      }
    });

  // Force callbacks re-evaluate on graphData(), so they may read state.filter.
  graph
    .d3Force("charge")
    .strength((n) => (n.type === "poem" ? -14 : state.filter === "featured" ? -150 : -85))
    .distanceMax(520);
  graph
    .d3Force("link")
    .distance((l) =>
      l.type === "poem" ? 26
      : l.type === "century" ? (state.filter === "featured" ? 155 : 115)
      : l.type === "theme" ? (state.filter === "featured" ? 165 : 105)
      : 80,
    )
    .strength((l) =>
      l.type === "poem" ? 0.55
      : l.type === "century" ? (state.filter === "featured" ? 0.08 : 0.32)
      : l.type === "theme" ? 0.045
      : 0.16,
    );
  graph.d3Force("center", null);
  const slotPull = (d) =>
    d.type === "century" ? 0.42
    : d.slotX == null ? 0.015
    : d.type === "poet" && state.filter === "featured" ? 0.016
    : 0.05;
  graph.d3Force("x", forceX((d) => d.slotX ?? 0).strength(slotPull));
  graph.d3Force("y", forceY((d) => d.slotY ?? 0).strength(slotPull));
  graph.d3Force(
    "collide",
    forceCollide()
      .radius((d) =>
        nodeR(d) + (d.type === "poem" ? 3 : d.type === "poet" ? (state.filter === "featured" ? 48 : 4.2) : 7),
      )
      .iterations(3),
  );

  applyFilter(state.filter, true);

  window.addEventListener("resize", () => {
    const s = graphSize();
    graph.width(s.w).height(s.h);
  });

  // Hover card follows the pointer with an offset above it.
  $("graph-mount").addEventListener("pointermove", (ev) => {
    const card = $("hovercard");
    if (!card.hidden) {
      card.style.left = `${ev.clientX}px`;
      card.style.top = `${ev.clientY}px`;
    }
  });

  // Warm portraits of the indexed canon first.
  state.nodes
    .filter((n) => n.type === "poet" && (n.indexed || 0) > 0)
    .forEach((n) => poetImg(n.slug));
}

function applyFilter(f, first = false) {
  state.filter = f;
  document.querySelectorAll(".chip").forEach((b) => b.classList.toggle("is-on", b.dataset.filter === f));
  $("legend-poem").hidden = f !== "featured";
  const data = filteredData();
  rebuildAdjacency(data);
  computeActive();
  graph.graphData(data);
  if (!first) {
    state.fitted = false;
    graph.d3ReheatSimulation();
  }
}

function selectNode(n) {
  if (n.type === "poem") {
    routeTo(`#/poem${n.url}`);
    return;
  }
  state.selectedId = n.id;
  computeActive();
  focusNode(n);
  openInspectorFor(n);
  redraw();
}

function focusNode(n, ms = 700) {
  graph.centerAt(n.x, n.y, ms);
  const target = n.type === "century" ? 1.7 : 2.6;
  if (graph.zoom() < target) graph.zoom(target, ms);
}

function clearSelection() {
  state.selectedId = null;
  computeActive();
  redraw();
}

function renderHoverCard(n) {
  const card = $("hovercard");
  if (!n || isTouch) {
    card.hidden = true;
    return;
  }
  if (n.type === "poet") {
    const meta = [n.century ? `${t("century")} ${faNum(n.century, state.lang)}` : null, n.place]
      .filter(Boolean)
      .join(" · ");
    card.innerHTML = `<div class="hc-name">${esc(n.label)}</div><div class="hc-meta">${esc(meta)}${
      (n.poems || 0) > 0 ? ` · ${faNum(n.poems, state.lang)} ${t("poemsUnit")}` : ""
    }</div>`;
  } else if (n.type === "poem") {
    const host = poetBySlug(n.slug);
    card.innerHTML = `<div class="hc-name">${esc(n.label)}</div><div class="hc-meta">${esc(
      host ? host.nickname || host.name : "",
    )} · ${t("openPoem")}</div>`;
  } else {
    const kind = n.type === "century" ? t("legendCentury") : n.type === "theme" ? t("legendTheme") : t("legendPlace");
    card.innerHTML = `<div class="hc-name">${esc(n.label)}</div><div class="hc-meta">${kind} · ${faNum(
      n.members || 0,
      state.lang,
    )} ${t("poetsUnit")}</div>`;
  }
  card.hidden = false;
}

/* ————————————————— inspector ————————————————— */

function closeInspector() {
  $("inspector").hidden = true;
}

const CLOSE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M6 6l12 12M18 6L6 18"/></svg>`;

function inspShell(inner) {
  const el = $("inspector");
  el.innerHTML = `<button type="button" class="insp-close" id="insp-close" aria-label="${t("close")}">${CLOSE_SVG}</button>${inner}`;
  el.hidden = false;
  el.scrollTop = 0;
  $("insp-close").addEventListener("click", () => {
    closeInspector();
    clearSelection();
  });
  el.querySelectorAll("[data-open-poet]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/poet/${b.dataset.openPoet}`)),
  );
  el.querySelectorAll("[data-open-poem]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/poem${b.dataset.openPoem}`)),
  );
  el.querySelectorAll("[data-open-place]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/place/${encodeURIComponent(b.dataset.openPlace)}`)),
  );
  el.querySelectorAll("[data-open-century]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/century/${b.dataset.openCentury}`)),
  );
  el.querySelectorAll("[data-focus-node]").forEach((b) =>
    b.addEventListener("click", () => {
      setMode("graph");
      const node = graph.graphData().nodes.find((n) => n.id === b.dataset.focusNode);
      if (node) {
        state.selectedId = node.id;
        computeActive();
        focusNode(node);
        redraw();
      }
    }),
  );
}

function yearsLine(p) {
  const parts = [];
  if (p.birth) parts.push(`${t("born")} ${faNum(p.birth, state.lang)}`);
  if (p.death) parts.push(`${t("died")} ${faNum(p.death, state.lang)}`);
  if (!parts.length) return "";
  return `${parts.join(" · ")} ${t("hijri")}`;
}

function openPoetPanel(slug) {
  const p = poetBySlug(slug);
  if (!p) return;
  const cent = centuryOf(p);
  const works = state.works
    .filter((w) => w.poet === slug && w.url !== `/${slug}`)
    .sort((a, b) => (b.poems || 0) - (a.poems || 0))
    .slice(0, 8);
  const poems = state.docs.length ? byPoet(state.docs, slug).slice(0, 18) : [];
  const poemCount = poemsOf(slug);

  const facts = [
    cent ? `<button type="button" class="fact link" data-open-century="${cent}">${t("century")} <b>${faNum(cent, state.lang)}</b></button>` : "",
    yearsLine(p) ? `<span class="fact">${esc(yearsLine(p))}</span>` : "",
    p.place ? `<button type="button" class="fact link" data-open-place="${esc(p.place)}">${t("place")}: <b>${esc(p.place)}</b></button>` : "",
    poemCount ? `<span class="fact"><b>${faNum(poemCount, state.lang)}</b> ${t("poemsUnit")}</span>` : "",
  ].filter(Boolean).join("");

  const bio = (p.bio || "").trim();
  const worksHtml = works.length
    ? `<div class="insp-sec"><div class="insp-sec-title">${t("works")}</div><ul class="rowlist">${works
        .map(
          (w) => `<li><a class="rowitem" href="${ganjoorHref(w.url)}" target="_blank" rel="noreferrer">
            <span><span class="t">${esc(w.title)}</span></span>
            ${w.poems ? `<span class="n">${faNum(w.poems, state.lang)}</span>` : ""}
          </a></li>`,
        )
        .join("")}</ul></div>`
    : "";

  const poemsHtml = poems.length
    ? `<div class="insp-sec"><div class="insp-sec-title">${t("indexedPoems")}</div><ul class="rowlist">${poems
        .map(
          (d) => `<li><button type="button" class="rowitem" data-open-poem="${esc(d.url)}">
            <span><span class="t">${esc(d.title)}</span><span class="m">${esc(snippet(d.text, "", 58))}</span></span>
          </button></li>`,
        )
        .join("")}</ul></div>`
    : "";

  inspShell(`
    <div class="insp-head">
      <img class="insp-avatar" src="./data/poets/${esc(slug)}.gif" alt="${esc(p.nickname || p.name)}" />
      <div>
        <div class="insp-name">${esc(p.nickname || p.name)}</div>
        ${p.name && p.name !== p.nickname ? `<div class="insp-kicker">${esc(p.name)}</div>` : ""}
      </div>
    </div>
    <div class="insp-facts">${facts}</div>
    ${bio ? `<p class="insp-bio clamp" id="insp-bio">${esc(bio)}</p><button type="button" class="bio-more" id="bio-more">${t("bioMore")}</button>` : ""}
    <div class="insp-actions">
      <button type="button" class="btn solid" data-focus-node="poet:${esc(slug)}">${t("openMap")}</button>
      <a class="btn" href="${ganjoorHref(p.url || `/${slug}`)}" target="_blank" rel="noreferrer">${t("ganjoor")}</a>
    </div>
    ${worksHtml}
    ${poemsHtml}
  `);

  const bioEl = $("insp-bio");
  const moreBtn = $("bio-more");
  if (bioEl && moreBtn) {
    if (bioEl.scrollHeight <= bioEl.clientHeight + 8) moreBtn.remove();
    else moreBtn.addEventListener("click", () => {
      bioEl.classList.toggle("clamp");
      moreBtn.textContent = bioEl.classList.contains("clamp") ? t("bioMore") : t("bioLess");
    });
  }
}

function listPoetsHtml(poets, metaFn) {
  return `<ul class="rowlist">${poets
    .map(
      (p) => `<li><button type="button" class="rowitem" data-open-poet="${esc(p.slug)}">
        <img src="./data/poets/${esc(p.slug)}.gif" alt="" loading="lazy" />
        <span><span class="t">${esc(p.nickname || p.name)}</span><span class="m">${esc(metaFn(p) || "")}</span></span>
      </button></li>`,
    )
    .join("")}</ul>`;
}

function centuryOf(p) {
  // Atlas rows carry century as the source string "سدهٔ N"; keep only N.
  if (p.century) {
    const n = parseInt(String(p.century).replace(/[^0-9]/g, ""), 10);
    if (n) return n;
  }
  const y = p.birth || p.death;
  return y ? Math.floor((y - 1) / 100) + 1 : null;
}

function openThemePanel(id) {
  const th = themeById(id);
  if (!th) return;
  const slugs = [...(state.adj.get(`theme:${id}`) || [])].map((pid) => pid.replace("poet:", ""));
  const poets = state.atlas.filter((p) => slugs.includes(p.slug));
  const poems = state.docs.length ? byTheme(state.docs, id).slice(0, 14) : [];
  inspShell(`
    <div class="insp-head">
      <span class="insp-sigil"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.4" transform="rotate(45 12 12)" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>
      <div>
        <div class="insp-name">${esc(th.label)}</div>
        <div class="insp-kicker">${t("legendTheme")}</div>
      </div>
    </div>
    <div class="insp-facts">${(th.stems || []).map((s) => `<span class="fact">${esc(s)}</span>`).join("")}</div>
    <p class="insp-bio">${t("themeNote")}</p>
    <div class="insp-actions">
      <button type="button" class="btn solid" data-focus-node="theme:${esc(id)}">${t("openMap")}</button>
    </div>
    <div class="insp-sec"><div class="insp-sec-title">${t("themePoets")}</div>
      ${listPoetsHtml(poets, (p) => (centuryOf(p) ? `${t("century")} ${faNum(centuryOf(p), state.lang)}` : ""))}
    </div>
    ${
      poems.length
        ? `<div class="insp-sec"><div class="insp-sec-title">${t("verses")}</div><ul class="rowlist">${poems
            .map(
              (d) => `<li><button type="button" class="rowitem" data-open-poem="${esc(d.url)}">
                <span><span class="t">${esc(d.poet)} · ${esc(d.title)}</span><span class="m">${esc(snippet(d.text, th.label, 56))}</span></span>
              </button></li>`,
            )
            .join("")}</ul></div>`
        : ""
    }
  `);
}

function openPlacePanel(name) {
  const poets = state.atlas.filter((p) => (p.place || "").trim() === name);
  if (!poets.length) return;
  inspShell(`
    <div class="insp-head">
      <span class="insp-sigil"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M12 21c4-3.8 7-7.2 7-11a7 7 0 1 0-14 0c0 3.8 3 7.2 7 11Z"/><circle cx="12" cy="10" r="2.4" fill="currentColor"/></svg></span>
      <div>
        <div class="insp-name">${esc(name)}</div>
        <div class="insp-kicker">${t("legendPlace")} · ${faNum(poets.length, state.lang)} ${t("poetsUnit")}</div>
      </div>
    </div>
    <div class="insp-actions">
      <button type="button" class="btn solid" data-focus-node="place:${esc(name)}">${t("openMap")}</button>
    </div>
    <div class="insp-sec"><div class="insp-sec-title">${t("placePoets")}</div>
      ${listPoetsHtml(poets, (p) => (centuryOf(p) ? `${t("century")} ${faNum(centuryOf(p), state.lang)}` : ""))}
    </div>
  `);
}

function openCenturyPanel(order) {
  const poets = state.atlas
    .filter((p) => centuryOf(p) === order)
    .sort((a, b) => poemsOf(b.slug) - poemsOf(a.slug) || (a.birth || a.death || 0) - (b.birth || b.death || 0));
  if (!poets.length) return;
  const node = state.nodes.find((n) => n.id === `century:${order}`);
  inspShell(`
    <div class="insp-head">
      <span class="insp-sigil"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1"/></svg></span>
      <div>
        <div class="insp-name">${esc(node ? node.label : "")}</div>
        <div class="insp-kicker">${faNum(poets.length, state.lang)} ${t("poetsUnit")}</div>
      </div>
    </div>
    <div class="insp-actions">
      <button type="button" class="btn solid" data-focus-node="century:${order}">${t("openMap")}</button>
    </div>
    <div class="insp-sec"><div class="insp-sec-title">${t("centuryPoets")}</div>
      ${listPoetsHtml(poets, (p) => [yearsLine(p), p.place].filter(Boolean).join(" · "))}
    </div>
  `);
}

function openInspectorFor(n) {
  if (n.type === "poet") routeTo(`#/poet/${n.slug}`);
  else if (n.type === "theme") routeTo(`#/theme/${n.id.replace("theme:", "")}`);
  else if (n.type === "place") routeTo(`#/place/${encodeURIComponent(n.label)}`);
  else if (n.type === "century") routeTo(`#/century/${n.order}`);
}

/* ————————————————— reader ————————————————— */

async function openReader(url) {
  const docLocal = state.docs.find((d) => d.url === url);
  let couplets = [];
  let doc = docLocal;
  try {
    const poem = await fetchPoem(url);
    couplets = coupletsFrom(poem);
    if (!doc) {
      doc = {
        url,
        title: poem.Title,
        poet: (poem.FullTitle || "").split("»")[0].trim(),
        slug: url.replace(/^\//, "").split("/")[0],
        metre: poem.Metre?.Rhythm || "",
        summary: poem.PoemSummary || "",
        themes: [],
      };
    }
  } catch {
    if (doc) {
      const lines = (doc.text || "").split("\n").filter(Boolean);
      for (let i = 0; i < lines.length; i += 2) couplets.push({ right: lines[i], left: lines[i + 1] || "" });
    }
  }
  if (!doc) return;

  const slug = doc.slug || url.replace(/^\//, "").split("/")[0];
  const themeChips = (doc.themes || [])
    .map((id) => themeById(id))
    .filter(Boolean)
    .map((th) => `<span class="fact">${esc(th.label)}</span>`)
    .join("");

  $("reader-card").innerHTML = `
    <div class="reader-top">
      <img src="./data/poets/${esc(slug)}.gif" alt="" />
      <div>
        <div class="t">${esc(doc.poet)}</div>
        <div class="m">${esc(doc.title)}</div>
      </div>
      <button type="button" class="insp-close" id="reader-close" aria-label="${t("close")}">${CLOSE_SVG}</button>
    </div>
    <div class="reader-body">
      <div class="reader-meta">
        ${doc.metre ? `<span class="fact">${t("metre")}: <b>${esc(doc.metre)}</b></span>` : ""}
        ${themeChips}
      </div>
      ${couplets
        .map((c) => `<div class="couplet"><span class="half">${esc(c.right)}</span><span class="half">${esc(c.left)}</span></div>`)
        .join("")}
      ${doc.summary ? `<p class="insp-bio" style="margin-top:16px"><b>${t("summaryLabel")}:</b> ${esc(doc.summary)}</p>` : ""}
    </div>
    <div class="reader-foot">
      <a class="btn" href="${ganjoorHref(url)}" target="_blank" rel="noreferrer">${t("ganjoor")}</a>
      <button type="button" class="btn solid" id="reader-copy">${t("copyVerse")}</button>
    </div>
  `;
  $("reader").hidden = false;
  $("reader-close").addEventListener("click", closeReader);
  $("reader").addEventListener("click", (e) => {
    if (e.target === $("reader")) closeReader();
  });
  $("reader-copy").addEventListener("click", () => {
    const text = couplets.map((c) => [c.right, c.left].filter(Boolean).join("  /  ")).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      $("reader-copy").textContent = t("copied");
      setTimeout(() => {
        const b = $("reader-copy");
        if (b) b.textContent = t("copyVerse");
      }, 1600);
    });
  });
}

function closeReader() {
  $("reader").hidden = true;
  if (location.hash.startsWith("#/poem/")) history.replaceState(null, "", "#/");
}

/* ————————————————— atlas ————————————————— */

function renderAtlasCenturies() {
  const cents = [...new Set(state.atlas.map(centuryOf).filter(Boolean))].sort((a, b) => a - b);
  $("atlas-centuries").innerHTML =
    `<button type="button" class="chip ${state.atlasCentury === "all" ? "is-on" : ""}" data-cent="all">${t("atlasAll")}</button>` +
    cents
      .map(
        (c) =>
          `<button type="button" class="chip ${String(state.atlasCentury) === String(c) ? "is-on" : ""}" data-cent="${c}">${
            state.lang === "fa" ? `سدهٔ ${faNum(c)}` : `C. ${c}`
          }</button>`,
      )
      .join("");
  $("atlas-centuries").querySelectorAll("[data-cent]").forEach((b) =>
    b.addEventListener("click", () => {
      state.atlasCentury = b.dataset.cent;
      renderAtlas();
    }),
  );
}

function renderAtlas() {
  renderAtlasCenturies();
  const q = normalize(state.atlasQuery);
  let poets = [...state.atlas];
  if (state.atlasCentury !== "all") poets = poets.filter((p) => String(centuryOf(p)) === String(state.atlasCentury));
  if (q) poets = poets.filter((p) => normalize(`${p.nickname || ""} ${p.name || ""}`).includes(q));
  poets.sort((a, b) => (a.birth || a.death || 9999) - (b.birth || b.death || 9999));

  const ready = t("atlasCount");
  $("atlas-grid").innerHTML =
    `<div class="atlas-count">${faNum(typeof ready === "function" ? ready(poets.length) : poets.length, state.lang)}</div>` +
    poets
      .map((p) => {
        const meta = [
          centuryOf(p) ? (state.lang === "fa" ? `سدهٔ ${faNum(centuryOf(p))}` : `C. ${centuryOf(p)}`) : null,
          p.place || null,
        ]
          .filter(Boolean)
          .join(" · ");
        return `<button type="button" class="poet-card" data-open-poet="${esc(p.slug)}">
          <img src="./data/poets/${esc(p.slug)}.gif" alt="" loading="lazy" />
          <span><span class="t">${esc(p.nickname || p.name)}</span><span class="m">${esc(meta)}</span></span>
        </button>`;
      })
      .join("");

  $("atlas-grid").querySelectorAll("[data-open-poet]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/poet/${b.dataset.openPoet}`)),
  );
}

/* ————————————————— chat ————————————————— */

function renderChatPrompts() {
  const box = $("chat-prompts");
  if (!box) return;
  box.innerHTML = [1, 2, 3, 4, 5, 6]
    .map((i) => `<button type="button" class="fu">${t(`prompt${i}`)}</button>`)
    .join("");
  box.querySelectorAll(".fu").forEach((b) =>
    b.addEventListener("click", () => {
      $("chat-q").value = b.textContent;
      submitChat();
    }),
  );
}

function chatWelcome() {
  if (state.chatStarted) return;
  state.chatStarted = true;
  const el = document.createElement("div");
  el.className = "msg simorgh";
  el.dataset.welcome = "1";
  el.innerHTML = `
    <div class="cite-head">${t("chatWelcomeTitle")}</div>
    <p class="lead" style="margin-top:7px">${t("chatWelcome")}</p>
  `;
  $("chat-log").appendChild(el);
}

function bindMsg(el) {
  el.querySelectorAll("[data-open-poem]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/poem${b.dataset.openPoem}`)),
  );
  el.querySelectorAll("[data-open-poet]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/poet/${b.dataset.openPoet}`)),
  );
  el.querySelectorAll("[data-open-theme]").forEach((b) =>
    b.addEventListener("click", () => routeTo(`#/theme/${b.dataset.openTheme}`)),
  );
  el.querySelectorAll("[data-ask]").forEach((b) =>
    b.addEventListener("click", () => {
      $("chat-q").value = b.dataset.ask;
      submitChat();
    }),
  );
}

function buildAnswer(bundle) {
  const parts = [];

  if (bundle.poet) {
    const p = bundle.poet;
    const meta = [
      centuryOf(p) ? `${t("century")} ${faNum(centuryOf(p), state.lang)}` : null,
      p.place || null,
    ]
      .filter(Boolean)
      .join(" · ");
    parts.push(`
      <div class="poetline">
        <img src="./data/poets/${esc(p.slug)}.gif" alt="" />
        <span><span class="t">${esc(p.nickname || p.name)}</span><br /><span class="m">${esc(meta)}</span></span>
        <button type="button" class="go" data-open-poet="${esc(p.slug)}">${t("openMap")}</button>
      </div>
    `);
    if (p.bio) parts.push(`<p class="lead">${esc(snippet(p.bio, "", 240))}</p>`);
  }

  if (bundle.themes.length) {
    const th = bundle.themes[0];
    const label = t("chatFromTheme");
    parts.push(
      `<p class="lead">${esc(typeof label === "function" ? label(th.label) : th.label)} · <button type="button" class="fu" data-open-theme="${esc(th.id)}">${esc(th.label)}</button></p>`,
    );
  }

  if (bundle.hits.length) {
    const found = t("chatFound");
    parts.push(`<p class="lead">${esc(typeof found === "function" ? faNum(found(bundle.hits.length), state.lang) : "")}</p>`);
    for (const { doc } of bundle.hits.slice(0, 4)) {
      const c = firstCouplet(doc.text);
      parts.push(`
        <div class="cite">
          <div class="cite-head">${esc(doc.poet)} · ${esc(doc.title)}${doc.metre ? `<span class="metre">${esc(doc.metre)}</span>` : ""}</div>
          <div class="cite-verse">${esc(c.right)}${c.left ? `<br />${esc(c.left)}` : ""}</div>
          <div class="cite-actions">
            <button type="button" data-open-poem="${esc(doc.url)}">${t("openPoem")}</button>
            <a href="${ganjoorHref(doc.url)}" target="_blank" rel="noreferrer">${t("ganjoor")}</a>
          </div>
        </div>
      `);
    }
    const followThemes = [...new Set(bundle.hits.flatMap(({ doc }) => doc.themes || []))]
      .map((id) => themeById(id))
      .filter(Boolean)
      .slice(0, 4);
    if (followThemes.length) {
      parts.push(
        `<div class="followups">${followThemes.map((th) => `<button type="button" class="fu" data-ask="${esc(th.label)}">${esc(th.label)}</button>`).join("")}</div>`,
      );
    }
  } else if (!bundle.poet && !bundle.themes.length) {
    parts.push(`<p class="lead">${t("chatNoHit")}</p>`);
  }

  return parts.join("");
}

async function submitChat() {
  const input = $("chat-q");
  const q = input.value.trim();
  if (!q) return;
  input.value = "";

  const log = $("chat-log");
  const user = document.createElement("div");
  user.className = "msg user";
  user.textContent = q;
  log.appendChild(user);

  const reply = document.createElement("div");
  reply.className = "msg simorgh";
  reply.innerHTML = `<span class="thinking"><i></i><i></i><i></i></span>`;
  log.appendChild(reply);
  log.scrollTop = log.scrollHeight;

  await new Promise((r) => setTimeout(r, 240));

  if (!state.index) {
    reply.innerHTML = `<p class="lead">${t("searchIndexing")}</p>`;
    return;
  }

  const bundle = retrieve({ index: state.index, atlas: state.atlas, themes: state.themes, query: q });
  reply.innerHTML = buildAnswer(bundle);
  bindMsg(reply);
  log.scrollTop = log.scrollHeight;
}

/* ————————————————— header search ————————————————— */

function renderSearch(q) {
  const box = $("seek-results");
  const query = normalize(q.trim());
  if (!query || query.length < 2) {
    box.hidden = true;
    return;
  }

  const poets = state.atlas
    .filter((p) => normalize(`${p.nickname || ""} ${p.name || ""} ${p.slug}`).includes(query))
    .slice(0, 5);
  const themes = state.themes.filter((th) => normalize(th.label).includes(query)).slice(0, 3);
  const verses = state.index ? search(state.index, q, 6) : [];

  let html = "";
  if (poets.length) {
    html += `<div class="seek-group">${t("poets")}</div>`;
    html += poets
      .map(
        (p) => `<button type="button" class="seek-item" data-go="#/poet/${esc(p.slug)}">
          <img src="./data/poets/${esc(p.slug)}.gif" alt="" loading="lazy" />
          <span><span class="t">${esc(p.nickname || p.name)}</span><br /><span class="m">${
            centuryOf(p) ? (state.lang === "fa" ? `سدهٔ ${faNum(centuryOf(p))}` : `C. ${centuryOf(p)}`) : ""
          }${p.place ? ` · ${esc(p.place)}` : ""}</span></span>
        </button>`,
      )
      .join("");
  }
  if (themes.length) {
    html += `<div class="seek-group">${t("themes")}</div>`;
    html += themes
      .map(
        (th) => `<button type="button" class="seek-item" data-go="#/theme/${esc(th.id)}">
          <span><span class="t">${esc(th.label)}</span></span>
        </button>`,
      )
      .join("");
  }
  if (state.index) {
    if (verses.length) {
      html += `<div class="seek-group">${t("verses")}</div>`;
      html += verses
        .map(
          ({ doc }) => `<button type="button" class="seek-item" data-go="#/poem${esc(doc.url)}">
            <span><span class="t">${esc(doc.poet)} · ${esc(doc.title)}</span><br /><span class="m">${esc(snippet(doc.text, q, 62))}</span></span>
          </button>`,
        )
        .join("");
    }
  } else {
    html += `<div class="seek-empty">${t("searchIndexing")}</div>`;
  }
  if (!html) html = `<div class="seek-empty">${t("empty")}</div>`;

  box.innerHTML = html;
  box.hidden = false;
  box.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => {
      box.hidden = true;
      $("seek").value = "";
      routeTo(b.dataset.go);
    }),
  );
}

/* ————————————————— modes & routing ————————————————— */

function setMode(mode) {
  if (mode !== state.mode) {
    closeInspector();
    clearSelection();
  }
  state.mode = mode;
  document.querySelectorAll(".tab, .m-tab").forEach((b) => b.classList.toggle("is-on", b.dataset.mode === mode));
  $("atlas").hidden = mode !== "atlas";
  $("chat").hidden = mode !== "chat";
  $("filters").hidden = mode !== "graph";
  $("legend").hidden = mode !== "graph";
  $("zoomer").hidden = mode !== "graph";
  if (mode === "atlas") renderAtlas();
  if (mode === "chat") chatWelcome();
}

function routeTo(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

function handleRoute() {
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/poem/")) closeReader();

  if (hash.startsWith("#/poet/")) {
    const slug = decodeURIComponent(hash.slice("#/poet/".length));
    openPoetPanel(slug);
    if (state.mode === "graph") {
      const node = graph.graphData().nodes.find((n) => n.id === `poet:${slug}`);
      if (node) {
        state.selectedId = node.id;
        computeActive();
        focusNode(node);
        redraw();
      }
    }
  } else if (hash.startsWith("#/theme/")) {
    openThemePanel(decodeURIComponent(hash.slice("#/theme/".length)));
  } else if (hash.startsWith("#/place/")) {
    openPlacePanel(decodeURIComponent(hash.slice("#/place/".length)));
  } else if (hash.startsWith("#/century/")) {
    openCenturyPanel(Number(hash.slice("#/century/".length)));
  } else if (hash.startsWith("#/poem/")) {
    openReader(hash.slice("#/poem".length));
  } else if (hash === "#/atlas") {
    setMode("atlas");
    closeInspector();
    clearSelection();
  } else if (hash === "#/chat") {
    setMode("chat");
    closeInspector();
    clearSelection();
  } else {
    setMode("graph");
    closeInspector();
    clearSelection();
  }
}

/* ————————————————— boot ————————————————— */

async function fetchJson(name) {
  const res = await fetch(`./data/${name}.json`);
  if (!res.ok) throw new Error(`${name} ${res.status}`);
  return res.json();
}

async function boot() {
  $("status").textContent = t("loading");

  const [graphData, atlas, themes, stats, works] = await Promise.all([
    fetchJson("graph"),
    fetchJson("atlas"),
    fetchJson("themes"),
    fetchJson("stats"),
    fetchJson("works"),
  ]);

  state.nodes = graphData.nodes;
  state.links = graphData.edges;
  state.atlas = atlas;
  state.themes = themes;
  state.stats = stats;
  state.works = works;
  for (const n of state.nodes) if (n.type === "poet") state.poemCounts.set(n.slug, n.poems || 0);

  initGraph();
  renderStatus();
  renderChatPrompts();
  wireUi();
  handleRoute();

  // Heavy verse index loads after first paint; search and chat light up when ready.
  setTimeout(async () => {
    try {
      const docs = await fetchJson("index");
      state.docs = docs;
      state.index = buildIndex(docs);
      renderStatus();
    } catch (err) {
      console.error("index load failed", err);
    }
  }, 600);
}

function wireUi() {
  document.querySelectorAll(".tab, .m-tab").forEach((b) =>
    b.addEventListener("click", () => {
      routeTo(b.dataset.mode === "graph" ? "#/" : `#/${b.dataset.mode}`);
    }),
  );

  document.querySelectorAll(".chip[data-filter]").forEach((b) =>
    b.addEventListener("click", () => applyFilter(b.dataset.filter)),
  );

  $("z-in").addEventListener("click", () => graph.zoom(Math.min(10, graph.zoom() * 1.45), 320));
  $("z-out").addEventListener("click", () => graph.zoom(Math.max(0.25, graph.zoom() / 1.45), 320));
  $("z-fit").addEventListener("click", () => graph.zoomToFit(600, 60));

  const seek = $("seek");
  seek.addEventListener("input", () => renderSearch(seek.value));
  seek.addEventListener("focus", () => renderSearch(seek.value));
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".seek")) $("seek-results").hidden = true;
  });

  $("atlas-seek").addEventListener("input", (e) => {
    state.atlasQuery = e.target.value;
    renderAtlas();
  });

  $("chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    submitChat();
  });
  $("chat-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    }
  });

  $("lang").addEventListener("click", () => {
    state.lang = state.lang === "fa" ? "en" : "fa";
    applyLang();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!$("reader").hidden) closeReader();
      else if (!$("inspector").hidden) {
        closeInspector();
        clearSelection();
      } else {
        $("seek-results").hidden = true;
        clearSelection();
      }
    } else if (e.key === "/" && document.activeElement !== $("seek") && document.activeElement !== $("chat-q")) {
      e.preventDefault();
      $("seek").focus();
    }
  });

  window.addEventListener("hashchange", handleRoute);
}

boot().catch((err) => {
  console.error("boot failed", err);
  $("status").textContent = `خطا: ${err.message}`;
});
