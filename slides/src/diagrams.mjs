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
  caption: 'API Key 只留在本機後端。建立連線那一次經後端代理，之後的音訊與文字由瀏覽器直連 OpenAI，不再經過後端。',
  children: [
    dzone({ x: 8, y: 138, w: 845, h: 330, label: '這台電腦' }),
    dzone({ x: 958, y: 138, w: 434, h: 330, label: '外部服務', fill: ZONE_COOL }),

    dnode({
      x: 40, y: 170, w: 300, h: 150, tone: 'sky', accent: C.blue,
      kicker: '瀏覽器', title: 'web/ 前端',
      lines: ['core · workshop1 · workshop2', '組 Prompt · 連線', '記憶工具'],
    }),
    dnode({
      x: 515, y: 170, w: 300, h: 150, tone: 'white', accent: C.green, emph: true,
      kicker: '本機 PYTHON 後端', title: 'dodo_workshop/web.py',
      lines: ['API Key 只留在這裡', 'profile.py 組 Prompt', 'weather.py 代查天氣'],
    }),
    dnode({
      x: 515, y: 372, w: 220, h: 76, tone: 'white', accent: C.inkSoft,
      title: 'student/my-dodo.json', titleSize: 16,
      lines: ['scenarios/ 的訪談稿'],
    }),
    dnode({
      x: 990, y: 170, w: 300, h: 150, tone: 'white', accent: C.apricot,
      kicker: 'OPENAI REALTIME', title: 'gpt-realtime-2',
      lines: ['gpt-4o-transcribe', 'near_field · sage'],
    }),
    dnode({
      x: 990, y: 372, w: 300, h: 76, tone: 'white', accent: C.apricot,
      title: 'OpenWeatherMap',
      lines: ['由後端代查'],
    }),

    dflow('w1arch', [[350, 245], [505, 245]], { both: true }),
    dlabelBlock(427, 214, ['① SDP offer', '與 instructions']),
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

export const w1Flow = diagram({
  id: 'w1flow',
  w: 1400,
  h: 470,
  label: '系統流程圖：連線只發生一次，之後每個回合視需不需要工具，產生一個或兩個 response',
  caption: 'instructions 在第 ① 步就隨 offer 送出，所以第一句話已經是豆豆。需要工具時，preamble 和 function_call 在同一個 response 裡，正式回答要等下一個。',
  children: [
    dlabel(0, 30, '連線 · 只發生一次', { colour: C.inkSoft, size: 14, weight: 800 }),
    dnode({ x: 8, y: 48, w: 286, h: 112, n: 1, accent: C.blue, title: '開啟畫面', lines: ['core.js 建立 WebRTC offer'] }),
    dnode({ x: 374, y: 48, w: 286, h: 112, n: 2, accent: C.blue, title: '送到本機後端', lines: ['offer 與 instructions 同行'] }),
    dnode({ x: 740, y: 48, w: 286, h: 112, n: 3, accent: C.green, title: '後端補上 API Key', lines: ['轉送 /v1/realtime/calls'] }),
    dnode({ x: 1106, y: 48, w: 286, h: 112, n: 4, accent: C.apricot, title: '連線建立', lines: ['第一句話就已經是豆豆'] }),
    dflow('w1flow', [[302, 104], [366, 104]]),
    dflow('w1flow', [[668, 104], [732, 104]]),
    dflow('w1flow', [[1034, 104], [1098, 104]]),

    dlabel(0, 216, '之後 · 每一個回合', { colour: C.inkSoft, size: 14, weight: 800 }),
    dnode({ x: 8, y: 250, w: 286, h: 112, n: 5, accent: C.blue, title: '使用者說完', lines: ['VAD 判定或按「送出」'] }),
    dnode({ x: 374, y: 250, w: 286, h: 112, n: 6, accent: C.blue, title: '模型建立 response', lines: ['決定要不要用工具'] }),
    dnode({
      x: 740, y: 190, w: 286, h: 104, tone: 'white', accent: C.green,
      kicker: '不需要工具', title: '一個 response 結束', lines: ['直接就是正式回答'],
    }),
    dnode({
      x: 740, y: 318, w: 286, h: 118, tone: 'white', accent: C.apricot,
      kicker: '需要工具', title: 'preamble + function_call', titleSize: 18,
      lines: ['兩者在同一個 response 裡'],
    }),
    dnode({
      x: 1106, y: 318, w: 286, h: 118, tone: 'paper', accent: C.apricot,
      kicker: '工具結果回送後', title: '下一個 response', lines: ['才是正式回答'],
    }),
    dflow('w1flow', [[302, 306], [366, 306]]),
    dflow('w1flow', [[668, 306], [700, 306]], { head: false }),
    dflow('w1flow', [[700, 306], [700, 242], [732, 242]]),
    dflow('w1flow', [[700, 306], [700, 377], [732, 377]]),
    dlabel(699, 288, '依模型決定', { anchor: 'middle', size: 14 }),
    dflow('w1flow', [[1034, 377], [1098, 377]]),
  ].join('\n    '),
});

/* ---------- Workshop 2 · 專案架構 ---------- */

export const w2Architecture = diagram({
  id: 'w2arch',
  w: 1400,
  h: 490,
  label: '專案架構圖：第二堂所有判斷都在本機完成，只有讓豆豆開口那一條線離開這台電腦',
  caption: '建檔、長條圖與「跑她的一天」全部在這台電腦上算完，不需要 API Key。只有讓豆豆真的開口那一條線才出網路（連線本身仍如第一堂由後端代理建立）。',
  children: [
    dzone({ x: 8, y: 138, w: 845, h: 330, label: '本機 · 不需要 API KEY', colour: C.green }),
    dzone({ x: 958, y: 138, w: 434, h: 330, label: '外部服務', fill: ZONE_COOL }),

    dnode({
      x: 40, y: 170, w: 300, h: 150, tone: 'sky', accent: C.blue,
      kicker: '瀏覽器', title: 'web/workshop2.js',
      lines: ['建檔六區', '記憶清單', '讓它開口的表單'],
    }),
    dnode({
      x: 515, y: 170, w: 300, h: 150, tone: 'white', accent: C.green, emph: true,
      kicker: '本機 PYTHON 後端', title: 'dodo_workshop/',
      lines: ['proactive.py 說不說', 'intake.py 建檔', 'profile.py 組 Prompt'],
    }),
    dnode({
      x: 515, y: 372, w: 300, h: 76, tone: 'white', accent: C.inkSoft,
      title: 'scenarios/ · my-dodo.json', titleSize: 17,
      lines: ['秀蘭阿嬤的資料'],
    }),
    dnode({
      x: 990, y: 170, w: 300, h: 150, tone: 'white', accent: C.apricot,
      kicker: '唯一需要 KEY 的地方', title: 'OpenAI Realtime',
      lines: ['紅隊挑戰', '讓豆豆真的開口'],
    }),

    dflow('w2arch', [[350, 245], [505, 245]], { both: true }),
    dlabelBlock(427, 214, ['① 事件與你的規則', '送去跑規則']),
    darc('w2arch', [190, 160], [1140, 160], 52),
    dlabel(665, 62, '② 只有「真的開口」這一步才出網路', { anchor: 'middle', colour: APRICOT_TEXT, weight: 700 }),
    dflow('w2arch', [[665, 330], [665, 362]]),
    dlabel(683, 352, '讀她的資料'),
  ].join('\n    '),
});

/* ---------- Workshop 2 · 系統流程 ---------- */

export const w2Flow = diagram({
  id: 'w2flow',
  w: 1400,
  h: 500,
  label: '系統流程圖：記憶要經過分層、擋掉絕不能記的一類與筆數上限才進 Prompt；主動訊息由程式決定說不說',
  caption: '兩條路都由程式把關：記憶先分層、擋掉絕不能記的那一類，再取每層最多 16 筆才進 Prompt；要不要開口也是程式決定，模型只負責怎麼講。',
  children: [
    dlabel(0, 30, '記憶怎麼進 PROMPT', { colour: C.inkSoft, size: 14, weight: 800 }),
    dnode({ x: 8, y: 48, w: 286, h: 104, n: 1, accent: C.blue, title: '使用者說一句話', lines: ['「我對花生過敏」'] }),
    dnode({ x: 374, y: 48, w: 286, h: 104, n: 2, accent: C.blue, title: '豆豆把它寫進記憶', titleSize: 17, lines: ['要指定放哪一層'] }),
    dnode({ x: 740, y: 48, w: 286, h: 104, n: 3, accent: C.green, title: '照層別分流', titleSize: 18, lines: ['A 重要事實 B 近期 C 摘要'] }),
    dnode({ x: 1106, y: 48, w: 286, h: 104, n: 4, accent: C.apricot, title: '組成 Prompt 段落', lines: ['每層最多 16 筆'] }),
    dnode({
      x: 740, y: 192, w: 286, h: 76, tone: 'white', accent: C.danger,
      title: '這一類直接拒絕', lines: ['密碼 · 金鑰 · 驗證碼'],
    }),
    dflow('w2flow', [[302, 100], [366, 100]]),
    dflow('w2flow', [[668, 100], [732, 100]]),
    dflow('w2flow', [[1034, 100], [1098, 100]]),
    dflow('w2flow', [[883, 152], [883, 184]], { colour: 'danger' }),
    dlabel(901, 174, '碰到就擋', { size: 14, colour: C.danger }),

    dlabel(0, 306, '主動要不要開口', { colour: C.inkSoft, size: 14, weight: 800 }),
    dnode({ x: 8, y: 324, w: 286, h: 104, n: 1, accent: C.blue, title: '事件與你的規則', lines: ['安靜 · 不打擾 · 間隔 · 上限'] }),
    dnode({ x: 374, y: 324, w: 286, h: 104, n: 2, accent: C.blue, title: '送去跑規則', lines: ['在這台電腦上判斷'] }),
    dnode({ x: 740, y: 324, w: 286, h: 104, n: 3, accent: C.green, title: '七條規則依序判斷', titleSize: 18, lines: ['重要提醒直放，其餘依序過關'] }),
    dnode({
      x: 1106, y: 262, w: 286, h: 94, tone: 'white', accent: C.inkSoft,
      kicker: '不說', title: '留一行 TOOL 說明', lines: ['被哪一條規則擋下'],
    }),
    dnode({
      x: 1106, y: 396, w: 286, h: 94, tone: 'paper', accent: C.apricot,
      kicker: '說', title: '在對話裡先開口', lines: ['模型只管怎麼講'],
    }),
    dflow('w2flow', [[302, 376], [366, 376]]),
    dflow('w2flow', [[668, 376], [732, 376]]),
    dflow('w2flow', [[1034, 376], [1066, 376]], { head: false }),
    dflow('w2flow', [[1066, 376], [1066, 309], [1098, 309]]),
    dflow('w2flow', [[1066, 376], [1066, 443], [1098, 443]], { colour: 'apricot' }),
  ].join('\n    '),
});
