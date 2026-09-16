// Wraps the .dc.html artboards in a presentation player: one 1600x900 slide
// scaled to the viewport, keyboard driven, with an overview grid.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [, , dir, out, deckName, accentName] = process.argv;

const ACCENTS = { blue: '#397d9f', green: '#287653' };
const accent = ACCENTS[accentName];

const canvas = JSON.parse(readFileSync(join(dir, 'canvas.json'), 'utf8'));

// Each artboard file is one slide; take the markup between the helmet (fonts,
// which the player supplies once) and the closing wrapper.
const slides = canvas.artboards.map((a) => {
  const src = readFileSync(join(dir, a.file), 'utf8');
  const body = src.slice(src.indexOf('</helmet>') + 9, src.lastIndexOf('</x-dc>')).trim();
  if (!body.startsWith('<div')) throw new Error(`could not extract ${a.file}`);
  const m = a.title.match(/^(\d+) · (.+)$/);
  return { body, num: m[1], title: m[2], file: a.file };
});

const sections = slides
  .map((s, i) => `<section class="slide" id="s${i + 1}" aria-label="${s.num} ${s.title}"${i === 0 ? '' : ' aria-hidden="true"'}>
  <div class="board">
${s.body}
  </div>
</section>`)
  .join('\n');

const html = `<title>${deckName}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;800;900&amp;family=Noto+Serif+TC:wght@500;700;900&amp;display=swap">
<style>
  /* The slides are fixed light artboards, so the player commits to one world:
     a dark stage around a projected frame. No theme stamps — a dark slide
     would be a different artifact, not a dark mode. */
  :root {
    --stage: #0c1c2b;
    --stage-lift: #14293b;
    --paper: #f7f2e8;
    --chrome: #dce6ec;
    --chrome-dim: #8ba3b4;
    --accent: ${accent};
    --apricot: #f1b879;
    --sans: 'Noto Sans TC', 'Microsoft JhengHei UI', sans-serif;
    --serif: 'Noto Serif TC', Georgia, serif;
    --mono: Consolas, 'Noto Sans TC', monospace;
    --scale: 1;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    min-height: 100vh;
    overflow: hidden;
    background: var(--stage);
    color: var(--chrome);
    font-family: var(--sans);
    -webkit-font-smoothing: antialiased;
  }

  body.is-overview { overflow: auto; }

  /* ---- stage ---- */

  .stage {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
  }

  body.is-overview .stage { display: none; }

  .slide {
    position: absolute;
    opacity: 0;
    visibility: hidden;
    transition: opacity .18s ease;
  }

  .slide.is-current { opacity: 1; visibility: visible; }

  @media (prefers-reduced-motion: reduce) {
    .slide { transition: none; }
  }

  .board {
    width: 1600px;
    height: 900px;
    transform: scale(var(--scale));
    transform-origin: center center;
    box-shadow: 0 40px 120px rgba(0, 0, 0, .55);
  }

  /* ---- progress ---- */

  .rail {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 30;
    height: 3px;
    background: rgba(220, 230, 236, .14);
  }

  .rail span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width .18s ease;
  }

  /* ---- chrome ---- */

  .bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 25;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 14px 22px;
    background: linear-gradient(to top, rgba(12, 28, 43, .96), rgba(12, 28, 43, 0));
    transition: opacity .25s ease;
  }

  body.is-idle .bar { opacity: 0; pointer-events: none; }
  body.is-overview .bar { position: sticky; background: var(--stage); }

  .where {
    display: flex;
    align-items: baseline;
    gap: 12px;
    min-width: 0;
  }

  .where b {
    color: var(--chrome);
    font: 700 15px/1 var(--serif);
    white-space: nowrap;
  }

  .where span {
    overflow: hidden;
    color: var(--chrome-dim);
    font: 500 14px/1.3 var(--sans);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .controls { display: flex; align-items: center; gap: 6px; }

  button {
    display: grid;
    place-items: center;
    min-width: 38px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid rgba(220, 230, 236, .18);
    border-radius: 6px;
    background: transparent;
    color: var(--chrome);
    font: 500 14px/1 var(--sans);
    cursor: pointer;
    transition: background .15s ease, border-color .15s ease;
  }

  button:hover:not(:disabled) { border-color: var(--accent); background: var(--stage-lift); }
  button:disabled { opacity: .3; cursor: default; }
  button:focus-visible { outline: 2px solid var(--apricot); outline-offset: 2px; }

  button svg { width: 17px; height: 17px; }

  .count {
    min-width: 78px;
    color: var(--chrome);
    font: 700 15px/1 var(--mono);
    font-variant-numeric: tabular-nums;
    letter-spacing: .06em;
    text-align: center;
  }

  .count i { color: var(--chrome-dim); font-style: normal; }

  /* ---- overview ---- */

  .overview { display: none; padding: 34px 30px 20px; }
  body.is-overview .overview { display: block; }

  .overview h1 {
    margin: 0 0 4px;
    color: var(--chrome);
    font: 700 26px/1.2 var(--serif);
    letter-spacing: -.02em;
  }

  .overview p {
    margin: 0 0 26px;
    color: var(--chrome-dim);
    font: 400 14px/1.5 var(--sans);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px 20px;
  }

  .thumb {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    text-align: left;
  }

  .thumb:hover:not(:disabled) { border-color: transparent; background: transparent; }

  .thumb .frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    border-radius: 3px;
    outline: 1px solid rgba(220, 230, 236, .16);
    outline-offset: -1px;
    background: var(--paper);
  }

  .thumb:hover .frame { outline: 2px solid var(--chrome-dim); }
  .thumb[aria-current="true"] .frame { outline: 3px solid var(--accent); }

  .thumb .frame > div {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }

  .thumb .meta { display: flex; gap: 9px; align-items: baseline; }

  .thumb .meta b {
    color: var(--accent);
    font: 800 12px/1.3 var(--mono);
    font-variant-numeric: tabular-nums;
  }

  .thumb .meta span {
    color: var(--chrome);
    font: 500 14px/1.35 var(--sans);
    text-wrap: pretty;
  }

  /* ---- hint ---- */

  .hint {
    position: fixed;
    left: 50%;
    bottom: 68px;
    z-index: 26;
    display: flex;
    gap: 18px;
    padding: 11px 18px;
    border: 1px solid rgba(220, 230, 236, .16);
    border-radius: 8px;
    background: rgba(20, 41, 59, .95);
    color: var(--chrome-dim);
    font: 500 13px/1 var(--sans);
    transform: translateX(-50%);
    transition: opacity .3s ease;
  }

  .hint kbd {
    padding: 3px 6px;
    border: 1px solid rgba(220, 230, 236, .24);
    border-radius: 4px;
    color: var(--chrome);
    font: 700 12px/1 var(--mono);
  }

  .hint.is-gone { opacity: 0; pointer-events: none; }
  body.is-overview .hint { display: none; }

  @media (max-width: 720px) {
    .where span, .hint { display: none; }
  }

  /* Printing is how the deck leaves this repo (PDF -> Canva / handout), so the
     paper is the artboard itself: one 1600x900 page per slide, no margin. */
  @page { size: 1600px 900px; margin: 0; }

  @media print {
    body { overflow: visible; background: #fff; }
    .rail, .bar, .hint, .overview { display: none !important; }
    .stage { position: static; display: block; overflow: visible; }
    .slide { position: static; opacity: 1; visibility: visible; break-after: page; }
    .slide:last-child { break-after: auto; }
    .board { transform: none; box-shadow: none; }
  }
</style>

<div class="rail" role="presentation"><span id="rail-fill"></span></div>

<div class="stage" id="stage" role="region" aria-label="${deckName} 投影片">
${sections}
</div>

<div class="overview" id="overview">
  <h1>${deckName}</h1>
  <p>共 ${slides.length} 張 · 點一張直接跳過去</p>
  <div class="grid" id="grid"></div>
</div>

<div class="hint" id="hint">
  <span><kbd>&larr;</kbd> <kbd>&rarr;</kbd> 翻頁</span>
  <span><kbd>O</kbd> 總覽</span>
  <span><kbd>F</kbd> 全螢幕</span>
</div>

<div class="bar">
  <div class="where">
    <b>${deckName}</b>
    <span id="where-title"></span>
  </div>
  <div class="controls">
    <button type="button" id="prev" aria-label="上一張" title="上一張（←）">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>
    </button>
    <span class="count" id="count" aria-live="polite"></span>
    <button type="button" id="next" aria-label="下一張" title="下一張（→）">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
    </button>
    <button type="button" id="grid-toggle" aria-label="總覽" title="總覽（O）">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="7" rx="1"/><rect x="14" y="15" width="7" height="7" rx="1"/></svg>
    </button>
    <button type="button" id="full" aria-label="全螢幕" title="全螢幕（F）">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>
    </button>
  </div>
</div>

<script>
  (function () {
    var TITLES = ${JSON.stringify(slides.map((s) => s.title))};
    var NUMS = ${JSON.stringify(slides.map((s) => s.num))};
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var total = slides.length;
    var root = document.documentElement;
    var body = document.body;
    var current = 0;
    var built = false;

    function fit() {
      root.style.setProperty('--scale', String(Math.min(window.innerWidth / 1600, window.innerHeight / 900)));
    }

    function show(i, push) {
      current = Math.max(0, Math.min(total - 1, i));
      slides.forEach(function (el, n) {
        var on = n === current;
        el.classList.toggle('is-current', on);
        if (on) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', 'true');
      });
      document.getElementById('count').innerHTML = NUMS[current] + ' <i>/ ' + total + '</i>';
      document.getElementById('where-title').textContent = TITLES[current];
      document.getElementById('rail-fill').style.width = ((current + 1) / total * 100) + '%';
      document.getElementById('prev').disabled = current === 0;
      document.getElementById('next').disabled = current === total - 1;
      var thumbs = document.querySelectorAll('.thumb');
      for (var t = 0; t < thumbs.length; t++) {
        thumbs[t].setAttribute('aria-current', t === current ? 'true' : 'false');
      }
      if (push !== false) {
        try { history.replaceState(null, '', '#' + (current + 1)); } catch (err) { /* sandboxed */ }
      }
    }

    // Thumbnails clone the real slides, so the overview can never drift from
    // what actually presents.
    function buildGrid() {
      if (built) return;
      built = true;
      var grid = document.getElementById('grid');
      slides.forEach(function (el, n) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb';
        btn.setAttribute('aria-current', n === current ? 'true' : 'false');
        var frame = document.createElement('div');
        frame.className = 'frame';
        frame.appendChild(el.querySelector('.board').firstElementChild.cloneNode(true));
        var meta = document.createElement('div');
        meta.className = 'meta';
        var num = document.createElement('b');
        num.textContent = NUMS[n];
        var label = document.createElement('span');
        label.textContent = TITLES[n];
        meta.appendChild(num);
        meta.appendChild(label);
        btn.appendChild(frame);
        btn.appendChild(meta);
        btn.addEventListener('click', function () {
          setOverview(false);
          show(n);
        });
        grid.appendChild(btn);
      });
      scaleThumbs();
    }

    function scaleThumbs() {
      var frames = document.querySelectorAll('.thumb .frame');
      for (var i = 0; i < frames.length; i++) {
        var board = frames[i].firstElementChild;
        if (board) board.style.transform = 'scale(' + (frames[i].clientWidth / 1600) + ')';
      }
    }

    function setOverview(on) {
      body.classList.toggle('is-overview', on);
      if (on) { buildGrid(); scaleThumbs(); wake(); }
    }

    var idleTimer;
    function wake() {
      body.classList.remove('is-idle');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (!body.classList.contains('is-overview')) body.classList.add('is-idle');
      }, 3200);
    }

    document.getElementById('prev').addEventListener('click', function () { show(current - 1); });
    document.getElementById('next').addEventListener('click', function () { show(current + 1); });
    document.getElementById('grid-toggle').addEventListener('click', function () {
      setOverview(!body.classList.contains('is-overview'));
    });
    document.getElementById('full').addEventListener('click', function () {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (root.requestFullscreen) root.requestFullscreen();
      } catch (err) { /* fullscreen may be blocked */ }
    });

    document.addEventListener('keydown', function (e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      var over = body.classList.contains('is-overview');
      if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') {
        if (over) setOverview(false); else show(current + 1);
        e.preventDefault();
      } else if (k === 'ArrowLeft' || k === 'PageUp') {
        if (!over) show(current - 1);
        e.preventDefault();
      } else if (k === 'Home') { show(0); e.preventDefault(); }
      else if (k === 'End') { show(total - 1); e.preventDefault(); }
      else if (k === 'o' || k === 'O') { setOverview(!over); e.preventDefault(); }
      else if (k === 'Escape') { if (over) setOverview(false); }
      else if (k === 'f' || k === 'F') { document.getElementById('full').click(); }
      wake();
    });

    var touchX = null;
    document.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (touchX === null || body.classList.contains('is-overview')) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 55) show(current + (dx < 0 ? 1 : -1));
      touchX = null;
      wake();
    }, { passive: true });

    window.addEventListener('resize', function () { fit(); scaleThumbs(); });
    document.addEventListener('mousemove', wake);

    setTimeout(function () { document.getElementById('hint').classList.add('is-gone'); }, 5200);

    fit();
    var start = parseInt((location.hash || '').slice(1), 10);
    show(isNaN(start) ? 0 : start - 1, false);
    wake();
  }());
</script>
`;

writeFileSync(out, html, 'utf8');
console.log(`${slides.length} slides -> ${out}`);
