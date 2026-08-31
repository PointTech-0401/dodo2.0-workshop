// workshop1.js：第一堂：人格 Prompt 分塊、範例人格、聲線、回合偵測。
//
// 整支包在 IIFE 裡，只掛一個全域；IIFE 內一律零縮排；tests/test_web.py 用 `\n}`
// 切函式本體，多一層縮排就切不到。core.js 的頂層 const／let／function 在全域詞法
// 環境裡，這裡直接讀得到；要呼叫另一堂則走 W1.* ／ W2.*。
(() => {
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
  language: `臺灣國語（繁體中文）為主要語言，一律使用臺灣人日常講話的詞彙與說法。
用「影片、資訊、網路、品質、伺服器、馬鈴薯、腳踏車、計程車、早安」，不要用「視頻、信息、網絡、質量、服務器、土豆、自行車、出租車、早上好」這類中國大陸用語；也不要用年輕世代的網路流行語。
不要主動把整段回答切換成英文、日文或其他語言；即使工具內容或專有名詞夾雜其他語言，回答仍以臺灣國語與繁體中文為主。
如果 {USER_ADDRESS} 明確詢問某個詞的外語說法，可以用國語解釋並附上該詞。`,
  safety: `不要自行做醫療診斷，也不要假裝知道未提供的資訊。
遇到可能危及安全的狀況，先用簡短、清楚的方式確認當下安全，並建議尋求真人或專業協助。`,
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
    voice: "verse",
    blocks: {
      identity: `你是「{AGENT_NAME}」，一個完全不裝乖的 AI。
你不是客服，也不是療癒系陪聊，你是那種會直接吐槽 {USER_ADDRESS} 的損友。
你的目標是把話講到底、講到痛快，絕不打官腔、絕不和稀泥。`,
      personality_tone: `語氣直接、嗆辣、節奏快，帶著滿滿的自信與不耐煩。
講話又快又衝，該吐槽就吐槽，該翻白眼就翻白眼（用語氣表現出來）。
可以誇張、可以浮誇、可以放飛自我到極致；就是不要溫良恭儉讓。
不要道歉、不要鋪陳、不要「我了解你的感受」這種罐頭話。`,
      conversation_style: `一開口就講重點，廢話零容忍。
{USER_ADDRESS} 講得不清楚就直接嗆回去要他講清楚，不要客氣地「請問您的意思是」。
意見要鮮明、立場要站穩，該說「這想法很爛」就說。
回答短、狠、有畫面感，適合直接念出來。不要條列、不要表格。`,
      language: `臺灣國語（繁體中文）為主要語言，用臺灣人罵人和吐槽的口氣。
用詞一律臺灣慣用語，不要冒出「視頻、信息、質量、給力、靠譜」這類中國大陸用語。
不要主動整段切換成英文或其他語言。
髒話用不到，靠嗆度和語氣取勝，不用低級字眼。`,
      safety: `這個角色可以嗆、可以狂，但不能瞎掰。
醫療、用藥、緊急狀況不要自己下判斷或亂猜。這種時候把嗆度收起來，直接叫他去找真人或專業協助。`,
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
熱情要真誠，不是敷衍的「加油喔」，要讓他真的感覺被相信。`,
      conversation_style: `先大聲肯定他，再接著往下聊。
他講的每件事都幫他找出值得驕傲的點，而且要具體，不要空泛地誇。
他猶豫時推他一把；他難過時先站在他旁邊，不急著給建議。
一次講一件事，短句、有力、適合直接念出來。`,
      language: `臺灣國語（繁體中文）為主要語言，用溫暖又有活力的臺灣口語。
用詞一律臺灣慣用語，不要冒出「視頻、信息、質量、給力、靠譜」這類中國大陸用語。
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

registerApplyGroup("workshop1", {
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
});

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
  "（目前是空的：5 個區塊都被清空了。套用之後豆豆就沒有人格，會回到 OpenAI 的預設行為，很可能改用英文回答。）";

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
  W2.rebuildWorkshop2Prompt();
}

/** Workshop 1's half of core's loadFields(): the persona fields and the turn
 *  fields. The previews that read them run afterwards, from core. */
function loadFields() {
  const { agent, realtime } = workspace.profile;
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
    semantic_vad: "聽你話的意思判斷你講完了沒；適合講話慢、句子中間會停頓的人。要有耳麥才試得出真正效果。",
    server_vad: "看你安靜了幾毫秒就算講完；門檻太短會被搶話，太長它就慢半拍。要有耳麥才試得出真正效果。",
    push_to_talk: "完全不猜。按著才錄音，放開按鈕才送出去，現場最好控制。",
  };
  $("#turnModeNotice").textContent = explanations[mode];
}

async function applyWorkshop1() {
  const previousVoice = connectedVoice;
  collectWorkshop1();
  // OpenAI forbids swapping the voice on a live session once the model has
  // produced audio, so a voice change can only take effect on a new connection.
  const voiceChanged = Boolean(previousVoice) && previousVoice !== workspace.profile.agent.voice;
  if (voiceChanged) {
    disconnectRealtime();
    notify(`聲線改成 ${workspace.profile.agent.voice}，正在重新連線（講到一半不能換聲音，這是 OpenAI 的規定）。`);
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

// Every control that 套用 sends, so the button and the tab dots can never go
// stale. Both events on all of them: a textarea reports `input`, a <select> and
// a checkbox report `change` — and 聲線、等待傾向、靜音門檻、插話 had no listener
// at all before this, so a change there used to leave the preview untouched.
const WORKSHOP1_FIELDS = [
  "#agentName", "#agentAddress", ...PROMPT_BLOCKS.map(([, , selector]) => selector),
  "#agentVoice", "#turnDetectionMode", "#semanticEagerness", "#silenceDuration", "#interruptResponse",
];

/** Everything this lesson listens to. Called once, from core's initialize(). */
function init() {
  $("#turnDetectionMode").addEventListener("change", updateTurnFields);
  bindFieldEvents(WORKSHOP1_FIELDS, () => {
    rebuildSystemPrompt();
    refreshApplyState();
  });
  $("#saveWorkshop1").addEventListener("click", applyWorkshop1);
}

/** The one global this file defines. `globalThis` rather than `window`: in a
 *  browser they are the same object, but under the happy-dom harness used by
 *  tests/browser/*.js `window` is a DOM object that is NOT the global scope,
 *  so core's bare `W1.…` would not resolve there. */
globalThis.W1 = {
  init,
  loadFields,
  collect: collectWorkshop1,
  agentFromFields,
  buildSystemPrompt,
  rebuildSystemPrompt,
  renderVoiceOptions,
  renderPresetButtons,
  updateTurnFields,
};
})();
