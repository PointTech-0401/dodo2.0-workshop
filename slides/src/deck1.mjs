import {
  C, SANS,
  cover, slide, card, row, stack, table, band, bullets, steps, code, payoff, emit,
} from './kit.mjs';
import { w1Architecture, w1Flow } from './diagrams.mjs';

const A = C.blue;
const EB = 'WORKSHOP 01 · 讓 DODO 聽完，再回答';
const S = [];
const add = (file, title, make) => S.push({ file, title, make });

add('Main.dc.html', '封面', () => cover({
  eyebrow: 'SESSION 01 · 165 分鐘',
  number: '01',
  title: '讓 Dodo 聽完，再回答',
  sub: '正確拆解 Realtime Voice Agent 的 Prompt、回合控制與輸出長度',
  meta: ['OpenAI Realtime API', 'gpt-realtime-2', 'gpt-4o-transcribe', '預設聲線 sage', 'near_field 收音降噪'],
  accent: A,
  halo: C.sky,
}));

add('ThreeLayers.dc.html', '三個層次', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'Voice Agent 不是「多寫一些 Prompt」就會自然',
  lede: '學生要能分清楚三個層次 —— 每一層在本專案都有一個實際對應的位置。',
  body: row([
    card({
      grow: true, accent: A, kicker: 'MODEL INSTRUCTIONS',
      title: '角色、語氣、回答內容與安全界線',
      body: '寫在畫面左側 A 區的五個分塊裡。',
      note: 'instructions',
    }),
    card({
      grow: true, accent: C.apricot, kicker: 'TURN DETECTION',
      title: '何時開始聽、何時判定說完、是否允許插話',
      body: '由右側 B 區的回合設定決定。',
      note: 'session.audio.input.turn_detection',
    }),
    card({
      grow: true, accent: C.green, kicker: 'OUTPUT LENGTH',
      title: '單次回答多長',
      body: '寫在「對話方式」分塊裡，不設 API 上限 —— 這是刻意的選擇。',
      note: '（沒有 max_output_tokens）',
    }),
  ]),
  foot: 'Prompt 不負責偵測使用者是否說完；回合控制也不負責決定它說什麼。',
}));

add('ProjectMap.dc.html', '專案架構', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '這個專案長什麼樣',
  body: w1Architecture,
}));

add('TurnFlow.dc.html', '系統流程', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '一句話從送出到回答，中間走過哪裡',
  body: w1Flow,
}));

add('Outcomes.dc.html', '學習成果', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '這堂課結束時，你可以做到',
  body: bullets([
    '說明 Prompt、VAD 與 Push-to-talk 各自負責什麼，以及為什麼回覆長度留給 Prompt 而不是 token 上限。',
    '透過真正的 OpenAI Realtime API，比較修改不同 Prompt 分塊後的回答差異。',
    `比較 ${code('server_vad')}、${code('semantic_vad')}、Push-to-talk 三種回合方式。`,
    '按「套用」把設定實際送進 Realtime session.update，並用同一句話比較前後差異。',
    '把 Prompt 分塊、組裝結果與 Realtime 設定保存到 my-dodo.json，第二堂繼續使用。',
  ], { accent: A, size: 25, gap: 20 }),
}));

add('Timetable.dc.html', '時間表', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '165 分鐘怎麼走',
  body: table(
    [{ label: '時間', w: '190px' }, { label: '內容', w: '1fr' }],
    [
      ['0–15 分', '示範：文字立即送出；語音則要先判斷「說完了沒」'],
      ['15–35 分', 'Voice Agent 架構：WebRTC、Realtime model、輸入音訊、逐字稿與輸出音訊'],
      ['35–55 分', '關鍵分層：Prompt 管內容與長度；VAD／按鍵管回合；instructions 在 mint 時送出'],
      ['55–70 分', '三種回合方式：Server VAD、Semantic VAD、Push-to-talk'],
      ['70–80 分', '休息'],
      ['80–105 分', '<strong style="color: #15324a;">實作一</strong>　用同一句話 A/B 測試 System instructions'],
      ['105–140 分', '<strong style="color: #15324a;">實作二</strong>　設定回合方式並套用；有耳麥者做真實語音驗證'],
      ['140–165 分', '下載 my-dodo.json、確認第二堂延續方式'],
    ],
    { accent: A, size: 21 },
  ),
}));

add('OutputLength.dc.html', '長度為什麼交給 Prompt', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '為什麼不設 max_output_tokens',
  lede: '兩種做法都有代價，正式 dodo 選了其中一邊，本專案跟進。',
  body: stack([
    row([
      card({
        grow: true, accent: A, bg: C.sky, kicker: '方案 A · PROMPT 指引',
        title: '「一次最多兩個短句」',
        body: '模型不保證逐字遵守，但句子一定是完整的。',
      }),
      card({
        grow: true, accent: C.danger, kicker: '方案 B · TOKEN 硬上限',
        title: '長度守得住，但句子會被切在一半',
        body: '講到第 47 個 token 就停，不管那句話說完了沒有。',
        note: 'max_output_tokens',
      }),
    ]),
    band('正式 dodo 不設 max_output_tokens，本專案跟進：長度交給 Prompt 描述。', { accent: C.apricot }),
  ], { gap: 26 }),
  foot: '「停頓門檻」只在 server_vad 語音輸入有效，打字送出不會經過 VAD。',
}));

add('WhenInstructions.dc.html', 'instructions 何時送出', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'instructions 什麼時候送出？',
  lede: '流程圖上的第 ① 步就是這件事。它也是「豆豆為什麼用英文回答」的根因。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: '正確做法',
        title: '建立連線時就跟 SDP offer 一起送',
        body: '第一句話就已經是豆豆。按「套用」時會再用 session.update 更新一次。',
      }),
      card({
        grow: true, accent: C.danger, kicker: '錯誤做法',
        title: '只靠 session.update 補送',
        body: '第一個回合會落在 OpenAI 的預設人格上 —— 你會看到豆豆用英文回答。',
      }),
    ]),
    band('驗證方法：連上線後第一句就問「你叫什麼？我叫什麼？」', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('TurnModes.dc.html', '三種回合方式', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '三種回合方式，三種取捨',
  lede: '右側 B 區的設定會組成 Realtime session.update。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: 'SEMANTIC VAD',
        title: '依語意判斷是否說完',
        body: '較適合說話慢、句中會停頓的長者。',
        note: 'eagerness = low',
      }),
      card({
        grow: true, accent: A, kicker: 'SERVER VAD',
        title: '依靜音時間切回合',
        body: '容易直接觀察延遲與搶話的取捨。',
        note: 'silence_duration_ms = 800',
      }),
      card({
        grow: true, accent: C.apricot, kicker: 'PUSH TO TALK',
        title: '按住錄音，放開才送出',
        body: '停用 VAD，最容易在吵雜教室穩定操作。',
        note: '（不使用 turn_detection）',
      }),
    ]),
    band(`barge-in 由 ${code('interrupt_response=true', 25)} 與 Push-to-talk 的 ${code('response.cancel', 25)} 負責，不是靠一句 Prompt 停止音訊。`, { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('ApiKeys.dc.html', '連接真正模型', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '開始前：連接真正的模型',
  lede: '未設定 Key 時聊天功能會明確停用；不會用固定句型假裝成模型回覆。',
  body: row([
    stack([
      bullets([
        '第一次啟動時，在畫面內分別輸入 OpenAI API Key 與 OpenWeatherMap API Key。',
        '每個 Key 旁邊只有「測試」按鈕；實際儲存一律由畫面最下方那一個按鈕完成 —— 沒測試過的 Key 會在儲存時自動先測一次。',
        '也可以由講師預先在 .env 設定 OPENAI_API_KEY 與 WEATHER_API_KEY。',
        '天氣 Key 沒有設定時仍可進入 Workshop，但即時天氣工具會明確提示尚未設定。',
      ], { accent: A, size: 23, gap: 18 }),
    ]),
    `<div style="flex: 0 0 560px;">${card({
      accent: C.green, bg: C.sky, kicker: 'KEY 去了哪裡',
      title: '只送到本機 Python 後端',
      body: '保存在該次程式的記憶體，不寫入 localStorage、my-dodo.json 或前端程式碼。關掉「API 設定」視窗（× 或 Esc）會丟棄尚未儲存的變更。',
    })}</div>`,
  ], { gap: 34 }),
}));

add('LabOne.dc.html', '實作一', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作一：Prompt 只改變回答內容',
  lede: '80–105 分。全班用「打字輸入／文字輸出」就能完成，不需要耳麥。',
  body: stack([
    row([
      steps([
        '確定標題下方顯示「Realtime 已連線」。',
        '先問「你叫什麼？我叫什麼？」驗證身分與稱呼。',
        '用預設 Prompt 輸入：「我今天第一次自己搭公車去醫院，有點緊張。」',
        '選一個分塊修改，觀察唯讀的完整 System Prompt 即時更新。',
        '按「套用」，再輸入<strong>完全相同</strong>的句子。',
        '比較內容、語調與長度。',
        '在「對話方式」改寫長度規則，再比一次。',
      ], { accent: A, size: 22, gap: 12 }),
      `<div style="flex: 0 0 500px; display: flex; flex-direction: column; gap: 16px;">
        ${card({
          accent: C.apricot, bg: C.paper, kicker: '可以先試',
          title: '快速套用範例人格',
          body: '溫柔陪伴／神經模式／啦啦隊長會覆蓋 5 個區塊與聲線，但保留你的 Dodo 名稱與稱呼。',
        })}
        ${card({
          accent: C.danger, bg: C.paper, kicker: '兩個常見誤解',
          title: '不要這樣解釋',
          body: '完整 System Prompt 只能檢視，所有修改都要回到對應分塊；也不要把文字輸入的回應時間解釋成 VAD 效果。',
        })}
      </div>`,
    ], { gap: 32 }),
    payoff('一個講話方式完全由你決定的豆豆，而且你說得出它為什麼變了。'),
  ], { gap: 22 }),
}));

add('VoiceVsPrompt.dc.html', '聲線與 Prompt', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '聲線與 Prompt 是兩件事',
  body: stack([
    row([
      card({
        grow: true, accent: A, kicker: 'A 區 · DODO 的聲線',
        title: '決定音色',
        body: '10 種內建聲線可選，預設與正式 dodo 一樣。',
        note: 'voice = sage',
      }),
      card({
        grow: true, accent: C.green, kicker: 'A 區 · 個性與聲音分塊',
        title: '決定用字、節奏與語氣表現',
        body: '改分塊不會換成另一個人的聲音；改聲線也不會讓它變得更有耐心。',
      }),
    ]),
    row([
      `<div style="flex: 1 1 0;">${band('程式不會以形容詞關鍵字偷偷切換語速。', { accent: C.apricot, tone: 'sky' })}</div>`,
      `<div style="flex: 1 1 0;">${band('同一個 session 不能換聲線，所以按「套用」改聲線會自動斷線重連。', { accent: C.apricot })}</div>`,
    ], { gap: 22 }),
  ], { gap: 24 }),
  foot: '這個斷線重連本身就是一個值得討論的 API 限制。',
}));

add('Preamble.dc.html', 'preamble', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'preamble 是哪一段？',
  lede: '流程圖右下角那兩個 response，在畫面上長這樣。',
  body: row([
    `<div style="flex: 0 0 600px; display: flex; flex-direction: column; gap: 20px;">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span style="color: ${C.green}; font: 800 14px/1 ${SANS}; letter-spacing: .14em;">DODO · PREAMBLE（工具前的開場）</span>
        <div style="padding: 18px 22px; border: 1px dashed ${C.mint}; border-radius: 4px 18px 18px 18px; color: ${C.ink}; font: 23px/1.65 ${SANS};">我幫您看一下臺北現在的天氣。</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <span style="color: ${A}; font: 800 14px/1 ${SANS}; letter-spacing: .14em;">DODO</span>
        <div style="padding: 18px 22px; border-radius: 4px 18px 18px 18px; background: ${C.sky}; color: ${C.ink}; font: 23px/1.65 ${SANS};">臺北現在 26 度，有一點雲，出門帶件薄外套就好。</div>
      </div>
    </div>`,
    stack([
      bullets([
        'Realtime API 沒有 preamble 這種 item type。',
        '客端靠結構判斷：同一個 response 裡同時出現 message item 與 function_call item，那個 message 就是 preamble。',
        '工具結果送回去之後建立的<strong>下一個</strong> response 才是正式回答。',
      ], { accent: C.green, size: 22, gap: 16 }),
      band('把那句要求從「對話方式」刪掉再按「套用」，preamble 就會消失。', { accent: C.apricot, tone: 'sky' }),
    ], { gap: 22 }),
  ], { gap: 34 }),
}));

add('LabTwo.dc.html', '實作二', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作二：真正的 Realtime 回合控制',
  lede: '105–140 分。沒有耳麥也做得完，有耳麥則多一段真實語音驗證。',
  body: stack([
    row([
      `<div style="flex: 1 1 0;">${card({
        accent: A, bg: C.paper, kicker: '沒有耳麥',
        title: '改設定後按「套用」',
        body: '用同一句話比較回答差異。客端不會測量真實音訊，所以只能觀察「套用後回答有什麼不同」。',
      })}</div>`,
      `<div style="flex: 1.35 1 0; display: flex; flex-direction: column; gap: 14px;">
        <span style="color: ${C.green}; font: 800 15px/1 ${SANS}; letter-spacing: .16em;">有耳麥 · 切成語音後客端會自動重新連接</span>
        ${steps([
          '句中停頓約半秒後繼續說。',
          '用完整語句說完並等待 Dodo 回答。',
          'Dodo 回答途中再次開口。',
          '切成 Push-to-talk，確認只有放開按鈕後才提交回合。',
        ], { accent: C.green, size: 22, gap: 12 })}
      </div>`,
    ], { gap: 32 }),
    payoff('一組你自己調過的回合設定，而且知道它在什麼情況下會搶話。'),
  ], { gap: 22 }),
}));

add('DoneCriteria.dc.html', '完成標準', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '完成標準',
  body: bullets([
    '打字與語音訊息都來自真正的 OpenAI Realtime API，不是本地固定回聲或另一個文字模型。',
    '問「你叫什麼？我叫什麼？」時，能依「角色與身分」分塊回答 Dodo 名稱與使用者稱呼。',
    '能指出 A 區是 Prompt（角色、聲音、長度都在這裡描述），B 區是 Realtime 回合控制。',
    `按過「套用」，且 my-dodo.json 的 ${code('progress.workshop_1_completed', 24)} 為 ${code('true', 24)}。`,
    '下載的 my-dodo.json 包含 profile.agent 與 profile.realtime，但<strong>不包含</strong> API Key。',
  ], { accent: C.green, size: 25, gap: 20 }),
  foot: '官方依據：OpenAI Realtime 文件中的文字輸入、mint 時的 instructions、output_modalities、function calling、server_vad、semantic_vad、silence_duration_ms 與 interrupt_response。',
}));

add('FieldNotes.dc.html', '講師現場提醒', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '講師現場提醒',
  lede: '全班以「打字輸入／文字輸出」完成主線；輸入與輸出可獨立設定。',
  body: stack([
    row([
      `<div style="flex: 1 1 0;">${bullets([
        '鍵盤按「送出」會在同一個 session 建立文字回合，但不會使用 VAD 或靜音門檻。',
        'A 區是模型 instructions，不設 token 上限；Prompt 不負責偵測使用者是否說完。',
        'instructions 在建立連線時就隨 SDP offer 送出，按「套用」才會再 session.update。',
      ], { accent: A, size: 21, gap: 15 })}</div>`,
      `<div style="flex: 1 1 0;">${bullets([
        '從語音輸入切成打字時，麥克風音軌會立即停止，不需等待儲存設定。',
        '語音連線失敗時會保留作品；可將輸入改成打字、輸出改成文字。',
        '查天氣或讀寫記憶前那一句「我幫您看一下」會標成 PREAMBLE。',
      ], { accent: C.apricot, size: 21, gap: 15 })}</div>`,
    ], { gap: 32 }),
    band('收尾：下載 my-dodo.json，第二堂用同一份作品繼續升級。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

const total = S.length;
S.forEach((s, i) => { s.html = s.make(i + 1, total); });
emit(process.argv[2], S);
