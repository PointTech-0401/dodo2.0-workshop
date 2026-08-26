# 兩場 Workshop 的簡報

投影片是 1600×900 的固定版面，配色與字級沿用 `web/styles.css` 的 token，讓簡報和學生整天看的客端是同一套視覺語彙。

## 檔案

| 路徑 | 是什麼 |
|---|---|
| `workshop-1/*.dc.html` · `workshop-2/*.dc.html` | 一張投影片一個檔案（16 / 17 張），`canvas.json` 決定順序與標題 |
| `workshop-1-listen-then-answer-slides.html` | 放映版：一次一張滿螢幕，方向鍵翻頁 |
| `workshop-2-remember-and-stay-quiet-slides.html` | 同上 |
| `src/` | 產生投影片的腳本 |

放映版操作：`←` `→` 翻頁、`Home` `End` 跳頭尾、`O` 總覽縮圖、`F` 全螢幕。網址列的 `#7` 會記住頁碼。

## 重新產生

從專案根目錄執行（腳本會先清掉舊的 `.dc.html`）：

```bash
node slides/src/deck1.mjs slides/workshop-1
node slides/src/deck2.mjs slides/workshop-2
node slides/src/present.mjs slides/workshop-1 slides/workshop-1-listen-then-answer-slides.html "讓 Dodo 聽完，再回答" blue
node slides/src/present.mjs slides/workshop-2 slides/workshop-2-remember-and-stay-quiet-slides.html "會記得、會主動，也知道何時閉嘴" green
```

改內容請改 `src/deck1.mjs`／`deck2.mjs`，改架構圖與流程圖請改 `src/diagrams.mjs`，改共用版面請改 `src/kit.mjs` —— 直接改產出的 `.dc.html` 會在下次重新產生時被蓋掉。

## 檢查

`.dc.html` 是固定 900px 高的框，超出的內容會被裁掉且不會有任何警告，所以改完請跑這兩個檢查：

```bash
node slides/src/check-diagrams.mjs   # 圖的幾何：文字撐破框、標籤互壓、線穿過節點、箭頭沒接到節點
node slides/src/check-fit.mjs        # 圖表頁的總高度是否還在 900px 內
```

兩個腳本都是解析產出的 SVG，不是讀原始座標 —— 這樣才驗得到真正上線的那一份。
