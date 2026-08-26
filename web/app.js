const SETUP_KEY = "dodo-workshop.setup";
const PROJECT_KEY = "dodo-workshop.project";
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
一次只問一件事，避免連續追問；回答要適合直接朗讀，不使用表格。`,
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
    description: "保存或更新使用者主動提供的非敏感個人資訊。不得保存密碼、API Key、金融帳號或驗證碼。",
    parameters: {
      type: "object",
      properties: {
        key: { type: "string", description: "資訊類別，例如：姓名、興趣、居住地、喜歡的食物。" },
        value: { type: "string", description: "要保存的臺灣繁體中文內容。" },
      },
      required: ["key", "value"],
      additionalProperties: false,
    },
  },
];
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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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

function selectedVoice() {
  const value = $("#agentVoice")?.value;
  return REALTIME_VOICES.some(([id]) => id === value) ? value : "sage";
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
  addMessage("system", `已載入「${preset.label}」範例（聲線 ${preset.voice}）。可以繼續編輯，按「套用」才會生效。`);
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
  // The preview must always show exactly what gets sent, including "nothing".
  preview.textContent = prompt || EMPTY_PROMPT_NOTICE;
  preview.classList.toggle("is-empty", !prompt);
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

function responseCreateEvent() {
  return {
    type: "response.create",
    response: { output_modalities: [setup?.outputMode === "voice" ? "audio" : "text"] },
  };
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
  // Half the usable width is a 1:1 split with the chat area — the widest
  // setting worth allowing. On narrow screens the chat floor wins instead.
  const availableMaximum = Math.min(usableWidth / 2, usableWidth - minimumChatWidth);
  return {
    min: LAB_WIDTH_MIN,
    max: Math.max(LAB_WIDTH_MIN, availableMaximum),
  };
}

function setLabPanelWidth(width) {
  const bounds = panelWidthBounds();
  const nextWidth = Math.round(Math.min(bounds.max, Math.max(bounds.min, width)));
  $(".app-shell").style.setProperty("--lab-width", `${nextWidth}px`);
  const resizer = $("#panelResizer");
  resizer.setAttribute("aria-valuemin", String(bounds.min));
  resizer.setAttribute("aria-valuemax", String(Math.round(bounds.max)));
  resizer.setAttribute("aria-valuenow", String(nextWidth));
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
  event.preventDefault();
}

function clampPanelWidths() {
  if (window.innerWidth <= PANEL_MOBILE_BREAKPOINT) return;
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
  rebuildSystemPrompt();
  $("#turnDetectionMode").value = turn.type;
  $("#semanticEagerness").value = turn.eagerness;
  $("#silenceDuration").value = turn.silence_duration_ms;
  $("#interruptResponse").checked = turn.interrupt_response;
  $("#elderAddress").value = elder.address;
  $("#elderInterests").value = elder.interests.join("、");
  $("#quietStart").value = proactive.quiet_hours.start;
  $("#quietEnd").value = proactive.quiet_hours.end;
  $("#cooldown").value = proactive.cooldown_minutes;
  $("#dailyLimit").value = proactive.daily_message_limit;
  updateTurnFields();
}

function collectWorkshop1() {
  workspace.profile.agent = {
    name: $("#agentName").value.trim() || "豆豆",
    address: $("#agentAddress").value.trim() || "王奶奶",
    prompt_blocks: promptBlocksFromFields(),
    system_prompt: buildSystemPrompt(agentFromFields()),
    voice: selectedVoice(),
    // Preserved for the CLI text lessons (Responses API); the Realtime session
    // no longer sends an output-token cap.
    max_output_tokens: workspace.profile.agent.max_output_tokens,
  };
  workspace.profile.realtime = {
    turn_detection: {
      type: $("#turnDetectionMode").value,
      eagerness: $("#semanticEagerness").value,
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: Number($("#silenceDuration").value),
      create_response: true,
      interrupt_response: $("#interruptResponse").checked,
    },
  };
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

function collectWorkshop2() {
  workspace.profile.elder_profile.address = $("#elderAddress").value.trim() || "王奶奶";
  workspace.profile.elder_profile.interests = $("#elderInterests").value
    .split(/[、,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const policy = workspace.profile.proactive_policy;
  policy.quiet_hours.start = Number($("#quietStart").value);
  policy.quiet_hours.end = Number($("#quietEnd").value);
  policy.cooldown_minutes = Number($("#cooldown").value);
  policy.daily_message_limit = Number($("#dailyLimit").value);
  saveProject();
}

function renderMemoryCards() {
  $("#memoryCards").innerHTML = bootstrapData.memory_cards.map((card, index) => `
    <div class="memory-card">
      <p>${index + 1}. ${card.text}</p>
      <select data-memory-index="${index}" aria-label="第 ${index + 1} 題分類">
        <option value="">選擇分類</option>
        <option value="A">A 重要事實</option>
        <option value="B">B 近期事件</option>
        <option value="C">C 跨日摘要</option>
        <option value="X">X 不保存</option>
      </select>
    </div>
  `).join("");
}

function switchStage(stage) {
  const isFirst = Number(stage) === 1;
  $("#workshop1Panel").hidden = !isFirst;
  $("#workshop2Panel").hidden = isFirst;
  $$(".stage-button").forEach((button) => button.classList.toggle("is-active", Number(button.dataset.stage) === Number(stage)));
  $("#conversationTitle").textContent = isFirst ? "讓 Dodo 聽完，再回答" : "再讓它記得你，適時主動關心";
}

function applyMode() {
  const inputLabel = setup?.inputMode === "voice" ? "語音" : "打字";
  const outputLabel = setup?.outputMode === "voice" ? "語音" : "文字";
  $("#modeBadge").textContent = `輸入：${inputLabel} · 輸出：${outputLabel}`;
  $("#pushToTalk").hidden = true;
  setState("listening", apiConfigured ? "Realtime 將自動連線" : "請先完成 API 設定");
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
    : "請從右上角「API 設定」輸入天氣 API Key；工具定義仍會保留供課堂觀察。";
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
  $("#apiKeyStatus").textContent = "正在儲存 API 設定…";
  try {
    const response = await fetch("/api/settings/api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const result = await response.json();
    if (!response.ok) {
      testedApiKey = "";
      $("#apiKeyStatus").textContent = result.detail || "API 設定儲存失敗。";
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
  $("#weatherApiKeyStatus").textContent = "正在儲存天氣 API 設定…";
  try {
    const response = await fetch("/api/settings/weather-api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    const result = await response.json();
    if (!response.ok) {
      testedWeatherApiKey = "";
      $("#weatherApiKeyStatus").textContent = result.detail || "天氣 API 設定儲存失敗。";
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
  switchStage(startStage);
  await connectRealtime();
}

function checkMemory() {
  let score = 0;
  bootstrapData.memory_cards.forEach((card, index) => {
    if ($(`[data-memory-index="${index}"]`).value === card.answer) score += 1;
  });
  memoryPassed = score === bootstrapData.memory_cards.length;
  $("#memoryResult").textContent = memoryPassed
    ? `✓ ${score}/${bootstrapData.memory_cards.length}，記憶分類完成`
    : `${score}/${bootstrapData.memory_cards.length}，修改後再檢查一次`;
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
  if (result.passed && memoryPassed) {
    workspace.progress.workshop_2_completed = true;
    saveProject();
    addMessage("system", `第二階段完成！${workspace.profile.agent.name} 會記得重要的事，也知道何時不該打擾。`);
  } else if (result.passed) {
    addMessage("system", "主動情境已經 6/6 通過，再完成記憶分類就升級成功了。");
  }
  setState("listening", result.passed ? "Workshop 2：主動情境 6/6" : "調整規則後再試一次");
}

async function sendText(message) {
  if (!apiConfigured) {
    addMessage("system", "目前沒有連接 OpenAI 模型。請先點右上角「API 設定」。");
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
  // Rebuilt from the blocks rather than read from the stored `system_prompt`.
  // The onboarding paths assign `workspace` without running migrateAgent, so a
  // stale stored string could win the deepMerge — and now that instructions ride
  // along at mint time, that would hand OpenAI the wrong persona (which is
  // exactly how 豆豆 ended up replying in English). Can legitimately be empty if
  // the student cleared every block; the preview says so before they apply.
  return buildSystemPrompt(workspace.profile.agent);
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
    addMessage("system", `聲線改成 ${workspace.profile.agent.voice}，正在重新建立連線（Realtime 不允許在同一個 session 換聲線）。`);
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
  const voiceNote = dataChannel?.readyState === "open" ? "，正在確認更新…" : "（尚未連線，下次連線時生效）";
  addMessage("system", `已套用「${workspace.profile.agent.name}」的設定${voiceNote}`);
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
    const facts = workspace.memory.facts.length;
    const events = workspace.memory.events.length;
    addMessage("tool", `read_memory：讀取記憶（${facts} 筆事實、${events} 筆事件）`, statusId);
    return workspace.memory;
  }

  if (call.name === "update_memory") {
    const key = String(args.key || "").trim();
    const value = String(args.value || "").trim();
    if (!key || !value) {
      addMessage("tool", "update_memory 失敗：key 與 value 都不可空白", statusId);
      return { error: "key 與 value 都不可空白。" };
    }
    if (/(密碼|password|api.?key|金鑰|帳號|信用卡|驗證碼)/i.test(`${key} ${value}`)) {
      addMessage("tool", `update_memory 已拒絕：「${key}」屬於敏感資料，不會保存`, statusId);
      return { error: "基於安全規則，這類敏感資料不會保存。" };
    }
    const fact = workspace.memory.facts.find((item) => item && typeof item === "object" && item.key === key);
    if (fact) {
      fact.value = value;
      fact.updated_at = new Date().toISOString();
    } else {
      workspace.memory.facts.push({ key, value, updated_at: new Date().toISOString() });
    }
    saveProject();
    addMessage("tool", `update_memory：已${fact ? "更新" : "新增"}「${key}」＝「${value}」`, statusId);
    return { saved: true, key, value };
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
    addMessage("system", "Realtime 已確認套用，下一次回答會使用新設定");
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
  if (["response.created", "response.output_item.added"].includes(event.type)) {
    // VAD fires responses we never asked for (create_response: true), so track
    // those too or a typed barge-in would not know there is anything to cancel.
    responseActive = true;
    setState("thinking", "Dodo 正在理解這一回合");
  }
  if (["response.output_audio_transcript.delta", "response.audio_transcript.delta"].includes(event.type)) {
    voiceDraft += event.delta || "";
    setState("speaking", "Dodo 正在用耳機回應");
    addMessage("assistant", voiceDraft, "voiceDraft");
  }
  if (["response.output_audio_transcript.done", "response.audio_transcript.done"].includes(event.type)) {
    const finalText = event.transcript || voiceDraft;
    if (finalText) addMessage("assistant", finalText, "voiceDraft");
    document.getElementById("voiceDraft")?.removeAttribute("id");
    voiceDraft = "";
  }
  if (event.type === "response.output_text.delta") {
    voiceDraft += event.delta || "";
    setState("speaking", "Dodo 正在顯示文字回答");
    addMessage("assistant", voiceDraft, "voiceDraft");
  }
  if (event.type === "response.output_text.done") {
    const finalText = event.text || voiceDraft;
    if (finalText) addMessage("assistant", finalText, "voiceDraft");
    document.getElementById("voiceDraft")?.removeAttribute("id");
    voiceDraft = "";
  }
  if (event.type === "response.done") {
    responseActive = false;
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
    } else if (setup.outputMode === "voice") {
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
    saveProject();
    loadFields();
    switchStage(workspace.progress.workshop_1_completed ? 2 : 1);
    addMessage("system", `已載入「${workspace.profile.agent.name}」，可以繼續上次的進度。`);
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
  clampPanelWidths();

  const forceInit = new URLSearchParams(location.search).has("init");
  if (forceInit || !setup?.completed) showOnboarding(forceInit);
  else if (apiConfigured) await connectRealtime();
  if (workspace.progress.workshop_1_completed && !workspace.progress.workshop_2_completed) switchStage(2);
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
["#agentName", "#agentAddress", ...PROMPT_BLOCKS.map(([, , selector]) => selector)].forEach((selector) => {
  $(selector).addEventListener("input", rebuildSystemPrompt);
});
$$(".stage-button").forEach((button) => button.addEventListener("click", () => switchStage(button.dataset.stage)));
$("#saveWorkshop1").addEventListener("click", applyWorkshop1);
$("#checkMemory").addEventListener("click", checkMemory);
$("#saveWorkshop2").addEventListener("click", () => { collectWorkshop2(); addMessage("system", "第二堂設定已保存。"); });
$("#runProactiveTests").addEventListener("click", runProactiveTests);
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
