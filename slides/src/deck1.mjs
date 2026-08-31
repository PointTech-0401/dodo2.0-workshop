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
  sub: '把一個會講話的 AI 拆成三件事：講什麼、什麼時候換人講、一次講多長',
  meta: ['OpenAI Realtime API', 'gpt-realtime-2', 'gpt-4o-transcribe', '預設聲線 sage', 'near_field 收音降噪'],
  accent: A,
  halo: C.sky,
}));

add('ThreeLayers.dc.html', '三個層次', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '會講話的 AI，不是 Prompt 多寫幾句就會變自然',
  lede: '三件事要分清楚：每一件在畫面上都找得到位置。',
  body: row([
    card({
      grow: true, accent: A, kicker: 'MODEL INSTRUCTIONS',
      title: '它是誰、什麼口氣、能講什麼不能講什麼',
      body: '寫在畫面右邊 A 區那五個分塊裡。',
      note: '（A 區）',
    }),
    card({
      grow: true, accent: C.apricot, kicker: 'TURN DETECTION',
      title: '什麼時候開始聽、怎麼算你講完了、能不能插話',
      body: '由右邊 B 區的設定決定。',
      note: '（B 區）',
    }),
    card({
      grow: true, accent: C.green, kicker: 'OUTPUT LENGTH',
      title: '一次回答多長',
      body: '寫在「對話方式」分塊裡，不設硬上限，這是刻意的選擇。',
      note: '（不設字數上限）',
    }),
  ]),
  foot: 'Prompt 不負責判斷你講完了沒；回合控制也不決定它要說什麼。',
}));

add('ProjectMap.dc.html', '專案架構', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '這個專案長什麼樣',
  body: w1Architecture,
}));

add('TurnFlow.dc.html', '系統流程', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '一句話從你按送出，到它開口，中間走過哪裡',
  body: w1Flow,
}));

add('Outcomes.dc.html', '學習成果', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '這堂課結束時，你可以做到',
  body: bullets([
    '講得出 Prompt、VAD、Push-to-talk 各自負責什麼，以及為什麼長度交給 Prompt，而不是設硬上限。',
    '用真正的 OpenAI Realtime API，比較改了不同分塊之後回答有什麼不一樣。',
    `比較 ${code('Server VAD')}、${code('Semantic VAD')}、Push-to-talk 三種判斷方式。`,
    '按「套用」把設定真的送進正在進行的對話，再用同一句話比前後差別。',
    '把這一堂的成果存進 my-dodo.json，第二堂接著用。',
  ], { accent: A, size: 25, gap: 20 }),
}));

add('Timetable.dc.html', '時間表', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '165 分鐘怎麼走',
  body: table(
    [{ label: '時間', w: '190px' }, { label: '內容', w: '1fr' }],
    [
      ['0–15 分', '示範：打字按送出就走；用講的，得先有人判斷「他講完了沒」'],
      ['15–35 分', '這東西怎麼接起來的：瀏覽器、模型、你的聲音、逐字稿、它的聲音'],
      ['35–55 分', '三件事分清楚：Prompt 管內容和長度；VAD／按鍵管換誰講；Prompt 一連線就送出去'],
      ['55–70 分', '三種判斷方式：Server VAD、Semantic VAD、Push-to-talk'],
      ['70–80 分', '休息'],
      ['80–105 分', '<strong style="color: #15324a;">實作一</strong>　用同一句話測 Prompt 改了以後差在哪'],
      ['105–140 分', '<strong style="color: #15324a;">實作二</strong>　設定回合方式並套用；有耳麥的人真的用講的試一次'],
      ['140–165 分', '下載 my-dodo.json、確認第二堂怎麼接下去'],
    ],
    { accent: A, size: 21 },
  ),
}));

add('OutputLength.dc.html', '長度為什麼交給 Prompt', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '為什麼不乾脆設一個字數上限',
  lede: '兩種做法都有代價，正式 dodo 選了其中一邊，本專案跟進。',
  body: stack([
    row([
      card({
        grow: true, accent: A, bg: C.sky, kicker: '方案 A · PROMPT 指引',
        title: '「一次最多兩個短句」',
        body: '模型不保證每次都照做，但句子一定是完整的。',
      }),
      card({
        grow: true, accent: C.danger, kicker: '方案 B · 字數硬上限',
        title: '長度守得住，但句子會被切在一半',
        body: '字數一到就停，不管那句講完了沒。',
        note: '（一到就砍）',
      }),
    ]),
    band('正式 dodo 不設字數上限，本專案跟進：長度用 Prompt 描述，不用程式砍。', { accent: C.apricot }),
  ], { gap: 26 }),
  foot: '「安靜多久算講完」只有用麥克風講話時才有意義，打字送出不會經過它。',
}));

add('WhenInstructions.dc.html', 'instructions 何時送出', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'Prompt 是什麼時候送出去的？',
  lede: '流程圖上的第 ① 步就是這件事，也是「豆豆為什麼用英文回答」的原因。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: '正確做法',
        title: '一連上線就跟著送出去',
        body: '第一句話就已經是豆豆。按「套用」會再送一次更新。',
      }),
      card({
        grow: true, accent: C.danger, kicker: '錯誤做法',
        title: '等連上了才補送',
        body: '第一個回合會落在 OpenAI 的預設人格上，你會看到豆豆用英文回答。',
      }),
    ]),
    band('驗證方法：連上線後第一句就問「你叫什麼？我叫什麼？」', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('TurnModes.dc.html', '三種回合方式', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '三種判斷方式，三種代價',
  lede: '右邊 B 區改的東西，會直接送進正在進行的那段對話。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: 'SEMANTIC VAD',
        title: '聽意思，判斷你講完了沒',
        body: '比較適合講話慢、句子中間會停頓的長者。',
        note: '等待傾向 = low',
      }),
      card({
        grow: true, accent: A, kicker: 'SERVER VAD',
        title: '你安靜夠久就算講完',
        body: '最容易看出「反應快」和「被搶話」互相拉扯。',
        note: '安靜 800 毫秒',
      }),
      card({
        grow: true, accent: C.apricot, kicker: 'PUSH TO TALK',
        title: '按住錄音，放開才送出',
        body: '完全不用猜，吵雜的教室裡最穩。',
        note: '（完全不猜）',
      }),
    ]),
    band('你一插話，是程式中斷它正在講的那句，不是靠 Prompt 拜託它停下來。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('ApiKeys.dc.html', '連接真正模型', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '開始前：連接真正的模型',
  lede: '沒填 Key 時聊天會直接停用，不會拿罐頭句子假裝自己是模型。',
  body: row([
    stack([
      bullets([
        '第一次啟動時，畫面上會分別要你填 OpenAI 的 Key 和天氣的 Key。',
        '每個 Key 旁邊只有一顆「測試」；真正存下來靠畫面最下面那顆按鈕。沒測過的 Key 會在存之前自動測一次。',
        '也可以由講師事先幫每台電腦設好。',
        '天氣 Key 沒填一樣可以上課，只是問天氣時它會明講「還沒設定」。',
      ], { accent: A, size: 23, gap: 18 }),
    ]),
    `<div style="flex: 0 0 560px;">${card({
      accent: C.green, bg: C.sky, kicker: 'KEY 去了哪裡',
      title: '只留在你自己這台電腦上',
      body: '跟著程式一起活著，程式一關就沒了。不會存進瀏覽器、不會寫進 my-dodo.json、也不會出現在網頁程式裡。關掉設定視窗（× 或 Esc）會丟掉還沒存的東西。',
    })}</div>`,
  ], { gap: 34 }),
}));

add('LabOne.dc.html', '實作一', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作一：Prompt 只改變「它怎麼回答」',
  lede: '80–105 分。全班用「打字輸入／文字輸出」就做得完，不需要耳麥。',
  body: stack([
    row([
      steps([
        '確定標題下方顯示「Realtime 已連線」。',
        '先問「你叫什麼？我叫什麼？」，確認名字和稱呼生效了。',
        '用預設 Prompt 輸入：「我今天第一次自己搭公車去醫院，有點緊張。」',
        '選一個分塊改，看下面那份完整 Prompt 馬上跟著變。',
        '按「套用」，再輸入<strong>完全相同</strong>的句子。',
        '比較內容、語調與長度。',
        '在「對話方式」改長度規則，再比一次。',
      ], { accent: A, size: 22, gap: 12 }),
      `<div style="flex: 0 0 500px; display: flex; flex-direction: column; gap: 16px;">
        ${card({
          accent: C.apricot, bg: C.paper, kicker: '可以先試',
          title: '快速套用範例人格',
          body: '溫柔陪伴／神經模式／啦啦隊長會換掉 5 個分塊和聲線，但你取的名字和稱呼會留著。',
        })}
        ${card({
          accent: C.danger, bg: C.paper, kicker: '兩個常見誤解',
          title: '不要這樣解釋',
          body: '完整 System Prompt 只能看不能改，要改就回上面的分塊；也不要把打字回答的快慢當成 VAD 的效果。',
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
        body: '10 種聲線可以挑，預設跟正式 dodo 一樣。',
        note: '預設 sage',
      }),
      card({
        grow: true, accent: C.green, kicker: 'A 區 · 個性與聲音分塊',
        title: '決定用字、節奏和態度',
        body: '改分塊不會換成另一個人的聲音；改聲線也不會讓它變得比較有耐心。',
      }),
    ]),
    row([
      `<div style="flex: 1 1 0;">${band('程式不會偷偷從你寫的形容詞裡去猜語速。', { accent: C.apricot, tone: 'sky' })}</div>`,
      `<div style="flex: 1 1 0;">${band('同一段對話中途不能換聲音，所以改了聲線按「套用」會自動斷線重接。', { accent: C.apricot })}</div>`,
    ], { gap: 22 }),
  ], { gap: 24 }),
  foot: '這個斷線重連本身就是一個值得討論的 API 限制。',
}));

add('Preamble.dc.html', 'preamble', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '那句「我幫您看一下」是什麼？',
  lede: '流程圖右下角那兩次回覆，在畫面上長這樣。',
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
        'Realtime API 本身沒有「工具前開場白」這種東西。',
        '畫面靠結構認出來：同一次回覆裡既說了一句話、又去呼叫工具，那句話就是開場白。',
        '工具查完之後的<strong>下一次</strong>回覆，才是正式回答。',
      ], { accent: C.green, size: 22, gap: 16 }),
      band('把那句要求從「對話方式」刪掉再按「套用」，這句開場白就會消失。', { accent: C.apricot, tone: 'sky' }),
    ], { gap: 22 }),
  ], { gap: 34 }),
}));

add('LabTwo.dc.html', '實作二', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作二：真正的回合控制',
  lede: '105–140 分。沒有耳麥也做得完，有耳麥就多一段真的用講的。',
  body: stack([
    row([
      `<div style="flex: 1 1 0;">${card({
        accent: A, bg: C.paper, kicker: '沒有耳麥',
        title: '改設定後按「套用」',
        body: '用同一句話比回答的差別。畫面不會量真實的聲音，只能看「套用後回答有什麼不同」。',
      })}</div>`,
      `<div style="flex: 1.35 1 0; display: flex; flex-direction: column; gap: 14px;">
        <span style="color: ${C.green}; font: 800 15px/1 ${SANS}; letter-spacing: .16em;">有耳麥 · 切成語音後畫面會自動重新連線</span>
        ${steps([
          '講到一半停半秒，再繼續講。',
          '一句話講完，等它回答。',
          '它正在回答時你再開口。',
          '換成 Push-to-talk，確認只有放開按鈕才會送出去。',
        ], { accent: C.green, size: 22, gap: 12 })}
      </div>`,
    ], { gap: 32 }),
    payoff('一組你自己調過的設定，而且知道它什麼時候會搶話。'),
  ], { gap: 22 }),
}));

add('DoneCriteria.dc.html', '完成標準', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '完成標準',
  body: bullets([
    '打字和語音的回答都來自真正的 OpenAI Realtime API，不是本機寫死的罐頭回應，也不是另外接的文字模型。',
    '問「你叫什麼？我叫什麼？」時，它答得出「角色與身分」分塊裡的名字和稱呼。',
    '講得出來：A 區是 Prompt（它是誰、什麼口氣、講多長都寫在這裡），B 區是「什麼時候算你講完了」。',
    '按過「套用」，設定真的送進去了。',
    '下載的 my-dodo.json 有這一堂的設定，但<strong>不包含</strong> API Key。',
  ], { accent: C.green, size: 25, gap: 20 }),
  foot: '依據 OpenAI Realtime 官方文件：文字輸入、連線時就送出 Prompt、工具呼叫，以及三種判斷「你講完了沒」的方式。',
}));

add('FieldNotes.dc.html', '講師現場提醒', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '講師現場提醒',
  lede: '全班用「打字輸入／文字輸出」跑主線；輸入和輸出可以分開選。',
  body: stack([
    row([
      `<div style="flex: 1 1 0;">${bullets([
        '按「送出」會在同一段對話裡多一個回合，但不會經過 VAD，也不會用到安靜門檻。',
        'A 區是 Prompt，不設字數上限；Prompt 不負責判斷學生講完了沒。',
        'Prompt 一連上線就送出去了，按「套用」才會再送一次更新。',
      ], { accent: A, size: 21, gap: 15 })}</div>`,
      `<div style="flex: 1 1 0;">${bullets([
        '從語音切回打字時，麥克風會立刻停，不用等按儲存。',
        '語音連不上不會弄丟作品；把輸入改成打字、輸出改成文字就好。',
        '查天氣或讀寫記憶前那句「我幫您看一下」，畫面會標成 PREAMBLE。',
      ], { accent: C.apricot, size: 21, gap: 15 })}</div>`,
    ], { gap: 32 }),
    band('收尾：下載 my-dodo.json，第二堂用同一份作品接著升級。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

const total = S.length;
S.forEach((s, i) => { s.html = s.make(i + 1, total); });
emit(process.argv[2], S);
