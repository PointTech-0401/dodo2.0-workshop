# Workshop 1：讓 Dodo 聽完，再回答

主題：正確拆解 Realtime Voice Agent 的 Prompt、回合控制與輸出限制

時間：165 分鐘

## 這堂課真正要教什麼

Voice Agent 不是「多寫一些 Prompt」就會自然。學生要能分清楚三個層次：

| 層次 | 負責什麼 | 本專案實際使用的位置 |
|---|---|---|
| Model instructions | 角色、語氣、回答內容與安全界線 | Realtime `instructions` |
| Turn detection | 何時開始聽、何時判定說完、是否允許插話 | Realtime `session.audio.input.turn_detection` |
| Output limit | 單次回答最多生成多少 token | `max_output_tokens`／`max_response_output_tokens` |

「最多幾句」只能是 Prompt 指引，模型不保證逐字遵守；本實作因此改用真正的 token 參數做輸出硬上限。「停頓門檻」只在 `server_vad` 語音輸入有效，打字送出不會經過 VAD。

## 學習成果

- 說明 Prompt、VAD、Push-to-talk 與輸出 token 上限各自負責什麼。
- 透過真正的 OpenAI Realtime API，比較修改不同 Prompt 分塊後的回答差異。
- 比較 `server_vad`、`semantic_vad`、Push-to-talk 三種回合方式。
- 有耳麥時，把設定實際送進 Realtime `session.update`；沒有耳麥時完成相同設定預演。
- 將第一堂的 Prompt 分塊、組裝結果與 Realtime 設定保存到 `my-dodo.json`，第二堂繼續使用。

## 時間表

| 時間 | 內容 |
|---|---|
| 0–15 分 | 示範：文字立即送出；語音則要先判斷「說完了沒」 |
| 15–35 分 | Voice Agent 架構：WebRTC、Realtime model、輸入音訊、逐字稿與輸出音訊 |
| 35–55 分 | 關鍵分層：Prompt 管內容；VAD／按鍵管回合；token 參數管上限 |
| 55–70 分 | 三種回合方式：Server VAD、Semantic VAD、Push-to-talk |
| 70–80 分 | 休息 |
| 80–105 分 | 實作一：用同一句話 A/B 測試 System instructions |
| 105–140 分 | 實作二：設定回合方式並跑 5 項預演；有耳麥者做真實語音驗證 |
| 140–165 分 | 完成 5/5、下載 `my-dodo.json`、確認第二堂延續方式 |

## 開始前：連接真正模型

第一次啟動時，在畫面內分別輸入 OpenAI API Key 與 OpenWeatherMap API Key，兩者都先按「測試」；通過後各自的「儲存設定」才會啟用。Key 只送到本機 Python 後端並保存在該次程式的記憶體，不寫入 localStorage、`my-dodo.json` 或前端程式碼。也可以由講師預先在 `.env` 設定 `OPENAI_API_KEY` 與 `WEATHER_API_KEY`。天氣 Key 沒有設定時仍可進入 Workshop，但即時天氣工具會明確提示尚未設定。

未設定 Key 時，聊天功能會明確停用；不會用固定句型假裝成模型回覆。

## 實作一：Prompt 只改變回答內容

1. 選擇「打字輸入／文字輸出」，確定標題下方顯示「OpenAI 已就緒」。
2. 先問「你叫什麼？我叫什麼？」，確認 Prompt 中的 Dodo 身分與使用者稱呼確實生效。
3. 使用預設 Prompt，輸入：「我今天第一次自己搭公車去醫院，有點緊張。」
4. 選一個分塊修改。例如把「個性與聲音」改成具體可觀察的語速、音調與態度，或調整「對話方式」的追問規則；觀察唯讀的完整 System Prompt 即時更新。
5. 按「套用 5 個 Prompt 區塊」，再次輸入完全相同的句子。完整 System Prompt 只能檢視，所有修改都必須回到對應分塊。
6. 比較內容、語調與長度；不要把文字輸入的回應時間解釋成 VAD 效果。
7. 將 token 上限分別設為 64 與 256，再比較回答是否被限制。

Realtime 使用與 dodo 專案相同的 `gpt-realtime-2`、`sage` 聲線、`gpt-4o-transcribe` 與 `near_field` 收音降噪。預設 Prompt 也對齊虛擬孫女、臺灣繁體中文、較慢且溫暖的說話方式。聲線決定基本音色；「個性與聲音」分塊會影響用字、節奏與語音表現，但不是把 `sage` 換成另一個人的聲音。程式不會以形容詞關鍵字偷偷切換語速。

## 實作二：真正的 Realtime 回合控制

右側 B 區的設定會組成 Realtime `session.update`：

- `semantic_vad + eagerness=low`：依語意判斷是否說完，較適合說話慢、句中會停頓的情境。
- `server_vad + silence_duration_ms=800`：依靜音時間切回合，容易直接觀察延遲與搶話的取捨。
- `push_to_talk`：停用 VAD，按住錄音、放開後送出，最容易在吵雜教室穩定操作。
- `interrupt_response=true`：語音插話時中止目前回覆；Push-to-talk 會送出 `response.cancel`。

沒有耳麥的學生按「執行 5 項設定預演」，理解每項設定會影響哪個層次。這只是設定驗證，不宣稱有測量真實音訊。

有耳麥的學生將輸入改成語音後，客端會自動重新連接 Realtime，接著依序測試：

1. 句中停頓約半秒後繼續說。
2. 用完整語句說完並等待 Dodo 回答。
3. Dodo 回答途中再次開口。
4. 切成 Push-to-talk，確認只有放開按鈕後才提交回合。

## 完成標準

- 打字與語音訊息都來自真正的 OpenAI Realtime API，不是本地固定回聲或另一個文字模型。
- 問「你叫什麼？我叫什麼？」時，能依「角色與身分」分塊回答 Dodo 名稱與使用者稱呼。
- 能指出 A 區是 Prompt／輸出參數，B 區是 Realtime 回合控制。
- 設定預演顯示 5/5。
- 下載的 `my-dodo.json` 包含 `profile.agent` 與 `profile.realtime`，但不包含 API Key。

官方依據：OpenAI Realtime 文件中的文字輸入、`output_modalities`、function calling、`speed`、`server_vad`、`semantic_vad`、`silence_duration_ms`、`interrupt_response` 與 `max_response_output_tokens`。
