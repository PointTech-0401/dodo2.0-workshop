const SETUP_KEY = "dodo-workshop.setup";
const PROJECT_KEY = "dodo-workshop.project";
const LAB_WIDTH_MIN = 320;
const LAB_WIDTH_MAX = 720;
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
let panelResizePointerId = null;

function promptBlocksFromFields() {
  return Object.fromEntries(PROMPT_BLOCKS.map(([key, , selector]) => [
    key,
    $(selector).value.trim() || DEFAULT_PROMPT_BLOCKS[key],
  ]));
}

function agentFromFields() {
  return {
    name: $("#agentName").value.trim() || "豆豆",
    address: $("#agentAddress").value.trim() || "王奶奶",
    prompt_blocks: promptBlocksFromFields(),
  };
}

function buildSystemPrompt(agent) {
  const replacements = {
    "{AGENT_NAME}": agent.name || "豆豆",
    "{USER_ADDRESS}": agent.address || "王奶奶",
  };
  const blocks = { ...DEFAULT_PROMPT_BLOCKS, ...(agent.prompt_blocks || {}) };
  return PROMPT_BLOCKS.map(([key, title]) => {
    let content = String(blocks[key] || DEFAULT_PROMPT_BLOCKS[key]).trim();
    Object.entries(replacements).forEach(([placeholder, value]) => {
      content = content.replaceAll(placeholder, value);
    });
    return `# ${title}\n${content}`;
  }).join("\n\n");
}

function rebuildSystemPrompt() {
  $("#agentSystemPrompt").textContent = buildSystemPrompt(agentFromFields());
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
  const railWidth = $(".signal-rail").getBoundingClientRect().width;
  const resizerWidth = $("#panelResizer").getBoundingClientRect().width;
  const minimumChatWidth = window.innerWidth <= 1100 ? 320 : 360;
  const availableMaximum = shell.getBoundingClientRect().width
    - railWidth
    - resizerWidth
    - minimumChatWidth;
  return {
    min: LAB_WIDTH_MIN,
    max: Math.max(LAB_WIDTH_MIN, Math.min(LAB_WIDTH_MAX, availableMaximum)),
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

function addMessage(role, text, id = null) {
  let article = id ? document.getElementById(id) : null;
  if (!article) {
    article = document.createElement("article");
    article.className = `message ${role}`;
    if (id) article.id = id;
    article.innerHTML = `<span class="speaker">${role === "user" ? "YOU" : "DODO"}</span><p></p>`;
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
  rebuildSystemPrompt();
  $("#maxOutputTokens").value = agent.max_output_tokens;
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
    max_output_tokens: Number($("#maxOutputTokens").value),
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
  $("#realtimeVoiceName").textContent = bootstrapData.realtime_voice;
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
  $("#saveApiKey").disabled = true;
  $("#apiKeyStatus").classList.remove("is-ready");
  if (!apiKey) {
    $("#apiKeyStatus").textContent = "請先輸入 OpenAI API Key。";
    return;
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
      return;
    }
    testedApiKey = apiKey;
    $("#saveApiKey").disabled = false;
    $("#apiKeyStatus").textContent = "✓ 測試通過，請按「儲存設定」。";
    $("#apiKeyStatus").classList.add("is-ready");
  } catch {
    $("#apiKeyStatus").textContent = "無法連接本機服務，請確認 Workshop 程式仍在執行。";
  }
}

async function saveApiKey() {
  const apiKey = $("#apiKeyInput").value.trim();
  if (!testedApiKey || apiKey !== testedApiKey) return;
  $("#apiKeyStatus").textContent = "正在儲存 API 設定…";
  const response = await fetch("/api/settings/api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  const result = await response.json();
  if (!response.ok) {
    testedApiKey = "";
    $("#saveApiKey").disabled = true;
    $("#apiKeyStatus").textContent = result.detail || "API 設定儲存失敗。";
    return;
  }
  apiConfigured = true;
  bootstrapData.api_configured = true;
  bootstrapData.api_key_source = result.source;
  bootstrapData.realtime_model = result.realtime_model;
  bootstrapData.realtime_voice = result.realtime_voice;
  bootstrapData.weather_configured = result.weather_configured;
  testedApiKey = "";
  $("#saveApiKey").disabled = true;
  refreshApiUi();
}

async function testWeatherApiKey() {
  const apiKey = $("#weatherApiKeyInput").value.trim();
  testedWeatherApiKey = "";
  $("#saveWeatherApiKey").disabled = true;
  $("#weatherApiKeyStatus").classList.remove("is-ready");
  if (!apiKey) {
    $("#weatherApiKeyStatus").textContent = "請先輸入天氣 API Key。";
    return;
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
      return;
    }
    testedWeatherApiKey = apiKey;
    $("#saveWeatherApiKey").disabled = false;
    $("#weatherApiKeyStatus").textContent = "✓ 測試通過，請按「儲存設定」。";
    $("#weatherApiKeyStatus").classList.add("is-ready");
  } catch {
    $("#weatherApiKeyStatus").textContent = "無法連接本機服務，請確認 Workshop 程式仍在執行。";
  }
}

async function saveWeatherApiKey() {
  const apiKey = $("#weatherApiKeyInput").value.trim();
  if (!testedWeatherApiKey || apiKey !== testedWeatherApiKey) return;
  $("#weatherApiKeyStatus").textContent = "正在儲存天氣 API 設定…";
  const response = await fetch("/api/settings/weather-api-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  const result = await response.json();
  if (!response.ok) {
    testedWeatherApiKey = "";
    $("#saveWeatherApiKey").disabled = true;
    $("#weatherApiKeyStatus").textContent = result.detail || "天氣 API 設定儲存失敗。";
    return;
  }
  weatherConfigured = true;
  bootstrapData.weather_configured = true;
  bootstrapData.weather_key_source = result.source;
  testedWeatherApiKey = "";
  $("#saveWeatherApiKey").disabled = true;
  refreshApiUi();
}

function showOnboarding(forceInit) {
  $("#onboarding").hidden = false;
  if (setup?.inputMode) $(`input[name="inputMode"][value="${setup.inputMode}"]`).checked = true;
  if (setup?.outputMode) $(`input[name="outputMode"][value="${setup.outputMode}"]`).checked = true;
  if (forceInit) {
    $("#entryChoice").hidden = true;
    $("#onboardingTitle").textContent = "API 與輸出入設定";
    $("#finishOnboarding").textContent = "儲存裝置設定";
  }
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

async function runTurnTests() {
  collectWorkshop1();
  setState("thinking", "正在執行 5 項設定預演");
  const response = await fetch("/api/turn-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      realtime: workspace.profile.realtime,
      max_output_tokens: workspace.profile.agent.max_output_tokens,
    }),
  });
  const result = await response.json();
  $("#turnResults").innerHTML = result.checks.map((item) => `
    <div class="test-item ${item.passed ? "is-pass" : "is-fail"}">
      <strong>${item.passed ? "✓" : "×"}</strong><span>${item.name}<br><small>${item.detail}</small></span>
    </div>
  `).join("");
  if (result.passed) {
    workspace.progress.workshop_1_completed = true;
    saveProject();
    addMessage("assistant", `設定預演完成。${workspace.profile.agent.name} 的 Prompt 與 Realtime 回合控制已分開保存；有耳麥時可直接做真實語音驗證。`);
  }
  setState("listening", result.passed ? "Workshop 1：5/5 通過" : "依說明調整後再試一次");
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
    addMessage("assistant", `第二階段完成！${workspace.profile.agent.name} 會記得重要的事，也知道何時不該打擾。`);
  } else if (result.passed) {
    addMessage("assistant", "主動情境已經 6/6 通過，再完成記憶分類就升級成功了。");
  }
  setState("listening", result.passed ? "Workshop 2：主動情境 6/6" : "調整規則後再試一次");
}

async function sendText(message) {
  if (!apiConfigured) {
    addMessage("assistant", "目前沒有連接 OpenAI 模型。請先點右上角「API 設定」。");
    showOnboarding(true);
    return;
  }
  const connected = await connectRealtime();
  if (!connected) return;
  addMessage("user", message);
  setState("thinking", "Dodo 正在整理回答");
  dataChannel.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "message", role: "user", content: [{ type: "input_text", text: message }] },
  }));
  dataChannel.send(JSON.stringify(responseCreateEvent()));
}

function realtimeInstructions() {
  return workspace.profile.agent.system_prompt;
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

function realtimeSpeechSpeed() {
  return 0.82;
}

function realtimeSessionUpdate() {
  return {
    type: "realtime",
    instructions: realtimeInstructions(),
    max_response_output_tokens: workspace.profile.agent.max_output_tokens,
    output_modalities: [setup?.outputMode === "voice" ? "audio" : "text"],
    reasoning: { effort: "low" },
    tools: [
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
    ],
    tool_choice: "auto",
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: "gpt-4o-transcribe",
          language: "zh",
          prompt: "請使用臺灣繁體中文記錄逐字稿，採用臺灣慣用詞，不要使用簡體字。",
        },
        turn_detection: realtimeTurnDetection(),
      },
      output: {
        voice: bootstrapData.realtime_voice,
        speed: realtimeSpeechSpeed(),
      },
    },
  };
}

async function applyWorkshop1() {
  collectWorkshop1();
  await connectRealtime();
  if (dataChannel?.readyState === "open") {
    pendingRealtimeApply = true;
    dataChannel.send(JSON.stringify({ type: "session.update", session: realtimeSessionUpdate() }));
    const isPushToTalk = workspace.profile.realtime.turn_detection.type === "push_to_talk";
    if (microphoneTrack) microphoneTrack.enabled = setup.inputMode === "voice" && !isPushToTalk;
    $("#pushToTalk").hidden = setup.inputMode !== "voice" || !isPushToTalk;
  }
  const voiceNote = dataChannel?.readyState === "open" ? "；Realtime 正在確認更新" : "";
  addMessage("assistant", `已從 5 個 Prompt 區塊重新組裝並套用完整 System Prompt${voiceNote}。下一次回答會使用「${workspace.profile.agent.name}」的最新設定；打字送出不會使用 B 區的 VAD。`);
}

async function executeRealtimeTool(call) {
  let args = {};
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return { error: "工具參數不是有效的 JSON。" };
  }

  if (call.name === "read_memory") return workspace.memory;

  if (call.name === "update_memory") {
    const key = String(args.key || "").trim();
    const value = String(args.value || "").trim();
    if (!key || !value) return { error: "key 與 value 都不可空白。" };
    if (/(密碼|password|api.?key|金鑰|帳號|信用卡|驗證碼)/i.test(`${key} ${value}`)) {
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
    return { saved: true, key, value };
  }

  if (call.name !== "get_weather") return { error: `不支援工具：${call.name}` };

  const statusId = `tool-${call.call_id}`;
  addMessage("assistant", `正在查詢「${args.city || "未指定城市"}」的即時天氣…`, statusId);
  try {
    const response = await fetch("/api/tools/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: args.city || "" }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "天氣查詢失敗。");
    addMessage("assistant", `已取得「${result.city}」的天氣資料，Dodo 正在整理回答。`, statusId);
    document.getElementById(statusId)?.removeAttribute("id");
    return result;
  } catch (error) {
    const detail = error.message || "天氣查詢失敗。";
    addMessage("assistant", detail, statusId);
    document.getElementById(statusId)?.removeAttribute("id");
    return { error: detail };
  }
}

async function handleRealtimeEvent(event) {
  if (event.type === "session.updated" && pendingRealtimeApply) {
    pendingRealtimeApply = false;
    addMessage("assistant", `Realtime 已確認套用由 5 個區塊組成的新 System Prompt。聲線為 ${bootstrapData.realtime_voice}，語速倍率 ${realtimeSpeechSpeed()}。`);
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
  if (["response.created", "response.output_item.added"].includes(event.type)) setState("thinking", "Dodo 正在理解這一回合");
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
      dataChannel?.send(JSON.stringify(responseCreateEvent()));
      return;
    }
    const note = setup.inputMode === "voice" ? "等待你繼續說話" : "等待下一段文字";
    window.setTimeout(() => setState("listening", note), 500);
  }
}

function disconnectRealtime() {
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
  }
  remoteAudio = undefined;
  $("#pushToTalk").hidden = true;
}

async function openRealtimeConnection() {
  let openTimer;
  try {
    disconnectRealtime();
    setState("thinking", "正在自動建立 Realtime 連線");
    peerConnection = new RTCPeerConnection();
    if (setup.outputMode === "voice") {
      remoteAudio = document.createElement("audio");
      remoteAudio.autoplay = true;
      peerConnection.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
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

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    const response = await fetch("/api/realtime/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        "X-Dodo-Output-Mode": setup.outputMode,
      },
      body: offer.sdp,
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
    addMessage("assistant", `${error.message || "Realtime 連線沒有成功。"} 請檢查 API Key、網路；使用語音輸入時也請確認麥克風權限。`);
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
    dataChannel?.send(JSON.stringify({ type: "response.cancel" }));
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
  dataChannel?.send(JSON.stringify(responseCreateEvent()));
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
    addMessage("assistant", `已載入「${workspace.profile.agent.name}」，可以繼續上次的進度。`);
  } catch {
    addMessage("assistant", "這個檔案不是可用的 Dodo 作品，請選擇 my-dodo.json。");
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
$("#saveApiKey").addEventListener("click", saveApiKey);
$("#testWeatherApiKey").addEventListener("click", testWeatherApiKey);
$("#saveWeatherApiKey").addEventListener("click", saveWeatherApiKey);
$("#apiKeyInput").addEventListener("input", () => {
  testedApiKey = "";
  $("#saveApiKey").disabled = true;
  $("#apiKeyStatus").classList.remove("is-ready");
  $("#apiKeyStatus").textContent = "Key 已變更，請重新測試。";
});
$("#weatherApiKeyInput").addEventListener("input", () => {
  testedWeatherApiKey = "";
  $("#saveWeatherApiKey").disabled = true;
  $("#weatherApiKeyStatus").classList.remove("is-ready");
  $("#weatherApiKeyStatus").textContent = "Key 已變更，請重新測試。";
});
$("#finishOnboarding").addEventListener("click", finishOnboarding);
$("#apiSettingsButton").addEventListener("click", () => showOnboarding(true));
$("#turnDetectionMode").addEventListener("change", updateTurnFields);
["#agentName", "#agentAddress", ...PROMPT_BLOCKS.map(([, , selector]) => selector)].forEach((selector) => {
  $(selector).addEventListener("input", rebuildSystemPrompt);
});
$$(".stage-button").forEach((button) => button.addEventListener("click", () => switchStage(button.dataset.stage)));
$("#saveWorkshop1").addEventListener("click", applyWorkshop1);
$("#runTurnTests").addEventListener("click", runTurnTests);
$("#checkMemory").addEventListener("click", checkMemory);
$("#saveWorkshop2").addEventListener("click", () => { collectWorkshop2(); addMessage("assistant", "第二堂設定已保存。"); });
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
