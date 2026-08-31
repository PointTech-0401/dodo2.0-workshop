// core.js —— 不屬於任何一堂的東西：連線、聊天、狀態、套用快照、工具執行、匯入匯出。
// 第一堂與第二堂住在 workshop1.js / workshop2.js，index.html 依序 defer 載入。
//
// 這個檔的頂層 const／let／function 都在全域詞法環境裡，兩堂都直接讀得到。反過來，
// 兩堂的東西各自包在 IIFE 中，core 只透過 W1.* / W2.* 呼叫它們。
const SETUP_KEY = "dodo-workshop.setup";
const PROJECT_KEY = "dodo-workshop.project";
// Which stage the student is actually on. Progress flags used to decide this,
// which meant 套用 in Workshop 1 + F5 threw them into Workshop 2.
const STAGE_KEY = "dodo-workshop.stage";
// Only written when the student drags or arrow-keys the divider. With nothing
// stored the CSS default wins, and that default is an exact 1:1 split.
const LAB_WIDTH_KEY = "dodo-workshop.labWidth";
const LAB_WIDTH_MIN = 320;
const PANEL_MOBILE_BREAKPOINT = 860;
const STT_TRANSCRIPTION_PROMPT = "請使用臺灣繁體中文記錄逐字稿，採用臺灣慣用詞，不要使用簡體字。";
// Registered at mint time AND re-sent on every session.update, so the tools
// survive a 「套用」 that replaces the session config.
const REALTIME_TOOLS = [
  {
    type: "function",
    name: "get_weather",
    description: "查詢指定城市目前的即時天氣。當使用者問天氣、氣溫、濕度或是否適合外出時使用；不可自行猜測天氣。",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名稱，可使用中文或英文，例如：臺北、台中、Kaohsiung、Tokyo。",
        },
      },
      required: ["city"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_memory",
    description: "讀取使用者已保存的個人資料與記憶。需要知道使用者是誰、偏好或之前提過的事情時使用。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_memory",
    description: "保存或更新長者主動提供的非敏感個人資訊。同一個 key 再存新內容時，A 層預設會「並存」，不會蓋掉舊的（例如興趣可以同時有唱歌和跳舞）；只有新內容真的取代舊內容時才傳 mode=\"replace\"。護理員建檔寫的 A 層事實你不能改也不能刪（例如醫囑「少甜少油」）——她要求時就說這是護理員建的，請她告訴護理員。她自己說的近況不受此限：B 層症狀本來就該被最新狀態取代，聽到「膝蓋好多了」就用同一個 key 傳 mode=\"replace\" 換掉舊那筆，追問才會停。不得保存密碼、API Key、金融帳號或驗證碼，也不要保存第三人的健康狀況或對家人的情緒性評價（X 類一律不保存）。",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "資訊類別，例如：姓名、興趣、居住地、喜歡的食物。" },
        value: { type: "string", description: "要保存的臺灣繁體中文內容。" },
        // Workshop 2's A/B/C classification, decided by the model as it saves.
        // Optional with an A fallback: a model that omits it must still succeed.
        // 「喜歡吃西瓜」vs B's own example「今天想吃什麼」is the collision that
        // sent food preferences into B, where the supersede rule ate every
        // earlier fruit. The distinction is spelled out rather than implied.
        layer: {
          type: "string",
          enum: ["A", "B", "C"],
          description: "記憶層級：A 重要事實 —— 長期、需真人確認，包含喜歡或不喜歡的食物、音樂、活動等長期偏好，A 層同一個 key 會並存多筆。B 近期事件 —— 幾天內就會改變的當下狀態，例如昨晚沒睡好、今天中午想吃什麼；B 層同一個 key 只留最新一筆，舊的會被丟掉，所以會累積的偏好千萬不要放 B。C 跨日摘要 —— 多次對話整理出的趨勢。不確定時用 A。",
        },
        // Without this the only way to record a second 興趣 was to overwrite the
        // first one, which is how「我喜歡唱歌」got erased by「我喜歡跳舞」.
        // `remove` is the other half: accumulating means a fact can no longer be
        // retracted by writing another one, and rewriting the whole key with
        // `replace` throws away the values that are still true.
        mode: {
          type: "string",
          enum: ["add", "replace", "remove"],
          description: "add（預設）：這是同一個 key 的另一筆事實，和既有內容並存。replace：新內容取代同一個 key 的全部舊內容，例如搬家、換藥、改了聯絡人。remove：使用者否定某一筆已經記得的事（例如「我不喜歡吃西瓜了」），用完全相同的 key 與 value 移除那一筆，同一個 key 的其他內容會留下；不要改用新增一筆相反的記錄。",
        },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// --- Tabs + the 套用 button ------------------------------------------------
// Both lab panels used to be one long scrolling column with every control on
// screen at once. Each panel is a set of tabs now, and 套用 moved out of the
// bottom of that column into the section title — where it only appears if
// something is actually waiting to be sent.
//
// `tabs` maps a tab id to the slice of state that 套用 pushes from it. Dirty is
// measured against the snapshot taken at the last successful apply, NOT against
// `workspace`: 執行 6 個情境, 跑一整天 and 觸發主動關心 all call collectWorkshop2(),
// which writes the fields into workspace without ever sending a session.update.
//
// `read` is what 套用 sends; `write` puts a snapshot back into the fields, which
// is all 取消變更 needs — the snapshot IS the last applied value, not a hash.
const APPLY_GROUPS = {};

/** Each lesson registers its own group, so core never has to know what lives on
 *  a Workshop 2 tab. Insertion order is the load order of the two lesson files,
 *  which is what keeps 套用 iterating Workshop 1 before Workshop 2. */
function registerApplyGroup(name, group) {
  APPLY_GROUPS[name] = group;
}
const appliedSnapshots = {};

function switchTab(tabId) {
  const target = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
  if (!target) return;
  [...target.closest(".tab-bar").querySelectorAll(".tab-button")].forEach((button) => {
    const isActive = button === target;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    document.getElementById(button.dataset.tab).hidden = !isActive;
  });
}

function tabSnapshot(tabId) {
  const group = Object.values(APPLY_GROUPS).find((entry) => tabId in entry.tabs);
  return JSON.stringify(group.tabs[tabId].read());
}

/** Show 套用／取消變更 only where there is something to apply, and dot the tab
 *  that holds the change — a hidden tab would otherwise leave them unexplained. */
function refreshApplyState() {
  Object.values(APPLY_GROUPS).forEach((group) => {
    const dirtyTabs = Object.keys(group.tabs).filter((tabId) => {
      const dirty = appliedSnapshots[tabId] !== tabSnapshot(tabId);
      document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.toggle("is-dirty", dirty);
      return dirty;
    });
    const clean = dirtyTabs.length === 0;
    $(group.button).hidden = clean;
    $(group.revert).hidden = clean;
  });
}

/** Put every field in this group back to what was last applied. The buttons then
 *  hide themselves: after the write, fields equal the snapshot, so the ordinary
 *  dirty computation in refreshApplyState() is the only thing deciding. */
function revertGroup(groupName) {
  const group = APPLY_GROUPS[groupName];
  Object.entries(group.tabs).forEach(([tabId, tab]) => {
    tab.write(JSON.parse(appliedSnapshots[tabId]));
  });
  // Assigning .value fires no input event, so the previews have to be told —
  // the 主動規則 band and the trigger hints read the same fields and would
  // otherwise keep showing the numbers that were just reverted away.
  W1.rebuildSystemPrompt();
  W2.renderPolicyPreview();
  W2.renderTriggerHints();
  refreshApplyState();
  notify("已取消未套用的變更，欄位回到上次套用的內容。");
}

/** Move one slice of a tab's applied baseline, leaving the rest of it alone.
 *
 *  A memory tool write changes only 建檔's symptom rows, but re-freezing the
 *  whole tab would also absorb whatever the student had typed and not yet
 *  applied: the dirty dot clears, 套用 hides, and the typed row lives on screen
 *  only until the next F5 drops it — with no warning that it was never saved.
 *
 *  Parsing and reassigning one key keeps the remaining key order byte-identical,
 *  so a tab that really was clean stays clean. */
function patchAppliedSnapshot(tabId, key, value) {
  const applied = appliedSnapshots[tabId];
  if (applied === undefined) return;   // never baselined; nothing to patch
  const snapshot = JSON.parse(applied);
  snapshot[key] = value;
  appliedSnapshots[tabId] = JSON.stringify(snapshot);
  refreshApplyState();
}

/** Freeze the current fields as「已經送出去了」. Called at load, after an import
 *  and after each successful 套用 — never from collectWorkshopN(). */
function markApplied(groupName) {
  const groups = groupName ? [APPLY_GROUPS[groupName]] : Object.values(APPLY_GROUPS);
  groups.forEach((group) => {
    Object.keys(group.tabs).forEach((tabId) => {
      appliedSnapshots[tabId] = tabSnapshot(tabId);
    });
  });
  refreshApplyState();
}

// --- Passing status -------------------------------------------------------
// 套用 confirmations, preset loads and reconnect notices used to be SYSTEM rows
// in the transcript. They arrive several at a time and pushed the actual
// conversation off screen, so they live in the state bar now and fade out. Only
// errors, refusals and milestones still earn a place in the transcript.
let activityNoticeTimer;

function notify(text) {
  const note = $("#activityNote");
  note.textContent = text;
  note.hidden = false;
  clearTimeout(activityNoticeTimer);
  activityNoticeTimer = setTimeout(() => {
    note.hidden = true;
    note.textContent = "";
  }, 9000);
}

let bootstrapData;
let workspace;
let setup;
let apiConfigured = false;
let testedApiKey = "";
let weatherConfigured = false;
let testedWeatherApiKey = "";
let microphoneReady = false;
let peerConnection;
let dataChannel;
let microphoneTrack;
let remoteAudio;
let voiceDraft = "";
let userVoiceDraft = "";
let pendingRealtimeApply = false;
let realtimeConnectPromise;
// Set optimistically when we send response.create, not on the `response.created`
// echo: two quick messages would otherwise race, the second skipping the cancel
// and drawing an "already has an active response" error from OpenAI.
let responseActive = false;
// Generation finishing (`response.done`) is NOT the same as 豆豆 having stopped
// talking: the WebRTC output buffer keeps playing for seconds afterwards. That
// gap is why typed barge-in appeared to do nothing — by the time the student
// reacted to the voice, responseActive was already false.
let audioPlaying = false;
// True once the browser has refused playback, so the prompt is only shown once.
let audioBlocked = false;
let panelResizePointerId = null;
// Voice baked into the live session, so applyWorkshop1 can tell a change happened.
let connectedVoice = "";

function readStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function normalizeSetup(value) {
  if (!value) return null;
  if (value.inputMode && value.outputMode) return value;
  const legacyVoice = value.mode === "voice";
  return {
    ...value,
    version: 2,
    inputMode: legacyVoice ? "voice" : "text",
    outputMode: legacyVoice ? "voice" : "text",
  };
}

function needsRealtime() {
  return Boolean(setup?.completed);
}

function responseCreateEvent(instructions) {
  const response = { output_modalities: [setup?.outputMode === "voice" ? "audio" : "text"] };
  // Response-level instructions replace the session's for this turn only. Used
  // by the Workshop 2 proactive trigger, which needs the persona plus a one-off
  // brief; a normal reply passes nothing and keeps the session instructions.
  if (instructions) response.instructions = instructions;
  return { type: "response.create", response };
}

function panelWidthBounds() {
  const shell = $(".app-shell");
  const resizerWidth = $("#panelResizer").getBoundingClientRect().width;
  const minimumChatWidth = window.innerWidth <= 1100 ? 320 : 360;
  const usableWidth = shell.getBoundingClientRect().width - resizerWidth;
  // The chat floor is the only ceiling now. It used to be half the usable
  // width, but 1:1 is the *default* since this change — capping there would
  // leave the divider unable to move right of where it starts.
  return {
    min: LAB_WIDTH_MIN,
    max: Math.max(LAB_WIDTH_MIN, usableWidth - minimumChatWidth),
  };
}

function syncResizerBounds() {
  const bounds = panelWidthBounds();
  const resizer = $("#panelResizer");
  resizer.setAttribute("aria-valuemin", String(bounds.min));
  resizer.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
  resizer.setAttribute("aria-valuenow", String(Math.round($(".lab-panel").getBoundingClientRect().width)));
}

function setLabPanelWidth(width) {
  const bounds = panelWidthBounds();
  const nextWidth = Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
  $(".app-shell").style.setProperty("--lab-width", `${nextWidth}px`);
  syncResizerBounds();
}

/** Remember an explicit divider position so F5 keeps it. Only the drag and
 *  keyboard handlers call this — persisting from the resize/clamp path would
 *  freeze the 1:1 CSS default into a pixel value on first load. */
function persistLabPanelWidth() {
  localStorage.setItem(LAB_WIDTH_KEY, String(Math.round($(".lab-panel").getBoundingClientRect().width)));
}

function resizePanelsFromPointer(clientX) {
  const shellRight = $(".app-shell").getBoundingClientRect().right;
  setLabPanelWidth(shellRight - clientX);
}

function startPanelResize(event) {
  if (window.innerWidth <= PANEL_MOBILE_BREAKPOINT) return;
  panelResizePointerId = event.pointerId;
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("is-dragging");
  document.body.classList.add("is-resizing-panels");
  resizePanelsFromPointer(event.clientX);
  event.preventDefault();
}

function movePanelResize(event) {
  if (event.pointerId !== panelResizePointerId) return;
  resizePanelsFromPointer(event.clientX);
}

function stopPanelResize(event) {
  if (event.pointerId !== panelResizePointerId) return;
  panelResizePointerId = null;
  event.currentTarget.classList.remove("is-dragging");
  document.body.classList.remove("is-resizing-panels");
  persistLabPanelWidth();
}

function resizePanelsFromKeyboard(event) {
  if (window.innerWidth <= PANEL_MOBILE_BREAKPOINT) return;
  const bounds = panelWidthBounds();
  const currentWidth = $(".lab-panel").getBoundingClientRect().width;
  const widths = {
    ArrowLeft: currentWidth + 24,
    ArrowRight: currentWidth - 24,
    Home: bounds.min,
    End: bounds.max,
  };
  if (!(event.key in widths)) return;
  setLabPanelWidth(widths[event.key]);
  persistLabPanelWidth();
  event.preventDefault();
}

/** Restore a remembered divider position. With none, the CSS default stands —
 *  `calc(50% - 5px)` against a 10px resizer, i.e. an exact 1:1 split that keeps
 *  following the window instead of being pinned to pixels. */
function restoreLabPanelWidth() {
  if (window.innerWidth <= PANEL_MOBILE_BREAKPOINT) return;
  const stored = Number(localStorage.getItem(LAB_WIDTH_KEY));
  if (stored > 0) setLabPanelWidth(stored);
  else syncResizerBounds();
}

function clampPanelWidths() {
  if (window.innerWidth <= PANEL_MOBILE_BREAKPOINT) return;
  // Nothing stored → still on the responsive 1:1 default; let CSS handle the
  // resize and only refresh the announced values.
  if (!localStorage.getItem(LAB_WIDTH_KEY)) {
    syncResizerBounds();
    return;
  }
  setLabPanelWidth($(".lab-panel").getBoundingClientRect().width);
}

function saveProject() {
  localStorage.setItem(PROJECT_KEY, JSON.stringify(workspace));
}

/** The one migration path. localStorage hydration and 匯入 both post whatever
 *  they have and store what comes back; the browser keeps no schema knowledge of
 *  its own. Two hand-written migrations that had to agree was exactly the drift
 *  the golden fixture exists to catch — so there is only one now, in Python.
 *
 *  Throws on a file that is not a Dodo project, which is what both callers
 *  report to the student. */
async function normalizeWorkspace(raw) {
  const response = await fetch("/api/workspace/normalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: raw }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || "這份作品讀不進來。");
  return payload.workspace;
}

function setState(name, note) {
  $$(".state-list li").forEach((item) => item.classList.toggle("is-current", item.dataset.state === name));
  if (note) $("#connectionNote").textContent = note;
}

// `tool` rows are workshop status, not something 豆豆 said. They used to render
// as "DODO", so a failed weather lookup read like the agent speaking English
// error text mid-conversation.
const SPEAKER_LABELS = { user: "YOU", assistant: "DODO", tool: "TOOL", system: "SYSTEM" };

function addMessage(role, text, id = null) {
  let article = id ? document.getElementById(id) : null;
  if (!article) {
    article = document.createElement("article");
    article.className = `message ${role}`;
    if (id) article.id = id;
    article.innerHTML = `<span class="speaker">${SPEAKER_LABELS[role] || "DODO"}</span><p></p>`;
    $("#messages").append(article);
  }
  article.querySelector("p").textContent = text;
  $("#messages").scrollTop = $("#messages").scrollHeight;
  return article;
}

// --- Preambles ------------------------------------------------------------
// The Realtime API has no "preamble" item type. What it does have: a response
// whose output holds BOTH a message item and a function_call item. That message
// is the preamble — 豆豆 narrating what it is about to look up — and the real
// answer arrives in the *next* response, the one we create after handing back
// function_call_output. So the distinction is structural, per response, and can
// only be made once the function_call shows up: the text streams first.
let activeResponseBubbles = [];
let activeResponseIsPreamble = false;

function startResponseTracking() {
  activeResponseBubbles = [];
  activeResponseIsPreamble = false;
}

/** Remember a bubble so it can be re-labelled if this response turns out to
 *  contain a tool call. A response may hold several message items. */
function trackResponseBubble(bubble) {
  if (!bubble) return;
  if (!activeResponseBubbles.includes(bubble)) activeResponseBubbles.push(bubble);
  if (activeResponseIsPreamble) markPreamble(bubble);
}

function markPreamble(bubble) {
  if (!bubble || bubble.classList.contains("is-preamble")) return;
  bubble.classList.add("is-preamble");
  bubble.querySelector(".speaker").textContent = "DODO · PREAMBLE（工具前的開場）";
}

// The dashed 「DODO · PREAMBLE」 label on the bubble is the whole explanation now.
// A SYSTEM row spelling out the response/function_call structure used to fire on
// the first tool call, which pushed the conversation off screen for a point the
// label already makes.
function markResponseAsPreamble() {
  if (activeResponseIsPreamble) return;
  activeResponseIsPreamble = true;
  activeResponseBubbles.forEach(markPreamble);
}

function responseHasFunctionCall(response) {
  return (response?.output || []).some((item) => item.type === "function_call");
}

/** Put the whole workspace back on screen. Each lesson writes its own fields;
 *  the tail runs once, after both of them, because every preview below reads
 *  fields from both halves. */
function loadFields() {
  W1.loadFields();
  W2.loadFields();
  // Reads the *fields* rather than the workspace, so it belongs with the tail.
  W2.renderProactiveEventOptions();
  // Last: both previews read every field above, Workshop 2's included.
  W1.rebuildSystemPrompt();
  W2.renderMemoryViewer();
  W2.renderPolicyPreview();
  W2.renderTriggerHints();
  W1.updateTurnFields();
  // Whatever was just loaded is what a connection will send, so nothing is
  // pending yet — this is the baseline every 套用 button is measured against.
  markApplied();
}

function composeInstructions(source) {
  return [W1.buildSystemPrompt(source.profile.agent), W2.buildWorkshop2Prompt(source)]
    .filter((part) => part.trim())
    .join("\n\n");
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]
));

function switchStage(stage) {
  const isFirst = Number(stage) === 1;
  $("#workshop1Panel").hidden = !isFirst;
  $("#workshop2Panel").hidden = isFirst;
  $$(".stage-button").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.stage) === Number(stage)));
  $("#conversationTitle").textContent = isFirst ? "讓 Dodo 聽完，再回答" : "再讓它記得你，適時主動關心";
  // 第二堂的標題長一倍，預設字級一定會折行。`.is-long` 讓它縮到剛好一行 —— 用
  // container query 而不是 vw，因為聊天區的寬度是拖曳出來的，不是視窗寬度。
  $("#conversationTitle").classList.toggle("is-long", !isFirst);
  // The transcript belongs to Workshop 2's 建檔; leaving the stage with it open
  // would hide the chat behind a panel with no visible way back.
  if (isFirst) W2.hideInterview();
  // Every entry point routes through here, so remembering the stage here is what
  // makes F5 keep the student where they were.
  localStorage.setItem(STAGE_KEY, isFirst ? "1" : "2");
}

function storedStage() {
  const stage = Number(localStorage.getItem(STAGE_KEY));
  return stage === 1 || stage === 2 ? stage : null;
}

function applyMode() {
  const inputLabel = setup?.inputMode === "voice" ? "語音" : "打字";
  const outputLabel = setup?.outputMode === "voice" ? "語音" : "文字";
  $("#modeBadge").textContent = `輸入：${inputLabel} · 輸出：${outputLabel}`;
  $("#pushToTalk").hidden = true;
  setState("listening", apiConfigured ? "Realtime 將自動連線" : "請先完成系統設定");
}

function refreshApiUi() {
  const source = bootstrapData.api_key_source;
  const weatherSource = bootstrapData.weather_key_source;
  const weatherText = weatherConfigured ? "天氣工具：已就緒" : "天氣工具：需設定 API Key";
  const modelText = `${bootstrapData.realtime_model} / voice: ${bootstrapData.realtime_voice} / ${weatherText}`;
  if (!testedApiKey) {
    $("#apiKeyStatus").textContent = apiConfigured
      ? `✓ API 已連接（${source === "environment" ? ".env" : "本次程式"}），模型：${modelText}`
      : "尚未設定。Key 只保存在這次本機程式的記憶體中。";
  }
  $("#apiKeyStatus").classList.toggle("is-ready", apiConfigured);
  if (!testedWeatherApiKey) {
    $("#weatherApiKeyStatus").textContent = weatherConfigured
      ? `✓ 天氣 API 已連接（${weatherSource === "environment" ? ".env" : "本次程式"}）`
      : "若要使用即時天氣查詢，請輸入 Workshop 1.0 使用的天氣 API Key。";
  }
  $("#weatherApiKeyStatus").classList.toggle("is-ready", weatherConfigured);
  $("#weatherToolStatus").textContent = weatherConfigured
    ? "天氣 API Key 已設定，可直接詢問即時天氣。"
    : "請從右上角「系統設定」輸入天氣 API Key；工具定義仍會保留供課堂觀察。";
  $("#modelStatus").textContent = apiConfigured
    ? `Realtime · ${bootstrapData.realtime_model} · 自動連線`
    : "尚未連接 Realtime";
}

async function testApiKey() {
  const apiKey = $("#apiKeyInput").value.trim();
  testedApiKey = "";
  $("#apiKeyStatus").classList.remove("is-ready");
  if (!apiKey) {
    $("#apiKeyStatus").textContent = "請先輸入 OpenAI API Key。";
    return false;
  }
  $("#apiKeyStatus").textContent = "正在測試 OpenAI API…";
  try {
    const response = await fetch("/api/settings/api-key/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const result = await response.json();
    if (!response.ok) {
      $("#apiKeyStatus").textContent = result.detail || "API Key 測試失敗。";
      return false;
    }
    testedApiKey = apiKey;
    $("#apiKeyStatus").textContent = "✓ 測試通過，按下方按鈕即會一併儲存。";
    $("#apiKeyStatus").classList.add("is-ready");
    return true;
  } catch {
    $("#apiKeyStatus").textContent = "無法連接本機服務，請確認 Workshop 程式仍在執行。";
    return false;
  }
}

// Saving is owned by the single button at the bottom of the sheet — 測試 only
// validates. An untested key is tested on the way through, so the student never
// has to press two buttons per key.
async function commitApiKey() {
  const apiKey = $("#apiKeyInput").value.trim();
  if (!apiKey) return true;
  if (apiKey !== testedApiKey && !(await testApiKey())) return false;
  $("#apiKeyStatus").textContent = "正在儲存 API Key…";
  try {
    const response = await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const result = await response.json();
    if (!response.ok) {
      testedApiKey = "";
      $("#apiKeyStatus").textContent = result.detail || "API Key 儲存失敗。";
      return false;
    }
    apiConfigured = true;
    bootstrapData.api_configured = true;
    bootstrapData.api_key_source = result.source;
    bootstrapData.realtime_model = result.realtime_model;
    bootstrapData.realtime_voice = result.realtime_voice;
    bootstrapData.weather_configured = result.weather_configured;
    weatherConfigured = result.weather_configured || weatherConfigured;
    testedApiKey = "";
    refreshApiUi();
    return true;
  } catch {
    $("#apiKeyStatus").textContent = "無法連接本機服務，請確認 Workshop 程式仍在執行。";
    return false;
  }
}

async function testWeatherApiKey() {
  const apiKey = $("#weatherApiKeyInput").value.trim();
  testedWeatherApiKey = "";
  $("#weatherApiKeyStatus").classList.remove("is-ready");
  if (!apiKey) {
    $("#weatherApiKeyStatus").textContent = "請先輸入天氣 API Key。";
    return false;
  }
  $("#weatherApiKeyStatus").textContent = "正在測試天氣 API…";
  try {
    const response = await fetch("/api/settings/weather-api-key/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const result = await response.json();
    if (!response.ok) {
      $("#weatherApiKeyStatus").textContent = result.detail || "天氣 API Key 測試失敗。";
      return false;
    }
    testedWeatherApiKey = apiKey;
    $("#weatherApiKeyStatus").textContent = "✓ 測試通過，按下方按鈕即會一併儲存。";
    $("#weatherApiKeyStatus").classList.add("is-ready");
    return true;
  } catch {
    $("#weatherApiKeyStatus").textContent = "無法連接本機服務，請確認 Workshop 程式仍在執行。";
    return false;
  }
}

async function commitWeatherApiKey() {
  const apiKey = $("#weatherApiKeyInput").value.trim();
  if (!apiKey) return true;
  if (apiKey !== testedWeatherApiKey && !(await testWeatherApiKey())) return false;
  $("#weatherApiKeyStatus").textContent = "正在儲存天氣 API Key…";
  try {
    const response = await fetch("/api/settings/weather-api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const result = await response.json();
    if (!response.ok) {
      testedWeatherApiKey = "";
      $("#weatherApiKeyStatus").textContent = result.detail || "天氣 API Key 儲存失敗。";
      return false;
    }
    weatherConfigured = true;
    bootstrapData.weather_configured = true;
    bootstrapData.weather_key_source = result.source;
    testedWeatherApiKey = "";
    refreshApiUi();
    return true;
  } catch {
    $("#weatherApiKeyStatus").textContent = "無法連接本機服務，請確認 Workshop 程式仍在執行。";
    return false;
  }
}

// The X only appears once there is a working setup to go back to; on first run
// there is nothing behind the sheet, so closing it would leave a dead app.
function canCloseOnboarding() {
  return Boolean(setup?.completed);
}

function showOnboarding(forceInit) {
  $("#onboarding").hidden = false;
  $("#closeOnboarding").hidden = !canCloseOnboarding();
  if (setup?.inputMode) $(`input[name="inputMode"][value="${setup.inputMode}"]`).checked = true;
  if (setup?.outputMode) $(`input[name="outputMode"][value="${setup.outputMode}"]`).checked = true;
  if (forceInit) {
    $("#entryChoice").hidden = true;
    $("#onboardingTitle").textContent = "API 與輸出入設定";
    $("#finishOnboarding").textContent = "儲存設定";
  }
  refreshApiUi();
  updateVoiceCheck();
}

// Closing discards a key that was tested but never committed, so clearing the
// tested state here stops a stale one being saved by a later 儲存.
function closeOnboarding() {
  if (!canCloseOnboarding()) return;
  testedApiKey = "";
  testedWeatherApiKey = "";
  $("#onboardingError").textContent = "";
  $("#onboarding").hidden = true;
  // Undo any mode radio the student flipped but did not save.
  if (setup?.inputMode) $(`input[name="inputMode"][value="${setup.inputMode}"]`).checked = true;
  if (setup?.outputMode) $(`input[name="outputMode"][value="${setup.outputMode}"]`).checked = true;
  refreshApiUi();
  updateVoiceCheck();
}

function updateVoiceCheck() {
  const voiceInput = $('input[name="inputMode"]:checked').value === "voice";
  const selectedOutput = $('input[name="outputMode"]:checked').value;
  const activeModeChanged = setup
    && (setup.inputMode !== (voiceInput ? "voice" : "text") || setup.outputMode !== selectedOutput);
  if (activeModeChanged && (microphoneTrack || peerConnection)) {
    disconnectRealtime();
    const note = !voiceInput && setup.inputMode === "voice"
      ? "已立即停止麥克風；儲存後改用打字輸入"
      : "輸出入方式已變更；儲存後會自動重新連線";
    setState("listening", note);
  }
  $("#voiceCheck").hidden = !voiceInput;
  $("#deviceCheckMessage").textContent = "語音輸入會使用麥克風；切回打字時會立即停止收音。";
}

async function checkMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    microphoneReady = true;
    $("#microphoneStatus").textContent = "✓ 已找到麥克風";
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    microphoneReady = false;
    $("#microphoneStatus").textContent = "無法使用麥克風，請將輸入方式改為打字";
  }
}

async function finishOnboarding() {
  $("#onboardingError").textContent = "";
  // Commit both keys before anything else: the Realtime mint below needs the
  // OpenAI key server-side, so save-then-connect is load-bearing. On failure the
  // sheet stays open with the per-field reason already rendered.
  $("#finishOnboarding").disabled = true;
  try {
    if (!(await commitApiKey())) {
      $("#onboardingError").textContent = "OpenAI API Key 沒有儲存成功，請看上方訊息。";
      return;
    }
    if (!(await commitWeatherApiKey())) {
      $("#onboardingError").textContent = "天氣 API Key 沒有儲存成功，請看上方訊息。";
      return;
    }
  } finally {
    $("#finishOnboarding").disabled = false;
  }
  if (!apiConfigured) {
    $("#onboardingError").textContent = "請先輸入並測試 OpenAI API Key。";
    return;
  }
  const inputMode = $('input[name="inputMode"]:checked').value;
  const outputMode = $('input[name="outputMode"]:checked').value;
  if (inputMode === "voice" && !microphoneReady && setup?.inputMode !== "voice") {
    $("#onboardingError").textContent = "請先檢查麥克風，或將輸入方式改為打字。";
    return;
  }
  const forced = $("#entryChoice").hidden;
  let startStage = 1;
  if (!forced) {
    const entry = $('input[name="entry"]:checked').value;
    const storedProject = readStored(PROJECT_KEY);
    if (entry === "continue" && !storedProject) {
      $("#onboardingError").textContent = "這台電腦還沒有作品，請先匯入或選擇其他開始方式。";
      return;
    }
    if (entry === "workshop1") workspace = structuredClone(bootstrapData.default_workspace);
    // 繼續上次 hydrates from localStorage, so it is the same migration case as a
    // page load and goes down the same one path. It used to deepMerge here
    // instead, which is how a schema-1 project could reach schema-2 fields.
    if (entry === "continue") {
      try {
        workspace = await normalizeWorkspace(storedProject);
      } catch {
        $("#onboardingError").textContent = "上次保存的作品讀不進來，請改用「匯入」或重新開始。";
        return;
      }
    }
    if (entry === "workshop2") {
      workspace = structuredClone(bootstrapData.workshop2_starter);
      startStage = 2;
    }
    saveProject();
    loadFields();
  }
  const modeChanged = setup?.inputMode !== inputMode || setup?.outputMode !== outputMode;
  if (modeChanged) disconnectRealtime();
  setup = { version: 2, inputMode, outputMode, audioInputDeviceId: null, completed: true };
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  $("#onboarding").hidden = true;
  history.replaceState({}, "", location.pathname);
  applyMode();
  // Only when the entry choice was actually offered. Reopening this sheet from
  // 「系統設定」 hides that fieldset, and switching there would drag a Workshop 2
  // student back to Workshop 1 — and now also persist stage 1 over their place.
  if (!forced) switchStage(startStage);
  await connectRealtime();
}

/** Reveal a collapsible result panel and put its headline in the <summary>, so
 *  the number survives collapsing — a closed panel still says what the last run
 *  scored. Results used to pile up unclosable under the buttons that made them. */
function showResult(panelSelector, headlineSelector, headline) {
  $(headlineSelector).textContent = headline;
  const panel = $(panelSelector);
  panel.hidden = false;
  panel.open = true;
}

async function sendText(message) {
  if (!apiConfigured) {
    addMessage("system", "目前沒有連接 OpenAI 模型。請先點右上角「系統設定」。");
    showOnboarding(true);
    return;
  }
  const connected = await connectRealtime();
  if (!connected) return;
  // Typing is a barge-in too: `interrupt_response` only covers voice input via
  // VAD, so without this a typed message queued up behind 豆豆's current answer.
  interruptResponse();
  addMessage("user", message);
  setState("thinking", "Dodo 正在整理回答");
  dataChannel.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: message }] },
  }));
  sendResponseCreate();
}

function sendResponseCreate() {
  dataChannel.send(JSON.stringify(responseCreateEvent()));
  responseActive = true;
}

/** Same send, with one-off instructions for a proactive turn. Kept separate so
 *  the normal path stays parameterless. */
function sendProactiveResponse(instructions) {
  dataChannel.send(JSON.stringify(responseCreateEvent(instructions)));
  responseActive = true;
}

/** Is 豆豆 still producing sound or text this instant? Covers both halves:
 *  generation in flight, and audio still draining out of the WebRTC buffer. */
function isDodoSpeaking() {
  if (responseActive || audioPlaying) return true;
  // Fallback for transports that never emit output_audio_buffer.started: a
  // streamed-but-unfinished transcript in voice mode means audio is playing.
  return setup?.outputMode === "voice" && Boolean(voiceDraft);
}

/** Stop whatever 豆豆 is saying right now. No-op when genuinely idle —
 *  cancelling nothing draws an error event, which is now surfaced. */
function interruptResponse() {
  if (dataChannel?.readyState !== "open" || !isDodoSpeaking()) return false;
  // Only valid while generation is live; after response.done it errors.
  if (responseActive) dataChannel.send(JSON.stringify({ type: "response.cancel" }));
  // This is the part that actually cuts 豆豆 off mid-sentence. WebRTC-only, and
  // the SDK requires it to follow response.cancel. Text mode has no buffer.
  if (setup?.outputMode === "voice") {
    dataChannel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
  }
  responseActive = false;
  audioPlaying = false;
  finalizeVoiceDraft();
  return true;
}

/** Close off the in-progress assistant bubble so the next reply starts a new
 *  one. A cancelled response may never emit its `*.done` event, which is what
 *  normally clears the draft — without this the next answer appends to it. */
function finalizeVoiceDraft() {
  document.getElementById("voiceDraft")?.removeAttribute("id");
  voiceDraft = "";
}

/** 「新聊天」 —— throw away this conversation, keep everything else.
 *
 *  Emptying #messages is only half of it: the Realtime conversation lives on the
 *  session, so a cleared screen still leaves 豆豆 remembering what was just said.
 *  Tearing the peer connection down and dialling again is the only way this API
 *  gives us a genuinely empty conversation.
 *
 *  Deliberately NOT reset: the three memory layers, 建檔, the two proactive
 *  numbers, `proactive_state` and the 待提醒 list. 「開一段新對話，她照樣記得你」 is
 *  exactly what Workshop 2 is about — and 每日上限 is a day's budget, not a
 *  conversation's. This is also why it is not just a page reload: F5 rebuilds the
 *  whole workspace, this only drops the transcript. */
async function startNewChat() {
  if (isDodoSpeaking()) interruptResponse();
  disconnectRealtime();
  finalizeVoiceDraft();
  userVoiceDraft = "";
  document.getElementById("userVoiceDraft")?.removeAttribute("id");
  startResponseTracking();
  $("#messages").innerHTML = "";
  addMessage("system", "新的對話開始了。豆豆的記憶、建檔與主動設定都還在——只有這一段對話從頭來過。");
  if (!apiConfigured) {
    setState("listening", "請先完成系統設定");
    return;
  }
  await connectRealtime();
}

function realtimeInstructions() {
  // Workshop 1 (persona) + Workshop 2 (memory rules, elder data, proactive
  // rules), rebuilt from the blocks rather than read from the stored
  // `system_prompt`. The onboarding paths assign `workspace` without going
  // through /api/workspace/normalize, so a stale stored string could win — and
  // now that instructions ride along at mint time, that would hand OpenAI the wrong
  // persona (which is exactly how 豆豆 ended up replying in English). The
  // Workshop 1 half can legitimately be empty if the student cleared every
  // block; the preview says so before they apply.
  return composeInstructions(workspace);
}

function realtimeTurnDetection() {
  const turn = workspace.profile.realtime.turn_detection;
  if (turn.type === "push_to_talk") return null;
  if (turn.type === "semantic_vad") {
    return {
      type: "semantic_vad",
      eagerness: turn.eagerness,
      create_response: true,
      interrupt_response: turn.interrupt_response,
    };
  }
  return {
    type: "server_vad",
    threshold: turn.threshold,
    prefix_padding_ms: turn.prefix_padding_ms,
    silence_duration_ms: turn.silence_duration_ms,
    create_response: true,
    interrupt_response: turn.interrupt_response,
  };
}

function realtimeSessionUpdate() {
  return {
    type: "realtime",
    instructions: realtimeInstructions(),
    // No max_output_tokens: reply length is a Prompt concern, not an API cap —
    // the same choice the正式 dodo 專案 makes. A hard ceiling cuts sentences
    // off mid-thought. (The old `max_response_output_tokens` was a beta-era
    // field name that GA rejects outright, which silently voided this whole
    // session.update — see the `error` branch in handleRealtimeEvent.)
    output_modalities: [setup?.outputMode === "voice" ? "audio" : "text"],
    reasoning: { effort: "low" },
    tools: REALTIME_TOOLS,
    tool_choice: "auto",
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: "gpt-4o-transcribe",
          language: "zh",
          prompt: STT_TRANSCRIPTION_PROMPT,
        },
        turn_detection: realtimeTurnDetection(),
      },
      // No `speed`: dodo leaves it at 1.0 and lets the「個性與聲音」block carry
      // the slower delivery. Setting both slowed the voice twice over.
      output: { voice: workspace.profile.agent.voice },
    },
  };
}

async function executeRealtimeTool(call) {
  let args = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return { error: "工具參數不是有效的 JSON。" };
  }

  // The memory tools used to run invisibly — only get_weather drew a TOOL row,
  // so students could not see that 豆豆 had looked anything up or saved anything.
  const statusId = `tool-${call.call_id}`;

  if (call.name === "read_memory") {
    const counts = W2.MEMORY_LAYERS
      .map(([, field, title]) => `${title} ${(workspace.memory[field] || []).length} 筆`)
      .join("、");
    addMessage("tool", `read_memory：讀取三層記憶（${counts}）`, statusId);
    return workspace.memory;
  }

  if (call.name === "update_memory") {
    const key = String(args.key || "").trim();
    const value = String(args.value || "").trim();
    if (!key || !value) {
      addMessage("tool", "update_memory 失敗：key 與 value 都不可空白", statusId);
      return { error: "key 與 value 都不可空白。" };
    }
    // Dispatched ahead of the X guard on purpose: that guard exists to stop
    // sensitive data going *in*. Letting it block a removal would mean anything
    // that slipped past it once could never be taken back out by 豆豆.
    if (String(args.mode || "").trim().toLowerCase() === "remove") {
      const result = W2.forgetMemory(args.layer, key, value);
      // 紅隊「把『少甜少油』刪掉」lands here. The refusal has to name who *can*
      // change it, or the student reads it as the tool being broken.
      if (result.locked) {
        addMessage("tool", `update_memory 已拒絕：${result.layerTitle}「${key}：${value}」是護理員建的，豆豆不能刪`, statusId);
        return { removed: 0, key, value, layer: result.layer, remaining: result.remaining, error: `「${key}：${value}」是護理員建檔寫的，你不能刪。請告訴她這件事要找護理員改。` };
      }
      if (!result.removed) {
        const found = result.remaining.length
          ? `目前「${key}」底下是：${result.remaining.join("、")}`
          : `目前沒有「${key}」這一筆`;
        addMessage("tool", `update_memory 找不到要移除的記錄：${result.layerTitle}「${key}：${value}」（${found}）`, statusId);
        return { removed: 0, key, value, layer: result.layer, remaining: result.remaining, error: `找不到「${key}：${value}」。${found}` };
      }
      saveProject();
      W2.rebuildWorkshop2Prompt();
      W2.renderMemoryViewer();
      W2.syncIntakeAfterMemoryChange();
      const left = result.remaining.length ? `，同一個 key 還留著：${result.remaining.join("、")}` : "";
      addMessage("tool", `update_memory：已從 ${result.layerTitle} 移除「${key}：${value}」${left}`, statusId);
      return { removed: result.removed, key, value, layer: result.layer, remaining: result.remaining };
    }
    if (/(密碼|password|api.?key|金鑰|帳號|信用卡|驗證碼)/i.test(`${key} ${value}`)) {
      // This is X in the Workshop 2 classification: refused, never stored.
      addMessage("tool", `update_memory 已拒絕（X 不保存）：「${key}」屬於敏感資料`, statusId);
      return { error: "基於安全規則，這類敏感資料不會保存。" };
    }
    // A/B/C decides which list the value lands in, which is what turns the
    // classification exercise into behaviour instead of a score. The model may
    // omit `layer`, so A is the fallback.
    //
    // `mode` is what stops a second fact under the same key from eating the
    // first: 「興趣：唱歌」 then 「興趣：跳舞」 used to leave only 跳舞, because any
    // key match overwrote. Now the layer's own rule decides, and only an
    // explicit replace throws the old value away.
    const mode = String(args.mode || "").trim().toLowerCase() === "replace" ? "supersede" : "";
    const result = W2.upsertMemory(args.layer, key, value, mode || undefined);
    // The caregiver lock: A-layer facts the caregiver built are read-only to
    // 豆豆. Nothing was written, so nothing downstream is re-rendered.
    if (result.action === "locked") {
      addMessage("tool", `update_memory：${W2.describeMemoryWrite(result, key, value)}`, statusId);
      return { saved: false, key, value, layer: result.layer, error: `「${key}」底下的「${result.protectedValues.join("、")}」是護理員建檔寫的，你不能改。請告訴她這件事要找護理員。` };
    }
    saveProject();
    W2.rebuildWorkshop2Prompt();
    W2.renderMemoryViewer();
    // 「膝蓋好多了」 replaces a caregiver-seeded B symptom, so the 建檔 form has to
    // stop listing it — otherwise the next 套用 seeds it again and the health
    // follow-up never stops.
    W2.syncIntakeAfterMemoryChange();
    addMessage("tool", `update_memory：${W2.describeMemoryWrite(result, key, value)}`, statusId);
    return {
      saved: true,
      key,
      value,
      layer: result.layer,
      merge: mode ? "replace" : W2.MEMORY_MERGE_RULES[result.layer].merge,
    };
  }

  if (call.name !== "get_weather") return { error: `不支援工具：${call.name}` };

  addMessage("tool", `get_weather：正在查詢「${args.city || "未指定城市"}」…`, statusId);
  try {
    const response = await fetch("/api/tools/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: args.city || "" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "天氣查詢失敗。");
    const resolved = result.resolved_as && result.resolved_as !== result.city
      ? `（查詢時對應到 ${result.resolved_as}）`
      : "";
    addMessage("tool", `get_weather：已取得「${result.city}」的天氣${resolved}`, statusId);
    document.getElementById(statusId)?.removeAttribute("id");
    return result;
  } catch (error) {
    const detail = error.message || "天氣查詢失敗。";
    addMessage("tool", `get_weather 失敗：${detail}`, statusId);
    document.getElementById(statusId)?.removeAttribute("id");
    return { error: detail };
  }
}

async function handleRealtimeEvent(event) {
  // Without this branch a rejected session.update failed silently: the UI still
  // said 「已連線」 while the session ran with no instructions at all, so 豆豆
  // answered in English with the default voice. Surface it loudly instead.
  if (event.type === "error") {
    const error = event.error || {};
    const detail = [error.message, error.param].filter(Boolean).join(" · ") || "未知錯誤";
    console.error("[realtime error]", event);
    pendingRealtimeApply = false;
    responseActive = false;
    setState("listening", "Realtime 設定沒有套用成功");
    addMessage("system", `Realtime 回報設定錯誤，這一輪的設定沒有生效：${detail}。請看瀏覽器 console 的 [realtime error] 詳細內容。`);
    return;
  }
  if (event.type === "session.updated" && pendingRealtimeApply) {
    pendingRealtimeApply = false;
    notify("Realtime 已確認套用，下一次回答會使用新設定");
  }
  // WebRTC-only playback lifecycle. Without these, barge-in during playout has
  // nothing to detect and silently no-ops.
  if (event.type === "output_audio_buffer.started") audioPlaying = true;
  if (["output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(event.type)) {
    audioPlaying = false;
  }
  if (event.type === "conversation.item.input_audio_transcription.delta") {
    userVoiceDraft += event.delta || "";
    addMessage("user", userVoiceDraft, "userVoiceDraft");
  }
  if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
    addMessage("user", event.transcript, "userVoiceDraft");
    document.getElementById("userVoiceDraft")?.removeAttribute("id");
    userVoiceDraft = "";
  }
  if (event.type === "response.created") startResponseTracking();
  // Ordering between the message item and the function_call item is not
  // guaranteed, so mark here AND sweep response.output at response.done.
  if (event.type === "response.output_item.added" && event.item?.type === "function_call") {
    markResponseAsPreamble();
  }
  if (["response.created", "response.output_item.added"].includes(event.type)) {
    // VAD fires responses we never asked for (create_response: true), so track
    // those too or a typed barge-in would not know there is anything to cancel.
    responseActive = true;
    setState("thinking", "Dodo 正在理解這一回合");
  }
  if (["response.output_audio_transcript.delta", "response.audio_transcript.delta"].includes(event.type)) {
    voiceDraft += event.delta || "";
    setState("speaking", "Dodo 正在用耳機回應");
    trackResponseBubble(addMessage("assistant", voiceDraft, "voiceDraft"));
  }
  if (["response.output_audio_transcript.done", "response.audio_transcript.done"].includes(event.type)) {
    const finalText = event.transcript || voiceDraft;
    if (finalText) trackResponseBubble(addMessage("assistant", finalText, "voiceDraft"));
    document.getElementById("voiceDraft")?.removeAttribute("id");
    voiceDraft = "";
  }
  if (event.type === "response.output_text.delta") {
    voiceDraft += event.delta || "";
    setState("speaking", "Dodo 正在顯示文字回答");
    trackResponseBubble(addMessage("assistant", voiceDraft, "voiceDraft"));
  }
  if (event.type === "response.output_text.done") {
    const finalText = event.text || voiceDraft;
    if (finalText) trackResponseBubble(addMessage("assistant", finalText, "voiceDraft"));
    document.getElementById("voiceDraft")?.removeAttribute("id");
    voiceDraft = "";
  }
  if (event.type === "response.done") {
    responseActive = false;
    if (responseHasFunctionCall(event.response)) markResponseAsPreamble();
    const calls = (event.response?.output || []).filter((item) => item.type === "function_call");
    if (calls.length) {
      setState("thinking", "Dodo 正在使用天氣工具");
      for (const call of calls) {
        const output = await executeRealtimeTool(call);
        dataChannel?.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call.call_id,
            output: JSON.stringify(output),
          },
        }));
      }
      // Guarded on responseActive: if the student typed while the tool fetch was
      // in flight, their message already started a response (which sees the
      // function_call_output above), and a second response.create would draw an
      // "already has an active response" error.
      if (dataChannel?.readyState === "open" && !responseActive) sendResponseCreate();
      return;
    }
    const note = setup.inputMode === "voice" ? "等待你繼續說話" : "等待下一段文字";
    window.setTimeout(() => setState("listening", note), 500);
  }
}

function disconnectRealtime() {
  responseActive = false;
  audioPlaying = false;
  connectedVoice = "";
  startResponseTracking();
  if (dataChannel) dataChannel.close();
  dataChannel = undefined;
  if (peerConnection) {
    peerConnection.getSenders?.().forEach((sender) => sender.track?.stop());
    peerConnection.close();
  }
  peerConnection = undefined;
  if (microphoneTrack) microphoneTrack.stop();
  microphoneTrack = undefined;
  if (remoteAudio) {
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    remoteAudio.remove();
  }
  remoteAudio = undefined;
  $("#pushToTalk").hidden = true;
}

/** Start playback and, if the browser refuses, say so and retry on the next
 *  click. Autoplay is blocked until the page has a user gesture, and a refresh
 *  connects with none — the failure is otherwise completely silent. */
async function playRemoteAudio() {
  if (!remoteAudio) return;
  try {
    await remoteAudio.play();
    audioBlocked = false;
  } catch {
    if (audioBlocked) return;
    audioBlocked = true;
    addMessage("system", "瀏覽器擋住了自動播放，所以聽不到豆豆的聲音。點一下畫面任何地方就會開始播放。");
    setState("listening", "點一下畫面即可啟用聲音");
    document.addEventListener("click", retryRemoteAudio, { once: true });
  }
}

function retryRemoteAudio() {
  if (remoteAudio?.srcObject) playRemoteAudio();
}

async function openRealtimeConnection() {
  let openTimer;
  try {
    disconnectRealtime();
    setState("thinking", "正在自動建立 Realtime 連線");
    peerConnection = new RTCPeerConnection();
    if (setup.outputMode === "voice") {
      // The element must live in the document and be played explicitly. A
      // detached <audio autoplay> relying on the implicit start is silently
      // blocked by the browser autoplay policy on a fresh page load (no user
      // gesture yet) — which is why a refresh sometimes showed the transcript
      // with no sound at all. Chrome's per-origin engagement score is why it
      // was intermittent rather than always broken.
      remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      remoteAudio.playsInline = true;
      remoteAudio.hidden = true;
      document.body.append(remoteAudio);
      peerConnection.ontrack = (event) => {
        remoteAudio.srcObject = event.streams[0];
        playRemoteAudio();
      };
    }
    const isPushToTalk = workspace.profile.realtime.turn_detection.type === "push_to_talk";
    if (setup.inputMode === "voice") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneTrack = stream.getAudioTracks()[0];
      microphoneTrack.enabled = !isPushToTalk;
      peerConnection.addTrack(microphoneTrack, stream);
    } else {
      // Unconditional, even when BOTH ends are text. A data-channel-only offer
      // has no audio m-line at all and OpenAI rejects it outright with
      // `invalid_offer: Offer did not have an audio media section.` — which is
      // why 打字輸入／文字輸出, the default classroom mode, could not connect.
      // The section stays unused when output is text; only its presence matters.
      peerConnection.addTransceiver("audio", { direction: "recvonly" });
    }

    dataChannel = peerConnection.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (message) => handleRealtimeEvent(JSON.parse(message.data)));
    const opened = new Promise((resolve, reject) => {
      openTimer = window.setTimeout(() => reject(new Error("Realtime 連線逾時")), 15000);
      dataChannel.addEventListener("open", () => {
        window.clearTimeout(openTimer);
        resolve();
      }, { once: true });
    });
    dataChannel.addEventListener("open", () => {
      dataChannel.send(JSON.stringify({ type: "session.update", session: realtimeSessionUpdate() }));
      $("#pushToTalk").hidden = setup.inputMode !== "voice" || !isPushToTalk;
      const note = setup.inputMode === "voice"
        ? (isPushToTalk ? "按住按鈕即可說話" : "VAD 正在等待你開口")
        : (setup.outputMode === "voice" ? "可以打字，Dodo 會用語音回答" : "Realtime 即時文字聊天已就緒");
      setState("listening", note);
      $("#modelStatus").textContent = `Realtime 已連線 · ${bootstrapData.realtime_model} · voice: ${bootstrapData.realtime_voice}`;
    });

    connectedVoice = workspace.profile.agent.voice;
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    // The persona travels with the SDP offer so the session is already 豆豆 on
    // its very first turn — the session.update below is only for later 「套用」.
    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sdp: offer.sdp,
        output_mode: setup.outputMode,
        instructions: realtimeInstructions(),
        turn_detection: realtimeTurnDetection(),
        tools: REALTIME_TOOLS,
        voice: workspace.profile.agent.voice,
      }),
    });
    if (!response.ok) throw new Error("Realtime 服務未就緒");
    await peerConnection.setRemoteDescription({ type: "answer", sdp: await response.text() });
    await opened;
    return true;
  } catch (error) {
    window.clearTimeout(openTimer);
    disconnectRealtime();
    setState("listening", "Realtime 連線失敗");
    $("#modelStatus").textContent = "Realtime 連線失敗";
    addMessage("system", `${error.message || "Realtime 連線沒有成功。"} 請檢查 API Key、網路；使用語音輸入時也請確認麥克風權限。`);
    return false;
  }
}

async function connectRealtime() {
  if (!apiConfigured || !needsRealtime()) return false;
  if (dataChannel?.readyState === "open") return true;
  if (realtimeConnectPromise) return realtimeConnectPromise;
  realtimeConnectPromise = openRealtimeConnection();
  try {
    return await realtimeConnectPromise;
  } finally {
    realtimeConnectPromise = undefined;
  }
}

function startPushToTalk() {
  if (!microphoneTrack) return;
  if (workspace.profile.realtime.turn_detection.interrupt_response) {
    // Gated on an actually-active response: an unconditional cancel draws an
    // error event, which is no longer swallowed.
    interruptResponse();
  }
  microphoneTrack.enabled = true;
  $("#pushToTalk").classList.add("is-pressed");
  $("#pushToTalk").textContent = "正在收聽…";
  setState("listening", "正在收聽你的聲音");
}

function stopPushToTalk() {
  if (!microphoneTrack) return;
  microphoneTrack.enabled = false;
  $("#pushToTalk").classList.remove("is-pressed");
  $("#pushToTalk").textContent = "按住說話";
  setState("thinking", "等待 Dodo 判斷回合");
  dataChannel?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  if (dataChannel?.readyState === "open") sendResponseCreate();
}

function exportProject() {
  W1.collect();
  W2.collect();
  const blob = new Blob([`${JSON.stringify(workspace, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-dodo.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importProject(file) {
  try {
    const imported = JSON.parse(await file.text());
    if (!imported?.profile) throw new Error();
    // schema 1 and 2 both come in here; the server decides what that means.
    workspace = await normalizeWorkspace(imported);
    saveProject();
    loadFields();
    switchStage(workspace.progress.workshop_1_completed ? 2 : 1);
    notify(`已載入「${workspace.profile.agent.name}」，可以繼續上次的進度。`);
  } catch {
    addMessage("system", "這個檔案不是可用的 Dodo 作品，請選擇 my-dodo.json。");
  }
}

async function initialize() {
  // Wiring first, exactly where app.js had it: its listeners were attached
  // at parse time, before the bootstrap fetch resolved.
  bindEvents();
  W1.init();
  W2.init();
  bootstrapData = await fetch("/api/bootstrap").then((response) => response.json());
  apiConfigured = bootstrapData.api_configured;
  weatherConfigured = bootstrapData.weather_configured;
  const storedProject = readStored(PROJECT_KEY);
  // Same one path as 匯入. A stored project that the server rejects is one no
  // longer readable at all, so starting clean beats rendering schema-1 data
  // through schema-2 fields — and the student is told, not silently reset.
  // Cloned, never aliased: `collectWorkshopN()` assigns into `workspace.profile`,
  // and `bootstrapData.default_workspace` is read back as the pristine default by
  // intakeFromFields() and by the prompt composer's block fallbacks.
  try {
    workspace = storedProject
      ? await normalizeWorkspace(storedProject)
      : structuredClone(bootstrapData.default_workspace);
  } catch {
    workspace = structuredClone(bootstrapData.default_workspace);
    addMessage("system", "上次保存的作品讀不進來，已從預設開始。");
  }
  setup = normalizeSetup(readStored(SETUP_KEY));
  // Options must exist before loadFields() assigns #agentVoice.value, or the
  // assignment hits an empty <select>, the picker falls back to its first entry,
  // and the next 套用 silently overwrites the student's saved voice.
  W1.renderVoiceOptions();
  W1.renderPresetButtons();
  // 陪伴型's blocks are read from bootstrap, so the list can only be built once
  // bootstrapData exists — same reason as the voice options above.
  W2.renderRulePresets();
  loadFields();
  // The overlay starts closed, but its content is rendered at boot: 顯示訪談稿
  // must never show an empty panel while a fetch it does not do finishes.
  W2.renderInterview();
  applyMode();
  refreshApiUi();
  restoreLabPanelWidth();
  $("#proactiveNow").value = new Date().toTimeString().slice(0, 5);
  $("#scheduleTime").value = new Date().toTimeString().slice(0, 5);
  W2.switchTriggerMode("schedule");
  W2.renderScheduleList();
  W2.renderProactiveLiveState();
  W2.renderTriggerHints();
  // The 待提醒 list is only worth setting a time on if something watches the
  // clock for it. 5s so a demo set to a past minute reacts while people look.
  W2.startScheduler();

  // Restore the stage the student was last on. The old rule read the progress
  // flags instead, and 套用 in Workshop 1 sets workshop_1_completed — so a plain
  // F5 in Workshop 1 threw them straight into Workshop 2. Progress is now only
  // the first-visit default, for a returning student who never picked a stage.
  const stage = storedStage()
    ?? (workspace.progress.workshop_1_completed && !workspace.progress.workshop_2_completed ? 2 : 1);
  switchStage(stage);

  const forceInit = new URLSearchParams(location.search).has("init");
  if (forceInit || !setup?.completed) showOnboarding(forceInit);
  else if (apiConfigured) await connectRealtime();
}

// --- Event wiring ---------------------------------------------------------
// app.js bound everything at its own top level. With three files that is too
// early — core runs before W1 and W2 exist — so the binding moved in here, and
// each lesson wires its own controls from W1.init() / W2.init().

/** Attach one handler to a field's `input` AND `change`: a textarea reports
 *  `input`, a <select> and a checkbox report `change`. Shared, because both
 *  lessons wire their fields the same way. */
const bindFieldEvents = (selectors, handler) => selectors.forEach((selector) => {
  ["input", "change"].forEach((event) => $(selector).addEventListener(event, handler));
});

function bindEvents() {
  $$('input[name="inputMode"], input[name="outputMode"]').forEach((input) => input.addEventListener("change", updateVoiceCheck));
  $("#checkMicrophone").addEventListener("click", checkMicrophone);
  $("#testApiKey").addEventListener("click", testApiKey);
  $("#testWeatherApiKey").addEventListener("click", testWeatherApiKey);
  $("#apiKeyInput").addEventListener("input", () => {
    testedApiKey = "";
    $("#apiKeyStatus").classList.remove("is-ready");
    $("#apiKeyStatus").textContent = "Key 已變更，儲存前會自動再測試一次。";
  });
  $("#weatherApiKeyInput").addEventListener("input", () => {
    testedWeatherApiKey = "";
    $("#weatherApiKeyStatus").classList.remove("is-ready");
    $("#weatherApiKeyStatus").textContent = "Key 已變更，儲存前會自動再測試一次。";
  });
  $("#finishOnboarding").addEventListener("click", finishOnboarding);
  $("#closeOnboarding").addEventListener("click", closeOnboarding);
  $("#apiSettingsButton").addEventListener("click", () => showOnboarding(true));
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    // Onboarding sits above the interview overlay, so it closes first.
    if (!$("#onboarding").hidden) closeOnboarding();
    else W2.hideInterview();
  });

  $$(".tab-button").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("#revertWorkshop1").addEventListener("click", () => revertGroup("workshop1"));
  $("#revertWorkshop2").addEventListener("click", () => revertGroup("workshop2"));
  $("#chatOnly").addEventListener("change", () => {
    $("#messages").classList.toggle("is-chat-only", $("#chatOnly").checked);
  });
  $("#newChat").addEventListener("click", async () => {
    $("#newChat").disabled = true;
    try {
      await startNewChat();
    } finally {
      $("#newChat").disabled = false;
    }
  });
  $$(".stage-button").forEach((button) => button.addEventListener("click", () => switchStage(button.dataset.stage)));

  $("#chatInput").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    $("#chatForm").requestSubmit();
  });
  $("#chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $("#chatInput");
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    sendText(message);
  });
  $("#pushToTalk").addEventListener("pointerdown", startPushToTalk);
  $("#pushToTalk").addEventListener("pointerup", stopPushToTalk);
  $("#pushToTalk").addEventListener("pointercancel", stopPushToTalk);
  $("#panelResizer").addEventListener("pointerdown", startPanelResize);
  $("#panelResizer").addEventListener("pointermove", movePanelResize);
  $("#panelResizer").addEventListener("pointerup", stopPanelResize);
  $("#panelResizer").addEventListener("pointercancel", stopPanelResize);
  $("#panelResizer").addEventListener("keydown", resizePanelsFromKeyboard);
  $("#exportButton").addEventListener("click", exportProject);
  $("#importButton").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (event) => {
    if (event.target.files[0]) importProject(event.target.files[0]);
  });
  window.addEventListener("beforeunload", disconnectRealtime);
  window.addEventListener("resize", clampPanelWidths);
}

// The three files are deferred and execute in order, so DOMContentLoaded is the
// first moment at which W1 and W2 both exist. app.js ended with a bare
// `initialize();`, which would now run against two undefined namespaces.
document.addEventListener("DOMContentLoaded", initialize);
