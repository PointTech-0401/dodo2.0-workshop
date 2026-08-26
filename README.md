# dodo 2.0 Workshop

這是兩堂各 2–3 小時的大學生工作坊專案。所有學生使用同一個客端；輸入方式可選打字或語音，輸出方式可獨立選擇文字或語音。

去年的 Prompt、Function Calling、Tool 與 MCP 不在本次重複實作；今年改用 dodo 2.0 的兩個問題作為主軸：

1. 如何透過文字或真實語音理解 Voice Agent 的停頓、插話與錯誤恢復？
2. 陪伴 Agent 應記得什麼、何時主動開口，又何時必須保持安靜？

## 專案內容

- 一個共用瀏覽器客端：兩堂課、文字與語音都從同一個畫面進入。
- 第一堂：分開調整 Model instructions 與 Realtime 回合設定，並實際套用到同一個 Realtime session。
- 第二堂：完成三層記憶分類，調整主動規則並執行 6 個固定情境。
- 一個作品檔 `my-dodo.json`：第一堂下載，第二堂可直接匯入延續。
- Workshop 2 starter：只參加第二堂者會載入講師準備的第一堂完成版。
- 真實模型回覆：沒有 API Key 時會明確停用聊天，不用固定回聲假裝成 AI。

## 共用客端規格

打字與語音不是兩個不同的應用程式，而是同一個客端可自由搭配的輸入／輸出方式。四種組合共用：

- persona、System instructions 與 Realtime turn detection
- 長者資料與三層記憶
- 對話 session 與逐字稿
- 主動事件、安全規則與課堂情境
- `listening`、`thinking`、`speaking` 等狀態顯示
- 桌面版可拖曳聊天區與右側 Prompt 設定區之間的分隔線；分隔線取得焦點後也可用左右方向鍵調整
- 聊天輸入框按 Enter 送出、Shift+Enter 換行；右側設定區統一使用 14px Microsoft JhengHei

差異只在輸入與輸出介面：

| 輸入 | 輸出 | 使用方式 | 適用情況 |
|---|---|---|---|
| 打字 | 文字 | Realtime API；畫面顯示回答 | 全班預設，不需任何音訊設備 |
| 打字 | 語音 | Realtime API；鍵盤提問、耳機聽回答 | 有耳機但不想開麥克風 |
| 語音 | 文字 | Realtime API；麥克風提問、畫面看回答 | 想測 VAD，但現場不適合播放聲音 |
| 語音 | 語音 | Realtime API；麥克風提問、耳機聽回答 | 有麥克風耳機的完整語音體驗 |

```text
                  ┌─ 文字輸入介面 ─┐
共用客端與 session ┤               ├─ 共用 Agent、記憶、規則與逐字稿
                  └─ 語音 WebRTC ──┘
```

四種輸出入組合都使用同一個 Realtime WebRTC session，進入 Workshop 後自動連線，不需要另外按「連接」。瀏覽器把 SDP offer 送到本機 Python 後端，由後端持有 `OPENAI_API_KEY` 並與 OpenAI 建立 Realtime call；Key 不會進入前端 JavaScript。參考 [OpenAI Realtime WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)、[Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations#text-inputs-and-outputs)、[Realtime function calling](https://developers.openai.com/api/docs/guides/realtime-conversations#function-calling) 與 [Realtime VAD](https://developers.openai.com/api/docs/guides/realtime-vad)。

共用瀏覽器客端已實作於 `web/`，後端入口是 `dodo_workshop/web.py`。語音連線採 OpenAI 官方文件建議的瀏覽器 WebRTC；標準 API Key 只存在 Python 後端。

## 首次啟動引導

客端以瀏覽器 `localStorage` 的 `dodo-workshop.setup` 判斷是否完成初始化。

### 第一次啟動

找不到初始化設定時，不直接進入聊天畫面，而是依序顯示：

1. **OpenAI API**：輸入個人 Key，可按「測試」先確認有效。儲存由畫面最下方的按鈕統一處理（沒測試過的 Key 會在儲存時自動先測一次）。Key 只留在本機後端記憶體，也可改用 `.env` 預先設定。
2. **輸入方式**：選擇「打字」或「語音」。
3. **輸出方式**：獨立選擇「文字」或「語音」。
4. **裝置檢查**：只有語音輸入才要求麥克風權限；語音輸出建議使用耳機。
5. **課程入口**：選擇從 Workshop 1 開始、繼續本機作品，或只參加 Workshop 2。
6. **完成**：保存模式與裝置偏好後進入共用聊天畫面。

建議保存格式：

```json
{
  "version": 2,
  "inputMode": "text",
  "outputMode": "text",
  "audioInputDeviceId": null,
  "completed": true
}
```

### 後續啟動

若 `dodo-workshop.setup.completed` 為 `true`，直接使用上次選擇的輸出入方式，不再顯示引導。客端頁面仍會顯示目前組合，以及「API 設定」入口。舊版單一 `mode` 設定會自動轉成新版格式。

### 使用 `init` 參數重新引導

需要重新選擇時，在網址加上 `init` 參數：

```text
http://localhost:8000/?init=1
```

啟動規則：

```text
if URL 有 init 參數：顯示初始化引導
else if 尚未完成 setup：顯示初始化引導
else：直接進入上次選擇的模式
```

`init` 可重新設定 API Key、輸入方式與輸出方式，但不清除對話教材、長者資料或記憶。完成引導後會使用 `history.replaceState` 移除網址上的 `init`，避免重新整理頁面時再次進入引導。

### 語音裝置與切換保護

若沒有麥克風、權限被拒絕、WebRTC 連線失敗或耳機測試沒有聲音，客端應提供：

- 重試裝置檢查
- 改選其他麥克風
- 將輸入改為打字、輸出改為文字

把輸入從語音切換成打字時，客端會立即關閉現有 WebRTC 連線並停止所有送出音軌，不等使用者按下儲存。已產生的逐字稿、作品與課堂進度會保留。

## 安裝

需要 Python 3.11+ 與 [uv](https://docs.astral.sh/uv/)。

```powershell
cd D:\Project\dodo2.0-workshop
uv sync --extra dev
Copy-Item .env.example .env
```

可直接在首次啟動畫面分別輸入 OpenAI API Key 與 OpenWeatherMap API Key；每個 Key 只有「測試」按鈕，儲存統一交給最下方的按鈕（未測試的 Key 會在儲存時自動先測試）。完成初次設定後，「API 設定」視窗可用右上角「×」或 Esc 關閉。Key 只保存到這次 Python 程式的記憶體，重啟後需重新輸入。講師也可以預先在 `.env` 填入：

```text
OPENAI_API_KEY=你的金鑰
# 僅供 Workshop 2 主動訊息／CLI 備援，不是聊天畫面的模型
OPENAI_MODEL=gpt-4.1-mini
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_VOICE=sage
WEATHER_API_KEY=沿用_Workshop_1.0_的_OpenWeatherMap_Key
```

不要把共用 API Key 寫進教材、投影片或 Git。現場可由講師預先在每台電腦設定環境變數。

## 執行

啟動共用客端：

```powershell
uv run python app.py
```

瀏覽器會開啟 `http://127.0.0.1:8000/`。需要重新選擇輸入／輸出方式時：

```powershell
uv run python app.py init
```

保留的 CLI 指令供講師備援或單元測試使用：

```powershell
# 第一堂 CLI 備援：明確標示為文字事件預演，不代表真實 VAD
uv run python app.py lesson1

# 第二堂：三層記憶分類
uv run python app.py lesson2-memory

# 第二堂：主動 Agent 情境測試
uv run python app.py lesson2-agent

# 明確的離線 CLI 示範（瀏覽器不使用假回覆）
uv run python app.py lesson1 --offline
uv run python app.py lesson2-agent --offline --all

# 測試
uv run pytest
```

## Workshop 1：讓 Dodo 聽完，再回答

右側分成兩個明確層次：

- A「模型怎麼回答」：名稱、使用者稱呼與五個 Prompt 分塊會即時組成完整 System Prompt。學生只能編輯「角色與身分、個性與聲音、對話方式、語言、邊界與安全」分塊；完整 Prompt 僅提供唯讀預覽。這份組裝結果在**建立連線時就隨 SDP offer 送給 OpenAI**，所以第一句話就已經是豆豆；按「套用」會再用 `session.update` 更新一次。回覆長度不設 API 上限，由「對話方式」分塊描述。
- B「何時算說完」：`semantic_vad`、`server_vad`、`silence_duration_ms`、`interrupt_response` 或 Push-to-talk 會真正送進 Realtime session（mint 與 `session.update` 都會帶）。

Realtime 預設使用 `gpt-realtime-2` 與 `sage`（A 區可改成其他 10 種內建聲線，並附三組現成人格範例：溫柔陪伴／神經模式／啦啦隊長，各自配一個聲線）。OpenAI 不允許在同一個 session 換聲線，所以按「套用」改聲線時客端會自動重新連線。其餘設定對齊正式 dodo 的低 reasoning effort、`gpt-4o-transcribe`、`near_field` 收音降噪和臺灣繁體中文虛擬孫女提示。轉錄服務也另有臺灣繁體中文 prompt，避免使用者語音逐字稿混入簡體。**不設定音訊 `speed`，也不設 `max_output_tokens`** —— 兩者都與正式 dodo 一致：語速與長度都由「個性與聲音」「對話方式」分塊以具體指令描述，不以「沉重」等關鍵字觸發程式分支，也不用 API 參數硬切。

Realtime 若回報設定錯誤（例如送出 GA 不接受的欄位），聊天室會直接顯示錯誤，瀏覽器 console 也會印出 `[realtime error]`。這類錯誤過去是靜默的：session 會退回 OpenAI 預設人格，豆豆就會用英文、用預設語調回答。

打字輸入／文字輸出同樣走 Realtime，只是鍵盤送出不會經過 VAD。有耳麥者可選語音輸入，實際驗證句中停頓、回合結束與插話；也可只選語音輸出，用打字聽豆豆回答。設定會保存到瀏覽器內的 `dodo-workshop.project`，下載後的檔名固定為 `my-dodo.json`；API Key 不會寫入作品。

### 沿用 Workshop 1.0 工具

Realtime session 會註冊 1.0 的 `get_weather`、`read_memory`、`update_memory`。模型決定查天氣後，瀏覽器呼叫本機 `/api/tools/weather`，後端使用 OpenWeatherMap 查詢，再以 `function_call_output` 放回同一段 Realtime 對話。可在首次啟動畫面輸入 1.0 使用的天氣 API Key，或由講師預先設定 `WEATHER_API_KEY`；設定完成後即可詢問「臺北今天天氣如何？」—— 中文城市名會先由 `dodo_workshop/weather.py` 的 `CITY_ALIASES` 對應成 OpenWeatherMap 認得的英文名稱（OpenWeatherMap 查不到「臺北」）。工具執行狀態會以 `TOOL` 標籤獨立顯示，不會混進豆豆的對話泡泡。Key 不會寫入 localStorage 或 `my-dodo.json`。

記憶工具直接讀寫 2.0 的 `workspace.memory`，因此會跟著自動保存與 `my-dodo.json` 匯出，在兩堂課之間延續。`update_memory` 會拒絕密碼、API Key、金融帳號與驗證碼等敏感資料。

## Workshop 2：會記得、會主動的 Dodo

學生先完成 8 題記憶分類，再調整長者興趣、安靜時段、冷卻時間與每日主動訊息上限。所有設定都延續在同一份 `my-dodo.json`。

建議比較：

- 安靜時段是否應為 22:00–08:00？
- 主動訊息冷卻時間應是 10、30 還是 60 分鐘？
- reminder、health、weather、news 的優先順序如何安排？
- 緊急事件是否能被「使用者剛拒絕聊天」擋住？

## 兩堂課如何銜接

```text
Workshop 1：agent + realtime.turn_detection
              ↓ 下載 / 自動保存
Workshop 2：elder_profile + memory_policy + proactive_policy
```

- 同一台電腦：第二堂啟動後會自動讀取上次成果。
- 換一台電腦：按「匯入」，選擇第一堂下載的 `my-dodo.json`。
- 只參加第二堂：首次引導選擇「只參加 Workshop 2」，載入 `starter/workshop2-default-dodo.json`。
- `init` 只重新選擇輸入／輸出方式與 API 設定，不會清除作品與課程進度。

`student/lesson1_*.json` 與 `student/lesson2_*.json` 是早期 CLI 範例；共用客端與兩堂正式流程均以 `student/my-dodo.json` 的 schema 為準。

完整教案見：

- `docs/workshop-1.md`
- `docs/workshop-2.md`
- `docs/instructor-guide.md`
