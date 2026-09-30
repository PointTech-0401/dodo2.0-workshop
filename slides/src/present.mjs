// Wraps the .dc.html artboards in a presentation player: one 1600x900 slide
// scaled to the viewport, keyboard driven, with an overview grid.
// With a notes module it also carries speaker notes (N: drawer, S: speaker
// window) and writes the same notes as a printable Markdown file.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , dir, out, deckName, accentName, notesPath] = process.argv;

const ACCENTS = { blue: '#397d9f', green: '#287653' };
const accent = ACCENTS[accentName];

const canvas = JSON.parse(readFileSync(join(dir, 'canvas.json'), 'utf8'));

// Notes are keyed by artboard file, so a slide that is added, renamed or
// dropped without its notes stops the build instead of silently shifting them.
const notes = notesPath ? (await import(pathToFileURL(resolve(notesPath)).href)).default : null;
if (notes) {
  const files = canvas.artboards.map((a) => a.file);
  const missing = files.filter((f) => !notes[f]);
  const unknown = Object.keys(notes).filter((f) => !files.includes(f));
  const noGoal = files.filter((f) => notes[f] && !notes[f].goal);
  if (missing.length || unknown.length || noGoal.length) {
    throw new Error(`notes out of sync with ${dir}: missing [${missing.join(', ')}] unknown [${unknown.join(', ')}] no goal [${noGoal.join(', ')}]`);
  }
}

// `do` is a sequence the presenter walks through, so it is the one numbered list.
const NOTE_LISTS = [['say', '可以這樣講', 'ul'], ['do', '操作', 'ol'], ['watch', '容易卡住', 'ul']];
const QA_LABEL = '被問到就這樣答';
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function noteHtml(n) {
  if (!n) return '';
  const parts = [];
  if (n.time) parts.push(`<p class="n-time">${esc(n.time)}</p>`);
  if (n.goal) parts.push(`<p class="n-goal">${esc(n.goal)}</p>`);
  for (const [key, label, tag] of NOTE_LISTS) {
    if (n[key]?.length) parts.push(`<h3>${label}</h3><${tag}>${n[key].map((t) => `<li>${esc(t)}</li>`).join('')}</${tag}>`);
  }
  if (n.qa?.length) {
    parts.push(`<h3>${QA_LABEL}</h3><dl>${n.qa.map(([q, a]) => `<dt>問：${esc(q)}</dt><dd>答：${esc(a)}</dd>`).join('')}</dl>`);
  }
  return parts.join('');
}

function noteMd(title, num, n) {
  const lines = [`## ${num} · ${title}${n.time ? `（${n.time}）` : ''}`, ''];
  if (n.goal) lines.push(`> ${n.goal}`, '');
  for (const [key, label, tag] of NOTE_LISTS) {
    const mark = (i) => (tag === 'ol' ? `${i + 1}.` : '-');
    if (n[key]?.length) lines.push(`**${label}**`, '', ...n[key].map((t, i) => `${mark(i)} ${t}`), '');
  }
  if (n.qa?.length) lines.push(`**${QA_LABEL}**`, '', ...n.qa.map(([q, a]) => `- 問：${q}\n  答：${a}`), '');
  return lines.join('\n');
}

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

// Inline JSON inside <script>: `<` is escaped so a note can never close the tag.
const inlineJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
const notesJson = inlineJson(notes ? slides.map((s) => noteHtml(notes[s.file])) : []);

// The speaker window is an about:blank popup the player writes into, so it
// shares the player's origin even from file:// and needs no second file.
const speakerDoc = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>講者視窗 · ${esc(deckName)}</title>
<style>
  body { margin: 0; padding: 22px 28px; background: #0c1c2b; color: #dce6ec; font: 18px/1.6 'Microsoft JhengHei UI', 'Noto Sans TC', sans-serif; }
  header { display: flex; align-items: baseline; gap: 18px; padding-bottom: 12px; border-bottom: 1px solid rgba(220,230,236,.2); }
  #sp-count { color: #f1b879; font: 800 22px/1 Consolas, monospace; }
  #sp-title { flex: 1; font: 700 22px/1.3 'Noto Serif TC', serif; }
  #sp-clock { color: #8ba3b4; font: 700 20px/1 Consolas, monospace; }
  #sp-next { margin: 10px 0 0; color: #8ba3b4; font-size: 15px; }
  h3, .n-time { margin: 16px 0 4px; color: #f1b879; font: 800 14px/1.2 sans-serif; letter-spacing: .12em; }
  .n-time { color: #8fd0f0; }
  .n-goal { margin: 6px 0 4px; padding: 10px 14px; border-left: 4px solid #8fd0f0; background: rgba(143,208,240,.1); color: #fff; font-weight: 700; font-size: 21px; line-height: 1.5; }
  ul, ol { margin: 0; padding-left: 24px; } li { margin: 3px 0; }
  dl { margin: 0; } dt { margin-top: 8px; font-weight: 700; } dd { margin: 2px 0 0 24px; color: #a9bccb; }
  footer { margin-top: 22px; color: #8ba3b4; font-size: 13px; }
</style></head><body>
<header><span id="sp-count"></span><span id="sp-title"></span><span id="sp-clock">00:00</span></header>
<p id="sp-next"></p>
<main id="sp-notes"></main>
<footer>在這個視窗按 ← → 也能翻頁；R 計時歸零。</footer>
</body></html>`;

if (notes) {
  const md = [`# ${deckName}：講者備註`, '', ...slides.map((s) => noteMd(s.title, s.num, notes[s.file]))].join('\n');
  const mdOut = out.endsWith('-slides.html') ? out.replace(/-slides\.html$/, '-notes.md') : `${out}.notes.md`;
  writeFileSync(mdOut, md, 'utf8');
  console.log(`notes -> ${mdOut}`);
}

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

  /* ---- speaker notes (N) ---- */

  .notes {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 24;
    display: none;
    height: 40vh;
    overflow: auto;
    padding: 14px 28px 76px;
    border-top: 1px solid rgba(220, 230, 236, .2);
    background: #0f2233;
    color: var(--chrome);
    font: 17px/1.6 var(--sans);
  }

  body.is-notes .notes { display: block; }
  body.is-notes .stage { bottom: 40vh; }
  /* The bar sits over the drawer's last lines; solid, it reads as a footer
     instead of text printed on text. The drawer's bottom padding scrolls clear. */
  body.is-notes .bar { background: #0f2233; border-top: 1px solid rgba(220, 230, 236, .12); }
  body.is-overview .notes { display: none; }

  .notes-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    color: var(--chrome-dim);
    font: 600 13px/1.4 var(--sans);
  }

  .notes h3, .n-time {
    margin: 12px 0 4px;
    color: var(--apricot);
    font: 800 13px/1.2 var(--sans);
    letter-spacing: .12em;
  }

  .n-time { color: var(--accent); filter: brightness(1.6); }
  .notes .n-goal {
    margin: 4px 0 2px;
    padding: 8px 12px;
    border-left: 4px solid var(--accent);
    background: rgba(220, 230, 236, .07);
    color: #fff;
    font: 700 19px/1.5 var(--sans);
  }
  .notes ul, .notes ol { margin: 0; padding-left: 22px; }
  .notes li { margin: 2px 0; }
  .notes dl { margin: 0; }
  .notes dt { margin-top: 8px; font-weight: 700; }
  .notes dd { margin: 2px 0 0 22px; color: var(--chrome-dim); }

  /* Printing is how the deck leaves this repo (PDF -> Canva / handout), so the
     paper is the artboard itself: one 1600x900 page per slide, no margin. */
  @page { size: 1600px 900px; margin: 0; }

  @media print {
    body { overflow: visible; background: #fff; }
    .rail, .bar, .hint, .overview, .notes { display: none !important; }
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

${notes ? `<aside class="notes" id="notes" aria-label="講者備註">
  <div class="notes-head"><b>講者備註</b><span id="notes-next"></span></div>
  <div id="notes-body"></div>
</aside>` : ''}

<div class="hint" id="hint">
  <span><kbd>&larr;</kbd> <kbd>&rarr;</kbd> 翻頁</span>
  <span><kbd>O</kbd> 總覽</span>
  <span><kbd>F</kbd> 全螢幕</span>${notes ? `
  <span><kbd>N</kbd> 備註</span>
  <span><kbd>S</kbd> 講者視窗</span>` : ''}
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
    var NOTES = ${notesJson};
    var SPEAKER_DOC = ${inlineJson(speakerDoc)};
    var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
    var total = slides.length;
    var root = document.documentElement;
    var body = document.body;
    var current = 0;
    var built = false;
    var speaker = null;
    var startedAt = Date.now();

    function fit() {
      var drawer = document.getElementById('notes');
      var reserved = drawer && body.classList.contains('is-notes') ? drawer.offsetHeight : 0;
      root.style.setProperty('--scale', String(Math.min(window.innerWidth / 1600, (window.innerHeight - reserved) / 900)));
    }

    function nextLabel() {
      return current < total - 1 ? '下一張：' + NUMS[current + 1] + ' ' + TITLES[current + 1] : '最後一張';
    }

    function renderNotes() {
      if (!NOTES.length) return;
      document.getElementById('notes-body').innerHTML = NOTES[current] || '<p>（這一張沒有備註）</p>';
      document.getElementById('notes-next').textContent = nextLabel();
      if (!speaker || speaker.closed) return;
      var d = speaker.document;
      d.getElementById('sp-count').textContent = NUMS[current] + ' / ' + total;
      d.getElementById('sp-title').textContent = TITLES[current];
      d.getElementById('sp-next').textContent = nextLabel();
      d.getElementById('sp-notes').innerHTML = NOTES[current] || '';
    }

    function openSpeaker() {
      if (!NOTES.length) return;
      if (speaker && !speaker.closed) { speaker.focus(); return; }
      speaker = window.open('', 'dodo-speaker', 'width=980,height=780');
      if (!speaker) return;
      speaker.document.open();
      speaker.document.write(SPEAKER_DOC);
      speaker.document.close();
      speaker.document.addEventListener('keydown', onKey);
      startedAt = Date.now();
      renderNotes();
    }

    setInterval(function () {
      if (!speaker || speaker.closed) return;
      var s = Math.floor((Date.now() - startedAt) / 1000);
      var clock = speaker.document.getElementById('sp-clock');
      if (clock) clock.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    }, 1000);

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
      renderNotes();
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

    // Shared by the player and the speaker window, so both flip the same deck.
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key;
      var over = body.classList.contains('is-overview');
      if (NOTES.length && (k === 'n' || k === 'N')) {
        body.classList.toggle('is-notes');
        fit();
        e.preventDefault();
        return;
      }
      if (NOTES.length && (k === 's' || k === 'S')) { openSpeaker(); e.preventDefault(); return; }
      if (k === 'r' || k === 'R') { startedAt = Date.now(); return; }
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
    }

    document.addEventListener('keydown', onKey);

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
