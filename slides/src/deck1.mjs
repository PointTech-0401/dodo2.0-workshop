import {
  C, SANS,
  cover, slide, card, row, stack, table, band, bullets, steps, code, emit,
} from './kit.mjs';
import { w1Architecture, w1Flow } from './diagrams.mjs';
import { installSlide, apiKeySlide } from './prework.mjs';

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
    '分辨聲線（音色）和「個性與聲音」分塊（演法）各自改變什麼。',
    '分辨哪些事寫在 Prompt 裡拜託模型，哪些事交給程式。',
  ], { accent: A, size: 25, gap: 20 }),
}));

add('Timetable.dc.html', '課程流程', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '課程流程',
  body: table(
    [{ label: '段落', w: '240px' }, { label: '內容', w: '1fr' }],
    [
      ['前置作業', '安裝、貼上金鑰、連線檢查'],
      ['專案架構', '程式放在哪裡；dodo 跟這堂課的關係'],
      ['連線與流程', 'WebRTC；一句話在瀏覽器、後端、OpenAI 之間怎麼走'],
      ['語音 AI 的三件事', 'Prompt、回合控制（三種回合判斷）、一次講多長'],
      ['<strong style="color: #15324a;">實作一</strong>', '調整 Prompt，比較前後回答'],
      ['<strong style="color: #15324a;">實作二</strong>', '聲音導演：改演法、換聲線，戴耳機聽'],
      ['<strong style="color: #15324a;">實作三</strong>', '用語音測試回合控制'],
      ['Prompt 的限制', '同一句話問五次'],
      ['總結', '今天的重點；帶走 my-dodo.json'],
    ],
    { accent: A, size: 20, pad: 11 },
  ),
}));

add('Install.dc.html', '前置作業：安裝', installSlide({ eyebrow: EB, accent: A, workshop: 1 }));

add('ApiKeys.dc.html', '前置作業：API Key 與連線檢查', apiKeySlide({ eyebrow: EB, accent: A, workshop: 1 }));

add('ProjectMap.dc.html', '專案架構', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '專案架構',
  body: w1Architecture,
}));

add('Dodo.dc.html', 'dodo 與這堂課', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '為什麼要寫 Prompt',
  lede: '豆豆是住在機器人裡的 AI 孫女，陪長照機構的長者。模型本身不知道這些。',
  body: stack([
    row([
      card({
        grow: true, accent: C.danger, kicker: '沒有 Prompt',
        title: '只是一個通用助理',
        body: '不知道自己是誰、在跟誰講話。可能用英文回答、一次講一長串，口氣像客服。',
      }),
      card({
        grow: true, accent: A, kicker: '豆豆的 Prompt 寫了什麼',
        title: '長者聽得懂的講法',
        body: '一句不超過 15–20 字。沒聽清楚就說「歹勢，可以再講一次嗎？」。時間講不清楚，先問「早上還是下午？」',
      }),
      card({
        grow: true, accent: C.green, kicker: '還有界線',
        title: '哪些事不能亂講',
        body: '醫療、用藥、緊急狀況不自己判斷。今天預設 Prompt 的「邊界與安全」分塊寫的就是這個。',
      }),
    ]),
    band('Prompt 決定豆豆是誰、怎麼講。什麼時候換人講、能不能被打斷，Prompt 管不到：這是今天的另外兩件事。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('WebRTC.dc.html', 'WebRTC', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'WebRTC：瀏覽器直接跟 OpenAI 通話',
  lede: '視訊通話用的就是 WebRTC：聲音一邊講一邊送，不用等整段錄完。',
  body: row([
    steps([
      '瀏覽器寫一份連線說明書（SDP）：要傳聲音，也要開一條傳事件的通道。',
      '說明書交給本機後端，後端補上 API Key，連同 Prompt 和設定一起轉給 OpenAI。',
      'OpenAI 回一份說明書：好，照這樣連。',
      '連上之後，聲音和事件直接在瀏覽器和 OpenAI 之間傳，不經後端。',
    ], { accent: A, size: 22, gap: 14 }),
    `<div style="flex: 0 0 500px; display: flex; flex-direction: column; gap: 16px;">
      ${card({
        accent: C.apricot, bg: C.paper, kicker: '音訊',
        title: '聲音的通道',
        body: '你的麥克風聲音進去，豆豆的聲音出來。',
      })}
      ${card({
        accent: C.green, bg: C.paper, kicker: '資料通道 · oai-events',
        title: '事件的通道',
        body: '打的字、逐字稿、工具呼叫、按「套用」送出的新設定，都走這一條。',
      })}
    </div>`,
  ], { gap: 32 }),
  foot: '打字模式也走同一條連線：一樣會開聲音通道（只收不送），沒有聲音通道 OpenAI 不接受連線。',
}));

add('TurnFlow.dc.html', '一句話的處理流程', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '一句話的處理流程',
  body: w1Flow,
}));

add('ThreeThings.dc.html', '語音 AI 的三件事', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '語音 AI 的三件事',
  lede: '講什麼、什麼時候換人講、一次講多長，各自由畫面上不同的地方決定。接下來三張依序講。',
  body: row([
    card({
      grow: true, accent: A, kicker: 'A 區 · PROMPT',
      title: '講什麼',
      body: '角色、口氣、內容，寫在 A 區的五個分塊。',
    }),
    card({
      grow: true, accent: C.apricot, kicker: 'B 區 · 回合控制',
      title: '什麼時候換人講',
      body: '何時開始聽、何時算講完、能不能插話。',
    }),
    card({
      grow: true, accent: C.green, kicker: 'A 區 · 對話方式',
      title: '一次講多長',
      body: '寫在「對話方式」分塊，沒有字數上限。',
    }),
  ]),
  foot: 'Prompt 不判斷你是否講完；回合控制不決定回答內容。',
}));

const OUTPUT_LENGTH = (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '一次講多長',
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
});

add('WhenInstructions.dc.html', 'Prompt 送出時機', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'Prompt 什麼時候送到 OpenAI',
  lede: '對應流程圖的第 ① 步。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: '建立連線時',
        title: '跟著連線請求一起送',
        body: 'Prompt 和連線說明書一起交給後端，後端一併轉給 OpenAI。所以第一句話就已經是豆豆。',
      }),
      card({
        grow: true, accent: A, kicker: '按「套用」',
        title: '從事件通道送新設定',
        body: '不用重新連線，剛才聊的也還在。下一次回答開始照新的 Prompt，已經講完的話不會重講。',
      }),
      card({
        grow: true, accent: C.apricot, kicker: '改了聲線再套用',
        title: '斷線重連',
        body: 'OpenAI 不允許同一段對話中途換聲線，所以重新連線，新連線帶著新的 Prompt；剛才聊的不會記得。',
      }),
    ]),
    band('為什麼不等連上再送？連上到補送之間的第一個回答，可能是 OpenAI 預設的人格，例如直接用英文回答。', { accent: C.apricot }),
  ], { gap: 26 }),
  foot: '驗證方式：連線後問「你叫什麼？我叫什麼？」',
}));

add('TurnModes.dc.html', '三種回合判斷', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '三種回合判斷',
  lede: 'B 區的設定會直接更新目前的對話。',
  body: stack([
    row([
      card({
        grow: true, accent: C.green, kicker: 'SEMANTIC VAD',
        title: '聽你話講完了沒',
        body: '模型看你已經講出的字，判斷這句完整了沒；不完整就多等一下。適合講話慢、句中會停頓的人。',
        note: '等待傾向 low：讓你慢慢講',
      }),
      card({
        grow: true, accent: A, kicker: 'SERVER VAD',
        title: '聽你安靜多久',
        body: '聲音大過門檻算開始講，安靜超過設定時間算講完，不管你講到哪。反應快，但停頓時容易搶話。',
        note: '安靜 800 毫秒',
      }),
      card({
        grow: true, accent: C.apricot, kicker: 'PUSH TO TALK',
        title: '按住講，放開送出',
        body: '不需要判斷，適合吵雜的環境。',
        note: '選語音輸入時先用這個',
      }),
    ]),
    band('插話時中斷回答的是回合偵測，不是 Prompt。', { accent: C.apricot }),
  ], { gap: 26 }),
}));

add('TurnCompare.dc.html', 'VAD 與 Push-to-talk 比較', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: 'VAD 與 Push-to-talk 比較',
  body: table(
    [
      { label: '', w: '200px' },
      { label: 'SEMANTIC VAD', w: '1fr' },
      { label: 'SERVER VAD', w: '1fr' },
      { label: 'PUSH-TO-TALK', w: '1fr' },
    ],
    [
      ['怎樣算講完', '模型看你講出的字，判斷這句完整了沒', '安靜超過設定的時間（800 毫秒）', '你放開按鈕'],
      ['誰決定', 'OpenAI', 'OpenAI', '你'],
      ['講到一半停一下', '多半會等你講完', '可能搶著回答', '不會，按著就一直聽'],
      ['旁邊有人講話', '可能被當成你在講', '可能被當成你在講', '沒按就不收音'],
      ['插話打斷', '一開口就停（勾了「你一開口，就讓 Dodo 停下正在講的話」）', '同左', '按下按鈕時停'],
      ['適合', '講話慢、句子中間會停的長輩', '安靜的地方、要反應快', '吵的地方，例如教室'],
    ],
    { accent: A, size: 21, pad: 13 },
  ),
}));

add('OutputLength.dc.html', '一次講多長', OUTPUT_LENGTH);

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
        accent: C.apricot, bg: C.paper, kicker: '人格版本',
        title: '三個系統預設＋自訂',
        body: '溫柔陪伴／神經模式／啦啦隊長替換 5 個分塊與聲線，名字與稱呼保留。改過任何一格就記成「自訂」，換去試預設也不會不見。',
      })}
      ${card({
        accent: C.danger, bg: C.paper, kicker: '注意',
        title: '兩個常見誤解',
        body: '完整 System Prompt 只能檢視，要修改請回到分塊；打字回答的快慢與 VAD 無關。',
      })}
    </div>`,
  ], { gap: 32 }),
}));

add('Preamble.dc.html', '工具前開場', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '工具前開場（Preamble）',
  lede: '對應流程圖的第 ⑥ 步和第 ⑨ 步。',
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

add('LabVoice.dc.html', '實作二', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作二：聲音導演',
  lede: '「系統設定」把輸出改成語音，輸入維持打字，戴上耳機。不用麥克風。',
  body: row([
    steps([
      '輸入「講一個 30 秒的睡前故事給我聽。」先聽預設的講法。',
      '只改「個性與聲音」，換成右邊其中一種演法，按「套用」。',
      '輸入<strong>同一句話</strong>，聽語氣、速度、停頓差在哪。',
      '分塊不動，只換「Dodo 的聲線」，按「套用」（會重新連線），再問同一句。',
      '演法和聲線自己搭一組，系統會記成「自訂」。',
    ], { accent: A, size: 22, gap: 14 }),
    `<div style="flex: 0 0 520px; display: flex; flex-direction: column; gap: 16px;">
      ${card({
        accent: C.apricot, bg: C.paper, kicker: '演法範例',
        title: '貼進「個性與聲音」',
        body: '悄悄話：用氣音、很小聲，像怕吵醒旁邊的人。<br>夜市叫賣：大聲、有精神，尾音拉長。<br>深夜電台 DJ：低沉、慢，每句話中間停一下。<br>廟口講古：抑揚頓挫，講到關鍵處故意停住。',
      })}
    </div>`,
  ], { gap: 32 }),
  foot: '聲線換的是音色，分塊換的是演法，兩個各管各的。',
}));

add('LabTwo.dc.html', '實作三', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '實作三：回合控制',
  lede: '「系統設定」把輸入也改成語音，按「檢查麥克風」後儲存。B 區會先變成 Push-to-talk，第 1 步再改。每一步講 30 秒，再安靜 30 秒觀察結果。',
  body: table(
    [
      { label: '步', w: '56px' },
      { label: 'B 區設定（改完按「套用」）', w: '360px' },
      { label: '要講的話', w: '1fr' },
      { label: '觀察', w: '330px' },
    ],
    [
      ['1', '改成 Semantic VAD，等待傾向 low', '「我今天早上去……（停一秒）……市場買了一把青菜。」', '講完才回答'],
      ['2', 'Server VAD，安靜 800 毫秒', '同一句，在同一個地方停一秒', '停頓時就開始回答'],
      ['3', '維持 Server VAD', '「講一個你最喜歡的故事給我聽。」回答到一半時說「等一下」', '回答中斷'],
      ['4', '取消勾選「你一開口，就讓 Dodo 停下正在講的話」', '同第 3 步', '回答不中斷'],
      ['5', '改回 Push-to-talk', '按住畫面上的按鈕講，講完放開', '放開才送出，不受旁邊聲音影響'],
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

add('Summary.dc.html', '總結', (n, t) => slide({
  eyebrow: EB, num: n, total: t, accent: A,
  title: '今天的重點',
  body: bullets([
    '語音 AI 的三件事分開管：講什麼寫在 Prompt，什麼時候換人講交給回合控制，一次講多長也寫在 Prompt。',
    'Key 只留在你電腦上的後端；連線那一次經過後端，之後聲音和文字由瀏覽器直連 OpenAI。',
    '聲線換的是音色，「個性與聲音」分塊換的是演法。',
    'Prompt 是拜託，模型不一定每次照做；插話中斷由回合偵測執行，一定會發生。需要確定發生的事寫進程式，第二堂從這裡接下去。',
    '按「下載我的 Dodo」帶走這一堂的成果（my-dodo.json），檔案裡<strong>不含</strong> API Key；回家用「匯入」就能接著玩。',
  ], { accent: C.green, size: 24, gap: 18 }),
  foot: '參考：OpenAI Realtime 官方文件中的文字輸入、連線時送出 Prompt、工具呼叫與回合判斷。',
}));

const total = S.length;
S.forEach((s, i) => { s.html = s.make(i + 1, total); });
emit(process.argv[2], S);
