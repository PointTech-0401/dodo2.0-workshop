import {
  C, SANS,
  cover, slide, card, row, stack, table, band, bullets, steps, code, payoff, darkPanel, emit,
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

add('Outcomes.dc.html', '學習成果', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '這堂課結束時，你可以做到',
  body: bullets([
    '講得出 Prompt、VAD（自動判斷你講完了沒）、Push-to-talk 各自負責什麼，以及為什麼長度交給 Prompt，而不是設硬上限。',
    '用真正的 OpenAI Realtime API，比較改了不同分塊之後回答有什麼不一樣。',
    `比較 ${code('Server VAD')}、${code('Semantic VAD')}、Push-to-talk 三種判斷方式。`,
    '按「套用」把設定真的送進正在進行的對話，再用同一句話比前後差別。',
    '把這一堂的成果留在這台電腦上，第二堂接著升級。',
  ], { accent: A, size: 25, gap: 20 }),
}));

add('Timetable.dc.html', '時間表', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '今天的流程',
  body: table(
    [{ label: '段落', w: '240px' }, { label: '做什麼', w: '1fr' }],
    [
      ['先看一次', '打字按送出就走；用講的，得先有人判斷「他講完了沒」'],
      ['安裝與連線', '貼上金鑰，送出第一句，看到豆豆回答'],
      ['三件事', 'Prompt、回合控制、長度，以及這東西怎麼接起來的'],
      ['Prompt', '管內容和長度；一連線就送出去'],
      ['三種判斷方式', 'Server VAD、Semantic VAD、Push-to-talk，先聽一次搶話'],
      ['休息', ''],
      ['<strong style="color: #15324a;">實作一</strong>', '用同一句話測 Prompt 改了以後差在哪'],
      ['<strong style="color: #15324a;">實作二</strong>', '戴上耳機，用講的試回合控制'],
      ['Prompt 是拜託', '同一句話問五次，數它照做幾次'],
      ['收尾', '第二堂怎麼接；按「下載我的 Dodo」存一份備份'],
    ],
    { accent: A, size: 20, pad: 11 },
  ),
}));

add('Install.dc.html', '安裝 4 步', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '安裝 4 步：只做一次，兩堂共用',
  lede: '約 15 分鐘，只要做一次。同樣的步驟也寫在專案 README 的最上面。',
  body: stack([
    row([
      steps([
        `按 Win + R，輸入 powershell，貼上下面那一行，按 Enter。關掉再開一個新的，輸入 <span style="white-space: nowrap;">${code('uv --version')}</span> 看到版本號。`,
        `下載課程的 ZIP，按右鍵「解壓縮全部」。打開資料夾，要直接看到 ${code('start.bat')}。`,
        `對 ${code('start.bat')} 點兩下。第一次要等幾分鐘；跳出「無法驗證發行者」就按「執行」。黑色視窗上課期間不要關。`,
        '瀏覽器打開後，貼上課堂用的金鑰。',
      ], { accent: A, size: 21, gap: 14 }),
      `<div style="flex: 0 0 470px;">${card({
        accent: C.apricot, bg: C.paper, kicker: '卡住了',
        title: '三個最常見的狀況',
        body: '只看到另一個資料夾：再點進去一層。「uv 不是內部或外部命令」：關掉 PowerShell 重開。start.bat 被擋：在資料夾網址列打 cmd，執行 uv run python app.py。',
      })}</div>`,
    ], { gap: 32 }),
    darkPanel('POWERSHELL', '第 1 步貼這一行', [
      'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
    ]),
  ], { gap: 22 }),
}));

add('ApiKeys.dc.html', '連接真正模型', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '接上真的模型，再做連線檢查',
  lede: '沒填 Key 時聊天會直接停用，不會拿罐頭句子假裝自己是模型。',
  body: stack([
    row([
      stack([
        bullets([
          '第一次啟動時，畫面上會分別要你填 OpenAI 的 Key 和天氣的 Key。',
          '每個 Key 旁邊只有一顆「測試」；真正存下來靠畫面最下面那顆按鈕。沒測過的 Key 會在存之前自動測一次。',
          '天氣 Key 沒填一樣可以上課，只是問天氣時它會明講「還沒設定」。',
        ], { accent: A, size: 22, gap: 16 }),
      ]),
      `<div style="flex: 0 0 560px;">${card({
        accent: C.green, bg: C.sky, kicker: 'KEY 去了哪裡',
        title: '只留在你自己這台電腦上',
        body: '跟著程式一起活著，程式一關就沒了。不會存進瀏覽器、不會寫進 my-dodo.json、也不會出現在網頁程式裡。關掉設定視窗（× 或 Esc）會丟掉還沒存的東西。',
      })}</div>`,
    ], { gap: 34 }),
    band('連線檢查：打「你叫什麼？我叫什麼？」，豆豆用中文答出名字和稱呼，才算接上。', { accent: C.apricot }),
  ], { gap: 26 }),
  foot: '接上之後先玩一次：按「神經模式」、套用、再問同一句，看 Prompt 能把口氣帶多遠。做完按「溫柔陪伴」、套用，換回預設。',
}));

add('ThreeLayers.dc.html', '三個層次', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '會講話的 AI，不是 Prompt 多寫幾句就會變自然',
  lede: '三件事要分清楚：每一件在畫面上都找得到位置。',
  body: row([
    card({
      grow: true, accent: A, kicker: 'A 區 · PROMPT',
      title: '它是誰、什麼口氣、能講什麼不能講什麼',
      body: '寫在畫面右邊 A 區那五個分塊裡。',
    }),
    card({
      grow: true, accent: C.apricot, kicker: 'B 區 · 換誰講',
      title: '什麼時候開始聽、怎麼算你講完了、能不能插話',
      body: '由右邊 B 區的設定決定。',
    }),
    card({
      grow: true, accent: C.green, kicker: 'A 區 · 講多長',
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
        body: '第一個回合可能落在 OpenAI 的預設人格上，我們真的遇過它因此用英文回答。',
      }),
    ]),
    band('你剛才連線檢查問的「你叫什麼？我叫什麼？」，就是在驗證這件事。', { accent: C.apricot }),
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
    band('你一插話，是回合偵測中斷它正在講的那句，不是靠 Prompt 拜託它停下來。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('LabOne.dc.html', '實作一', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作一：Prompt 只改變「它怎麼回答」',
  lede: '用「打字輸入／文字輸出」就做得完，不需要耳麥。',
  body: stack([
    row([
      steps([
        '確定標題下方顯示「Realtime 已連線」。',
        '先問「你叫什麼？我叫什麼？」，確認名字和稱呼生效了。',
        '用預設 Prompt 輸入：「我今天第一次自己搭公車去醫院，有點緊張。」',
        '改「角色與身分」或「對話方式」，看下面的完整 Prompt 跟著變。',
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
          accent: C.danger, bg: C.paper, kicker: '常見誤解',
          title: '兩個容易搞錯的地方',
          body: '完整 System Prompt 只能看不能改，要改就回上面的分塊；打字回答的快慢也跟 VAD 無關。',
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
      `<div style="flex: 1 1 0;">${band('用聲音回答過之後就不能換聲音，所以改了聲線按「套用」會斷線重接。', { accent: C.apricot })}</div>`,
    ], { gap: 22 }),
  ], { gap: 24 }),
  foot: '一個 API 的限制，會直接變成使用者看得到的行為：這裡就是那次斷線重接。',
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
        'Realtime 的事件裡，沒有標示「工具前開場白」的欄位。',
        '畫面靠結構認出來：同一次回覆裡既說了一句話、又去呼叫工具，那句話就是開場白。',
        '工具查完之後的<strong>下一次</strong>回覆，才是正式回答。',
      ], { accent: C.green, size: 22, gap: 16 }),
      band('先問「臺北今天天氣如何？」看它出現；把那句要求從「對話方式」刪掉、套用、再問一次，它就不見了。', { accent: C.apricot, tone: 'sky' }),
    ], { gap: 22 }),
  ], { gap: 34 }),
}));

add('LabTwo.dc.html', '實作二', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作二：戴上耳機，用講的試回合控制',
  lede: '「系統設定」把輸入和輸出都選語音，先按「檢查麥克風」再儲存。每一步大家一起講 30 秒，再安靜 30 秒看結果；沒有耳麥就看前面的投影。',
  body: table(
    [
      { label: '步', w: '56px' },
      { label: 'B 區設定（改完按「套用」）', w: '360px' },
      { label: '要講的話', w: '1fr' },
      { label: '看什麼', w: '330px' },
    ],
    [
      ['1', 'Semantic VAD，等待傾向 low（預設）', '「我今天早上去……（停一秒）……市場買了一把青菜。」', '它等你講完才回答'],
      ['2', 'Server VAD，安靜 800 毫秒', '同一句，同一個地方停一秒', '你一停，它就搶著回答'],
      ['3', '維持 Server VAD', '「講一個你最喜歡的故事給我聽。」它講到一半時說「等一下」', '它停下來：是回合偵測中斷它'],
      ['4', '取消勾選「你一開口，就讓 Dodo 停下它正在講的話」', '同第 3 步', '它不停，把話講完'],
      ['5', 'Push-to-talk', '按著畫面上的按鈕講，講完放開', '放開才送出，鄰座再吵也不會觸發它'],
    ],
    { accent: A, size: 19, pad: 11 },
  ),
  foot: '豆豆在你沒講話時自己開始回答，是鄰座的聲音被當成你在講話：這就是 Push-to-talk 存在的理由。',
}));

add('PromptRequest.dc.html', 'Prompt 是拜託', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'Prompt 是拜託，不是保證',
  lede: '這一段看投影就好，不用跟著做。',
  body: stack([
    row([
      steps([
        '在「對話方式」分塊最後加一句「一次最多兩個短句」，按「套用」。',
        '同一句話連問五次：「今天天氣好冷，你覺得我要穿什麼？」',
        '數五次裡有幾次真的只講兩句。',
      ], { accent: A, size: 22, gap: 14 }),
      `<div style="flex: 0 0 500px;">${card({
        accent: C.green, bg: C.sky, kicker: '對照實作二第 3 步',
        title: '插話時它會停',
        body: '那是回合偵測一聽到你開口就中斷它，不看模型願不願意。長度寫在 Prompt 裡，模型會盡量配合，但沒有任何機制保證每一次都照做。',
      })}</div>`,
    ], { gap: 32 }),
    band('哪些事拜託模型，哪些事寫進程式。第二堂「什麼時候必須閉嘴」全部寫在程式裡。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('DoneCriteria.dc.html', '完成標準', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '完成標準',
  body: bullets([
    '打字和語音的回答都來自真正的 OpenAI Realtime API，不是本機寫死的罐頭回應，也不是另外接的文字模型。',
    '問「你叫什麼？我叫什麼？」時，它答得出「角色與身分」分塊裡的名字和稱呼。',
    '改過至少一個 A 區分塊並按過「套用」，用同一句話比過前後的回答。',
    '有耳麥的話：實作二五步都做過，聽過一次搶話、一次插話被停下。',
    '同一台電腦第二堂會自動接著用；my-dodo.json 是換電腦用的備份，<strong>不包含</strong> API Key。',
  ], { accent: C.green, size: 24, gap: 18 }),
  foot: '依據 OpenAI Realtime 官方文件：文字輸入、連線時就送出 Prompt、工具呼叫，以及三種判斷「你講完了沒」的方式。',
}));

const total = S.length;
S.forEach((s, i) => { s.html = s.make(i + 1, total); });
emit(process.argv[2], S);
