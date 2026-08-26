// Geometry check over the GENERATED svg, not the source coordinates: parses the
// diagram out of each .dc.html and verifies text fits its node, labels do not sit
// on top of a node, nodes do not overlap, and every connector actually lands on
// a node edge with clearance instead of floating or crossing one.
import { readFileSync } from 'node:fs';
import { textW } from './kit.mjs';

const TARGETS = [
  ['slides/workshop-1', 'ProjectMap.dc.html'],
  ['slides/workshop-1', 'TurnFlow.dc.html'],
  ['slides/workshop-2', 'ProjectMap.dc.html'],
  ['slides/workshop-2', 'MemoryFlow.dc.html'],
];

const problems = [];
const note = (f, msg) => problems.push(`${f}: ${msg}`);

function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

// Flatten a generated path into sample points. Handles L, Q (rounded corners)
// and the single C used by the arc connector.
function samplePath(d) {
  const pts = [];
  const nums = (s) => s.trim().split(/[\s,]+/).map(Number);
  const tokens = d.match(/[MLQC][^MLQC]*/g) || [];
  let cur = null;
  for (const tk of tokens) {
    const cmd = tk[0];
    const v = nums(tk.slice(1));
    if (cmd === 'M') { cur = [v[0], v[1]]; pts.push(cur); }
    else if (cmd === 'L') { cur = [v[0], v[1]]; pts.push(cur); }
    else if (cmd === 'Q') {
      const c = [v[0], v[1]];
      const e = [v[2], v[3]];
      for (let i = 1; i <= 6; i += 1) {
        const t = i / 6;
        const u = 1 - t;
        pts.push([u * u * cur[0] + 2 * u * t * c[0] + t * t * e[0], u * u * cur[1] + 2 * u * t * c[1] + t * t * e[1]]);
      }
      cur = e;
    } else if (cmd === 'C') {
      const c1 = [v[0], v[1]];
      const c2 = [v[2], v[3]];
      const e = [v[4], v[5]];
      for (let i = 1; i <= 24; i += 1) pts.push(bezier(cur, c1, c2, e, i / 24));
      cur = e;
    }
  }
  return pts;
}

const inside = (p, r, pad = 0) => p[0] > r.x + pad && p[0] < r.x + r.w - pad && p[1] > r.y + pad && p[1] < r.y + r.h - pad;
const edgeDist = (p, r) => Math.min(
  Math.abs(p[0] - r.x), Math.abs(p[0] - (r.x + r.w)),
  Math.abs(p[1] - r.y), Math.abs(p[1] - (r.y + r.h)),
);
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const [dir, file] of TARGETS) {
  const src = readFileSync(`${dir}/${file}`, 'utf8');
  // Drop <defs> — the arrowhead marker paths are not connectors.
  const whole = src.slice(src.indexOf('<svg'), src.indexOf('</svg>'));
  const svg = whole.slice(0, whole.indexOf('<defs>')) + whole.slice(whole.indexOf('</defs>') + 7);
  const tag = `${dir.replace('slides/', '')}/${file.replace('.dc.html', '')}`;
  const [, W, H] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);

  const rects = [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)" rx="(\d+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], rx: +m[5] }));
  const nodes = rects.filter((r) => r.rx === 8);
  const zones = rects.filter((r) => r.rx === 12);

  const texts = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"(?: text-anchor="(\w+)")? fill="[^"]*" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => {
      const size = +m[4];
      const w = textW(m[5], size);
      const anchor = m[3] || 'start';
      const x = +m[1];
      const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
      return { x, y: +m[2], size, str: m[5], w, box: { x: left, y: +m[2] - size * 0.82, w, h: size * 1.05 } };
    });

  const paths = [...svg.matchAll(/<path d="(M [^"]+)"/g)]
    .map((m) => m[1])
    .filter((d) => d.includes('L') || d.includes('C'));

  // 1. everything inside the viewBox
  for (const r of [...nodes, ...zones]) {
    if (r.x < 0 || r.y < 0 || r.x + r.w > W || r.y + r.h > H) note(tag, `rect out of viewBox at ${r.x},${r.y}`);
  }
  for (const t of texts) {
    if (t.box.x < -1 || t.box.y < -1 || t.box.x + t.w > W + 1 || t.box.y + t.box.h > H + 1) {
      note(tag, `text out of viewBox: "${t.str}"`);
    }
  }

  // 2. node text fits its own node, with padding
  for (const t of texts) {
    const host = nodes.find((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);
    if (!host) continue;
    if (t.box.x + t.w > host.x + host.w - 10) {
      note(tag, `text overflows node right edge by ${Math.round(t.box.x + t.w - (host.x + host.w - 10))}px: "${t.str}"`);
    }
    if (t.y + 6 > host.y + host.h) note(tag, `text below node bottom: "${t.str}"`);
  }

  // 3. labels outside nodes must not sit on a node
  for (const t of texts) {
    const host = nodes.find((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);
    if (host) continue;
    for (const r of nodes) {
      if (overlaps(t.box, r)) note(tag, `label "${t.str}" collides with node at ${r.x},${r.y}`);
    }
  }

  // 4. label vs label
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i];
      const b = texts[j];
      const hostA = nodes.find((r) => a.x >= r.x && a.x <= r.x + r.w && a.y >= r.y && a.y <= r.y + r.h);
      const hostB = nodes.find((r) => b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h);
      if (hostA && hostA === hostB) continue;
      if (overlaps(a.box, b.box)) note(tag, `labels overlap: "${a.str}" / "${b.str}"`);
    }
  }

  // 5. nodes must not overlap each other
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (overlaps(nodes[i], nodes[j])) note(tag, `nodes overlap at ${nodes[i].x},${nodes[i].y}`);
    }
  }

  // 6. connectors: endpoints land near a node edge (or on a shared branch
  //    junction), and no shaft crosses a node.
  const sampled = paths.map(samplePath);
  const endpoints = sampled.flatMap((pts) => [pts[0], pts[pts.length - 1]]);
  const isJunction = (p) => endpoints.filter((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1).length > 1;
  for (const pts of sampled) {
    const ends = [pts[0], pts[pts.length - 1]];
    for (const p of ends) {
      const near = nodes.some((r) => !inside(p, r, 0) && edgeDist(p, r) <= 14
        && p[0] >= r.x - 14 && p[0] <= r.x + r.w + 14 && p[1] >= r.y - 14 && p[1] <= r.y + r.h + 14);
      if (!near && !isJunction(p)) note(tag, `connector endpoint ${p.map(Math.round)} is neither on a node edge nor a junction`);
      if (nodes.some((r) => inside(p, r, 0))) note(tag, `connector endpoint ${p.map(Math.round)} sits inside a node`);
    }
    for (const p of pts) {
      const hit = nodes.find((r) => inside(p, r, 3));
      if (hit) note(tag, `connector passes through node at ${hit.x},${hit.y}`);
    }
  }

  // 7. no label may sit on top of a connector line
  for (const t of texts) {
    const host = nodes.find((r) => t.x >= r.x && t.x <= r.x + r.w && t.y >= r.y && t.y <= r.y + r.h);
    if (host) continue;
    for (const pts of sampled) {
      for (const p of pts) {
        if (inside(p, t.box, -3)) {
          note(tag, `connector crosses label "${t.str}" at ${p.map(Math.round)}`);
          break;
        }
      }
    }
  }

  console.log(`${tag}: ${nodes.length} nodes, ${zones.length} zones, ${texts.length} texts, ${paths.length} connectors`);
}

console.log(problems.length ? `\n${problems.length} PROBLEM(S):\n${problems.map((p) => ` - ${p}`).join('\n')}` : '\nAll geometry checks passed.');
