import {
  C, SANS,
  cover, slide, card, row, stack, table, band, bullets, steps, code, darkPanel, emit,
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
  sub: '語音 AI 的三件事：講什麼、什麼時候換人講、一次講多長',
  meta: ['OpenAI Realtime API', 'gpt-realtime-2', 'gpt-4o-transcribe', '預設聲線 sage', 'near_field 收音降噪'],
  accent: A,
  halo: C.sky,
}));

add('Outcomes.dc.html', '學習目標', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '學習目標',
  body: bullets([
    '分辨 Prompt、VAD（自動判斷你講完了沒）與 Push-to-talk 各自負責的事。',
    '用 OpenAI Realtime API 比較不同 Prompt 分塊的回答。',
    `比較 ${code('Server VAD')}、${code('Semantic VAD')} 與 Push-to-talk 三種回合判斷。`,
    '用「套用」更新正在進行的對話。',
    '成果留在這台電腦上，第二堂接著使用。',
  ], { accent: A, size: 25, gap: 20 }),
}));

add('Timetable.dc.html', '課程流程', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '課程流程',
  body: table(
    [{ label: '段落', w: '240px' }, { label: '內容', w: '1fr' }],
    [
      ['示範', '打字送出，與用講的有什麼不同'],
      ['安裝與連線', '安裝、貼上金鑰、送出第一句'],
      ['三個層次', 'Prompt、回合控制、回答長度；系統架構'],
      ['Prompt', '內容與長度；送出的時機'],
      ['回合判斷', 'Server VAD、Semantic VAD、Push-to-talk'],
      ['休息', ''],
      ['<strong style="color: #15324a;">實作一</strong>', '調整 Prompt，比較前後回答'],
      ['<strong style="color: #15324a;">實作二</strong>', '用語音測試回合控制'],
      ['Prompt 的限制', '同一句話問五次'],
      ['收尾', '第二堂的銜接；備份 my-dodo.json'],
    ],
    { accent: A, size: 20, pad: 11 },
  ),
}));

add('Install.dc.html', '安裝', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '安裝',
  lede: '約 15 分鐘，兩堂共用。步驟也寫在專案 README 的最上面。',
  body: stack([
    row([
      steps([
        `按 Win + R，輸入 powershell，貼上下面的指令並執行。重開 PowerShell，輸入 <span style="white-space: nowrap;">${code('uv --version')}</span> 確認版本號。`,
        `下載課程 ZIP，按右鍵「解壓縮全部」。資料夾裡要直接看到 ${code('start.bat')}。`,
        `對 ${code('start.bat')} 點兩下。第一次會下載套件；出現「無法驗證發行者」時按「執行」。黑色視窗不要關。`,
        '瀏覽器開啟後，貼上課堂用的金鑰。',
      ], { accent: A, size: 21, gap: 14 }),
      `<div style="flex: 0 0 470px;">${card({
        accent: C.apricot, bg: C.paper, kicker: '常見問題',
        title: '裝不起來時',
        body: '只看到另一個資料夾：再點進去一層。「uv 不是內部或外部命令」：重開 PowerShell。start.bat 被擋：在資料夾網址列輸入 cmd，執行 uv run python app.py。',
      })}</div>`,
    ], { gap: 32 }),
    darkPanel('POWERSHELL', '第 1 步的指令', [
      'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
    ]),
  ], { gap: 22 }),
}));

add('ApiKeys.dc.html', 'API Key 與連線', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'API Key 與連線檢查',
  body: stack([
    row([
      stack([
        bullets([
          '第一次啟動時填入 OpenAI Key 與天氣 Key。',
          '「測試」只檢查 Key 是否有效；按最下方的按鈕才會儲存。',
          '天氣 Key 可以不填，問天氣時會回覆「還沒設定」。',
          '沒有 OpenAI Key 時，聊天功能停用。',
        ], { accent: A, size: 22, gap: 16 }),
      ]),
      `<div style="flex: 0 0 560px;">${card({
        accent: C.green, bg: C.sky, kicker: 'KEY 存放位置',
        title: '只存在這台電腦的程式裡',
        body: '程式關閉後就消失。不存進瀏覽器，也不寫進 my-dodo.json。設定視窗按 × 或 Esc 關閉時，未儲存的內容不會保留。',
      })}</div>`,
    ], { gap: 34 }),
    band('連線檢查：輸入「你叫什麼？我叫什麼？」，豆豆用中文答出名字與稱呼即完成。', { accent: C.apricot }),
  ], { gap: 26 }),
  foot: '完成後可試「神經模式」：套用後問同一句，再換回「溫柔陪伴」。',
}));

add('ThreeLayers.dc.html', '三個層次', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '三個層次',
  lede: '語音 AI 的表現由三件事決定，各自對應畫面上的一個位置。',
  body: row([
    card({
      grow: true, accent: A, kicker: 'A 區 · PROMPT',
      title: '角色、口氣、內容',
      body: 'A 區的五個分塊。',
    }),
    card({
      grow: true, accent: C.apricot, kicker: 'B 區 · 回合控制',
      title: '何時開始聽、何時算講完、能否插話',
      body: 'B 區的設定。',
    }),
    card({
      grow: true, accent: C.green, kicker: 'A 區 · 回答長度',
      title: '一次講多長',
      body: '寫在「對話方式」分塊，沒有字數上限。',
    }),
  ]),
  foot: 'Prompt 不判斷你是否講完；回合控制不決定回答內容。',
}));

add('ProjectMap.dc.html', '專案架構', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '專案架構',
  body: w1Architecture,
}));

add('TurnFlow.dc.html', '系統流程', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '一句話的處理流程',
  body: w1Flow,
}));

add('OutputLength.dc.html', '回答長度', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '回答長度',
  lede: '控制長度有兩種做法。',
  body: stack([
    row([
      card({
        grow: true, accent: A, bg: C.sky, kicker: '做法 A · PROMPT 指引',
        title: '「一次最多兩個短句」',
        body: '句子完整，但模型不一定每次照做。',
      }),
      card({
        grow: true, accent: C.danger, kicker: '做法 B · 字數上限',
        title: '長度固定',
        body: '到上限就停止，句子可能斷在一半。',
      }),
    ]),
    band('本專案不設字數上限，長度寫在 Prompt 裡。', { accent: C.apricot }),
  ], { gap: 26 }),
  foot: '「安靜多久算講完」只在使用麥克風時有作用，打字送出不經過這個判斷。',
}));

add('WhenInstructions.dc.html', 'Prompt 送出時機', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'Prompt 送出的時機',
  lede: '對應流程圖的第 ① 步。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: '連線時送出',
        title: '第一句話就是設定好的角色',
        body: '之後按「套用」會再更新一次。',
      }),
      card({
        grow: true, accent: C.danger, kicker: '連線後才補送',
        title: '第一個回合可能用預設人格',
        body: '例如直接用英文回答。',
      }),
    ]),
    band('驗證方式：連線後問「你叫什麼？我叫什麼？」', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('TurnModes.dc.html', '三種回合判斷', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '三種回合判斷',
  lede: 'B 區的設定會直接更新目前的對話。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: 'SEMANTIC VAD',
        title: '依語意判斷是否講完',
        body: '適合講話慢、句中會停頓的人。',
        note: '等待傾向 low',
      }),
      card({
        grow: true, accent: A, kicker: 'SERVER VAD',
        title: '安靜一段時間就算講完',
        body: '反應快，但容易在停頓時搶話。',
        note: '安靜 800 毫秒',
      }),
      card({
        grow: true, accent: C.apricot, kicker: 'PUSH TO TALK',
        title: '按住講，放開送出',
        body: '不需要判斷，適合吵雜的環境。',
      }),
    ]),
    band('插話時中斷回答的是回合偵測，不是 Prompt。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('LabOne.dc.html', '實作一', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作一：調整 Prompt',
  lede: '使用「打字輸入／文字輸出」，不需要耳麥。',
  body: row([
    steps([
      '確認標題下方顯示「Realtime 已連線」。',
      '問「你叫什麼？我叫什麼？」，確認名字與稱呼。',
      '輸入：「我今天第一次自己搭公車去醫院，有點緊張。」',
      '修改「角色與身分」或「對話方式」，下方完整 Prompt 會同步更新。',
      '按「套用」，輸入<strong>同一句話</strong>。',
      '比較內容、語氣與長度。',
      '在「對話方式」修改長度規則，再比較一次。',
    ], { accent: A, size: 22, gap: 12 }),
    `<div style="flex: 0 0 500px; display: flex; flex-direction: column; gap: 16px;">
      ${card({
        accent: C.apricot, bg: C.paper, kicker: '範例人格',
        title: '快速套用',
        body: '溫柔陪伴／神經模式／啦啦隊長：替換 5 個分塊與聲線，名字與稱呼保留。',
      })}
      ${card({
        accent: C.danger, bg: C.paper, kicker: '注意',
        title: '兩個常見誤解',
        body: '完整 System Prompt 只能檢視，要修改請回到分塊；打字回答的快慢與 VAD 無關。',
      })}
    </div>`,
  ], { gap: 32 }),
}));

add('VoiceVsPrompt.dc.html', '聲線與 Prompt', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '聲線與 Prompt',
  body: stack([
    row([
      card({
        grow: true, accent: A, kicker: 'A 區 · 聲線',
        title: '音色',
        body: '10 種可選，預設 sage。',
      }),
      card({
        grow: true, accent: C.green, kicker: 'A 區 · 個性與聲音分塊',
        title: '用字、節奏、態度',
        body: '修改分塊不會換聲音；換聲線也不會改變態度。',
      }),
    ]),
    row([
      `<div style="flex: 1 1 0;">${band('程式不會從形容詞推測語速。', { accent: C.apricot, tone: 'sky' })}</div>`,
      `<div style="flex: 1 1 0;">${band('用聲音回答過後就不能換聲線；改聲線後按「套用」會重新連線。', { accent: C.apricot })}</div>`,
    ], { gap: 22 }),
  ], { gap: 24 }),
}));

add('Preamble.dc.html', '工具前開場', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '工具前開場（Preamble）',
  lede: '對應流程圖右下角的兩次回覆。',
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
        'Realtime 的事件裡沒有標示開場白的欄位。',
        '同一次回覆裡同時有文字與工具呼叫，那段文字就是開場白。',
        '工具結果送回後的<strong>下一次</strong>回覆，才是正式回答。',
      ], { accent: C.green, size: 22, gap: 16 }),
      band('操作：問「臺北今天天氣如何？」；刪掉「對話方式」裡要求先講一句的那一行，套用後再問一次。', { accent: C.apricot, tone: 'sky' }),
    ], { gap: 22 }),
  ], { gap: 34 }),
}));

add('LabTwo.dc.html', '實作二', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作二：回合控制',
  lede: '「系統設定」把輸入與輸出都改成語音，按「檢查麥克風」後儲存。每一步講 30 秒，再安靜 30 秒觀察結果。',
  body: table(
    [
      { label: '步', w: '56px' },
      { label: 'B 區設定（改完按「套用」）', w: '360px' },
      { label: '要講的話', w: '1fr' },
      { label: '觀察', w: '330px' },
    ],
    [
      ['1', 'Semantic VAD，等待傾向 low（預設）', '「我今天早上去……（停一秒）……市場買了一把青菜。」', '講完才回答'],
      ['2', 'Server VAD，安靜 800 毫秒', '同一句，在同一個地方停一秒', '停頓時就開始回答'],
      ['3', '維持 Server VAD', '「講一個你最喜歡的故事給我聽。」回答到一半時說「等一下」', '回答中斷'],
      ['4', '取消勾選「你一開口，就讓 Dodo 停下它正在講的話」', '同第 3 步', '回答不中斷'],
      ['5', 'Push-to-talk', '按住畫面上的按鈕講，講完放開', '放開才送出，不受旁邊聲音影響'],
    ],
    { accent: A, size: 19, pad: 11 },
  ),
  foot: '沒有講話卻開始回答，通常是麥克風收到旁邊的聲音；這種環境適合 Push-to-talk。',
}));

add('PromptRequest.dc.html', 'Prompt 的限制', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'Prompt 的限制',
  lede: '示範：同一份 Prompt、同一句話。',
  body: stack([
    row([
      steps([
        '在「對話方式」最後加一句「一次最多兩個短句」，按「套用」。',
        '同一句話連問五次：「今天天氣好冷，你覺得我要穿什麼？」',
        '數五次裡有幾次只講兩句。',
      ], { accent: A, size: 22, gap: 14 }),
      `<div style="flex: 0 0 500px;">${card({
        accent: C.green, bg: C.sky, kicker: '對照',
        title: '插話中斷',
        body: '由回合偵測執行，不需要模型配合。長度規則寫在 Prompt 裡，模型不一定每次照做。',
      })}</div>`,
    ], { gap: 32 }),
    band('需要確定發生的行為寫在程式裡。第二堂的主動規則就是這樣設計。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('DoneCriteria.dc.html', '完成標準', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '完成標準',
  body: bullets([
    '打字與語音的回答都來自 OpenAI Realtime API。',
    '問「你叫什麼？我叫什麼？」時，答得出「角色與身分」設定的名字與稱呼。',
    '修改過至少一個 A 區分塊並套用，比較過前後回答。',
    '有耳麥：完成實作二的五個步驟。',
    '第二堂在同一台電腦接著使用；my-dodo.json 是備份，<strong>不含</strong> API Key。',
  ], { accent: C.green, size: 24, gap: 18 }),
  foot: '參考：OpenAI Realtime 官方文件中的文字輸入、連線時送出 Prompt、工具呼叫與回合判斷。',
}));

const total = S.length;
S.forEach((s, i) => { s.html = s.make(i + 1, total); });
emit(process.argv[2], S);
