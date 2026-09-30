import { textW } from './kit.mjs';
import { readFileSync } from 'node:fs';
const CW = 1600 - 108 - 88;
const CHROME = 58 + 52 + 35 + 30 + 30;
for (const [d, f] of [['workshop-1','ProjectMap'],['workshop-1','TurnFlow'],['workshop-2','ProjectMap']]) {
  const s = readFileSync('slides/' + d + '/' + f + '.dc.html', 'utf8');
  const vh = +s.match(/viewBox="0 0 (\d+) (\d+)"/)[2];
  const title = s.match(/font: 700 52px[^>]*>([^<]*)</)[1];
  const cap = s.match(/<figcaption[^>]*>([^<]*)</)[1];
  const titleLines = Math.ceil(textW(title, 52) / 1310);
  const capLines = Math.ceil(textW(cap, 19) / CW);
  const svgH = vh * (CW / 1400);
  const total = CHROME + titleLines * 60.3 + svgH + 14 + capLines * 29.45;
  console.log((total <= 900 ? 'FITS  ' : 'OVER  ') + d + '/' + f + '  svg ' + Math.round(svgH) + '  title ' + titleLines + 'L  caption ' + capLines + 'L  => ' + Math.round(total) + '/900  slack ' + Math.round(900 - total));
}
