# 選用：真實 DOM 行為檢查

`tests/test_web.py` 是原始碼層級的斷言（字串比對），跑得快、擋得住改壞的字串，但擋不住
「事件沒接上」「按鈕該出現卻沒出現」這種只有真的跑起來才看得到的問題。這兩個腳本把
`web/index.html` + `web/app.js` 放進 happy-dom 執行，用真的 click／input 事件驗證行為。

**不在 `pytest` 裡**，需要 [bun](https://bun.sh) 與一個正在跑的 Workshop 伺服器：

```bash
uv run python app.py serve --no-browser --port 8123   # 另開一個終端機
bun add happy-dom
DODO_PORT=8123 bun run tests/browser/uicheck.js       # 分頁切換、套用按鈕的髒資料判定、聊天室降噪
DODO_PORT=8123 bun run tests/browser/legacycheck.js   # 舊專案裡的 max_output_tokens 不會回到下載檔
```

兩個腳本都以 exit code 表示結果（0 = 全過）。用不到就整個 `tests/browser/` 刪掉，
`pytest` 不受影響。
