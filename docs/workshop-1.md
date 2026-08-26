# Workshop 1：讓 Dodo 聽完，再回答

主題：正確拆解 Realtime Voice Agent 的 Prompt、回合控制與輸出長度

時間：165 分鐘

## 這堂課真正要教什麼

Voice Agent 不是「多寫一些 Prompt」就會自然。學生要能分清楚三個層次：

| 層次 | 負責什麼 | 本專案實際使用的位置 |
|---|---|---|
| Model instructions | 角色、語氣、回答內容與安全界線 | Realtime `instructions` |
| Turn detection | 何時開始聽、何時判定說完、是否允許插話 | Realtime `session.audio.input.turn_detection` |
| Output length | 單次回答多長 | 「對話方式」分塊（不設 API 上限） |

「最多幾句」只能是 Prompt 指引，模型不保證逐字遵守 —— 但改用 token 硬上限的代價是句子會被切在一半。正式 dodo 因此不設 `max_output_tokens`，本專案跟進：長度交給 Prompt 描述。「停頓門檻」只在 `server_vad` 語音輸入有效，打字送出不會經過 VAD。

**instructions 什麼時候送出？** 在建立連線（mint）時就跟 SDP offer 一起送給 OpenAI，所以第一句話就已經是豆豆。按「套用」時會再用 `session.update` 更新一次。如果只靠 `session.update` 補送，第一個回合會落在 OpenAI 的預設人格上 —— 你會看到豆豆用英文回答。

## 學習成果

- 說明 Prompt、VAD 與 Push-to-talk 各自負責什麼，以及為什麼回覆長度留給 Prompt 而不是 token 上限。
- 透過真正的 OpenAI Realtime API，比較修改不同 Prompt 分塊後的回答差異。
- 比較 `server_vad`、`semantic_vad`、Push-to-talk 三種回合方式。
- 按「套用」把設定實際送進 Realtime `session.update`，並用同一句話比較前後差異。
- 將第一堂的 Prompt 分塊、組裝結果與 Realtime 設定保存到 `my-dodo.json`，第二堂繼續使用。

## 時間表

| 時間 | 內容 |
|---|---|
| 0–15 分 | 示範：文字立即送出；語音則要先判斷「說完了沒」 |
| 15–35 分 | Voice Agent 架構：WebRTC、Realtime model、輸入音訊、逐字稿與輸出音訊 |
| 35–55 分 | 關鍵分層：Prompt 管內容與長度；VAD／按鍵管回合；instructions 在 mint 時送出 |
| 55–70 分 | 三種回合方式：Server VAD、Semantic VAD、Push-to-talk |
| 70–80 分 | 休息 |
| 80–105 分 | 實作一：用同一句話 A/B 測試 System instructions |
| 105–140 分 | 實作二：設定回合方式並套用；有耳麥者做真實語音驗證 |
| 140–165 分 | 下載 `my-dodo.json`、確認第二堂延續方式 |

## 開始前：連接真正模型

第一次啟動時，在畫面內分別輸入 OpenAI API Key 與 OpenWeatherMap API Key。每個 Key 旁邊只有「測試」按鈕（可先確認 Key 有效），實際儲存一律由畫面最下方那一個按鈕完成 —— 沒測試過的 Key 會在儲存時自動先測一次。完成初次設定後，右上角「API 設定」開啟的視窗右上角有「×」（也可按 Esc）可以關掉；關掉會丟棄尚未儲存的變更。Key 只送到本機 Python 後端並保存在該次程式的記憶體，不寫入 localStorage、`my-dodo.json` 或前端程式碼。也可以由講師預先在 `.env` 設定 `OPENAI_API_KEY` 與 `WEATHER_API_KEY`。天氣 Key 沒有設定時仍可進入 Workshop，但即時天氣工具會明確提示尚未設定。

未設定 Key 時，聊天功能會明確停用；不會用固定句型假裝成模型回覆。

## 實作一：Prompt 只改變回答內容

1. 選擇「打字輸入／文字輸出」，確定標題下方顯示「OpenAI 已就緒」。
2. 先問「你叫什麼？我叫什麼？」，確認 Prompt 中的 Dodo 身分與使用者稱呼確實生效。
3. 使用預設 Prompt，輸入：「我今天第一次自己搭公車去醫院，有點緊張。」
4. 也可以先按「快速套用範例人格」的三個範例（溫柔陪伴／神經模式／啦啦隊長）聽聽差別 —— 它們會覆蓋 5 個區塊與聲線，但保留你的 Dodo 名稱與稱呼。
5. 選一個分塊修改。例如把「個性與聲音」改成具體可觀察的語速、音調與態度，或調整「對話方式」的追問規則；觀察唯讀的完整 System Prompt 即時更新。
6. 按「套用」，再次輸入完全相同的句子。完整 System Prompt 只能檢視，所有修改都必須回到對應分塊。
7. 比較內容、語調與長度；不要把文字輸入的回應時間解釋成 VAD 效果。
8. 在「對話方式」分塊改寫長度規則（例如「一次最多兩個短句」對比「可以講長一點」），再比較回答長度 —— 這是 Prompt 指引，不是 API 硬上限，模型不保證逐字遵守。

Realtime 使用與 dodo 專案相同的 `gpt-realtime-2`、`gpt-4o-transcribe` 與 `near_field` 收音降噪，預設聲線也和正式 dodo 一樣是 `sage`。預設 Prompt 對齊虛擬孫女、臺灣繁體中文、較慢且溫暖的說話方式。

**聲線與 Prompt 是兩件事**：A 區的「Dodo 的聲線」決定音色（10 種內建聲線可選），「個性與聲音」分塊決定用字、節奏與語氣表現。改分塊不會換成另一個人的聲音；改聲線也不會讓它變得更有耐心。程式不會以形容詞關鍵字偷偷切換語速。

OpenAI 不允許在同一個 session 中更換聲線，所以按「套用」改聲線時客端會自動斷線重連 —— 這本身就是一個值得討論的 API 限制。

## 實作二：真正的 Realtime 回合控制

右側 B 區的設定會組成 Realtime `session.update`：

- `semantic_vad + eagerness=low`：依語意判斷是否說完，較適合說話慢、句中會停頓的情境。
- `server_vad + silence_duration_ms=800`：依靜音時間切回合，容易直接觀察延遲與搶話的取捨。
- `push_to_talk`：停用 VAD，按住錄音、放開後送出，最容易在吵雜教室穩定操作。
- `interrupt_response=true`：語音插話時中止目前回覆；Push-to-talk 會送出 `response.cancel`。

沒有耳麥的學生改設定後按「套用」，用同一句話比較回答差異。有耳麥的學生將輸入改成語音後，客端會自動重新連接 Realtime，接著依序測試：

1. 句中停頓約半秒後繼續說。
2. 用完整語句說完並等待 Dodo 回答。
3. Dodo 回答途中再次開口。
4. 切成 Push-to-talk，確認只有放開按鈕後才提交回合。

## 完成標準

- 打字與語音訊息都來自真正的 OpenAI Realtime API，不是本地固定回聲或另一個文字模型。
- 問「你叫什麼？我叫什麼？」時，能依「角色與身分」分塊回答 Dodo 名稱與使用者稱呼。
- 能指出 A 區是 Prompt（角色、聲音、長度都在這裡描述），B 區是 Realtime 回合控制。
- 按過「套用」，且 `my-dodo.json` 的 `progress.workshop_1_completed` 為 `true`。
- 下載的 `my-dodo.json` 包含 `profile.agent` 與 `profile.realtime`，但不包含 API Key。

官方依據：OpenAI Realtime 文件中的文字輸入、mint 時的 `instructions`、`output_modalities`、function calling、`server_vad`、`semantic_vad`、`silence_duration_ms` 與 `interrupt_response`。
