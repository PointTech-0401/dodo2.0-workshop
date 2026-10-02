// The four mechanism diagrams. Every module name, path and decision order here
// is read off dodo_workshop/web.py, proactive.py, intake.py, profile.py and web/*.js.
//
// Grid: the two architecture diagrams are three columns (瀏覽器 · 後端 · 外部)
// with 300px nodes and 175px gutters, so the bypass path can arc over the middle
// column instead of threading past it. The two flow diagrams are four columns of
// 286px on an 80px gutter. Numbered badges = a step; kicker = an outcome.
import {
  C, diagram, dnode, dzone, dflow, darc, dlabel, dlabelBlock, ZONE_COOL,
} from './kit.mjs';

const APRICOT_TEXT = '#a8722a';

/* ---------- Workshop 1 · 專案架構 ---------- */

export const w1Architecture = diagram({
  id: 'w1arch',
  w: 1400,
  h: 490,
  label: '專案架構圖：瀏覽器與本機 Python 後端在同一台電腦，建立連線經後端代理，之後的音訊與文字由瀏覽器直連 OpenAI',
  caption: 'API Key 只存在本機後端（Terminal），網頁讀不到。建立連線時經後端代理，之後的音訊與文字由瀏覽器直接連到 OpenAI。',
  children: [
    dzone({ x: 8, y: 138, w: 845, h: 330, label: '這台電腦' }),
    dzone({ x: 958, y: 138, w: 434, h: 330, label: '外部服務', fill: ZONE_COOL }),

    dnode({
      x: 40, y: 170, w: 300, h: 150, tone: 'sky', accent: C.blue,
      kicker: '瀏覽器', title: 'web/ 前端',
      lines: ['第一堂的畫面', '組 Prompt、建立連線', '處理工具呼叫'],
    }),
    dnode({
      x: 515, y: 170, w: 300, h: 150, tone: 'white', accent: C.green, emph: true,
      kicker: '本機 PYTHON 後端', title: 'dodo_workshop/web.py',
      lines: ['API Key 只留在這裡', 'profile.py 預設文字、整理存檔', 'weather.py 代查天氣'],
    }),
    dnode({
      x: 515, y: 372, w: 220, h: 76, tone: 'white', accent: C.inkSoft,
      title: 'runtime/',
      lines: ['自動存檔'],
    }),
    dnode({
      x: 990, y: 170, w: 300, h: 150, tone: 'white', accent: C.apricot,
      kicker: 'OPENAI REALTIME', title: 'gpt-realtime-2',
      lines: ['gpt-4o-transcribe', 'near_field · 聲線自選'],
    }),
    dnode({
      x: 990, y: 372, w: 300, h: 76, tone: 'white', accent: C.apricot,
      title: 'OpenWeatherMap',
      lines: ['由後端代查'],
    }),

    dflow('w1arch', [[350, 245], [505, 245]], { both: true }),
    dlabelBlock(427, 214, ['① 連線請求', '與 Prompt']),
    dflow('w1arch', [[825, 245], [980, 245]]),
    dlabelBlock(902, 214, ['② 補上 API Key', '後代理']),
    darc('w1arch', [190, 160], [1140, 160], 52),
    dlabel(665, 62, '③ WebRTC 音訊／文字：瀏覽器直連，不經後端', { anchor: 'middle', colour: APRICOT_TEXT, weight: 700 }),
    dflow('w1arch', [[625, 330], [625, 362]]),
    dlabel(643, 352, '讀寫作品'),
    dflow('w1arch', [[790, 330], [790, 410], [980, 410]]),
    dlabel(808, 400, 'get_weather'),
  ].join('\n    '),
});

/* ---------- Workshop 1 · 系統流程 ---------- */

// Three lanes (OpenAI · 瀏覽器 · 本機後端), browser in the middle so every hop
// in a turn is between neighbours. Only the connection's 後端 → OpenAI hop has
// to pass the browser lane, and it arcs over the top to do it.
const LANE = { openai: 38, browser: 530, backend: 1022 };
const FLOW_NODE = { w: 340, h: 84 };

export const w1Flow = diagram({
  id: 'w1flow',
  w: 1400,
  h: 562,
  label: '一句話的處理流程：OpenAI、瀏覽器、本機後端三方之間怎麼傳。連線只發生一次，之後聲音與文字由瀏覽器直連 OpenAI，查天氣時才經過後端',
  caption: '連線只發生一次（①–③），之後聲音和文字直連 OpenAI；查天氣才經過後端，結果送回後的下一個回覆才是正式回答。',
  children: [
    dzone({ x: 8, y: 58, w: 400, h: 472, label: '', fill: ZONE_COOL }),
    dzone({ x: 500, y: 58, w: 400, h: 472, label: '' }),
    dzone({ x: 992, y: 58, w: 400, h: 472, label: '' }),
    dlabel(8, 552, 'OPENAI REALTIME', { colour: C.inkSoft, size: 14, weight: 800 }),
    dlabel(500, 552, '瀏覽器', { colour: C.inkSoft, size: 14, weight: 800 }),
    dlabel(992, 552, '本機後端', { colour: C.inkSoft, size: 14, weight: 800 }),

    dnode({ x: LANE.browser, y: 98, ...FLOW_NODE, n: 1, accent: C.blue, title: '準備連線', lines: ['連線請求與 Prompt 一起送'] }),
    dnode({ x: LANE.backend, y: 98, ...FLOW_NODE, n: 2, accent: C.green, title: '補上 API Key', lines: ['轉送給 OpenAI'] }),
    dnode({ x: LANE.openai, y: 98, ...FLOW_NODE, n: 3, accent: C.apricot, title: '連線建立', lines: ['第一句話就已經是豆豆'] }),
    dflow('w1flow', [[880, 140], [1012, 140]]),
    dlabelBlock(946, 112, ['連線請求', '＋Prompt'], { step: 17 }),
    // ② → ③ has to pass the browser lane; it clears every zone border by
    // rising well above them, and lands on ③ only (the answer is implied).
    darc('w1flow', [1192, 88], [208, 88], 0, { colour: 'ink', both: false }),
    dflow('w1flow', [[520, 140], [388, 140]], { colour: 'apricot', both: true }),
    dlabelBlock(454, 112, ['WebRTC', '直連'], { step: 17, colour: APRICOT_TEXT, weight: 700 }),

    dnode({ x: LANE.browser, y: 202, ...FLOW_NODE, n: 4, accent: C.blue, title: '你說完', lines: ['VAD 判定或按「送出」'] }),
    dnode({ x: LANE.openai, y: 202, ...FLOW_NODE, n: 5, accent: C.apricot, title: '模型回覆', lines: ['不用工具：這就是正式回答'] }),
    dflow('w1flow', [[520, 244], [388, 244]], { colour: 'apricot' }),
    dlabel(454, 234, '聲音或文字', { anchor: 'middle', colour: APRICOT_TEXT, weight: 700 }),

    dnode({ x: LANE.openai, y: 332, ...FLOW_NODE, n: 6, accent: C.apricot, title: '先講開場，呼叫工具', titleSize: 18, lines: ['這句開場就是 preamble'] }),
    dnode({ x: LANE.browser, y: 332, ...FLOW_NODE, n: 7, accent: C.blue, title: '執行工具', lines: ['天氣交給後端代查'] }),
    dnode({ x: LANE.backend, y: 332, ...FLOW_NODE, n: 8, accent: C.green, title: '代查天氣', lines: ['用天氣 Key 查 OpenWeatherMap'] }),
    dflow('w1flow', [[208, 296], [208, 322]]),
    dlabel(222, 314, '要查天氣時'),
    dflow('w1flow', [[388, 374], [520, 374]], { colour: 'apricot' }),
    dlabel(454, 364, '工具呼叫', { anchor: 'middle', colour: APRICOT_TEXT, weight: 700 }),
    dflow('w1flow', [[880, 374], [1012, 374]], { both: true }),
    dlabel(946, 364, '查天氣', { anchor: 'middle' }),

    dnode({ x: LANE.openai, y: 436, ...FLOW_NODE, n: 9, accent: C.apricot, tone: 'paper', title: '下一個回覆', lines: ['這才是正式回答'] }),
    dflow('w1flow', [[640, 426], [640, 478], [388, 478]], { colour: 'apricot' }),
    dlabel(652, 458, '送回結果', { colour: APRICOT_TEXT, weight: 700 }),
  ].join('\n    '),
});

/* ---------- Workshop 2 · 專案架構 ---------- */

export const w2Architecture = diagram({
  id: 'w2arch',
  w: 1400,
  h: 490,
  label: '專案架構圖：規則判斷都在本機完成；API Key 只在本機後端，連線經後端代理，之後瀏覽器直連 OpenAI',
  caption: '建檔與長條圖都在這台電腦上算完，不需要 API Key。Key 只存在本機後端（Terminal）：連線經後端代理，之後瀏覽器直連 OpenAI。整份 Prompt（含她的用藥與症狀）都會送到 OpenAI；今日摘要由後端另外送給文字模型。',
  children: [
    dzone({ x: 8, y: 138, w: 845, h: 330, label: '這台電腦', colour: C.green }),
    dzone({ x: 958, y: 138, w: 434, h: 330, label: '外部服務', fill: ZONE_COOL }),

    dnode({
      x: 40, y: 170, w: 300, h: 150, tone: 'sky', accent: C.blue,
      kicker: '瀏覽器', title: 'web/workshop2.js',
      lines: ['建檔六區', '記憶清單', '讓豆豆開口的表單'],
    }),
    dnode({
      x: 515, y: 170, w: 300, h: 150, tone: 'white', accent: C.green, emph: true,
      kicker: '本機 PYTHON 後端', title: 'dodo_workshop/',
      lines: ['proactive.py 說不說', 'intake.py 建檔', 'profile.py 預設文字、整理存檔'],
    }),
    dnode({
      x: 515, y: 372, w: 300, h: 76, tone: 'white', accent: C.inkSoft,
      title: 'scenarios/ · runtime/', titleSize: 17,
      lines: ['秀蘭阿嬤的資料 · 自動存檔'],
    }),
    dnode({
      x: 990, y: 170, w: 300, h: 150, tone: 'white', accent: C.apricot,
      kicker: '需要 KEY 的地方', title: 'OpenAI Realtime',
      lines: ['問豆豆 · 紅隊', '讓豆豆真的開口'],
    }),

    dflow('w2arch', [[350, 245], [505, 245]], { both: true }),
    dlabelBlock(427, 214, ['① 事件與你的規則', '送去跑規則']),
    dlabel(427, 268, '建立連線也走這條', { anchor: 'middle' }),
    dflow('w2arch', [[825, 245], [980, 245]]),
    dlabelBlock(902, 214, ['② 補上 Key', '代理連線']),
    darc('w2arch', [190, 160], [1140, 160], 52),
    dlabel(665, 62, '③ 連線建好後，瀏覽器直連 OpenAI，Prompt 整份送去', { anchor: 'middle', colour: APRICOT_TEXT, weight: 700 }),
    dflow('w2arch', [[665, 330], [665, 362]]),
    dlabel(683, 352, '讀她的資料'),
  ].join('\n    '),
});
