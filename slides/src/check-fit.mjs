import { textW, FONT_BUMP } from './kit.mjs';
import { readFileSync } from 'node:fs';
const CW = 1600 - 108 - 88;
const TITLE = 52 + FONT_BUMP;
const CAPTION = 19 + FONT_BUMP;
const CHROME = 58 + 52 + 35 + FONT_BUMP + 30 + 30;
for (const [d, f] of [['workshop-1','ProjectMap'],['workshop-1','TurnFlow'],['workshop-2','ProjectMap']]) {
  const s = readFileSync('slides/' + d + '/' + f + '.dc.html', 'utf8');
  const vh = +s.match(/viewBox="0 0 (\d+) (\d+)"/)[2];
  const title = s.match(new RegExp(`font: 700 ${TITLE}px[^>]*>([^<]*)<`))[1];
  const cap = s.match(/<figcaption[^>]*>([^<]*)</)[1];
  const titleLines = Math.ceil(textW(title, TITLE) / 1310);
  const capLines = Math.ceil(textW(cap, CAPTION) / CW);
  const svgH = vh * (CW / 1400);
  const total = CHROME + titleLines * TITLE * 1.16 + svgH + 14 + capLines * CAPTION * 1.55;
  console.log((total <= 900 ? 'FITS  ' : 'OVER  ') + d + '/' + f + '  svg ' + Math.round(svgH) + '  title ' + titleLines + 'L  caption ' + capLines + 'L  => ' + Math.round(total) + '/900  slack ' + Math.round(900 - total));
}
