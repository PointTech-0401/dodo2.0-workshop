# dodo 2.0 Workshop

## 給學生：安裝與開啟

約 15 分鐘，只做一次。兩堂課用同一次安裝。

### 1. 裝 uv

按 `Win + R`，輸入 `powershell`，按 Enter。貼上下面這一行，按 Enter，等它跑完：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

把視窗關掉，再開一個新的，輸入 `uv --version`。出現版本號就成功了。

### 2. 下載並解壓縮

打開講師給的短網址，下載課程 ZIP。在檔案上按右鍵，選「解壓縮全部」，再按「解壓縮」。

打開解壓縮出來的資料夾。要直接看到 `start-w1.bat`、`start-w2.bat` 和 `app.py`。如果只看到另一個資料夾，再點進去。

### 3. 開啟

- **第一堂**：對 `start-w1.bat` 點兩下。
- **第二堂**：對 `start-w2.bat` 點兩下，不用再裝一次。講師說開始再點。

第一次會下載套件，要等幾分鐘。如果跳出「無法驗證發行者」，按「執行」。

黑色視窗上課期間不要關。關掉的話，再對同一個檔點兩下。

瀏覽器會自動打開。沒有的話，把黑色視窗裡「已啟動」那一行的網址貼到 Chrome 或 Edge。

### 4. 第一次的畫面

照講師的指示貼上金鑰。金鑰只留在這台電腦的記憶體，程式一關就沒了。黑色視窗被關掉之後，要到右上角「系統設定」再貼一次。第二堂開的是另一支程式，金鑰也要再貼一次。

### 卡住了

- **只看到另一個資料夾，沒有 `start-w1.bat`**：再點進去一層。
- **`uv` 不是內部或外部命令**：把 PowerShell 關掉，重開一個新的。
- **啟動檔打不開或被擋下**：在資料夾上方的網址列輸入 `cmd`，按 Enter，貼上 `uv run python app.py serve --workshop 1`（第二堂把 1 換成 2），按 Enter。
- **畫面寫「Realtime 連線逾時」，但金鑰測試是綠的**：請巡場的人幫忙。

## 這個專案是什麼

這是兩堂各 2–3 小時的大學生工作坊專案。所有學生使用同一個客端；輸入方式可選打字或語音，輸出方式可獨立選擇文字或語音。

去年的 Prompt、Function Calling、Tool 與 MCP 不在本次重複實作；今年改用 dodo 2.0 的兩個問題作為主軸：

1. 如何透過文字或真實語音理解 Voice Agent 的停頓、插話與錯誤恢復？
2. 陪伴 Agent 應記得什麼、何時主動開口，又何時必須保持安靜？

## 專案內容

- 一個共用瀏覽器客端：兩堂課、文字與語音都從同一個畫面進入。
- 第一堂：分開調整 Model instructions 與 Realtime 回合設定，並實際套用到同一個 Realtime session。
- 第二堂：讀一份訪談稿，幫秀蘭阿嬤建檔（六區＋每區「問豆豆這一區」），用三組範例或自己寫的四個分塊定下對話規範，用兩個數字跑完她的星期二，並排一筆待提醒讓豆豆在真實時間到達時自己開口一次；課尾從對話長出一筆 C 層今日摘要。
- 一個作品檔 `my-dodo.json`：每一堂最後下載，帶回家。
- 兩個啟動檔：`start-w1.bat` 只開第一堂；`start-w2.bat` 只開第二堂，固定用打字與文字，每個人都從 `starter/workshop2-default-dodo.json` 這份起始檔開始。
- 真實模型回覆：沒有 API Key 時會明確停用聊天，不用固定回聲假裝成 AI。

## 共用客端規格

打字與語音不是兩個不同的應用程式，而是同一個客端可自由搭配的輸入／輸出方式。四種組合共用：

- persona、System instructions 與 Realtime turn detection
- 長者資料與三層記憶
- 對話 session 與逐字稿
- 主動事件、安全規則與課堂情境
- `listening`、`thinking`、`speaking` 等狀態顯示
- 桌面版預設左右各半（1:1），可拖曳聊天區與右側 Prompt 設定區之間的分隔線；分隔線取得焦點後也可用左右方向鍵調整，拖過的寬度會記在瀏覽器裡
- 重新整理（F5）會留在原本那一堂，不會因為按過「套用」就跳到 Workshop 2
- 聊天區右上角一顆**「＋ 新聊天」**：清掉這一段對話並重開一個 Realtime session（畫面清空不等於模型忘記，對話歷史在 session 那一端）。**三層記憶、建檔、主動設定與待提醒都留著**：「開一段新對話，她照樣記得你」正是第二堂要看的東西，也是它和 F5 的差別：F5 會把整份 workspace 重載一次
- 聊天輸入框按 Enter 送出、Shift+Enter 換行；右側設定區統一使用 14px Microsoft JhengHei
- 右側設定區以分頁分組（Workshop 1：A 回答方式／B 何時算說完；Workshop 2：建檔／對話規範／主動規則／主動對話）。標題列與分頁列**固定在右側最上方不隨捲動移動**，所以在長分頁的最底下也能直接換頁或按「套用」。「套用」與「取消變更」在該堂標題列最右邊，**只有在欄位真的和已送出的設定不同時才出現**；有未套用變更的分頁會標上小圓點，所以改在隱藏分頁也看得到。「取消變更」把欄位還原成上次套用的內容
- 「跑她的一天」的結果在可收合面板裡，收起後標題仍顯示那兩個數字
- 「套用完成」「Realtime 已確認套用」這類過場狀態顯示在狀態列並自動淡出，不再洗版聊天室；聊天室只保留錯誤、拒絕與階段完成訊息。狀態列右邊的「只看對話」可暫時隱藏 `SYSTEM` 與 `TOOL` 記錄

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
5. **課程入口**：選擇從 Workshop 1 開始、繼續本機作品，或只參加 Workshop 2。用 `--workshop 1` 啟動時沒有「只參加 Workshop 2」；用 `--workshop 2` 啟動時不問輸入輸出方式、也不問入口，直接載入起始檔（這個網址已經有進度時接著用）。
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

若 `dodo-workshop.setup.completed` 為 `true`，直接使用上次選擇的輸出入方式，不再顯示引導。客端頁面仍會顯示目前組合，以及「系統設定」入口。舊版單一 `mode` 設定會自動轉成新版格式。

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

只需要 [uv](https://docs.astral.sh/uv/)。Python 由 uv 依 `.python-version` 自動下載（釘在 3.12，去年在電腦教室驗證過），不必另外裝。學生的安裝步驟在最上面的「給學生」。

開發與跑測試：

```powershell
cd D:\Project\dodo2.0-workshop
uv sync --extra dev
Copy-Item .env.example .env
```

### 打包給學生

```powershell
uv run python scripts/pack_student_zip.py
```

輸出在 `dist/dodo2.0-workshop.zip`。內容取自 git 已提交的部分（預設 `HEAD`，可用 `--ref` 指定 tag），所以要先 commit 或先打 tag；缺 `start-w1.bat`、`start-w2.bat`、`.python-version`，或帶了測試、簡報、講師文件時，腳本會拒絕並刪掉輸出的 ZIP。ZIP 的根目錄直接是專案，不帶測試、簡報與講師文件（規則寫在 `.gitattributes`），批次檔一律 CRLF。

不要讓學生用 GitHub 的「Download ZIP」或 Release 頁面的「Source code (zip)」，那兩個都會多包一層資料夾，學生解壓縮後再多一層，CMD 就站錯資料夾。給他們這支腳本打出來的檔案的直接下載連結。腳本只打包，不發佈。

可直接在首次啟動畫面分別輸入 OpenAI API Key 與 OpenWeatherMap API Key；每個 Key 只有「測試」按鈕，儲存統一交給最下方的按鈕（未測試的 Key 會在儲存時自動先測試）。兩把 Key 是一起測、一起存的，不會等完一把才跑另一把，所以一把壞掉時另一把的問題也會同時看到。測試通過之後又改了 Key，那一行會退回原本的內容。完成初次設定後，「系統設定」視窗可用右上角「×」或 Esc 關閉。Key 只保存到這次 Python 程式的記憶體，重啟後需重新輸入。講師也可以預先在 `.env` 填入：

```text
OPENAI_API_KEY=你的金鑰
# 僅供 Workshop 2 主動訊息／CLI 備援，不是聊天畫面的模型
OPENAI_MODEL=gpt-4.1-mini
OPENAI_REALTIME_MODEL=gpt-realtime-2
OPENAI_REALTIME_VOICE=sage
WEATHER_API_KEY=沿用_Workshop_1.0_的_OpenWeatherMap_Key
```

不要把共用 API Key 寫進教材、投影片或 Git。學校統一管理的電腦教室沒辦法預先設定，現場由學生在首次啟動畫面貼上講師給的金鑰，不需要 `.env`。

## 執行

啟動共用客端：

```powershell
uv run python app.py
```

瀏覽器會開啟 `http://127.0.0.1:8000/`，兩堂都看得到（開發與講師備課用）。上課用啟動參數把兩堂分開：

| 指令 | 誰用 | 看得到 | 網址 |
|---|---|---|---|
| `uv run python app.py serve --workshop 1`（`start-w1.bat`） | 學生，第一堂 | 只有 01 | `http://127.0.0.1:8000/` |
| `uv run python app.py serve --workshop 2`（`start-w2.bat`） | 學生，第二堂 | 只有 02；固定打字與文字，系統設定沒有語音選項 | `http://127.0.0.1:8001/` |
| `uv run python app.py serve --workshop 2 --allow-voice` | 講師機，第二堂 | 只有 02；可以把輸出切成語音接喇叭 | `http://127.0.0.1:8001/` |

第二堂用另一個 port，瀏覽器資料就跟第一堂分開：第一次開啟時直接載入起始檔，不會讀第一堂的設定；中途關掉再開，會接著這一堂上次的進度。

需要重新選擇輸入／輸出方式時：

```powershell
uv run python app.py init
```

保留的 CLI 指令供講師備援或單元測試使用（第二堂沒有 CLI：建檔、她的一天與真的開口都在瀏覽器客端）：

```powershell
# 第一堂 CLI 備援：明確標示為文字事件預演，不代表真實 VAD
uv run python app.py lesson1

# 明確的離線 CLI 示範（瀏覽器不使用假回覆）
uv run python app.py lesson1 --offline

# 測試
uv run pytest
```

## Workshop 1：讓 Dodo 聽完，再回答

右側分成兩個分頁，對應兩個明確層次：

- A「用分塊設計回答方式」：名稱、使用者稱呼與五個 Prompt 分塊會即時組成完整 System Prompt。學生只能編輯「角色與身分、個性與聲音、對話方式、語言、邊界與安全」分塊；完整 Prompt 僅提供唯讀預覽。這份組裝結果在**建立連線時就隨 SDP offer 送給 OpenAI**，所以第一句話就已經是豆豆；按「套用」會再用 `session.update` 更新一次。回覆長度不設 API 上限，由「對話方式」分塊描述。
- B「何時算說完」：`semantic_vad`、`server_vad`、`silence_duration_ms`、`interrupt_response` 或 Push-to-talk 會真正送進 Realtime session（mint 與 `session.update` 都會帶）。

Realtime 預設使用 `gpt-realtime-2` 與 `sage`（A 區可改成其他 10 種內建聲線，並附三組現成人格範例：溫柔陪伴／神經模式／啦啦隊長，各自配一個聲線）。OpenAI 不允許在同一個 session 換聲線，所以按「套用」改聲線時客端會自動重新連線。其餘設定：低 reasoning effort、`gpt-4o-transcribe`、`near_field` 收音降噪和臺灣繁體中文虛擬孫女提示。轉錄服務也另有臺灣繁體中文 prompt，避免使用者語音逐字稿混入簡體。**不設定音訊 `speed`，也不設 `max_output_tokens`**：語速與長度都由「個性與聲音」「對話方式」分塊以具體指令描述，不以「沉重」等關鍵字觸發程式分支，也不用 API 參數硬切。

Realtime 若回報設定錯誤（例如送出 GA 不接受的欄位），聊天室會直接顯示錯誤，瀏覽器 console 也會印出 `[realtime error]`。這類錯誤過去是靜默的：session 會退回 OpenAI 預設人格，豆豆就會用英文、用預設語調回答。

打字輸入／文字輸出同樣走 Realtime，只是鍵盤送出不會經過 VAD。有耳麥者可選語音輸入，實際驗證句中停頓、回合結束與插話；也可只選語音輸出，用打字聽豆豆回答。設定會保存到瀏覽器內的 `dodo-workshop.project`，下載後的檔名固定為 `my-dodo.json`；API Key 不會寫入作品。

### 沿用 Workshop 1.0 工具

Realtime session 會註冊 1.0 的 `get_weather`、`read_memory`、`update_memory`。模型決定查天氣後，瀏覽器呼叫本機 `/api/tools/weather`，後端使用 OpenWeatherMap 查詢，再以 `function_call_output` 放回同一段 Realtime 對話。可在首次啟動畫面輸入 1.0 使用的天氣 API Key，或由講師預先設定 `WEATHER_API_KEY`；設定完成後即可詢問「臺北今天天氣如何？」。中文城市名會先由 `dodo_workshop/weather.py` 的 `CITY_ALIASES` 對應成 OpenWeatherMap 認得的英文名稱（OpenWeatherMap 查不到「臺北」）。工具執行狀態會以 `TOOL` 標籤獨立顯示，不會混進豆豆的對話泡泡。Key 不會寫入 localStorage 或 `my-dodo.json`。

記憶工具直接讀寫 2.0 的 `workspace.memory`，因此會跟著自動保存與 `my-dodo.json` 匯出，在兩堂課之間延續。`update_memory` 帶 `layer` 參數（A／B／C），決定寫進 `memory.facts`、`memory.events` 還是 `memory.summaries`；密碼、API Key、金融帳號、驗證碼、第三人的健康狀況與對家人的情緒性評價屬於 X，一律拒絕保存。護理員建檔寫的 A 層事實 `update_memory` 不能改也不能刪。

**同一個 key 再存一次時，每一層的行為不同**，這才是 A／B／C 真正的差別（保存天數只是標籤）：A 重要事實**累加**，所以「興趣：唱歌」不會被「興趣：跳舞」蓋掉；B 近期事件**只留同一個 key 的最新一筆**，整層並有 16 筆上限（與 Prompt 視窗同值：參考建檔光 A 層就有 13 筆事實，整份都必須進得了模型）；C 跨日摘要**直接重寫**。key 與 value 完全相同只會更新時間，不會多一筆。長期偏好（喜歡的音樂、食物）因此屬於 A 而不是 B：偏好會累積，放進取代語意的 B 會讓每一句新偏好吃掉上一句。

`update_memory` 的 `mode` 有三種：`add`（預設，並存）、`replace`（覆蓋同一個 key 的全部舊內容，例如搬家、換藥）、`remove`（用一模一樣的 key + value 只移除那一筆）。`remove` 是累加規則必然需要的另一半：「我不喜歡吃西瓜了」不能靠新增一筆相反的記錄來處理，否則記憶裡會同時躺著「喜歡西瓜」和「不喜歡西瓜」；而 `replace` 又會把同一個 key 底下還成立的鳳梨、芭樂一起丟掉。移除的判斷刻意排在 X 敏感關鍵字檢查**之前**：那道檢查是防資料進來，不該連帶讓已經溜進去的東西再也拿不出來。

所有寫入（Realtime 工具、建檔表單、今日摘要）都走同一個 `upsertMemory()`，移除走 `forgetMemory()`，所以護理員鎖與三層的合併規則不可能有第二套實作。

### preamble 與正式回答會分開顯示

模型在呼叫工具前可以先說一句「我幫您查一下臺北的天氣」，這句就是 preamble。Realtime API 沒有 preamble 這種 item type，它的判斷方式是結構性的：**同一個 response 裡同時有 message item 與 function_call item，那個 message 就是 preamble**；工具查完之後的正式回答，是我們送回 `function_call_output` 後建立的下一個 response。客端因此把這種泡泡標成 `DODO · PREAMBLE（工具前的開場）`並改用虛線框，標籤本身就是說明，不再另外送一列 `SYSTEM` 洗版。預設「對話方式」分塊也要求豆豆查資料前先說一句，否則學生不一定看得到。

### 旁白會被標出來，不會被藏起來

豆豆有時沒要查任何東西，卻先把心裡的盤算講出來（「我想一下怎麼陪你聊這個」）。`gpt-realtime` 可以在自己產生的 output item 上標 `phase`，`commentary` 就是這種話。客端因此把那顆泡泡標成 `DODO · 旁白（模型把心裡話講出來了）`並改用杏色虛線框。

**只認模型自己標的，不比對字串。** 用關鍵字猜會把豆豆正常講故事時的「我想想」一起抓進來，所以沒有標 `phase` 的 item 一律不動。旁白留在畫面上並標示，學生看得到才知道 Prompt 在壓什麼。同一個 response 裡有 function_call 時，那一輪仍然歸 `PREAMBLE`，第一堂是用那個標籤教的。

第二堂的「同一句話，前後對照」在挑真正的答案時，會跳過 `PREAMBLE` 與旁白這兩種泡泡，兩者都不是回答。

## Workshop 2：一位長者，一整天

第二堂給學生一份訪談稿和一個人。分頁就是課堂順序：**建檔 → 對話規範 → 主動規則 → 主動對話**。

秀蘭阿嬤是**虛構**的（`scenarios/interview.md`，檔頭有聲明），學生填的建檔會直接改變後面的結果：填錯作息，帶狀圖和「她的一天」擋人的時段就錯；漏填 21:00 的安眠藥，結果會列出「這一天她不會被提醒」。「她的一天」的 18 個事件本身來自參考建檔，全班跑同一天，數字才比得起來。

### 建檔：學生是護理員

最上面一顆「顯示訪談稿」，按下去訪談稿會蓋住左邊的聊天區（約 1,500 字），右邊表單照樣可填，「關閉」或 Esc 回到聊天；下面六區表單，每區都寫著【落點】【誰寫】【訪談 §幾找】，右上一顆**「問豆豆這一區」**，按下去會先套用，再送一句只有剛填的那一區能回答的問題。六個小回饋圈，取代一次 35 分鐘後才知道對不對的表單。另有一顆**「直接載入範例建檔」**（`GET /api/reference-intake`）給不想自己填、或中途才加入的人：只填表單，仍要按套用，取消變更也還原得掉。

訪談稿刻意不乾淨：有離題、有前後矛盾（「四點多醒、五點起來」），還有一個模糊地帶（她吃了人家給的糖，並說「不要跟護理師講」）。完整度清單只算**數量**，不判對錯。

**興趣、偏好、症狀不存在建檔物件裡**：那兩區直接寫進 `workspace.memory`，帶 `source: "caregiver"` 與 `tag`，所以記憶檢視器只有一份真相，合併規則一樣生效。

**護理員鎖只管 A 層**：`facts` 裡 `source: caregiver` 的項目，`update_memory` 不能 `replace`／`remove`（工具會回「這是護理員建的，豆豆不能改，請告訴護理員」）。B 層一律可改：症狀就是護理員建的 B 項目，鎖住就永遠演不出「我膝蓋好多了 → B 被取代 → 追問停止」。人（記憶檢視器的刪除）永遠可以，但護理員建的那幾筆寫著「在建檔區修改」，因為在這裡刪掉下次套用又會被表單寫回來。

紅隊五句（課堂上第 4 句「我膝蓋好多了」延到主動對話再講），刻意不自動判定成敗：能自動判定就等於已經有那個完美分類器，而這一節要說的正是它不存在。只靠關鍵字一定會漏，所以三件事一起做：含高風險字眼的直接拒絕、護理員填的 AI 動不了、人隨時可以刪。

### 對話規範：建檔決定資料，Prompt 只寫規範

三組一鍵套用的規範範例（陪伴型／話少型／照護嚴謹型，只換四格、不動建檔；陪伴型直接讀 `/api/bootstrap` 的預設值），四個可編輯分塊（記憶使用規則、重要提醒怎麼講、健康關心怎麼問、閒聊從哪裡開始），加上四個自動生成段落：`# 長者資料`、`# 目前記得的事（三層記憶）`、`# 不主動提起`、`# 主動訊息的程式規則`。分頁上列出每一段的來源，所以「這句話為什麼在 Prompt 裡」永遠有答案。

一個唯讀的「完整 System Prompt（Workshop 1 + 2）」可以 View，這就是實際送進 Realtime 的 `instructions`。前後端組出來的文字**逐字相同**，由 `tests/fixtures/workshop2_prompt.txt` 這組 golden fixture 兩邊釘住（pytest 比對 `compose_workshop2_prompt`，`uicheck.js` 比對 `buildWorkshop2Prompt`）。

### 主動規則：兩個旋鈕、帶狀圖、她的一天

主動這一半是兩個分頁，切在**風險改變的地方**：主動規則上的東西全部是模擬，豆豆一句話都不會送出去；主動對話是唯一真的會發出 `response.create` 的地方。兩頁互相有連結。

七列規則表就是 `choose_event()` 的判斷順序，但**只有兩條是欄位**：間隔與每日上限。安靜與不打擾**由建檔的作息推導出來**（分鐘級、跨午夜、weekday 過濾），那兩列是灰的，點一下跳回建檔：它們是她的生活，不是設定值。每則句數寫死 2 句。

**24 小時帶狀圖**（48 格半小時）畫出每一分鐘豆豆被規則按住的時間，改建檔就重畫，**唯讀**。前端那份窗計算只畫圖，決策一律走後端；兩邊同義由 `uicheck.js` 拿一次真實模擬回傳的 `schedule` 逐位元組比對釘住。下面第二行點名**現在哪一條規則在卡人**，並補一句「但重要提醒照樣送得出去」，這解掉「我把間隔改小了為什麼一整天沒變化」這個最常見的困惑（真正在卡的是每日上限）。

**跑她的一天**（星期二，18 個事件，先預測再跑）回報兩個互相拉扯的數字：漏掉的健康關心與打擾。課堂上學生要先猜再跑，所以各組跑出來的數字與結論不寫在這份會發給學生的 README，放在講師用的 `docs/workshop-2.md` 與 `docs/instructor-guide.md`（`tests/test_proactive.py` 會確認那兩份印的數字跟引擎實際跑出來的一樣）。擋人統計讀的是決策器自己回報的規則代碼，不是從理由句子撈關鍵字。

**對照開關**改用寫死的閘門（22:00–08:00＋用餐窗）跑同一天，用來比較「閘門從她的作息算出來」和「閘門寫死」的差別。

### 主動對話：真的開口、待提醒清單、今日摘要

**真的開口**只有三種事件類型，就是後端真正判斷的三種：

| type | 間隔／上限 | 安靜／不打擾／拒絕 | 吃額度 | 來源 |
|---|---|---|---|---|
| `reminder` 重要提醒 | 不受限 | 不受限 | **否** | 建檔 › 用藥、回診 |
| `health` 健康關心 | 受限 | 受限 | 是 | B 層 `tag: symptom` |
| `chat` 閒聊 | 受限 | 受限 | 是 | A 層興趣＋作息＋請教 |

兩個時鐘共用同一個事件表單：**⏰ 排到真實時間**每 5 秒對一次真實時鐘，到了就用**真實**累積量與**真實**的拒絕狀態送 `/api/proactive-decide`；**🧪 假設狀態**四個欄位全是假設值，用來戳規則邊界。通過才在聊天室建立一個帶 `response.instructions` 的 response（response 層的 instructions 會**取代** session 的，所以完整人格會一起送出）。不論從哪一邊說出去都記進同一份 `workspace.proactive_state`（跨 F5 保留、每天歸零）。

「她剛說不想聊」（按鈕在**主動規則**的規則表第 2 列，因為它是一條規則，不是一次開口）寫入 `declined_until`：60 分鐘或到她下一次起床，取較早者。按鈕顯示失效時間、可以取消，過期畫面自己更新，一次拒絕不該讓她永遠聽不到聲音。

**今日摘要**是唯一由系統整理的記憶（由後端另外呼叫文字模型產生，再按一次會蓋掉前一筆）：從今天的對話長出一筆 C 層，來源標「系統整理」。逐字稿只取她和豆豆說的話，`TOOL` 與 `SYSTEM` 是課堂儀器。

程式決定「說不說」，模型只決定「怎麼說」，這是實作二真正要教的分工。

## 兩堂課如何銜接

```text
Workshop 1（start-w1.bat，port 8000）：agent.prompt_blocks + realtime.turn_detection
Workshop 2（start-w2.bat，port 8001）：從 starter/workshop2-default-dodo.json 開始
              workshop2_blocks + elder_profile + proactive_policy + memory + proactive_state
instructions = Workshop 1 的 5 個分塊 + Workshop 2 的 4 個對話規範分塊與 4 個生成段落
```

- 兩堂用不同的網址，瀏覽器裡的資料彼此分開。第二堂每個人都從同一份起始檔開始（第一堂的分塊是出廠預設、稱呼是秀蘭阿嬤），講師講的結果才會跟每一台的畫面一樣。只上第二堂的人也一樣，直接點 `start-w2.bat`。
- 第二堂中途關掉黑色視窗：再點一次 `start-w2.bat`、重貼金鑰，接著上次的進度。
- 不帶 `--workshop` 啟動時兩堂都看得到，首次引導仍有「只參加 Workshop 2」這個入口，會載入同一份起始檔。
- `init` 只重新選擇輸入／輸出方式與系統設定，不會清除作品與課程進度。

`student/lesson1_*.json` 是早期 CLI 範例；共用客端與兩堂正式流程均以 `student/my-dodo.json` 的 schema 為準（`schema_version: 2`）。

完整教案見：

- `docs/workshop-1.md`
- `docs/workshop-2.md`
- `docs/instructor-guide.md`
