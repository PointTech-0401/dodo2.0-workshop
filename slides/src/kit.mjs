// Shared slide kit. Every value below is lifted from web/styles.css so the deck
// and the client the students look at all day read as one product.
import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const C = {
  ink: '#15324a', inkSoft: '#4d6475', paper: '#f7f2e8', white: '#fffdf8',
  sky: '#d9edf7', blue: '#397d9f', apricot: '#f1b879', mint: '#aad4bf',
  line: '#cfd9dc', danger: '#a84a42', green: '#287653', deep: '#102638',
};
export const SANS = "'Noto Sans TC','Microsoft JhengHei UI',sans-serif";
export const SERIF = "'Noto Serif TC',Georgia,serif";
export const MONO = "Consolas,'Noto Sans TC',monospace";

const FONTS = 'https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&amp;family=Noto+Serif+TC:wght@500;700;900&amp;display=swap';

// Every CSS font size on every slide is this much larger than the number written
// in the decks and in the helpers below (2026-10-02: whole deck +2px). SVG
// `font-size="…"` attributes are left alone: the diagram geometry and
// check-diagrams.mjs are measured in those units.
export const FONT_BUMP = 2;
const bumpFonts = (html) => html
  .replace(/(font:\s*(?:\d{3}\s+)?)(\d+(?:\.\d+)?)px/g, (_, lead, n) => `${lead}${Number(n) + FONT_BUMP}px`)
  .replace(/(font-size:\s*)(\d+(?:\.\d+)?)px/g, (_, lead, n) => `${lead}${Number(n) + FONT_BUMP}px`);

function shell(inner, accent) {
  inner = bumpFonts(inner);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="${FONTS}">
  <style>
    body { margin: 0; background: ${C.paper}; }
    a { color: ${accent}; } a:hover { color: ${C.ink}; }
  </style>
</helmet>
${inner}
</x-dc>
</body>
</html>
`;
}

// The dodo mark: same blob radius, apricot fill and -8deg tilt as .brand-mark.
export function mark(size = 52, bg = C.apricot, fg = C.ink) {
  return `<div style="width: ${size}px; height: ${size}px; display: grid; place-items: center; border-radius: 50% 50% 48% 52%; background: ${bg}; color: ${fg}; font: 800 ${Math.round(size * 0.66)}px/1 ${SERIF}; transform: rotate(-8deg);">d</div>`;
}

// Inline code token, the blue-on-sky treatment from .prompt-variables code.
export function code(t, size = 21) {
  return `<span style="padding: 2px 7px; border-radius: 4px; background: ${C.sky}; color: ${C.blue}; font: 700 ${size}px/1.5 ${MONO};">${t}</span>`;
}

// The 29px sky circle from .prompt-block header, scaled to slide size.
export function step(n, accent = C.blue, size = 46) {
  return `<div style="flex-shrink: 0; width: ${size}px; height: ${size}px; display: grid; place-items: center; border-radius: 50%; background: ${C.sky}; color: ${accent}; font: 800 ${Math.round(size * 0.42)}px/1 ${MONO};">${n}</div>`;
}

// The mint-outlined micro badge from .prompt-block em.
export function badge(t, color = C.green, border = C.mint) {
  return `<span style="padding: 5px 9px; border: 1px solid ${border}; border-radius: 3px; color: ${color}; font: 800 15px/1 ${MONO}; letter-spacing: .08em; white-space: nowrap;">${t}</span>`;
}

// The dark prompt-preview panel: --ink frame, #102638 body, apricot label.
export function darkPanel(label, title, lines) {
  const body = lines
    .map((l) => `<div style="color: #eef7f4; font: 20px/1.7 ${MONO}; white-space: pre-wrap;">${l}</div>`)
    .join('\n      ');
  return `<div style="border: 1px solid ${C.ink}; border-radius: 4px 14px 14px 4px; background: ${C.ink}; overflow: hidden;">
    <div style="display: flex; align-items: center; gap: 12px; padding: 16px 20px;">
      <span style="padding: 5px 8px; border: 1px solid ${C.apricot}; border-radius: 3px; color: ${C.apricot}; font: 800 14px/1 ${MONO}; letter-spacing: .08em;">${label}</span>
      <strong style="color: ${C.white}; font: 700 21px/1.3 ${SANS};">${title}</strong>
    </div>
    <div style="display: flex; flex-direction: column; gap: 6px; padding: 18px 20px; border-top: 1px solid rgba(255, 253, 248, .2); background: ${C.deep};">
      ${body}
    </div>
  </div>`;
}

// Chat bubble geometry from .message p — the assistant corner stays square.
export function bubble(text, { who = 'DODO', accent = C.blue, dashed = false, bg = C.sky } = {}) {
  const skin = dashed
    ? `background: transparent; border: 1px dashed ${C.mint};`
    : `background: ${bg};`;
  return `<div style="display: flex; flex-direction: column; gap: 6px;">
    <span style="color: ${accent}; font: 800 14px/1 ${SANS}; letter-spacing: .14em;">${who}</span>
    <div style="padding: 18px 22px; border-radius: 4px 18px 18px 18px; color: ${C.ink}; font: 23px/1.65 ${SANS}; ${skin}">${text}</div>
  </div>`;
}

export function card({ kicker, title, body, note, accent = C.blue, bg = C.paper, grow = false }) {
  return `<div style="${grow ? 'flex: 1 1 0; min-width: 0; ' : ''}display: flex; flex-direction: column; gap: 12px; padding: 30px 30px 32px; border-top: 4px solid ${accent}; border-radius: 0 0 4px 4px; background: ${bg};">
    ${kicker ? `<span style="color: ${accent}; font: 800 15px/1 ${SANS}; letter-spacing: .16em;">${kicker}</span>` : ''}
    <h3 style="margin: 0; color: ${C.ink}; font: 700 30px/1.3 ${SERIF}; letter-spacing: -.01em; text-wrap: pretty;">${title}</h3>
    <p style="margin: 0; color: ${C.inkSoft}; font: 21px/1.72 ${SANS}; text-wrap: pretty;">${body}</p>
    ${note ? `<span style="margin-top: 2px; color: ${accent}; font: 700 18px/1.5 ${MONO}; overflow-wrap: anywhere;">${note}</span>` : ''}
  </div>`;
}

// What the student walks away with, stated as a thing that now exists.
export function payoff(text, { accent = C.green } = {}) {
  return `<div style="display: flex; align-items: center; gap: 16px; padding: 20px 26px; border: 1px dashed ${accent}; border-radius: 4px 18px 18px 4px; background: ${C.white};">
    <span style="flex-shrink: 0; color: ${accent}; font: 800 14px/1 ${SANS}; letter-spacing: .16em;">做完你會有</span>
    <p style="margin: 0; color: ${C.ink}; font: 700 24px/1.5 ${SANS}; text-wrap: pretty;">${text}</p>
  </div>`;
}

/* ---------- diagram primitives ----------
   Hand-authored SVG on a shared grid. Numbered badges mark a sequence, kickers
   mark an outcome, and every connector is a rounded path with a fixed-size head
   that stops short of the node it points at. */

const ARROW_COLORS = { ink: '#3f5a70', apricot: '#c07f2c', danger: C.danger, green: C.green };
export const TONES = { white: C.white, sky: C.sky, paper: C.paper };
export const ZONE_WARM = '#f5f0e6';
export const ZONE_COOL = '#edf3f6';

// Width estimate used both for composing labels and for the geometry self-check.
// CJK and fullwidth punctuation take a full em; latin averages a bit over half.
export function textW(text, size) {
  let w = 0;
  for (const ch of String(text)) {
    w += /[⺀-鿿＀-｠　-〿①-⓿]/.test(ch) ? size : size * 0.55;
  }
  return Math.round(w);
}

export function diagram({ id, w, h, label, caption, children }) {
  const markers = Object.entries(ARROW_COLORS)
    .map(([name, colour]) => `<marker id="${id}-${name}" viewBox="0 0 12 12" refX="10.6" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
        <path d="M 1.6 1.4 L 11 6 L 1.6 10.6 Z" fill="${colour}"></path>
      </marker>`)
    .join('\n      ');
  return `<figure style="margin: 0; display: flex; flex-direction: column; gap: 14px;">
  <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" style="display: block; width: 100%; height: auto; font-family: ${SANS};">
    <defs>
      ${markers}
    </defs>
    ${children}
  </svg>
  <figcaption style="color: ${C.inkSoft}; font: 19px/1.55 ${SANS}; text-wrap: pretty;">${caption}</figcaption>
</figure>`;
}

// A node. `n` gives it a numbered badge (it is a step); `kicker` labels it as an
// outcome. `emph` draws the border in the accent for the one node a slide is about.
export function dnode({
  x, y, w, h, n, kicker, title, lines = [],
  accent = C.blue, tone = 'white', titleSize = 19, emph = false,
}) {
  const pad = 22;
  const titleX = n ? x + 54 : x + pad;
  const titleY = n ? y + 37 : (kicker ? y + 52 : y + 36);
  const lineTop = (n ? y + 72 : titleY + 28);
  const body = lines
    .map((l, i) => `<text x="${x + pad}" y="${lineTop + i * 22}" fill="${C.inkSoft}" font-size="15.5">${l}</text>`)
    .join('\n    ');
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${TONES[tone]}" stroke="${emph ? accent : C.line}" stroke-width="${emph ? 1.6 : 1}"></rect>
    ${n ? `<circle cx="${x + 28}" cy="${y + 30}" r="15" fill="${accent}"></circle>
    <text x="${x + 28}" y="${y + 36}" text-anchor="middle" fill="${C.white}" font-size="15" font-weight="800">${n}</text>` : ''}
    ${kicker ? `<text x="${x + pad}" y="${y + 26}" fill="${accent}" font-size="13" font-weight="800" letter-spacing="1.6">${kicker}</text>` : ''}
    <text x="${titleX}" y="${titleY}" fill="${C.ink}" font-size="${titleSize}" font-weight="700">${title}</text>
    ${body}
  </g>`;
}

export function dzone({ x, y, w, h, label, colour = C.inkSoft, fill = ZONE_WARM }) {
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${colour}" stroke-width="1" stroke-dasharray="8 7" opacity=".9"></rect>
    ${label ? `<text x="${x}" y="${y - 13}" fill="${colour}" font-size="14" font-weight="800" letter-spacing="1.8">${label}</text>` : ''}
  </g>`;
}

// Rounded-corner routing between waypoints.
function roundPath(pts, r) {
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = cx + ((px - cx) / d1) * rr;
    const ay = cy + ((py - cy) / d1) * rr;
    const bx = cx + ((nx - cx) / d2) * rr;
    const by = cy + ((ny - cy) / d2) * rr;
    d += ` L ${Math.round(ax)} ${Math.round(ay)} Q ${cx} ${cy} ${Math.round(bx)} ${Math.round(by)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}

export function dflow(id, pts, { colour = 'ink', both = false, head = true, r = 14 } = {}) {
  return `<path d="${roundPath(pts, r)}" fill="none" stroke="${ARROW_COLORS[colour]}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"${head ? ` marker-end="url(#${id}-${colour})"` : ''}${both ? ` marker-start="url(#${id}-${colour})"` : ''}></path>`;
}

// A curved connector that visibly goes around whatever sits between the ends.
export function darc(id, [x1, y1], [x2, y2], lift, { colour = 'apricot', both = true } = {}) {
  return `<path d="M ${x1} ${y1} C ${x1} ${lift}, ${x2} ${lift}, ${x2} ${y2}" fill="none" stroke="${ARROW_COLORS[colour]}" stroke-width="1.9" stroke-linecap="round" marker-end="url(#${id}-${colour})"${both ? ` marker-start="url(#${id}-${colour})"` : ''}></path>`;
}

export function dlabel(x, y, text, { anchor = 'start', colour = C.ink, size = 15.5, weight = 600 } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${colour}" font-size="${size}" font-weight="${weight}">${text}</text>`;
}

// Stacked label lines, for the narrow gutters between columns.
export function dlabelBlock(x, y, lines, { anchor = 'middle', colour = C.ink, size = 15.5, weight = 600, step = 19 } = {}) {
  return lines
    .map((l, i) => dlabel(x, y + i * step, l, { anchor, colour, size, weight }))
    .join('\n    ');
}

export function row(cells, { gap = 22, align = 'stretch' } = {}) {
  return `<div style="display: flex; gap: ${gap}px; align-items: ${align};">${cells.join('\n')}</div>`;
}

export function stack(items, { gap = 18 } = {}) {
  return `<div style="display: flex; flex-direction: column; gap: ${gap}px;">${items.join('\n')}</div>`;
}

// A rule-and-space table. cols = [{label, w, align}], rows = array of arrays.
export function table(cols, rows, { accent = C.blue, size = 21, pad = 15 } = {}) {
  const grid = cols.map((c) => c.w).join(' ');
  const head = cols
    .map((c) => `<div style="padding: 0 0 ${Math.max(8, pad - 3)}px; color: ${accent}; font: 800 15px/1 ${SANS}; letter-spacing: .14em; text-align: ${c.align || 'left'};">${c.label}</div>`)
    .join('\n    ');
  const body = rows
    .map((r) => r
      .map((cell, j) => `<div style="padding: ${pad}px 0; border-top: 1px solid ${C.line}; color: ${j === 0 ? C.ink : C.inkSoft}; font: ${j === 0 ? 700 : 400} ${size}px/1.55 ${SANS}; text-align: ${cols[j].align || 'left'}; text-wrap: pretty;">${cell}</div>`)
      .join('\n    '))
    .join('\n    ');
  return `<div style="display: grid; grid-template-columns: ${grid}; column-gap: 28px; align-items: start;">
    ${head}
    ${body}
  </div>`;
}

// Full-bleed conclusion band — the one line the room should leave with.
export function band(text, { accent = C.apricot, tone = 'ink' } = {}) {
  const bg = tone === 'ink' ? C.ink : C.sky;
  const fg = tone === 'ink' ? C.white : C.ink;
  return `<div style="display: flex; align-items: center; gap: 20px; padding: 26px 32px; border-radius: 4px 18px 18px 4px; background: ${bg};">
    <div style="flex-shrink: 0; width: 6px; align-self: stretch; border-radius: 3px; background: ${accent};"></div>
    <p style="margin: 0; color: ${fg}; font: 700 28px/1.5 ${SANS}; text-wrap: pretty;">${text}</p>
  </div>`;
}

export function bullets(items, { accent = C.blue, size = 24, gap = 16 } = {}) {
  const li = items
    .map((t) => `<li style="display: flex; gap: 16px; align-items: flex-start;">
      <span style="flex-shrink: 0; width: 11px; height: 11px; margin-top: ${Math.round(size * 0.55)}px; border-radius: 50%; background: ${accent};"></span>
      <span style="color: ${C.ink}; font: ${size}px/1.68 ${SANS}; text-wrap: pretty;">${t}</span>
    </li>`)
    .join('\n');
  return `<ul style="display: flex; flex-direction: column; gap: ${gap}px; margin: 0; padding: 0; list-style: none;">${li}</ul>`;
}

// Numbered practice steps.
export function steps(items, { accent = C.blue, gap = 15, size = 23 } = {}) {
  const li = items
    .map((t, i) => `<li style="display: flex; gap: 18px; align-items: center;">
      ${step(i + 1, accent, 42)}
      <span style="color: ${C.ink}; font: ${size}px/1.55 ${SANS}; text-wrap: pretty;">${t}</span>
    </li>`)
    .join('\n');
  return `<ol style="display: flex; flex-direction: column; gap: ${gap}px; margin: 0; padding: 0; list-style: none;">${li}</ol>`;
}

// Standard content slide.
export function slide({ eyebrow, num, total, title, lede, body, foot, accent = C.blue }) {
  const inner = `<div style="position: relative; width: 1600px; height: 900px; overflow: hidden; background: ${C.white}; font-family: ${SANS}; color: ${C.ink};">
  <div style="position: absolute; left: 0; top: 0; width: 12px; height: 900px; background: ${accent};"></div>
  <div style="position: absolute; inset: 0; display: flex; flex-direction: column; gap: 30px; padding: 58px 88px 52px 108px;">
    <div style="display: flex; align-items: baseline; justify-content: space-between; gap: 32px; padding-bottom: 18px; border-bottom: 1px solid ${C.line};">
      <span style="color: ${accent}; font: 800 16px/1 ${SANS}; letter-spacing: .18em;">${eyebrow}</span>
      <span style="color: ${C.inkSoft}; font: 700 15px/1 ${MONO}; letter-spacing: .14em;">${String(num).padStart(2, '0')} / ${total}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 13px;">
      <h1 style="margin: 0; max-width: 1310px; color: ${C.ink}; font: 700 52px/1.16 ${SERIF}; letter-spacing: -.025em; text-wrap: pretty;">${title}</h1>
      ${lede ? `<p style="margin: 0; max-width: 1200px; color: ${C.inkSoft}; font: 23px/1.62 ${SANS}; text-wrap: pretty;">${lede}</p>` : ''}
    </div>
    <div style="flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: 22px; min-height: 0;">
      ${body}
    </div>
    ${foot ? `<div style="display: flex; align-items: center; gap: 14px; padding-top: 16px; border-top: 1px solid ${C.line};">
      <span style="flex-shrink: 0; width: 9px; height: 9px; border-radius: 50%; background: ${C.apricot};"></span>
      <span style="color: ${C.inkSoft}; font: 19px/1.55 ${SANS}; text-wrap: pretty;">${foot}</span>
    </div>` : ''}
  </div>
</div>`;
  return shell(inner, accent);
}

// Cover slide — the one dark artboard per deck.
export function cover({ eyebrow, number, title, sub, meta, accent = C.blue, halo = C.sky }) {
  const chips = meta
    .map((m) => `<span style="padding: 9px 16px; border: 1px solid rgba(255, 253, 248, .28); border-radius: 999px; color: rgba(255, 253, 248, .82); font: 500 18px/1 ${SANS};">${m}</span>`)
    .join('\n        ');
  const inner = `<div style="position: relative; width: 1600px; height: 900px; overflow: hidden; background: ${C.ink}; font-family: ${SANS}; color: ${C.white};">
  <div style="position: absolute; right: -170px; top: -190px; width: 700px; height: 700px; border-radius: 50%; background: ${accent}; opacity: .3;"></div>
  <div style="position: absolute; right: 150px; bottom: -280px; width: 520px; height: 520px; border-radius: 50%; background: ${C.apricot}; opacity: .13;"></div>
  <div style="position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 72px 96px 68px;">
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 32px;">
      <div style="display: flex; align-items: center; gap: 18px;">
        ${mark(58)}
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <strong style="color: ${C.white}; font: 700 25px/1 ${SERIF};">dodo 2.0 Workshop</strong>
          <span style="color: rgba(255, 253, 248, .6); font: 800 13px/1 ${SANS}; letter-spacing: .2em;">${eyebrow}</span>
        </div>
      </div>
      <span style="color: ${halo}; font: 900 126px/1 ${SERIF}; letter-spacing: -.05em;">${number}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 26px;">
      <h1 style="margin: 0; max-width: 1250px; color: ${C.white}; font: 700 96px/1.06 ${SERIF}; letter-spacing: -.045em; text-wrap: pretty;">${title}</h1>
      <div style="width: 132px; height: 6px; border-radius: 3px; background: ${C.apricot};"></div>
      <p style="margin: 0; max-width: 1080px; color: rgba(255, 253, 248, .84); font: 500 29px/1.55 ${SANS}; text-wrap: pretty;">${sub}</p>
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 12px;">
        ${chips}
    </div>
  </div>
</div>`;
  return shell(inner, accent);
}

export function emit(dir, slides) {
  mkdirSync(dir, { recursive: true });
  // Slides are fully generated, so drop stale artboards from an earlier run —
  // otherwise a renamed or removed slide keeps being seeded into the canvas.
  for (const name of readdirSync(dir)) {
    if (name.endsWith('.dc.html')) rmSync(join(dir, name));
  }
  const artboards = slides.map((s, i) => ({
    file: s.file,
    x: (i % 4) * 1760,
    y: Math.floor(i / 4) * 1140,
    w: 1600,
    h: 900,
    title: `${String(i + 1).padStart(2, '0')} · ${s.title}`,
  }));
  for (const s of slides) writeFileSync(join(dir, s.file), s.html, 'utf8');
  writeFileSync(
    join(dir, 'canvas.json'),
    JSON.stringify({ artboards, launch: { view: 'canvas' } }, null, 2),
    'utf8',
  );
  console.log(`${slides.length} artboards -> ${dir}`);
}
