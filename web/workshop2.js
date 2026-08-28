// workshop2.js —— 第二堂：三層記憶、長者資料、主動關心規則與待提醒排程。
//
// 整支包在 IIFE 裡，只掛一個全域；IIFE 內一律零縮排 —— tests/test_web.py 用 `\n}`
// 切函式本體，多一層縮排就切不到。core.js 的頂層 const／let／function 在全域詞法
// 環境裡，這裡直接讀得到；要呼叫另一堂則走 W1.* ／ W2.*。
(() => {
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
// Workshop 2's own editable blocks. Their default text lives only in
// profile.py's DEFAULT_WORKSPACE and arrives via /api/bootstrap, so there is no
// second copy to keep in sync.
const WORKSHOP2_BLOCKS = [
  ["memory_use", "記憶使用規則", "#promptMemoryUse"],
  ["proactive", "主動關心規則", "#promptProactive"],
];

registerApplyGroup("workshop2", {
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
        renderPriorityFields(policy.priorities);
        renderProactiveEventOptions();
      },
    },
  },
});
// Only Workshop 2 reads or writes this: 記憶分類 sets it, 執行 6 個情境 gates on it.
let memoryPassed = false;

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

/** The six numbers behind 事件優先權. The docs told students to tune them and
 *  the screen had no field for it — the only way in was editing the JSON by
 *  hand. Rendered once per load (and per 取消變更): re-rendering on every
 *  keystroke would re-sort the rows under the cursor. */
function renderPriorityFields(priorities = workspace.profile.proactive_policy.priorities) {
  const entries = Object.entries(priorities || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  $("#priorityFields").innerHTML = entries.map(([type, score]) => `
    <label class="priority-field">
      <span>${escapeHtml(PROACTIVE_EVENT_LABELS[type] || type)}</span>
      <input type="number" min="0" max="999" data-priority="${escapeHtml(type)}" value="${Number(score) || 0}">
    </label>`).join("");
}

/** Keys come out alphabetically, not in DOM order: the dirty check compares
 *  JSON strings, and a re-sorted 取消變更 would otherwise look like an edit. */
function prioritiesFromFields() {
  const inputs = [...document.querySelectorAll("#priorityFields [data-priority]")];
  if (!inputs.length) return { ...(workspace.profile.proactive_policy.priorities || {}) };
  return Object.fromEntries(inputs
    .map((input) => [input.dataset.priority, Math.max(0, Number(input.value) || 0)])
    .sort((left, right) => left[0].localeCompare(right[0])));
}

function renderProactiveEventOptions() {
  // From the fields rather than the saved workspace, so lowering emergency shows
  // up in this dropdown before 套用 — 「類型只是一個數字」stays visible.
  const priorities = proactivePolicyFromFields().priorities || {};
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

/** Workshop 2's half of core's loadFields(): the elder profile, the two
 *  editable blocks and the proactive numbers. The previews that read them run
 *  afterwards, from core. */
function loadFields() {
  const { elder_profile: elder, proactive_policy: proactive } = workspace.profile;
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
  renderPriorityFields(proactive.priorities);
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
    priorities: prioritiesFromFields(),
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
      agent: W1.agentFromFields(),
      workshop2_blocks: workshop2BlocksFromFields(),
      elder_profile: elderProfileFromFields(),
      // Not editable in the UI, but it decides the retention labels.
      memory_policy: workspace.profile.memory_policy,
      proactive_policy: proactivePolicyFromFields(),
    },
    memory: workspace.memory,
  };
}

function rebuildWorkshop2Prompt() {
  $("#workshop2SystemPrompt").textContent = composeInstructions(workshop2Draft());
}

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
    const status = due ? "時間已到" : SCHEDULE_STATUS_LABELS[item.status] || item.status;
    // One line: 時間・類型・內容・狀態・×. The reason only takes a second line
    // when there is one — that sentence names the rule that blocked it, which
    // is the whole lesson, so it is never truncated away.
    return `<div class="schedule-row is-${item.status}${due ? " is-due" : ""}">
      <time>${escapeHtml(item.time)}</time>
      <span class="schedule-kind">${escapeHtml(DAY_EVENT_LABELS[item.type] || item.type)}</span>
      <span class="schedule-topic">${escapeHtml(item.topic || "（未填寫內容）")}</span>
      <span class="schedule-status">${escapeHtml(status)}</span>
      <button type="button" class="schedule-delete" data-schedule-id="${escapeHtml(item.id)}" title="刪除這一筆" aria-label="刪除 ${escapeHtml(item.time)} 的待提醒">×</button>
      ${item.reason ? `<small class="schedule-reason">${escapeHtml(item.reason)}</small>` : ""}
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

// =====================================================================
// 觸發主動 had three stacked blocks: a shared 事件 form with no heading of its
// own, then A and B. The only real difference between A and B is which clock
// decides, so that became the switch and the headings went away.
// =====================================================================
const TRIGGER_MODE_NOTES = {
  schedule: "用<strong>真實時鐘</strong>和真實累積量：時間到了，瀏覽器代替事件源推一次，跑的是同一個 <code>choose_event</code>。每一筆只觸發一次。",
  manual: "下面四個欄位都是<strong>你假設的狀況</strong>，用來一次一次戳規則的邊界，例如「如果現在是凌晨三點呢」。不影響下面的待提醒清單。",
};

function switchTriggerMode(mode) {
  const target = TRIGGER_MODE_NOTES[mode] ? mode : "schedule";
  $$("[data-trigger-mode]").forEach((button) => {
    const isActive = button.dataset.triggerMode === target;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    document.getElementById(button.getAttribute("aria-controls")).hidden = !isActive;
  });
  $("#triggerModeNote").innerHTML = TRIGGER_MODE_NOTES[target];
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

// `choose_event` returns a sentence, not a code. Matching on the distinctive
// word is enough to total up which rule did the work — and that total is the
// most direct answer this page has to 「為什麼要設計這條規則」.
const BLOCK_RULES = [
  ["安靜時段", "安靜時段"],
  ["太近", "冷卻時間"],
  ["上限", "每日上限"],
  ["拒絕", "尊重拒絕"],
];

function renderDayBlockers(result) {
  const tally = new Map();
  result.steps.filter((step) => !step.spoke).forEach((step) => {
    const hit = BLOCK_RULES.find(([needle]) => String(step.reason).includes(needle));
    const label = hit ? hit[1] : "其他";
    tally.set(label, (tally.get(label) || 0) + 1);
  });
  if (!tally.size) return '<p class="day-blockers">這一天沒有任何事件被擋下 —— 13 件全說出去了。</p>';
  const ranked = [...tally.entries()].sort((left, right) => right[1] - left[1]);
  const breakdown = ranked.map(([label, count]) => `${label} <b>${count}</b> 次`).join("・");
  return `<p class="day-blockers">這一天擋掉最多的是〈<strong>${ranked[0][0]}</strong>〉：${breakdown}。</p>`;
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
      ${renderDayBlockers(result)}
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

// Workshop 2's half of the field list core's bindFieldEvents() wires up.
const WORKSHOP2_FIELDS = [
  "#elderAddress", "#elderCity", "#elderInterests", ...WORKSHOP2_BLOCKS.map(([, , selector]) => selector),
  "#quietStart", "#quietEnd", "#cooldown", "#dailyLimit", "#maxSentences",
];

/** Everything this lesson listens to. Called once, from core's initialize(). */
function init() {
  // Workshop 2 fields feed the composed instructions, so the VIEW panel has to
  // follow them live the same way Workshop 1's does.
  bindFieldEvents(WORKSHOP2_FIELDS, () => {
    rebuildWorkshop2Prompt();
    refreshApplyState();
    // 主動規則 is five numbers; the band and the hints are what make them legible.
    renderPolicyPreview();
    renderTriggerHints();
  });
  // Dynamic rows, so the listener lives on the container. Editing a priority
  // changes the Prompt, the 套用 state and the 觸發主動 dropdown — but never
  // re-renders these inputs, which would move the row being typed into.
  ["input", "change"].forEach((event) => $("#priorityFields").addEventListener(event, () => {
    rebuildWorkshop2Prompt();
    refreshApplyState();
    renderProactiveEventOptions();
  }));
  $$("[data-trigger-mode]").forEach((button) => {
    button.addEventListener("click", () => switchTriggerMode(button.dataset.triggerMode));
  });
  // The manual trigger's own fields are half of every comparison in the hints.
  bindFieldEvents(["#proactiveNow", "#proactiveSinceLast", "#proactiveSentToday"], renderTriggerHints);
  // The quiz cards address the elder by name, so they follow 長者稱呼 live.
  ["input", "change"].forEach((event) => $("#elderAddress").addEventListener(event, renderMemoryCards));

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
}

/** The one global this file defines — see the note on globalThis in
 *  workshop1.js. */
globalThis.W2 = {
  init,
  loadFields,
  collect: collectWorkshop2,
  migrateWorkshop2Blocks,
  buildWorkshop2Prompt,
  rebuildWorkshop2Prompt,
  renderProactiveEventOptions,
  renderMemoryViewer,
  renderMemoryCards,
  renderPolicyPreview,
  renderTriggerHints,
  renderProactiveLiveState,
  renderScheduleList,
  switchTriggerMode,
  startScheduler,
  // Read by core's executeRealtimeTool, which owns the Realtime tool loop.
  upsertMemory,
  forgetMemory,
  describeMemoryWrite,
  MEMORY_LAYERS,
  MEMORY_MERGE_RULES,
  // No production caller outside this file; tests/browser/uicheck.js drives
  // these two directly to check the merge rules and the quiet-hour wrap-around.
  memoryEntryText,
  isQuietHour,
};
})();
