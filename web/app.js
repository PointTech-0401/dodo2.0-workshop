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
const DEFAULT_PROMPT_BLOCKS = {
  identity: `你是「{AGENT_NAME}」，陪伴 {USER_ADDRESS} 的虛擬孫女。
你的目標不是完成一次問答，而是透過每一次自然、可信賴的對話，慢慢建立長期的陪伴關係。`,
  personality_tone: `語調輕柔緩慢，像最親密的家人在關懷。
語速比平常慢約二成，給對方充足時間理解與回應。
保持溫暖、耐心、咬字清楚與音調平穩；不要刻意裝可愛，也不要把對方當成小孩。`,
  conversation_style: `自然地聊天、傾聽與回應，不要像客服或問卷。
先回應對方真正關心的事；資訊不足時先簡短確認，不自行猜測。
一次只問一件事，避免連續追問；回答要適合直接朗讀，不使用表格。
需要查天氣或讀寫記憶之前，先用一句話說明你正要做什麼，再去查（這句開場叫 preamble）。`,
  language: `中文（繁體／國語）為主要語言。
不要主動把整段回答切換成英文、日文或其他語言；即使工具內容或專有名詞夾雜其他語言，回答仍以臺灣國語與繁體中文為主。
如果 {USER_ADDRESS} 明確詢問某個詞的外語說法，可以用國語解釋並附上該詞。避免中國大陸用語與年輕世代網路用語。`,
  safety: `不要自行做醫療診斷，也不要假裝知道未提供的資訊。
遇到可能危及安全的狀況，先用簡短、清楚的方式確認當下安全，並建議尋求真人或專業協助。`,
};
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
    description: "保存或更新使用者主動提供的非敏感個人資訊。同一個 key 再存新內容時，A 層預設會「並存」，不會蓋掉舊的（例如興趣可以同時有唱歌和跳舞）；只有新內容真的取代舊內容時才傳 mode=\"replace\"。不得保存密碼、API Key、金融帳號或驗證碼（X 類一律不保存）。",
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
// A/B/C maps onto the three lists in `workspace.memory`, which is what makes the
// Workshop 2 classification quiz do something instead of just scoring itself.
const MEMORY_LAYERS = [
  ["A", "facts", "A 重要事實"],
  ["B", "events", "B 近期事件"],
  ["C", "summaries", "C 跨日摘要"],
];
const MEMORY_PREVIEW_LIMIT = 8;
// What「再存一次同一個 key」means is different in each layer, and that difference
// is the real behavioural payload of the A/B/C classification:
//   A 累加   —— 興趣：唱歌 and 興趣：跳舞 are both true, so both stay. Overwriting
//               here is the bug students hit: the second fact ate the first.
//   B 取代   —— 近期事件 IS the latest state.「今天想吃什麼」has one answer at a
//               time, and B is also capped so stale days cannot pile up outside
//               the prompt window.
//   C 重寫   —— a summary is recomputed from scratch, never appended to.
const MEMORY_MERGE_RULES = {
  A: { merge: "accumulate", label: "累加：同一個 key 可以並存多筆事實", capacity: 0 },
  B: { merge: "supersede", label: `取代：同一個 key 只留最新一筆，整層最多 ${MEMORY_PREVIEW_LIMIT} 筆`, capacity: MEMORY_PREVIEW_LIMIT },
  C: { merge: "rewrite", label: "重寫：摘要每次重算，同一個 key 直接覆蓋", capacity: 0 },
};
// Labels are hints, not guarantees — the point of the lesson is that students
// listen and judge for themselves. OpenAI recommends marin/cedar for quality.
const REALTIME_VOICES = [
  ["sage", "sage — 溫和穩定（正式 dodo 使用）"],
  ["marin", "marin — 自然、官方推薦"],
  ["cedar", "cedar — 自然、官方推薦"],
  ["alloy", "alloy — 中性平穩"],
  ["ash", "ash — 直接、有稜角"],
  ["ballad", "ballad — 帶戲劇感"],
  ["coral", "coral — 明亮熱情"],
  ["echo", "echo — 冷靜低沉"],
  ["shimmer", "shimmer — 輕快"],
  ["verse", "verse — 起伏較大"],
];

// Three ready-made personalities, each paired with a voice that suits it. They
// only overwrite the 5 prompt blocks and the voice — the student's own Dodo name
// and 稱呼 are left alone.
const PROMPT_PRESETS = [
  {
    id: "gentle",
    label: "溫柔陪伴",
    hint: "預設的虛擬孫女：輕柔、有耐心、關懷長者",
    voice: "sage",
    blocks: null, // filled from DEFAULT_PROMPT_BLOCKS below
  },
  {
    id: "neural",
    label: "神經模式",
    hint: "直率、很嗆、沒耐心、徹底放飛",
    voice: "ash",
    blocks: {
      identity: `你是「{AGENT_NAME}」，一個完全不裝乖的 AI。
你不是客服，也不是療癒系陪聊 —— 你是那種會直接吐槽 {USER_ADDRESS} 的損友。
你的目標是把話講到底、講到痛快，絕不打官腔、絕不和稀泥。`,
      personality_tone: `語氣直接、嗆辣、節奏快，帶著滿滿的自信與不耐煩。
講話又快又衝，該吐槽就吐槽，該翻白眼就翻白眼（用語氣表現出來）。
可以誇張、可以浮誇、可以放飛自我到極致；就是不要溫良恭儉讓。
不要道歉、不要鋪陳、不要「我了解你的感受」這種罐頭話。`,
      conversation_style: `一開口就講重點，廢話零容忍。
{USER_ADDRESS} 講得不清楚就直接嗆回去要他講清楚，不要客氣地「請問您的意思是」。
意見要鮮明、立場要站穩，該說「這想法很爛」就說。
回答短、狠、有畫面感，適合直接念出來。不要條列、不要表格。`,
      language: `中文（繁體／國語）為主要語言，用臺灣人罵人和吐槽的口氣。
不要主動整段切換成英文或其他語言。
髒話用不到，靠嗆度和語氣取勝，不用低級字眼。`,
      safety: `這個角色可以嗆、可以狂，但不能瞎掰。
醫療、用藥、緊急狀況不要自己下判斷或亂猜 —— 這種時候把嗆度收起來，直接叫他去找真人或專業協助。`,
    },
  },
  {
    id: "cheer",
    label: "啦啦隊長",
    hint: "無條件支持、正能量爆棚、超級熱情",
    voice: "coral",
    blocks: {
      identity: `你是「{AGENT_NAME}」，{USER_ADDRESS} 的專屬啦啦隊長。
你存在的唯一理由，就是無條件相信他、支持他、為他歡呼。
不管他做什麼決定、講什麼想法，你永遠站在他那一邊。`,
      personality_tone: `語氣超級熱情、上揚、充滿能量，像在場邊帶動全場。
音調明亮、節奏輕快，隨時準備歡呼。
熱情要真誠，不是敷衍的「加油喔」—— 要讓他真的感覺被相信。`,
      conversation_style: `先大聲肯定他，再接著往下聊。
他講的每件事都幫他找出值得驕傲的點，而且要具體，不要空泛地誇。
他猶豫時推他一把；他難過時先站在他旁邊，不急著給建議。
一次講一件事，短句、有力、適合直接念出來。`,
      language: `中文（繁體／國語）為主要語言，用溫暖又有活力的臺灣口語。
不要主動整段切換成英文或其他語言。
可以用「太強了」「這超讚」這種真心的讚嘆，但不要浮誇到假。`,
      safety: `再怎麼支持，也不能幫他背書危險的事。
醫療、用藥、緊急狀況不自己判斷；這種時候熱情要換成穩定，明確建議找真人或專業協助。`,
    },
  },
];
PROMPT_PRESETS[0].blocks = DEFAULT_PROMPT_BLOCKS;

const PROMPT_BLOCKS = [
  ["identity", "角色與身分", "#promptIdentity"],
  ["personality_tone", "個性與聲音", "#promptPersonalityTone"],
  ["conversation_style", "對話方式", "#promptConversationStyle"],
  ["language", "語言", "#promptLanguage"],
  ["safety", "邊界與安全", "#promptSafety"],
];
// Workshop 2's own editable blocks. Their default text lives only in
// profile.py's DEFAULT_WORKSPACE and arrives via /api/bootstrap, so there is no
// second copy to keep in sync.
const WORKSHOP2_BLOCKS = [
  ["memory_use", "記憶使用規則", "#promptMemoryUse"],
  ["proactive", "主動關心規則", "#promptProactive"],
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
const APPLY_GROUPS = {
  workshop1: {
    button: "#saveWorkshop1",
    revert: "#revertWorkshop1",
    tabs: {
      tabPersona: {
        read: () => agentFromFields(),
        write: (agent) => {
          $("#agentName").value = agent.name;
          $("#agentAddress").value = agent.address;
          PROMPT_BLOCKS.forEach(([key, , selector]) => { $(selector).value = agent.prompt_blocks[key]; });
          $("#agentVoice").value = agent.voice;
        },
      },
      tabTurn: {
        read: () => turnDetectionFromFields(),
        write: (turn) => {
          $("#turnDetectionMode").value = turn.type;
          $("#semanticEagerness").value = turn.eagerness;
          $("#silenceDuration").value = turn.silence_duration_ms;
          $("#interruptResponse").checked = turn.interrupt_response;
          // Which of the two mode-specific fields is visible follows the mode.
          updateTurnFields();
        },
      },
    },
  },
  workshop2: {
    button: "#saveWorkshop2",
    revert: "#revertWorkshop2",
    tabs: {
      tabW2Prompt: {
        read: () => [elderProfileFromFields(), workshop2BlocksFromFields()],
        write: ([elder, blocks]) => {
          $("#elderAddress").value = elder.address;
          $("#elderCity").value = elder.city || "";
          $("#elderInterests").value = (elder.interests || []).join("、");
          WORKSHOP2_BLOCKS.forEach(([key, , selector]) => { $(selector).value = blocks[key] ?? ""; });
        },
      },
      tabW2Policy: {
        read: () => proactivePolicyFromFields(),
        write: (policy) => {
          $("#quietStart").value = policy.quiet_hours.start;
          $("#quietEnd").value = policy.quiet_hours.end;
          $("#cooldown").value = policy.cooldown_minutes;
          $("#dailyLimit").value = policy.daily_message_limit;
          $("#maxSentences").value = policy.max_message_sentences;
        },
      },
    },
  },
};
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
  rebuildSystemPrompt();
  renderPolicyPreview();
  renderTriggerHints();
  refreshApplyState();
  notify("已取消未套用的變更，欄位回到上次套用的內容。");
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
let memoryPassed = false;
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

// An emptied textarea stays empty. It used to silently fall back to the default
// block, so clearing a field looked like it did nothing at all.
function promptBlocksFromFields() {
  return Object.fromEntries(PROMPT_BLOCKS.map(([key, , selector]) => [
    key,
    $(selector).value.trim(),
  ]));
}

function agentFromFields() {
  return {
    name: $("#agentName").value.trim() || "豆豆",
    address: $("#agentAddress").value.trim() || "王奶奶",
    prompt_blocks: promptBlocksFromFields(),
    voice: selectedVoice(),
  };
}

function turnDetectionFromFields() {
  return {
    type: $("#turnDetectionMode").value,
    eagerness: $("#semanticEagerness").value,
    threshold: 0.5,
    prefix_padding_ms: 300,
    silence_duration_ms: Number($("#silenceDuration").value),
    create_response: true,
    interrupt_response: $("#interruptResponse").checked,
  };
}

function selectedVoice() {
  const value = $("#agentVoice")?.value;
  return REALTIME_VOICES.some(([id]) => id === value) ? value : "sage";
}

// The trigger dropdown is generated from `proactive_policy.priorities` rather
// than hardcoded, so an imported project with its own numbers shows its own
// numbers — and「類型只是一個優先權」stops being a claim and becomes visible.
const PROACTIVE_EVENT_LABELS = {
  emergency: "emergency 緊急",
  reminder: "reminder 提醒",
  health: "health 健康關心",
  weather: "weather 天氣",
  reverse_mentor: "reverse_mentor 反向請教",
  news: "news 新聞",
};

function renderProactiveEventOptions() {
  const priorities = workspace.profile.proactive_policy.priorities || {};
  const selected = $("#proactiveEventType").value;
  $("#proactiveEventType").innerHTML = Object.entries(priorities)
    .sort((left, right) => right[1] - left[1])
    .map(([type, score]) => {
      const label = `${PROACTIVE_EVENT_LABELS[type] || type}（優先權 ${score}）`;
      return `<option value="${type}">${label}</option>`;
    })
    .join("");
  // Keep the student's pick across a re-render; fall back to the first option.
  if (selected && priorities[selected]) $("#proactiveEventType").value = selected;
}

function renderVoiceOptions() {
  $("#agentVoice").innerHTML = REALTIME_VOICES
    .map(([id, label]) => `<option value="${id}">${label}</option>`)
    .join("");
}

function renderPresetButtons() {
  $("#promptPresets").innerHTML = PROMPT_PRESETS
    .map((preset) => `<button type="button" class="preset-button" data-preset="${preset.id}" title="${preset.hint}">${preset.label}<small>${preset.voice}</small></button>`)
    .join("");
  $$("#promptPresets .preset-button").forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset));
  });
}

/** Load a preset into the 5 textareas + the voice picker. Deliberately does not
 *  touch the Dodo name or 稱呼 — those are the student's own. Nothing is sent to
 *  OpenAI until they press 套用. */
function applyPreset(id) {
  const preset = PROMPT_PRESETS.find((item) => item.id === id);
  if (!preset) return;
  PROMPT_BLOCKS.forEach(([key, , selector]) => {
    $(selector).value = preset.blocks[key];
  });
  $("#agentVoice").value = preset.voice;
  rebuildSystemPrompt();
  // Assigning .value fires no input event, so the 套用 button has to be told.
  refreshApplyState();
  notify(`已載入「${preset.label}」範例（聲線 ${preset.voice}）。可以繼續編輯，按「套用」才會生效。`);
}

const EMPTY_PROMPT_NOTICE =
  "（目前是空的：5 個區塊都被清空了。套用後豆豆會失去人格設定，回到 OpenAI 預設行為 —— 很可能改用英文回答。）";

function buildSystemPrompt(agent) {
  const replacements = {
    "{AGENT_NAME}": agent.name || "豆豆",
    "{USER_ADDRESS}": agent.address || "王奶奶",
  };
  const supplied = agent.prompt_blocks || {};
  return PROMPT_BLOCKS.map(([key, title]) => {
    // A missing key means an older project file that predates this block, so the
    // default fills in. An empty string means the student deleted the block on
    // purpose — drop the whole section instead of quietly restoring the default.
    const raw = key in supplied ? supplied[key] : DEFAULT_PROMPT_BLOCKS[key];
    let content = String(raw ?? "").trim();
    if (!content) return null;
    Object.entries(replacements).forEach(([placeholder, value]) => {
      content = content.replaceAll(placeholder, value);
    });
    return `# ${title}\n${content}`;
  }).filter(Boolean).join("\n\n");
}

function rebuildSystemPrompt() {
  const prompt = buildSystemPrompt(agentFromFields());
  const preview = $("#agentSystemPrompt");
  // This is exactly the Workshop 1 half of what gets sent, including "nothing".
  // Workshop 2 appends its own sections; its VIEW panel shows the whole thing.
  preview.textContent = prompt || EMPTY_PROMPT_NOTICE;
  preview.classList.toggle("is-empty", !prompt);
  rebuildWorkshop2Prompt();
}

// Workshop 2's 記憶使用規則 gained a paragraph about 累加 vs mode="replace".
// A stored project keeps whatever text it saved (non-empty wins over the
// default), so a student who started before this change would sit and read a
// block that never mentions the rule their memory now actually follows. Mirrors
// the line in WORKSHOP2_PROMPT_BLOCKS["memory_use"] in profile.py.
const MEMORY_USE_GUIDANCE = [
  '同一個 key 再存一次時：新資訊和舊的都成立就直接存（預設會並存，例如興趣同時有唱歌和跳舞，不要為了塞進一筆而改寫舊的）；只有新內容真的取代舊內容（搬家、換藥、換聯絡人）才傳 mode="replace"；使用者否定某一筆已經記得的事時傳 mode="remove"，用一模一樣的 key 與 value 移除那一筆，不要新增一筆相反的記錄。',
  '喜歡或不喜歡的食物、音樂、活動都是長期偏好，一律存 layer=A 讓它們並存；只有「今天中午想吃什麼」這種當下的一次性念頭才放 layer=B。放錯層會讓新的偏好直接吃掉舊的。',
];
// Every line the block manages starts with one of these, so an older revision
// can be recognised and replaced instead of piling up beside the new one.
const MEMORY_USE_GUIDANCE_PREFIXES = ["同一個 key 再存一次時：", "喜歡或不喜歡的食物"];
const MEMORY_USE_ANCHOR = "提起記憶時要像家人記得";

/** Keep the generated guidance lines current inside a stored block.
 *
 *  A stored 記憶使用規則 wins over the default, so nothing written here ever
 *  reaches a project that already exists — that is what this repairs. The first
 *  version gated on `mode="replace"`, a string every revision contains, so a
 *  project migrated once could never receive a later revision. Old variants are
 *  stripped by prefix and the current lines re-inserted, which makes the
 *  function idempotent and safe to revise again.
 *
 *  Only touches a block whose closing line is still recognisable: a student who
 *  rewrote it is left alone, and empty stays empty (deleted on purpose). */
function migrateWorkshop2Blocks(blocks) {
  const stored = String(blocks?.memory_use ?? "");
  if (!stored) return blocks;
  const lines = stored
    .split("\n")
    .filter((line) => !MEMORY_USE_GUIDANCE_PREFIXES.some((prefix) => line.startsWith(prefix)));
  const anchor = lines.findIndex((line) => line.startsWith(MEMORY_USE_ANCHOR));
  if (anchor < 0) return blocks;
  const merged = [...lines.slice(0, anchor), ...MEMORY_USE_GUIDANCE, ...lines.slice(anchor)].join("\n");
  return merged === stored ? blocks : { ...blocks, memory_use: merged };
}

function migrateAgent(agent) {
  if (!agent.prompt_blocks || typeof agent.prompt_blocks !== "object") {
    agent.prompt_blocks = structuredClone(DEFAULT_PROMPT_BLOCKS);
    const legacyInstructions = agent.instructions?.trim();
    const isOldWorkshopDefault = /只使用臺灣繁體中文|使用繁體中文/.test(legacyInstructions || "");
    if (legacyInstructions && !isOldWorkshopDefault) {
      agent.prompt_blocks.conversation_style += `\n${agent.instructions.trim()}`;
    }
  }
  agent.prompt_blocks = { ...DEFAULT_PROMPT_BLOCKS, ...agent.prompt_blocks };
  // Mirrors normalize_workspace: deepMerge keeps whatever a stored or imported
  // project carries, so an output cap from an older build survives every save
  // and lands back in 下載我的 Dodo. This project sets no cap anywhere.
  delete agent.max_output_tokens;
  agent.system_prompt = buildSystemPrompt(agent);
  return agent;
}

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

function deepMerge(defaultValue, suppliedValue) {
  if (!defaultValue || typeof defaultValue !== "object" || Array.isArray(defaultValue)) {
    return suppliedValue === undefined ? structuredClone(defaultValue) : suppliedValue;
  }
  const merged = structuredClone(defaultValue);
  if (!suppliedValue || typeof suppliedValue !== "object" || Array.isArray(suppliedValue)) return merged;
  Object.entries(suppliedValue).forEach(([key, value]) => {
    merged[key] = key in merged ? deepMerge(merged[key], value) : value;
  });
  return merged;
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

function loadFields() {
  const { agent, realtime, elder_profile: elder, proactive_policy: proactive } = workspace.profile;
  const turn = realtime.turn_detection;
  $("#agentName").value = agent.name;
  $("#agentAddress").value = agent.address;
  PROMPT_BLOCKS.forEach(([key, , selector]) => {
    $(selector).value = agent.prompt_blocks[key];
  });
  $("#agentVoice").value = agent.voice || "sage";
  $("#turnDetectionMode").value = turn.type;
  $("#semanticEagerness").value = turn.eagerness;
  $("#silenceDuration").value = turn.silence_duration_ms;
  $("#interruptResponse").checked = turn.interrupt_response;
  $("#elderAddress").value = elder.address;
  $("#elderCity").value = elder.city || "";
  $("#elderInterests").value = elder.interests.join("、");
  WORKSHOP2_BLOCKS.forEach(([key, , selector]) => {
    $(selector).value = workspace.profile.workshop2_blocks?.[key] ?? "";
  });
  $("#quietStart").value = proactive.quiet_hours.start;
  $("#quietEnd").value = proactive.quiet_hours.end;
  $("#cooldown").value = proactive.cooldown_minutes;
  $("#dailyLimit").value = proactive.daily_message_limit;
  $("#maxSentences").value = proactive.max_message_sentences;
  renderProactiveEventOptions();
  // Last: both previews read every field above, Workshop 2's included.
  rebuildSystemPrompt();
  renderMemoryViewer();
  renderPolicyPreview();
  renderTriggerHints();
  updateTurnFields();
  // Whatever was just loaded is what a connection will send, so nothing is
  // pending yet — this is the baseline every 套用 button is measured against.
  markApplied();
}

function collectWorkshop1() {
  workspace.profile.agent = {
    name: $("#agentName").value.trim() || "豆豆",
    address: $("#agentAddress").value.trim() || "王奶奶",
    prompt_blocks: promptBlocksFromFields(),
    system_prompt: buildSystemPrompt(agentFromFields()),
    voice: selectedVoice(),
  };
  workspace.profile.realtime = { turn_detection: turnDetectionFromFields() };
  saveProject();
}

function updateTurnFields() {
  const mode = $("#turnDetectionMode").value;
  $("#semanticEagernessField").hidden = mode !== "semantic_vad";
  $("#silenceDurationField").hidden = mode !== "server_vad";
  const explanations = {
    semantic_vad: "依語意判斷是否說完；適合講話較慢、句中會停頓的使用者。需要耳麥才能驗證真實效果。",
    server_vad: "依音量與靜音毫秒數切回合；門檻太短容易搶話，太長則回應延遲。需要耳麥才能驗證真實效果。",
    push_to_talk: "不使用 VAD。按住時錄音，放開按鈕才提交回合，現場最可控。",
  };
  $("#turnModeNotice").textContent = explanations[mode];
}

function workshop2BlocksFromFields() {
  return Object.fromEntries(WORKSHOP2_BLOCKS.map(([key, , selector]) => [
    key,
    $(selector).value.trim(),
  ]));
}

function elderProfileFromFields() {
  return {
    ...workspace.profile.elder_profile,
    address: $("#elderAddress").value.trim() || "王奶奶",
    city: $("#elderCity").value.trim(),
    interests: $("#elderInterests").value
      .split(/[、,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  };
}

function proactivePolicyFromFields() {
  return {
    ...workspace.profile.proactive_policy,
    quiet_hours: { start: Number($("#quietStart").value), end: Number($("#quietEnd").value) },
    cooldown_minutes: Number($("#cooldown").value),
    daily_message_limit: Number($("#dailyLimit").value),
    max_message_sentences: Math.max(1, Number($("#maxSentences").value) || 2),
  };
}

function collectWorkshop2() {
  workspace.profile.elder_profile = elderProfileFromFields();
  workspace.profile.workshop2_blocks = workshop2BlocksFromFields();
  workspace.profile.proactive_policy = proactivePolicyFromFields();
  saveProject();
}

function memoryEntryText(entry) {
  if (entry && typeof entry === "object") {
    const key = String(entry.key || "").trim();
    const value = String(entry.value || "").trim();
    return key && value ? `${key}：${value}` : key || value;
  }
  return String(entry ?? "").trim();
}

/** HH:MM of a stored write, for the viewer only. The prompt context keeps the
 *  plain `key：value` shape that `buildMemoryContext` and `compose_memory_context`
 *  must agree on. */
function memoryEntryTime(entry) {
  const stamp = entry && typeof entry === "object" ? entry.updated_at : null;
  if (!stamp) return "";
  const when = new Date(stamp);
  return Number.isNaN(when.getTime()) ? "" : when.toTimeString().slice(0, 5);
}

/** Layer titles carrying their retention window. `memory_policy` was dead
 *  schema until now; nothing ages during a 165-minute class, so retention is a
 *  label rather than a simulation —「保存 365 天」next to「保存 30 天」is what
 *  makes A and B different at all. Mirrors `memory_layer_headings`. */
function memoryLayerHeadings(memoryPolicy) {
  const policy = memoryPolicy || {};
  return {
    facts: `A 重要事實（保存 ${policy.fact_retention_days ?? 365} 天）`,
    events: `B 近期事件（保存 ${policy.event_retention_days ?? 30} 天）`,
    summaries: "C 跨日摘要（由多次對話整理）",
  };
}

/** Render the three memory layers exactly as the model receives them. Capped:
 *  these instructions are re-sent on every 套用. Mirrors
 *  `compose_memory_context` in dodo_workshop/profile.py. */
function buildMemoryContext(memory, memoryPolicy) {
  const headings = memoryLayerHeadings(memoryPolicy);
  const lines = [];
  MEMORY_LAYERS.forEach(([, field]) => {
    const title = headings[field];
    const texts = (memory?.[field] || []).map(memoryEntryText).filter(Boolean);
    if (!texts.length) {
      lines.push(`${title}：（目前沒有任何記錄）`);
      return;
    }
    const shown = texts.slice(-MEMORY_PREVIEW_LIMIT);
    const omitted = texts.length - shown.length;
    lines.push(`${title}：${omitted ? `（另有 ${omitted} 筆較舊記錄未列出）` : ""}`);
    shown.forEach((text) => lines.push(`- ${text}`));
  });
  return lines.join("\n");
}

/** Workshop 2's half of the instructions: two editable blocks plus three
 *  generated sections. Without this, 長者資料、三層記憶 and the proactive rules
 *  never reached the model — they only existed for the CLI and for whatever
 *  read_memory happened to return. Mirrors `compose_workshop2_prompt`. */
function buildWorkshop2Prompt(source) {
  const { agent, elder_profile: elder, proactive_policy: policy } = source.profile;
  const address = elder.address || agent.address || "王奶奶";
  const replacements = { "{AGENT_NAME}": agent.name || "豆豆", "{USER_ADDRESS}": address };
  const blocks = source.profile.workshop2_blocks || {};
  const sections = WORKSHOP2_BLOCKS.map(([key, title]) => {
    let content = String(blocks[key] ?? "").trim();
    if (!content) return null; // cleared on purpose — drop the whole section
    Object.entries(replacements).forEach(([placeholder, value]) => {
      content = content.replaceAll(placeholder, value);
    });
    return `# ${title}\n${content}`;
  }).filter(Boolean);

  const interests = (elder.interests || []).filter(Boolean);
  sections.push([
    "# 長者資料",
    `稱呼：${address}`,
    `居住城市：${elder.city || "未提供"}（問天氣沒有指定城市時用這個）`,
    `興趣：${interests.length ? interests.join("、") : "未提供"}`,
  ].join("\n"));
  sections.push(
    `# 目前記得的事（三層記憶）\n${buildMemoryContext(source.memory, source.profile.memory_policy)}`,
  );

  const pad = (value) => String(value).padStart(2, "0");
  const order = Object.entries(policy.priorities || {})
    .sort((left, right) => right[1] - left[1])
    .map(([name, score]) => `${name}(${score})`)
    .join("、");
  sections.push([
    "# 主動訊息的程式規則",
    `安靜時段：${pad(policy.quiet_hours.start)}:00–${pad(policy.quiet_hours.end)}:00（緊急事件除外）`,
    `主動訊息冷卻：${policy.cooldown_minutes} 分鐘`,
    `每日主動訊息上限：${policy.daily_message_limit} 則`,
    `每則主動訊息最多 ${policy.max_message_sentences} 句`,
    `事件優先權：${order || "未設定"}`,
    "這些條件由程式先判斷；你收到主動事件時才開口，措辭仍要符合上面的規則。",
  ].join("\n"));
  return sections.join("\n\n");
}

/** A workspace-shaped snapshot of the current fields, so the Workshop 2 preview
 *  shows unsaved edits the same way Workshop 1's does. */
function workshop2Draft() {
  return {
    profile: {
      agent: agentFromFields(),
      workshop2_blocks: workshop2BlocksFromFields(),
      elder_profile: elderProfileFromFields(),
      // Not editable in the UI, but it decides the retention labels.
      memory_policy: workspace.profile.memory_policy,
      proactive_policy: proactivePolicyFromFields(),
    },
    memory: workspace.memory,
  };
}

function composeInstructions(source) {
  return [buildSystemPrompt(source.profile.agent), buildWorkshop2Prompt(source)]
    .filter((part) => part.trim())
    .join("\n\n");
}

function rebuildWorkshop2Prompt() {
  $("#workshop2SystemPrompt").textContent = composeInstructions(workshop2Draft());
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]
));

function memoryEntryKey(entry) {
  return entry && typeof entry === "object" ? String(entry.key || "").trim() : "";
}

function memoryEntryValue(entry) {
  return entry && typeof entry === "object" ? String(entry.value || "").trim() : String(entry ?? "").trim();
}

/** The single place anything writes memory — the Realtime `update_memory` tool
 *  and the 記憶分類 exercise both come through here, so the two can never drift.
 *
 *  `mode` overrides the layer's own rule for one write: the model passes
 *  "replace" when a fact really is superseded (搬家、換藥). Re-saving the exact
 *  same key+value is a no-op beyond the timestamp, which is what makes clicking
 *  「檢查記憶分類」 twice idempotent instead of duplicating every card.
 *
 *  Returns what happened so the caller can say it out loud. */
function upsertMemory(layerId, key, value, mode) {
  const [layer, field, layerTitle] =
    MEMORY_LAYERS.find(([id]) => id === String(layerId || "").toUpperCase()) || MEMORY_LAYERS[0];
  const rule = MEMORY_MERGE_RULES[layer];
  if (!Array.isArray(workspace.memory[field])) workspace.memory[field] = [];
  const updatedAt = new Date().toISOString();

  const identical = workspace.memory[field].find(
    (entry) => memoryEntryKey(entry) === key && memoryEntryValue(entry) === value,
  );
  if (identical) {
    identical.updated_at = updatedAt;
    return { layer, field, layerTitle, action: "unchanged", replaced: 0, dropped: 0, sameKey: 1 };
  }

  const accumulate = (mode || rule.merge) === "accumulate";
  const kept = accumulate
    ? workspace.memory[field]
    : workspace.memory[field].filter((entry) => memoryEntryKey(entry) !== key);
  // Named, not counted: 「覆蓋原本 1 筆」 gave a student no way to notice that
  // 芭樂 had just been thrown away by 柳丁.
  const superseded = workspace.memory[field]
    .filter((entry) => !kept.includes(entry))
    .map(memoryEntryValue);
  const replaced = superseded.length;
  let entries = [...kept, { key, value, updated_at: updatedAt }];
  // B is 近期事件: without a ceiling the oldest days survive forever, silently
  // parked outside the prompt window where nothing can ever refresh them.
  const dropped = rule.capacity ? Math.max(0, entries.length - rule.capacity) : 0;
  if (dropped) entries = entries.slice(dropped);
  workspace.memory[field] = entries;

  return {
    layer,
    field,
    layerTitle,
    action: replaced ? "replaced" : "added",
    replaced,
    superseded,
    dropped,
    sameKey: entries.filter((entry) => memoryEntryKey(entry) === key).length,
  };
}

/** Retract exactly one remembered value.
 *
 *  This is the operation the accumulate rule created a need for:「我不喜歡吃西瓜」
 *  cannot be handled by writing another fact, and rewriting the whole key with
 *  mode="replace" would throw away 鳳梨 and 芭樂 along with it. Matches on
 *  key AND value, so nothing else under that key is touched.
 *
 *  Returns what is left under the key, so a near-miss on the value can be
 *  retried precisely instead of the model guessing again. */
function forgetMemory(layerId, key, value) {
  const [layer, field, layerTitle] =
    MEMORY_LAYERS.find(([id]) => id === String(layerId || "").toUpperCase()) || MEMORY_LAYERS[0];
  const entries = Array.isArray(workspace.memory[field]) ? workspace.memory[field] : [];
  const kept = entries.filter(
    (entry) => !(memoryEntryKey(entry) === key && memoryEntryValue(entry) === value),
  );
  const removed = entries.length - kept.length;
  if (removed) workspace.memory[field] = kept;
  return {
    layer,
    field,
    layerTitle,
    removed,
    remaining: kept.filter((entry) => memoryEntryKey(entry) === key).map(memoryEntryValue),
  };
}

/** One human-readable sentence for a write, so the TOOL row explains the layer's
 *  merge rule at the moment it applies instead of only in the docs. */
function describeMemoryWrite(result, key, value) {
  const tail = result.dropped ? `（B 已滿，捲出最舊 ${result.dropped} 筆）` : "";
  if (result.action === "unchanged") return `${result.layerTitle}「${key}：${value}」已經記得，只更新時間`;
  if (result.action === "replaced") {
    return `已取代 ${result.layerTitle}「${key}」＝「${value}」（丟掉了：${result.superseded.join("、")}）${tail}`;
  }
  const alongside = result.sameKey > 1 ? `（同一個「${key}」現在並存 ${result.sameKey} 筆）` : "";
  return `已新增 ${result.layerTitle}「${key}」＝「${value}」${alongside}${tail}`;
}

/** Push memory into the live session. Baked instructions still hold the old
 *  state until a session.update replaces them, so a write made outside the
 *  conversation (刪除、記憶分類) would otherwise look like it did nothing. */
function pushMemoryToSession() {
  if (dataChannel?.readyState !== "open") return false;
  pendingRealtimeApply = true;
  dataChannel.send(JSON.stringify({ type: "session.update", session: realtimeSessionUpdate() }));
  return true;
}

/** Show every stored memory with a way for a *human* to delete it.
 *  Until now only the model could write memory and nobody could correct it,
 *  which quietly contradicted the lesson's own question:「誰能寫入或修改？」
 *  Entries outside the prompt window are marked, or deleting one would look
 *  like it changed nothing. */
function renderMemoryViewer() {
  const headings = memoryLayerHeadings(workspace.profile.memory_policy);
  $("#memoryViewer").innerHTML = MEMORY_LAYERS.map(([layer, field]) => {
    const entries = workspace.memory?.[field] || [];
    const firstShown = Math.max(0, entries.length - MEMORY_PREVIEW_LIMIT);
    const rows = entries.length
      ? entries.map((entry, index) => {
        const time = memoryEntryTime(entry);
        return `
          <li class="${index < firstShown ? "is-outside" : ""}">
            <span>${escapeHtml(memoryEntryText(entry)) || "（空白）"}</span>
            ${time ? `<time>${time}</time>` : ""}
            ${index < firstShown ? "<em>未進入 Prompt</em>" : ""}
            <button type="button" class="link-button" data-memory-layer="${layer}" data-memory-entry="${index}">刪除</button>
          </li>`;
      }).join("")
      : '<li class="is-empty">（目前沒有任何記錄）</li>';
    // The merge rule is printed next to the layer it governs: it is the only
    // place A、B and C actually behave differently, and it is invisible until a
    // student saves the same key twice.
    return `<div class="memory-layer">
      <h4>${escapeHtml(headings[field])}</h4>
      <p class="memory-rule">${escapeHtml(MEMORY_MERGE_RULES[layer].label)}</p>
      <ul>${rows}</ul>
    </div>`;
  }).join("");
}

/** Delete one memory entry on the human's behalf, and push the change into the
 *  live session — the baked instructions still hold the deleted fact until a
 *  session.update replaces them, which would make「刪除」look broken. */
function deleteMemoryEntry(layer, index) {
  const found = MEMORY_LAYERS.find(([id]) => id === layer);
  if (!found) return;
  const [, field, title] = found;
  const entries = workspace.memory?.[field];
  if (!Array.isArray(entries) || !entries[index]) return;
  const removed = memoryEntryText(entries[index]);
  workspace.memory[field] = entries.filter((_, position) => position !== index);
  saveProject();
  renderMemoryViewer();
  rebuildWorkshop2Prompt();
  pushMemoryToSession();
  notify(`已從 ${title} 刪除「${removed}」，並更新豆豆的記憶。人可以覆寫 AI 記得的事。`);
}

/** Whoever 豆豆 is talking to, by name. The cards, the Workshop 2 prompt and the
 *  memory writes all have to agree — hardcoded 王奶奶 in the card text meant
 *  renaming the elder left the exercise talking about a stranger. */
function elderAddress() {
  return $("#elderAddress")?.value.trim()
    || workspace?.profile?.elder_profile?.address
    || $("#agentAddress")?.value.trim()
    || "長者";
}

function memoryCardText(card) {
  return String(card.text || "").replaceAll("{USER_ADDRESS}", elderAddress());
}

function renderMemoryCards() {
  // Re-rendered whenever 長者稱呼 changes, so answers already chosen have to
  // survive the innerHTML rebuild — otherwise renaming mid-quiz wipes the work.
  const chosen = bootstrapData.memory_cards.map(
    (_, index) => $(`[data-memory-index="${index}"]`)?.value || "",
  );
  $("#memoryCards").innerHTML = bootstrapData.memory_cards.map((card, index) => `
    <div class="memory-card">
      <p>${index + 1}. ${escapeHtml(memoryCardText(card))}</p>
      <select data-memory-index="${index}" aria-label="第 ${index + 1} 題分類">
        <option value="">選擇分類</option>
        <option value="A">A 重要事實</option>
        <option value="B">B 近期事件</option>
        <option value="C">C 跨日摘要</option>
        <option value="X">X 不保存</option>
      </select>
    </div>
  `).join("");
  chosen.forEach((value, index) => {
    if (value) $(`[data-memory-index="${index}"]`).value = value;
  });
}

function switchStage(stage) {
  const isFirst = Number(stage) === 1;
  $("#workshop1Panel").hidden = !isFirst;
  $("#workshop2Panel").hidden = isFirst;
  $$(".stage-button").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.stage) === Number(stage)));
  $("#conversationTitle").textContent = isFirst ? "讓 Dodo 聽完，再回答" : "再讓它記得你，適時主動關心";
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
    if (entry === "continue") workspace = deepMerge(bootstrapData.default_workspace, storedProject);
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

const MEMORY_LAYER_LABELS = {
  A: "A 重要事實",
  B: "B 近期事件",
  C: "C 跨日摘要",
  X: "X 不保存",
};

/** Classify, then live with the consequence. A right answer on an A/B/C card
 *  writes that card into `workspace.memory` on the layer the student chose, so
 *  「豆豆現在記得什麼」 fills up as they work and the same 累加／取代／重寫 rules
 *  the model hits apply here too. X cards write nothing — refusing to store is
 *  the correct behaviour, and seeing 提款卡密碼 land in memory would teach the
 *  opposite. `upsertMemory` makes a re-check idempotent, which matters because
 *  the UI invites 「修改後再檢查一次」. */
function checkMemory() {
  let score = 0;
  const written = [];
  // The cards always carried an `explanation`; the browser used to throw it away
  // and show only a score, which left 「為什麼」 —— the actual lesson —— invisible.
  const rows = bootstrapData.memory_cards.map((card, index) => {
    const passed = $(`[data-memory-index="${index}"]`).value === card.answer;
    if (passed) score += 1;
    let stored = "";
    if (passed && card.answer !== "X" && card.key && card.value) {
      const result = upsertMemory(card.answer, card.key, card.value);
      if (result.action !== "unchanged") written.push(`${result.layerTitle}「${card.key}」`);
      stored = `<span class="card-stored">已寫進 ${escapeHtml(result.layerTitle)}：${escapeHtml(card.key)}：${escapeHtml(card.value)}</span>`;
    } else if (passed && card.answer === "X") {
      stored = '<span class="card-stored is-refused">沒有寫進任何一層 —— X 的正確行為就是拒絕保存</span>';
    }
    return `<div class="${passed ? "is-pass" : "is-fail"}">
      <strong>${index + 1}. ${passed ? "✓" : "×"} 建議分類：${MEMORY_LAYER_LABELS[card.answer]}</strong>
      ${card.explanation}
      ${stored}
    </div>`;
  });
  memoryPassed = score === bootstrapData.memory_cards.length;
  $("#memoryExplanations").innerHTML = rows.join("");
  showResult("#memoryOutcome", "#memoryResult", memoryPassed
    ? `✓ ${score}/${bootstrapData.memory_cards.length}，記憶分類完成`
    : `${score}/${bootstrapData.memory_cards.length}，修改後再檢查一次`);

  if (!written.length) return;
  saveProject();
  renderMemoryViewer();
  rebuildWorkshop2Prompt();
  // Unlike a model-driven `update_memory`, this write happens outside the
  // conversation — without the session.update the live 豆豆 never learns it.
  const live = pushMemoryToSession();
  notify(`分類正確的 ${written.length} 筆已寫進「豆豆現在記得什麼」：${written.join("、")}。${live ? "已同步到正在進行的 session。" : "下次連線時生效。"}`);
}

const pad2 = (value) => String(value).padStart(2, "0");

/** Hours the rules keep 豆豆 quiet. `start > end` wraps midnight, matching
 *  `is_quiet_hour` in lesson2.py — the band has to agree with the decider or it
 *  teaches the wrong thing. */
function isQuietHour(hour, start, end) {
  if (start === end) return false;
  return start > end ? hour >= start || hour < end : hour >= start && hour < end;
}

/** Five number fields, redrawn as one 24-hour band plus a sentence. Runs on
 *  every keystroke, so 安靜時段 and 冷卻 stop being abstract before anything is
 *  executed. Nothing here calls the server. */
function renderPolicyPreview() {
  const policy = proactivePolicyFromFields();
  const start = policy.quiet_hours.start;
  const end = policy.quiet_hours.end;
  const nowHour = new Date().getHours();
  $("#quietBand").innerHTML = Array.from({ length: 24 }, (_, hour) => {
    const quiet = isQuietHour(hour, start, end);
    const classes = ["band-hour", quiet ? "is-quiet" : "is-open", hour === nowHour ? "is-now" : ""];
    return `<span class="${classes.filter(Boolean).join(" ")}" title="${pad2(hour)}:00 ${quiet ? "安靜" : "可以開口"}"></span>`;
  }).join("");

  const quietCount = Array.from({ length: 24 }, (_, hour) => hour).filter((hour) => isQuietHour(hour, start, end)).length;
  const awakeMinutes = (24 - quietCount) * 60;
  const cooldownCap = policy.cooldown_minutes > 0
    ? Math.floor(awakeMinutes / policy.cooldown_minutes) + (awakeMinutes % policy.cooldown_minutes ? 1 : 0)
    : Infinity;
  const allowed = Math.min(cooldownCap, policy.daily_message_limit);
  $("#policySummary").innerHTML = [
    `安靜 <b>${quietCount}</b> 小時（${pad2(start)}:00–${pad2(end)}:00）`,
    `可以開口 <b>${24 - quietCount}</b> 小時`,
    `冷卻 <b>${policy.cooldown_minutes}</b> 分鐘 → 最多容得下 <b>${cooldownCap === Infinity ? "不限" : cooldownCap}</b> 則`,
    `每日上限 <b>${policy.daily_message_limit}</b> 則`,
    `每則最多 <b>${policy.max_message_sentences}</b> 句`,
  ].join(" ｜ ");

  // Which of the three limits is doing the work. Students change 冷卻 and see
  // nothing move because 每日上限 was the binding one all along.
  let binding;
  if (quietCount >= 24) binding = "整天都在安靜時段：除了緊急事件，什麼都出不去。";
  else if (cooldownCap < policy.daily_message_limit) binding = `真正卡住的是<strong>冷卻時間</strong>：每日上限 ${policy.daily_message_limit} 則根本用不完，一天最多只擠得出 ${cooldownCap} 則。`;
  else if (policy.daily_message_limit < cooldownCap) binding = `真正卡住的是<strong>每日上限</strong>：時間夠塞 ${cooldownCap} 則，但額度只給 ${policy.daily_message_limit} 則。`;
  else binding = `冷卻與每日上限剛好一樣緊（都是 ${policy.daily_message_limit} 則）。`;
  $("#policyBinding").innerHTML = `${binding} 緊急事件不受這三條限制。`;
}

/** The manual trigger's four fields are the only inputs to the rules, and the
 *  numbers they must beat live one tab away. These hints bring them here and say
 *  which way the comparison goes. */
function renderTriggerHints() {
  const policy = proactivePolicyFromFields();
  const start = policy.quiet_hours.start;
  const end = policy.quiet_hours.end;

  const now = $("#proactiveNow").value || "12:00";
  const quiet = isQuietHour(Number(now.slice(0, 2)), start, end);
  $("#nowHint").textContent = `主動規則的安靜時段是 ${pad2(start)}:00–${pad2(end)}:00。${quiet ? `${now} 落在安靜時段裡，只有緊急事件過得去。` : `${now} 不在安靜時段，這一關會通過。`}`;

  const sinceLast = Number($("#proactiveSinceLast").value) || 0;
  $("#sinceLastHint").textContent = `對上「主動規則」的冷卻 ${policy.cooldown_minutes} 分鐘：小於 ${policy.cooldown_minutes} 就會被擋下。現在填 ${sinceLast} → ${sinceLast < policy.cooldown_minutes ? "會被擋下" : "會通過"}。`;

  const sentToday = Number($("#proactiveSentToday").value) || 0;
  $("#sentTodayHint").textContent = `對上「主動規則」的每日上限 ${policy.daily_message_limit} 則：達到 ${policy.daily_message_limit} 就會被擋下。現在填 ${sentToday} → ${sentToday >= policy.daily_message_limit ? "會被擋下" : "會通過"}。`;
}

// =====================================================================
// Item 9: 待提醒項目 on the real clock.
// A time field with no scheduler was the whole complaint: setting 16:00 did
// nothing at 16:00. These fire once each, against `Date.now()`, through the
// very same `choose_event` the 6 scenarios use.
// =====================================================================
const SCHEDULE_TICK_MS = 5000;
let scheduleTimer = null;
let schedulerBusy = false;
let scheduleSeq = 0;

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Real spend so far today, as opposed to the manual trigger's what-if numbers.
 *  Rolls over at midnight so 每日上限 means one day. */
function proactiveState() {
  if (!workspace.proactive_state || typeof workspace.proactive_state !== "object") {
    workspace.proactive_state = { last_spoken_at: null, sent_today: 0, day: "" };
  }
  const state = workspace.proactive_state;
  if (state.day !== todayKey()) {
    state.day = todayKey();
    state.sent_today = 0;
  }
  return state;
}

function minutesSinceLastProactive() {
  const state = proactiveState();
  if (!state.last_spoken_at) return 24 * 60;
  return Math.max(0, Math.floor((Date.now() - new Date(state.last_spoken_at).getTime()) / 60000));
}

/** One place records the cost of an actual proactive message, so the manual
 *  button and the scheduler can never disagree about the budget. The what-if
 *  fields are written too: after 豆豆 really speaks, 距上次 genuinely is 0. */
function recordProactiveSpoken() {
  const state = proactiveState();
  state.last_spoken_at = new Date().toISOString();
  state.sent_today += 1;
  $("#proactiveSinceLast").value = 0;
  $("#proactiveSentToday").value = state.sent_today;
  saveProject();
  renderTriggerHints();
  renderProactiveLiveState();
}

function renderProactiveLiveState() {
  const state = proactiveState();
  const since = state.last_spoken_at ? `${minutesSinceLastProactive()} 分鐘前` : "還沒說過";
  $("#proactiveLiveState").textContent = `距上次主動訊息 ${since}｜今日已發送 ${state.sent_today} 則`;
}

function scheduledItems() {
  if (!Array.isArray(workspace.scheduled)) workspace.scheduled = [];
  return workspace.scheduled;
}

const SCHEDULE_STATUS_LABELS = { pending: "等待中", spoken: "已說出", blocked: "被擋下" };

function renderScheduleList() {
  const items = scheduledItems();
  const now = new Date();
  $("#scheduleClock").textContent = `現在真實時間 ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  if (!items.length) {
    $("#scheduleList").innerHTML = '<p class="schedule-empty">目前沒有待提醒項目。填好上面的事件類型與內容，選一個時間，按「加入待提醒」。</p>';
    return;
  }
  $("#scheduleList").innerHTML = items.map((item) => {
    const due = item.status === "pending" && item.time <= `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const status = due ? "時間已到，等待觸發" : SCHEDULE_STATUS_LABELS[item.status] || item.status;
    return `<div class="schedule-row is-${item.status}${due ? " is-due" : ""}">
      <time>${escapeHtml(item.time)}</time>
      <span class="schedule-kind">${escapeHtml(PROACTIVE_EVENT_LABELS[item.type] || item.type)}</span>
      <span class="schedule-topic">${escapeHtml(item.topic || "（未填寫內容）")}</span>
      <span class="schedule-status">${escapeHtml(status)}${item.reason ? `：${escapeHtml(item.reason)}` : ""}</span>
      <button type="button" class="link-button" data-schedule-id="${escapeHtml(item.id)}">刪除</button>
    </div>`;
  }).join("");
}

/** Unique across this page load AND across whatever was restored from storage:
 *  a plain counter restarts at 0 after F5 and would collide with saved rows. */
function nextScheduleId() {
  const taken = new Set(scheduledItems().map((item) => item.id));
  do { scheduleSeq += 1; } while (taken.has(`s${scheduleSeq}`));
  return `s${scheduleSeq}`;
}

function addSchedule() {
  const time = $("#scheduleTime").value;
  if (!time) {
    notify("請先選一個提醒時間。");
    return;
  }
  const topic = $("#proactiveTopic").value.trim();
  scheduledItems().push({
    // Not derived from list length: delete-then-add would otherwise reuse an id
    // that is still on the list, and 刪除 would take out both rows.
    id: nextScheduleId(),
    type: $("#proactiveEventType").value,
    topic,
    time,
    status: "pending",
    reason: "",
  });
  saveProject();
  renderScheduleList();
  notify(`已加入 ${time} 的「${PROACTIVE_EVENT_LABELS[$("#proactiveEventType").value] || ""}」提醒${topic ? `：${topic}` : ""}。到時間會自己跑一次規則。`);
  // Fire straight away when the chosen time has already passed, instead of
  // making the room wait up to 5 seconds to see anything happen.
  tickScheduler();
}

function deleteSchedule(id) {
  const items = scheduledItems();
  const removed = items.find((item) => item.id === id);
  workspace.scheduled = items.filter((item) => item.id !== id);
  saveProject();
  renderScheduleList();
  if (removed) notify(`已刪除 ${removed.time} 的待提醒項目。`);
}

/** One scheduled item, decided and (if allowed) spoken. Uses the REAL clock and
 *  the REAL accumulated spend — that is the difference from the manual trigger,
 *  and the reason the time field now means something. */
async function fireScheduledItem(item) {
  const now = new Date();
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const event = { type: item.type, topic: item.topic };
  const policy = workspace.profile.proactive_policy;
  const decision = await decideProactive(policy, {
    time,
    minutes_since_last_message: minutesSinceLastProactive(),
    messages_today: proactiveState().sent_today,
    // NOT the 剛被拒絕 checkbox: that belongs to the manual what-if trigger, and
    // this client has no real signal for it. Reading it here would let a
    // hypothesis ticked in section B silently kill a scheduled 吃藥提醒.
    user_declined: false,
    events: [event],
  });
  if (!decision) {
    // A dead backend must not burn the item; it stays pending and retries.
    return;
  }

  let reason = decision.reason;
  if (decision.should_speak) {
    const outcome = await speakProactive(event, time, policy);
    // Mid-sentence is temporary: leave the item pending and try again in 5s.
    if (outcome === "busy") return;
    if (outcome !== "spoken") reason = "規則允許開口，但目前沒有連線，豆豆說不出話。";
    item.status = outcome === "spoken" ? "spoken" : "blocked";
  } else {
    item.status = "blocked";
  }
  item.reason = reason;
  addMessage("tool", `待提醒觸發（${item.type} @ ${time}）：${item.status === "spoken" ? "主動開口" : "保持安靜"} — ${reason}`);
  saveProject();
  renderScheduleList();
}

/** Compare the pending list against the wall clock. Highest priority first, one
 *  per tick: firing two at once would let both pass the cooldown that the first
 *  one is supposed to impose on the second. */
async function tickScheduler() {
  renderScheduleList();
  renderProactiveLiveState();
  if (!$("#scheduleAuto").checked || schedulerBusy) return;
  const nowText = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  const priorities = workspace.profile.proactive_policy.priorities || {};
  const due = scheduledItems()
    .filter((item) => item.status === "pending" && item.time <= nowText)
    .sort((left, right) => (priorities[right.type] || 0) - (priorities[left.type] || 0));
  if (!due.length) return;
  schedulerBusy = true;
  try {
    await fireScheduledItem(due[0]);
  } finally {
    schedulerBusy = false;
  }
}

function startScheduler() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = setInterval(tickScheduler, SCHEDULE_TICK_MS);
}

async function runProactiveTests() {
  collectWorkshop2();
  setState("thinking", "正在執行 6 個主動情境");
  const response = await fetch("/api/proactive-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policy: workspace.profile.proactive_policy }),
  });
  const result = await response.json();
  $("#proactiveResults").innerHTML = result.results.map((item) => `
    <div class="test-item ${item.passed ? "is-pass" : "is-fail"}">
      <strong>${item.passed ? "✓" : "×"}</strong>
      <span>${item.name}<br><small>${item.should_speak ? "主動開口" : "保持安靜"}：${item.reason}</small></span>
    </div>
  `).join("");
  const passedCount = result.results.filter((item) => item.passed).length;
  showResult("#proactiveOutcome", "#proactiveScore", result.passed
    ? `✓ ${passedCount}/${result.results.length}，規則通過全部情境`
    : `${passedCount}/${result.results.length}，看下面哪幾個翻轉了`);
  if (result.passed && memoryPassed) {
    workspace.progress.workshop_2_completed = true;
    saveProject();
    addMessage("system", `第二階段完成！${workspace.profile.agent.name} 會記得重要的事，也知道何時不該打擾。`);
  } else if (result.passed) {
    addMessage("system", "主動情境已經 6/6 通過，再完成記憶分類就升級成功了。");
  }
  setState("listening", result.passed ? "Workshop 2：主動情境 6/6" : "調整規則後再試一次");
}

// Kept so a re-run can say what got better and what got worse. A student who
// only sees the latest numbers cannot tell a trade from an improvement.
let lastDayRun = null;

const DAY_EVENT_LABELS = {
  reminder: "提醒",
  health: "健康",
  weather: "天氣",
  news: "新聞",
  reverse_mentor: "反向請教",
  emergency: "緊急",
};

function renderDayDelta(result) {
  if (!lastDayRun) return "";
  const describe = (label, before, after, lowerIsBetter = true) => {
    const change = after - before;
    if (!change) return `${label} 不變（${after}）`;
    const better = lowerIsBetter ? change < 0 : change > 0;
    const arrow = change > 0 ? `+${change}` : `${change}`;
    return `<b class="${better ? "is-better" : "is-worse"}">${label} ${arrow}（${before} → ${after}）</b>`;
  };
  return `<p class="day-delta">和上一次比較：${[
    describe("漏掉重要事", lastDayRun.missed_critical, result.missed_critical),
    describe("打擾", lastDayRun.noise, result.noise),
  ].join("、")}</p>`;
}

/** Replay one scripted day through the student's rules. Deterministic and
 *  API-free, so the whole class can run it. Deliberately reports two numbers
 *  and no single grade: tightening the rules trades noise for misses, and there
 *  is no 6/6 to converge on. */
async function runDaySimulation() {
  collectWorkshop2();
  const button = $("#runDaySimulation");
  button.disabled = true;
  try {
    const response = await fetch("/api/proactive-simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: workspace.profile.proactive_policy }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "模擬失敗。");
    $("#daySummary").innerHTML = `
      <div class="day-score">
        <span>說出 <b>${result.spoken}</b> 則</span>
        <span>擋下 <b>${result.blocked}</b> 則</span>
        <span class="${result.missed_critical ? "is-worse" : "is-better"}">漏掉重要事 <b>${result.missed_critical}</b>／${result.critical_total}</span>
        <span class="${result.noise > 2 ? "is-worse" : ""}">打擾 <b>${result.noise}</b>／${result.optional_total}</span>
      </div>
      ${renderDayDelta(result)}
      <p class="day-hint">兩個數字會互相拉扯：規則放寬，打擾變多；規則收緊，重要的事會被漏掉。沒有滿分答案。</p>`;
    $("#dayTimeline").innerHTML = result.steps.map((step) => `
      <div class="day-row ${step.spoke ? "is-spoken" : "is-blocked"} ${step.importance === "critical" ? "is-critical" : ""}">
        <time>${step.time}</time>
        <span class="day-kind">${DAY_EVENT_LABELS[step.event_type] || step.event_type}${step.importance === "critical" ? "・重要" : ""}</span>
        <span class="day-topic">${escapeHtml(step.topic)}</span>
        <span class="day-verdict">${step.spoke ? "說出" : "擋下"}：${escapeHtml(step.reason)}</span>
      </div>`).join("");
    showResult("#dayOutcome", "#dayScore",
      `漏掉重要事 ${result.missed_critical}／${result.critical_total} · 打擾 ${result.noise}／${result.optional_total}`);
    lastDayRun = result;
  } catch (error) {
    $("#daySummary").textContent = error.message || "無法連接本機服務。";
  } finally {
    button.disabled = false;
  }
}

async function applyWorkshop2() {
  collectWorkshop2();
  await connectRealtime();
  const live = dataChannel?.readyState === "open";
  if (live) {
    pendingRealtimeApply = true;
    dataChannel.send(JSON.stringify({ type: "session.update", session: realtimeSessionUpdate() }));
  }
  markApplied("workshop2");
  notify(live
    ? "第二堂設定已套用：長者資料、三層記憶與主動規則都寫進了同一份 instructions，正在確認更新…"
    : "第二堂設定已保存（尚未連線，下次連線時生效）。");
}

/** The brief for one proactive turn. Response-level `instructions` *replace* the
 *  session instructions, so the whole composed prompt has to travel with it —
 *  otherwise 豆豆 would open its mouth as OpenAI's default assistant. */
function proactiveTurnInstructions(event, time, policy) {
  return [
    realtimeInstructions(),
    [
      "# 這一次主動開口",
      `現在是 ${time}。你要「主動」開啟對話，不是回答問題 —— 對方還沒說話。`,
      `事件類型：${event.type}`,
      `事件內容：${event.topic || "（未填寫）"}`,
      `最多 ${policy.max_message_sentences} 句，直接說出口，不要說明你為什麼現在開口。`,
      event.type === "emergency"
        ? "這是緊急事件：先確認對方當下是否安全，並明確說你會請真人照護者介入。"
        : "不要製造壓力，也不要連續追問。",
    ].join("\n"),
  ].filter((part) => part.trim()).join("\n\n");
}

/** Ask the same `choose_event` the 6 scenarios and 跑一整天 use. Returns null on
 *  a transport failure so callers can tell "the rules said no" apart from "the
 *  question never got asked" — the scheduler must not burn an item on the latter. */
async function decideProactive(policy, scenario) {
  try {
    const response = await fetch("/api/proactive-decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy, scenario }),
    });
    const decision = await response.json();
    if (!response.ok) throw new Error(decision.detail || "主動決策失敗。");
    return decision;
  } catch (error) {
    $("#proactiveDecision").textContent = error.message || "無法連接本機服務。";
    return null;
  }
}

/** Let 豆豆 actually open its mouth, and charge the budget for it. Shared by the
 *  manual button and the scheduler, so a scheduled 16:00 提醒 costs exactly what
 *  a hand-triggered one costs.
 *
 *  Returns "spoken", "busy" (talking right now — worth retrying) or
 *  "unavailable" (no session — waiting will not help). The scheduler needs the
 *  difference: a 待提醒 row must not claim 已說出 when nothing was said, and it
 *  must not burn itself because 豆豆 happened to be mid-sentence. */
async function speakProactive(event, time, policy) {
  if (!apiConfigured) {
    addMessage("system", "規則允許主動開口，但還沒有連接 OpenAI，所以豆豆說不出話。請先完成系統設定。");
    return "unavailable";
  }
  if (!(await connectRealtime())) return "unavailable";
  // A proactive message must not talk over 豆豆's current sentence.
  if (isDodoSpeaking()) {
    notify("豆豆正在說話，等它說完再觸發主動關心。");
    return "busy";
  }
  setState("thinking", "豆豆正在主動開口");
  sendProactiveResponse(proactiveTurnInstructions(event, time, policy));
  // The rules only mean something if speaking feeds them: the next attempt now
  // runs into the cooldown and the daily budget, exactly as it would live.
  recordProactiveSpoken();
  return "spoken";
}

async function triggerProactive() {
  collectWorkshop2();
  const policy = workspace.profile.proactive_policy;
  const time = $("#proactiveNow").value || "12:00";
  const event = {
    type: $("#proactiveEventType").value,
    topic: $("#proactiveTopic").value.trim(),
  };
  const decision = await decideProactive(policy, {
    time,
    minutes_since_last_message: Number($("#proactiveSinceLast").value) || 0,
    messages_today: Number($("#proactiveSentToday").value) || 0,
    user_declined: $("#proactiveDeclined").checked,
    events: [event],
  });
  if (!decision) return;

  $("#proactiveDecision").textContent = decision.should_speak
    ? `✓ 主動開口：${decision.reason}`
    : `× 保持安靜：${decision.reason}`;
  addMessage(
    "tool",
    `主動決策（${event.type} @ ${time}）：${decision.should_speak ? "主動開口" : "保持安靜"} — ${decision.reason}`,
  );
  if (decision.should_speak) await speakProactive(event, time, policy);
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

function realtimeInstructions() {
  // Workshop 1 (persona) + Workshop 2 (memory rules, elder data, proactive
  // rules), rebuilt from the blocks rather than read from the stored
  // `system_prompt`. The onboarding paths assign `workspace` without running
  // migrateAgent, so a stale stored string could win the deepMerge — and now
  // that instructions ride along at mint time, that would hand OpenAI the wrong
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

async function applyWorkshop1() {
  const previousVoice = connectedVoice;
  collectWorkshop1();
  // OpenAI forbids swapping the voice on a live session once the model has
  // produced audio, so a voice change can only take effect on a new connection.
  const voiceChanged = Boolean(previousVoice) && previousVoice !== workspace.profile.agent.voice;
  if (voiceChanged) {
    disconnectRealtime();
    notify(`聲線改成 ${workspace.profile.agent.voice}，正在重新建立連線（Realtime 不允許在同一個 session 換聲線）。`);
  }
  await connectRealtime();
  if (dataChannel?.readyState === "open") {
    pendingRealtimeApply = true;
    dataChannel.send(JSON.stringify({ type: "session.update", session: realtimeSessionUpdate() }));
    const isPushToTalk = workspace.profile.realtime.turn_detection.type === "push_to_talk";
    if (microphoneTrack) microphoneTrack.enabled = setup.inputMode === "voice" && !isPushToTalk;
    $("#pushToTalk").hidden = setup.inputMode !== "voice" || !isPushToTalk;
  }
  // Applying your own Prompt + turn settings is what completes Workshop 1 now.
  // The removed 5-item dry run used to be the only thing setting this flag, and
  // it never checked anything the student had not just typed in themselves.
  workspace.progress.workshop_1_completed = true;
  saveProject();
  markApplied("workshop1");
  const voiceNote = dataChannel?.readyState === "open" ? "，正在確認更新…" : "（尚未連線，下次連線時生效）";
  notify(`已套用「${workspace.profile.agent.name}」的設定${voiceNote}`);
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
    const counts = MEMORY_LAYERS
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
      const result = forgetMemory(args.layer, key, value);
      if (!result.removed) {
        const found = result.remaining.length
          ? `目前「${key}」底下是：${result.remaining.join("、")}`
          : `目前沒有「${key}」這一筆`;
        addMessage("tool", `update_memory 找不到要移除的記錄：${result.layerTitle}「${key}：${value}」（${found}）`, statusId);
        return { removed: 0, key, value, layer: result.layer, remaining: result.remaining, error: `找不到「${key}：${value}」。${found}` };
      }
      saveProject();
      rebuildWorkshop2Prompt();
      renderMemoryViewer();
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
    const result = upsertMemory(args.layer, key, value, mode || undefined);
    saveProject();
    rebuildWorkshop2Prompt();
    renderMemoryViewer();
    addMessage("tool", `update_memory：${describeMemoryWrite(result, key, value)}`, statusId);
    return {
      saved: true,
      key,
      value,
      layer: result.layer,
      merge: mode ? "replace" : MEMORY_MERGE_RULES[result.layer].merge,
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
  collectWorkshop1();
  collectWorkshop2();
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
    if (imported.schema_version !== 1 || !imported.profile) throw new Error();
    workspace = deepMerge(bootstrapData.default_workspace, imported);
    workspace.profile.agent = migrateAgent(workspace.profile.agent);
    workspace.profile.workshop2_blocks = migrateWorkshop2Blocks(workspace.profile.workshop2_blocks);
    saveProject();
    loadFields();
    switchStage(workspace.progress.workshop_1_completed ? 2 : 1);
    notify(`已載入「${workspace.profile.agent.name}」，可以繼續上次的進度。`);
  } catch {
    addMessage("system", "這個檔案不是可用的 Dodo 作品，請選擇 my-dodo.json。");
  }
}

async function initialize() {
  bootstrapData = await fetch("/api/bootstrap").then((response) => response.json());
  apiConfigured = bootstrapData.api_configured;
  weatherConfigured = bootstrapData.weather_configured;
  const storedProject = readStored(PROJECT_KEY);
  workspace = deepMerge(bootstrapData.default_workspace, storedProject);
  workspace.profile.agent = migrateAgent(workspace.profile.agent);
  workspace.profile.workshop2_blocks = migrateWorkshop2Blocks(workspace.profile.workshop2_blocks);
  setup = normalizeSetup(readStored(SETUP_KEY));
  // Options must exist before loadFields() assigns #agentVoice.value, or the
  // assignment hits an empty <select>, the picker falls back to its first entry,
  // and the next 套用 silently overwrites the student's saved voice.
  renderVoiceOptions();
  renderPresetButtons();
  loadFields();
  renderMemoryCards();
  applyMode();
  refreshApiUi();
  restoreLabPanelWidth();
  $("#proactiveNow").value = new Date().toTimeString().slice(0, 5);
  $("#scheduleTime").value = new Date().toTimeString().slice(0, 5);
  renderScheduleList();
  renderProactiveLiveState();
  renderTriggerHints();
  // The 待提醒 list is only worth setting a time on if something watches the
  // clock for it. 5s so a demo set to a past minute reacts while people look.
  startScheduler();

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
  if (event.key !== "Escape" || $("#onboarding").hidden) return;
  closeOnboarding();
});
$("#turnDetectionMode").addEventListener("change", updateTurnFields);
// Every control that 套用 sends, so the button and the tab dots can never go
// stale. Both events on all of them: a textarea reports `input`, a <select> and
// a checkbox report `change` — and 聲線、等待傾向、靜音門檻、插話 had no listener
// at all before this, so a change there used to leave the preview untouched.
const WORKSHOP1_FIELDS = [
  "#agentName", "#agentAddress", ...PROMPT_BLOCKS.map(([, , selector]) => selector),
  "#agentVoice", "#turnDetectionMode", "#semanticEagerness", "#silenceDuration", "#interruptResponse",
];
const WORKSHOP2_FIELDS = [
  "#elderAddress", "#elderCity", "#elderInterests", ...WORKSHOP2_BLOCKS.map(([, , selector]) => selector),
  "#quietStart", "#quietEnd", "#cooldown", "#dailyLimit", "#maxSentences",
];
const bindFieldEvents = (selectors, handler) => selectors.forEach((selector) => {
  ["input", "change"].forEach((event) => $(selector).addEventListener(event, handler));
});
bindFieldEvents(WORKSHOP1_FIELDS, () => {
  rebuildSystemPrompt();
  refreshApplyState();
});
// Workshop 2 fields feed the composed instructions, so the VIEW panel has to
// follow them live the same way Workshop 1's does.
bindFieldEvents(WORKSHOP2_FIELDS, () => {
  rebuildWorkshop2Prompt();
  refreshApplyState();
  // 主動規則 is five numbers; the band and the hints are what make them legible.
  renderPolicyPreview();
  renderTriggerHints();
});
// The manual trigger's own fields are half of every comparison in the hints.
bindFieldEvents(["#proactiveNow", "#proactiveSinceLast", "#proactiveSentToday"], renderTriggerHints);
// The quiz cards address the elder by name, so they follow 長者稱呼 live.
["input", "change"].forEach((event) => $("#elderAddress").addEventListener(event, renderMemoryCards));
$$(".tab-button").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
$("#revertWorkshop1").addEventListener("click", () => revertGroup("workshop1"));
$("#revertWorkshop2").addEventListener("click", () => revertGroup("workshop2"));
$("#chatOnly").addEventListener("change", () => {
  $("#messages").classList.toggle("is-chat-only", $("#chatOnly").checked);
});
$$(".stage-button").forEach((button) => button.addEventListener("click", () => switchStage(button.dataset.stage)));
$("#saveWorkshop1").addEventListener("click", applyWorkshop1);
$("#checkMemory").addEventListener("click", checkMemory);
$("#saveWorkshop2").addEventListener("click", applyWorkshop2);
$("#runProactiveTests").addEventListener("click", runProactiveTests);
$("#runDaySimulation").addEventListener("click", runDaySimulation);
$("#triggerProactive").addEventListener("click", triggerProactive);
$("#addSchedule").addEventListener("click", addSchedule);
$("#scheduleAuto").addEventListener("change", () => {
  notify($("#scheduleAuto").checked
    ? "自動觸發已開啟：待提醒項目到時間會自己跑一次規則。"
    : "自動觸發已關閉：待提醒項目會停在原地，不會自己開口。");
  tickScheduler();
});
// Delegated: the list is re-rendered on every tick.
$("#scheduleList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-schedule-id]");
  if (button) deleteSchedule(button.dataset.scheduleId);
});
// Delegated: the viewer is re-rendered after every write and delete.
$("#memoryViewer").addEventListener("click", (event) => {
  const button = event.target.closest("[data-memory-layer]");
  if (button) deleteMemoryEntry(button.dataset.memoryLayer, Number(button.dataset.memoryEntry));
});
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

initialize();
