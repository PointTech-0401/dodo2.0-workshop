// 前置作業：安裝、API Key 與連線檢查。兩堂的步驟一樣，只差啟動檔與這一堂的細節，
// 所以兩份投影片都從這裡產生，改一次兩堂都跟著變。
import {
  C,
  slide, card, row, stack, band, bullets, steps, code, darkPanel,
} from './kit.mjs';

const nowrap = (html) => `<span style="white-space: nowrap;">${html}</span>`;

/** `workshop` is 1 or 2: it picks the launcher, the fallback command and the
 *  one line that differs for people who already installed in session 1. */
export function installSlide({ eyebrow, accent, workshop }) {
  const bat = `start-w${workshop}.bat`;
  const lede = workshop === 1
    ? '約 15 分鐘，步驟也寫在專案 README 的最上面。'
    : '約 15 分鐘，步驟也寫在專案 README 的最上面。上過第一堂的人直接做第 3 步。';
  return (n, t) => slide({
    eyebrow, num: n, total: t, accent,
    title: '前置作業：安裝',
    lede,
    body: stack([
      row([
        steps([
          `按 Win + R，輸入 powershell，貼上下面的指令並執行。重開 PowerShell，輸入 ${nowrap(code('uv --version'))} 確認版本號。`,
          `打開白板上的短網址，下載課程 ZIP，按右鍵「解壓縮全部」。資料夾裡要直接看到 ${code(bat)}。`,
          `對 ${code(bat)} 點兩下。第一次會下載套件；出現「無法驗證發行者」時按「執行」。跳出來的 Terminal 不要關。`,
          '瀏覽器開啟後，貼上這一堂的金鑰。',
        ], { accent, size: 21, gap: 14 }),
        `<div style="flex: 0 0 470px;">${card({
          accent: C.apricot, bg: C.paper, kicker: '常見問題',
          title: '裝不起來時',
          body: `只看到另一個資料夾：再點進去一層。「uv 不是內部或外部命令」：重開 PowerShell。${bat} 被擋：在資料夾網址列輸入 cmd，執行 ${nowrap(`uv run python app.py serve --workshop ${workshop}`)}。`,
        })}</div>`,
      ], { gap: 32 }),
      darkPanel('POWERSHELL', '第 1 步的指令', [
        'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"',
      ]),
    ], { gap: 22 }),
  });
}

export function apiKeySlide({ eyebrow, accent, workshop }) {
  const foot = workshop === 1
    ? '完成後可試「神經模式」：套用後問同一句，再換回「溫柔陪伴」。'
    : '這一堂只用打字。不小心關掉 Terminal：重開 start-w2.bat，選「載入上次的資料」就能接著做。';
  const check = workshop === 1
    ? '連線檢查：輸入「你叫什麼？我叫什麼？」，豆豆用中文答出名字與稱呼即完成。'
    : '連線檢查：輸入「嗨～你是誰？」，豆豆用中文回答自己是誰即完成。';
  return (n, t) => slide({
    eyebrow, num: n, total: t, accent,
    title: '前置作業：API Key 與連線檢查',
    body: stack([
      row([
        stack([
          bullets([
            '第一次啟動時填入 OpenAI Key 與天氣 Key。',
            '「測試」只檢查 Key 是否有效；按最下方的按鈕才會儲存。',
            '天氣 Key 可以不填，問天氣時會回覆「還沒設定」。',
            '沒有 OpenAI Key 時，聊天功能停用。',
          ], { accent, size: 22, gap: 16 }),
        ]),
        `<div style="flex: 0 0 560px;">${card({
          accent: C.green, bg: C.sky, kicker: 'KEY 存放位置',
          title: '只存在這台電腦的程式裡',
          body: '關掉 Terminal 就消失，重開要再貼一次。不存進瀏覽器，也不寫進任何檔案。設定視窗按 × 或 Esc 關閉時，未儲存的內容不會保留。',
        })}</div>`,
      ], { gap: 34 }),
      band(check, { accent: C.apricot }),
    ], { gap: 26 }),
    foot,
  });
}
