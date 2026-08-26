# 講師指南

## 課前準備

1. 每台電腦安裝 Python 3.11+ 與 uv。
2. 執行 `uv sync --extra dev`。
3. 執行 `uv run pytest`。
4. 執行 `uv run python app.py serve --no-browser`，確認 `http://127.0.0.1:8000/` 可開啟。
5. 決定由學生在首次啟動畫面輸入個人 API Key，或由講師預先在每台電腦的 `.env` 設定；不要將共用 Key 寫入教材。
6. 實際測試 Key 驗證、Realtime 文字回覆、天氣 function calling 與至少一台耳麥的語音連線。沒有 Key 時聊天會明確停用，不會出現假回覆。

## 現場條件

全班以「打字輸入／文字輸出」完成 Prompt A/B 與 Realtime 設定預演，不需要 MIC 或喇叭。有麥克風耳機的學生可以用同一個客端加做真實語音驗證。輸入與輸出可獨立設定，講師需明確說明：

- 鍵盤按「送出」會在同一個 Realtime session 建立文字回合，但不會使用 VAD 或靜音門檻。
- A 區是模型 instructions 與 `max_output_tokens`；Prompt 不負責偵測使用者是否說完。
- B 區是 Realtime `turn_detection`；只有連接耳麥後才是在測真實 `server_vad`／`semantic_vad`。
- `interrupt_response` 與 Push-to-talk 的 `response.cancel` 負責 barge-in，不是靠一句 Prompt 停止音訊。
- 沒耳麥時的 5 項結果是「設定預演」，不是音訊品質測試。
- 語音連線失敗時會保留作品；可將輸入改成打字、輸出改成文字。
- 從語音輸入切成打字時，麥克風音軌會立即停止，不需等待儲存設定。

## Workshop 2 入口

- 參加兩堂：同一台電腦自動讀取；換電腦時匯入 `my-dodo.json`。
- 只參加第二堂：首次引導選「只參加 Workshop 2」，載入講師 starter。

開場只花 3–5 分鐘完成分流，之後所有學生使用相同畫面與情境。

## 成功標準

第一堂：學生已取得至少一次真正的 Realtime 回覆，畫面顯示 `5/5`，並下載第一階段的 `my-dodo.json`。

第二堂：記憶分類顯示 `8/8`、主動情境顯示 `6/6`，學生再次下載升級後作品。

不安排小組討論、互連服務或自由探索。提早完成且有耳麥者可比較三種回合模式；無耳麥者可用同一句話比較不同 instructions 與 token 上限，但不影響全班主線。
