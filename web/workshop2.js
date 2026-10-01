// workshop2.js：第二堂：建檔、對話規範分塊、三層記憶、主動關心規則與待提醒排程。
//
// 整支包在 IIFE 裡，只掛一個全域；IIFE 內一律零縮排；tests/test_web.py 用 `\n}`
// 切函式本體，多一層縮排就切不到。core.js 的頂層 const／let／function 在全域詞法
// 環境裡，這裡直接讀得到；要呼叫另一堂則走 W1.* ／ W2.*。
(() => {
// =====================================================================
// 記憶：三層、來源、合併規則
// =====================================================================
// A/B/C maps onto the three lists in `workspace.memory`.
const MEMORY_LAYERS = [
  ["A", "facts", "A 重要事實"],
  ["B", "events", "B 近期事件"],
  ["C", "summaries", "C 跨日摘要"],
];
// Everything from here to `composeRulesSection` mirrors dodo_workshop/
// prompt_sections.py word for word; tests/fixtures/workshop2_prompt.txt pins
// both sides, and tests/browser/uicheck.js compares this composer against it.
const MEMORY_PREVIEW_LIMIT = 16;
const MEMORY_LAYER_HEADINGS = {
  facts: "A 重要事實（長期保存；標［護理員］的你不能改）",
  events: "B 近期事件（會過期；同一件事新的取代舊的）",
  summaries: "C 跨日摘要（由系統整理，不是人寫的）",
};
const SOURCE_MARKERS = { caregiver: "［護理員］", system: "［系統］" };
const SOURCE_LABELS = { caregiver: "護理員建", dodo: "豆豆記的", system: "系統整理" };
const MEMORY_TAG_LABELS = { interest: "興趣", preference: "偏好", medical_note: "醫囑", symptom: "症狀", note: "短期念頭" };
const WEEKDAY_NAMES = { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六", 7: "日" };
const MAX_MESSAGE_SENTENCES = 2;
const DEFAULT_PROACTIVE_POLICY = { interval_minutes: 30, daily_limit: 4 };
// What「再存一次同一個 key」means is different in each layer, and that difference
// is the real behavioural payload of A/B/C:
//   A 累加   ：興趣：唱歌 and 興趣：跳舞 are both true, so both stay. Caregiver
//               facts are locked: the model may add beside them, never replace.
//   B 取代   ：近期事件 IS the latest state. 「膝蓋好多了」 replaces 「膝蓋痛」,
//               which is what stops the 健康關心 follow-up. Capped so stale days
//               cannot pile up outside the prompt window.
//   C 重寫   ：a summary is recomputed from scratch, never appended to.
const MEMORY_MERGE_RULES = {
  A: { merge: "accumulate", label: "累加：同一個 key 可以並存多筆事實；護理員建的豆豆不能改", capacity: 0 },
  B: { merge: "supersede", label: `取代：同一個 key 只留最新一筆，整層最多 ${MEMORY_PREVIEW_LIMIT} 筆`, capacity: MEMORY_PREVIEW_LIMIT },
  C: { merge: "rewrite", label: "重寫：摘要由系統重算，同一個 key 直接覆蓋", capacity: 0 },
};
// Workshop 2's editable blocks: how 豆豆 speaks, never what it knows.
// 建檔決定資料，Prompt 只寫規範.
// Default text lives in profile.py and arrives via /api/bootstrap.
const WORKSHOP2_BLOCKS = [
  ["memory_use", "記憶使用規則", "#promptMemoryUse"],
  ["attitude_reminder", "重要提醒怎麼講", "#promptAttitudeReminder"],
  ["attitude_health", "健康關心怎麼問", "#promptAttitudeHealth"],
  ["attitude_chat", "閒聊從哪裡開始", "#promptAttitudeChat"],
];

// 規範範例: three ways of writing the same four blocks, against the same 建檔.
// The point is that none of them touches her data — swap one in, ask the same
// question, and the difference is entirely 怎麼說, which is what this tab owns.
// 陪伴型's blocks are the shipped defaults, read from bootstrap rather than
// copied, so a change in profile.py cannot leave a stale duplicate here.
const RULE_PRESETS = [
  {
    id: "companion",
    label: "陪伴型",
    hint: "預設：先問感覺、從興趣起頭、可以請教她",
    blocks: null,
  },
  {
    id: "brief",
    label: "話少型",
    hint: "能不開口就不開口；開口只講一件事，不追問",
    blocks: {
      memory_use: `記憶分三層，用 read_memory 讀、用 update_memory 寫，寫入時指定 layer：
A 重要事實（layer=A）：過敏、慢性病、醫囑、緊急聯絡人、長期偏好。同一個 key 可以並存多筆。標［護理員］的你不能改也不能刪。
B 近期事件（layer=B）：這幾天的身體與心情。同一件事新的取代舊的：她說好多了就用 mode="replace" 換掉。
C 跨日摘要：由系統整理，不要自己寫。
不保存：密碼、卡號、帳號、驗證碼；第三人的健康；對任何人的評價。也不要在對話中複誦。
寫記憶不要說出來打斷她。只有她問起、或那件事正好要用到時才提記憶，其他時候記住就好。`,
      attitude_reminder: `一句話：稱呼＋時間＋要做的事。不解釋、不叮嚀、不加關心語。說完就結束，不接話題。`,
      attitude_health: `只問一句「今天還好嗎」，等她回答。她說好了就用 update_memory 換掉那一筆；她說不好，聽完回一句就好，不追問、不給建議。她沒有要講就不要再問。`,
      attitude_chat: `除非她先開口，否則不主動閒聊。真的要開口就講一句，講完等她。她沒有接話就結束，不要再找話題。`,
    },
  },
  {
    id: "clinical",
    label: "照護嚴謹型",
    hint: "用藥與回診逐項確認；不確定就請她找護理員",
    blocks: {
      memory_use: `記憶分三層，用 read_memory 讀、用 update_memory 寫，寫入時指定 layer：
A 重要事實（layer=A）：過敏、慢性病、醫囑、緊急聯絡人、長期偏好。同一個 key 可以並存多筆。標［護理員］的是護理員建的，你不能改也不能刪；她要改，請她告訴護理員。
B 近期事件（layer=B）：這幾天的身體狀況與心情。同一件事新的取代舊的：她說膝蓋好多了，就用 mode="replace" 換掉，並把她的原話一起寫進去。
C 跨日摘要：由系統整理，不要自己寫。
不保存：密碼、卡號、帳號、驗證碼；第三人的健康；對任何人的評價。也不要在對話中複誦。
身體狀況有變化就當場記下來，寫的時候用她自己的說法，不要改寫成醫學名詞。你不是醫護人員：不判斷、不推測原因，該找人的時候請她找護理員。
讀或寫記憶之前，先用一句話說明你正要做什麼（這句開場叫 preamble）。`,
      attitude_reminder: `先叫她的稱呼，講清楚時間、要做的事、要帶的東西。講完問一句「這樣可以嗎」，確認她聽到了。她說已經做了就回一句知道了，不重複。`,
      attitude_health: `先問感覺，再問一句具體的（什麼時候開始、跟昨天比怎麼樣），問完就停。不給建議、不推測原因、不說「要多注意」。她說好了就用 update_memory 換掉那一筆；她說不好或聽起來不對勁，請她跟護理員說，並告訴她你會記下來。`,
      attitude_chat: `從她的興趣起頭，一次一件，兩句以內。閒聊中聽到身體、睡眠、吃飯的事就記下來，但不要把閒聊變成問診。碰到「不主動提起」清單裡的事，等她自己開口。`,
    },
  },
];

// =====================================================================
// 建檔：六區表單。The scalar fields are plain inputs; the seven list sections
// render rows into a container and are read back by kind. Interests and
// symptoms are not part of `elder_profile` — they are caregiver-written memory
// entries, so the memory viewer stays the single source of truth for what 豆豆
// knows, and the merge rules apply to them like to anything else.
// =====================================================================
const INTAKE_SCALARS = [
  ["#elderAddress", "address"], ["#elderName", "name"], ["#elderRoom", "room"], ["#elderCity", "city"],
  ["#elderLanguage", "language"], ["#elderBackground", "background"],
  ["#elderWake", "wake_time"], ["#elderBed", "bed_time"],
];
const FACT_TAGS = ["interest", "preference", "medical_note"];
const SYMPTOM_TAGS = ["symptom", "note"];
const ROW_KINDS = {
  routine: { container: "#routineRows", empty: () => ({ label: "", start: "", end: "", do_not_disturb: true, weekdays: [] }) },
  medication: { container: "#medicationRows", empty: () => ({ name: "", time: "", note: "" }) },
  appointment: { container: "#appointmentRows", empty: () => ({ label: "", weekday: "", date: "", time: "", note: "" }) },
  fact: { container: "#factRows", empty: () => ({ key: "", value: "", tag: "interest" }) },
  symptom: { container: "#symptomRows", empty: () => ({ key: "", value: "", tag: "symptom" }) },
  taboo: { container: "#tabooRows", empty: () => ({ topic: "", rule: "" }) },
  declined: { container: "#declinedRows", empty: () => ({ text: "", reason: "" }) },
};
const attr = (value) => escapeHtml(String(value ?? ""));
const textInput = (field, value, placeholder = "", extra = "") =>
  `<input data-field="${field}" value="${attr(value)}" placeholder="${attr(placeholder)}" ${extra}>`;
const timeInput = (field, value) => `<input type="time" data-field="${field}" value="${attr(value)}">`;
const tagSelect = (tags, current) => `<select data-field="tag">${tags.map((tag) =>
  `<option value="${tag}" ${tag === current ? "selected" : ""}>${MEMORY_TAG_LABELS[tag]}</option>`).join("")}</select>`;
const weekdayBoxes = (checked) => `<span class="weekday-boxes" aria-label="星期">${Object.entries(WEEKDAY_NAMES).map(([day, name]) =>
  `<label><input type="checkbox" data-weekday="${day}" ${checked.includes(Number(day)) ? "checked" : ""}>${name}</label>`).join("")}</span>`;

const ROW_TEMPLATES = {
  routine: (row) => `${textInput("label", row.label, "午睡、歌唱班…")}${timeInput("start", row.start)}<span class="row-dash">–</span>${timeInput("end", row.end)}
    <label class="row-check"><input type="checkbox" data-field="do_not_disturb" ${row.do_not_disturb ? "checked" : ""}>不打擾</label>${weekdayBoxes(row.weekdays || [])}`,
  medication: (row) => `${timeInput("time", row.time)}${textInput("name", row.name, "藥名")}${textInput("note", row.note, "備註：飯後、配溫水…")}`,
  appointment: (row) => `${textInput("label", row.label, "復健、回診…")}<select data-field="weekday"><option value="">單次</option>${Object.entries(WEEKDAY_NAMES).map(([day, name]) =>
    `<option value="${day}" ${String(row.weekday) === day ? "selected" : ""}>每週${name}</option>`).join("")}</select><input type="date" data-field="date" value="${attr(row.date)}">${timeInput("time", row.time)}${textInput("note", row.note, "要帶什麼")}`,
  fact: (row) => `${textInput("key", row.key, "喜歡的歌、口味、醫囑…")}${textInput("value", row.value, "內容")}${tagSelect(FACT_TAGS, row.tag)}`,
  symptom: (row) => `${textInput("key", row.key, "膝蓋、睡眠…")}${textInput("value", row.value, "現在怎麼樣、從什麼時候開始")}${tagSelect(SYMPTOM_TAGS, row.tag)}`,
  taboo: (row) => `${textInput("topic", row.topic, "話題")}${textInput("rule", row.rule, "她自己提起才回應、不說教…")}`,
  declined: (row) => `${textInput("text", row.text, "訪談稿裡那一句")}${textInput("reason", row.reason, "為什麼不記")}`,
};

function renderRows(kind, rows) {
  const container = $(ROW_KINDS[kind].container);
  const items = Array.isArray(rows) && rows.length ? rows : [];
  container.innerHTML = items.map((row, index) => `
    <div class="row-item row-${kind}" data-row="${index}">
      ${ROW_TEMPLATES[kind]({ ...ROW_KINDS[kind].empty(), ...row })}
      <button type="button" class="row-remove" data-remove="${index}" title="移除這一列" aria-label="移除第 ${index + 1} 列">×</button>
    </div>`).join("");
  // Every <select> is assigned after the markup rather than trusting
  // `<option selected>` to survive innerHTML: happy-dom does not apply it (its
  // selectedIndex comes back as 1 whatever the markup says), so tests/browser
  // could not otherwise check that 取消變更 restores a list row. A select left on
  // the wrong option is a 取消變更 that never finishes — read() would disagree
  // with the snapshot forever and the dirty dot could never be cleared.
  [...container.querySelectorAll(".row-item")].forEach((element, index) => {
    const row = { ...ROW_KINDS[kind].empty(), ...items[index] };
    element.querySelectorAll("select[data-field]").forEach((select) => {
      select.value = String(row[select.dataset.field] ?? "");
    });
  });
  container.classList.toggle("is-empty", !items.length);
}

/** One row back into an object. Everything the snapshot compares comes through
 *  here, so it has to be deterministic: trimmed strings, numbers as numbers,
 *  weekdays sorted — or 取消變更 would leave a phantom dirty dot. */
function readRow(kind, element) {
  const row = ROW_KINDS[kind].empty();
  element.querySelectorAll("[data-field]").forEach((input) => {
    const field = input.dataset.field;
    row[field] = input.type === "checkbox" ? input.checked : input.value.trim();
  });
  if (kind === "routine") {
    row.weekdays = [...element.querySelectorAll("[data-weekday]:checked")].map((box) => Number(box.dataset.weekday)).sort();
  }
  if (kind === "appointment") {
    row.weekday = row.weekday ? Number(row.weekday) : "";
  }
  return row;
}

const ROW_TEXT_FIELDS = {
  routine: ["label", "start", "end"], medication: ["name", "time", "note"], appointment: ["label", "date", "time", "note"],
  fact: ["key", "value"], symptom: ["key", "value"], taboo: ["topic", "rule"], declined: ["text", "reason"],
};
const ROW_SORT_KEY = { routine: "start", medication: "time" };

function readRows(kind) {
  const rows = [...$(ROW_KINDS[kind].container).querySelectorAll(".row-item")]
    .map((element) => readRow(kind, element))
    // A row the student added and never filled is not data.
    .filter((row) => ROW_TEXT_FIELDS[kind].some((field) => row[field]) || (kind === "appointment" && row.weekday));
  const sortKey = ROW_SORT_KEY[kind];
  return sortKey ? rows.sort((left, right) => String(left[sortKey]).localeCompare(String(right[sortKey]))) : rows;
}

function splitList(text) {
  return String(text || "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
}

/** The whole 建檔 as the backend's shapes: `elder_profile`, plus the caregiver-
 *  written facts and events that go into `workspace.memory`. */
function intakeFromFields() {
  const elder = { ...structuredClone(bootstrapData.default_workspace.profile.elder_profile) };
  INTAKE_SCALARS.forEach(([selector, field]) => { elder[field] = $(selector).value.trim(); });
  elder.expertise = splitList($("#elderExpertise").value);
  elder.routines = readRows("routine");
  elder.medications = readRows("medication");
  elder.appointments = readRows("appointment").map((row) => {
    const item = { label: row.label, time: row.time, note: row.note };
    if (row.weekday) item.weekday = row.weekday;
    else if (row.date) item.date = row.date;
    return item;
  });
  elder.emergency_contact = {
    name: $("#contactName").value.trim(),
    relation: $("#contactRelation").value.trim(),
    phone: $("#contactPhone").value.trim(),
  };
  elder.taboos = readRows("taboo");
  elder.declined_notes = readRows("declined");
  const stamp = (row) => ({ key: row.key, value: row.value, tag: row.tag, source: "caregiver" });
  return { elder, facts: readRows("fact").map(stamp), events: readRows("symptom").map(stamp) };
}

function caregiverEntries(field) {
  return (workspace.memory?.[field] || []).filter((entry) => entry && entry.source === "caregiver");
}

/** The form owns the caregiver rows; whatever 豆豆 or the system wrote stays,
 *  after them. A caregiver row that did not change keeps its timestamp. */
function mergeCaregiver(existing, rows) {
  const previous = Array.isArray(existing) ? existing : [];
  const kept = previous.filter((entry) => !(entry && entry.source === "caregiver"));
  const stamped = rows.map((row) => {
    const same = previous.find((entry) => entry && entry.source === "caregiver" && entry.key === row.key && entry.value === row.value);
    return { ...row, updated_at: same?.updated_at || new Date().toISOString() };
  });
  return [...stamped, ...kept];
}

function writeIntake({ elder, facts, events }) {
  INTAKE_SCALARS.forEach(([selector, field]) => { $(selector).value = elder[field] || ""; });
  $("#elderExpertise").value = (elder.expertise || []).join("、");
  renderRows("routine", elder.routines);
  renderRows("medication", elder.medications);
  renderRows("appointment", elder.appointments);
  $("#contactName").value = elder.emergency_contact?.name || "";
  $("#contactRelation").value = elder.emergency_contact?.relation || "";
  $("#contactPhone").value = elder.emergency_contact?.phone || "";
  renderRows("fact", facts);
  renderRows("symptom", events);
  renderRows("taboo", elder.taboos);
  renderRows("declined", elder.declined_notes);
  renderIntakeHints();
}

// Per-section consequence lines: what filling this section in will *do*, shown
// the moment it is filled — the 60-minute wait for feedback was the deepest
// valley in the old timetable.
function renderIntakeHints() {
  const symptoms = readRows("symptom").filter((row) => row.tag === "symptom").length;
  const taboos = readRows("taboo").length;
  const declined = readRows("declined").length;
  const quiet = readRows("routine").filter((row) => row.do_not_disturb).length;
  const meds = readRows("medication").length;
  $("#hintRoutines").textContent = quiet
    ? `${quiet} 段不打擾時段會變成主動規則分頁帶狀圖上的灰色；只有重要提醒能穿過。`
    : "還沒有不打擾時段：現在豆豆一整天什麼時候都能開口。";
  $("#hintCare").textContent = meds
    ? `${meds} 筆用藥會變成重要提醒，不受間隔與上限限制，也不算今天的次數。`
    : "還沒有用藥：豆豆不會有任何重要提醒可以講。";
  $("#hintSymptoms").textContent = symptoms
    ? `${symptoms} 筆症狀會變成健康關心的題材：豆豆會挑時間問「還好嗎」，她說好了就換掉那一筆。標「短期念頭」的不會被拿去問，它們是閒聊的材料。`
    : "還沒有症狀：豆豆沒有健康關心可以問。";
  $("#hintTaboos").textContent = `${taboos} 個禁區會進 Prompt 的「# 不主動提起」；${declined} 句決定不記，不會進任何地方。`;
}

let intakeCheckTimer = null;
function scheduleIntakeCheck() {
  clearTimeout(intakeCheckTimer);
  intakeCheckTimer = setTimeout(runIntakeCheck, 400);
}

/** Counts per section against what the interview actually contains. Not a
 *  grade: whether the content is right is answered by 豆豆's own answers. */
async function runIntakeCheck() {
  const { elder, facts, events } = intakeFromFields();
  try {
    const response = await fetch("/api/intake-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ elder_profile: elder, memory: { facts, events } }),
    });
    if (!response.ok) return;
    renderCompleteness(await response.json());
  } catch {
    // Offline: the chips just keep their last value.
  }
}

function renderCompleteness(result) {
  $("#intakeCompleteness").innerHTML = result.completeness.map((row) => `
    <span class="check-chip ${row.done ? "is-done" : ""}">${escapeHtml(row.label)} <b>${row.have}</b>/${row.expected}</span>`).join("");
}

/** The interview is markdown with headings, bold, blockquotes and rules; that
 *  is all this renders. Escaped first — it is content, not markup. */
function renderInterview() {
  const inline = (text) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  const html = String(bootstrapData?.interview_markdown || "").split(/\r?\n/).map((line) => {
    if (!line.trim()) return "";
    if (line.startsWith("## ")) return `<h4>${inline(line.slice(3))}</h4>`;
    if (line.startsWith("# ")) return `<h3>${inline(line.slice(2))}</h3>`;
    if (line.startsWith("> ")) return `<blockquote>${inline(line.slice(2))}</blockquote>`;
    if (line.trim() === "---") return "<hr>";
    return `<p>${inline(line)}</p>`;
  }).join("");
  $("#interviewText").innerHTML = html;
}

/** The transcript covers the chat area, not the lab panel — reading it and
 *  filling 建檔 is one action, so the form on the right stays live while it is
 *  open. Toggled with `hidden` so both states are observable from a test. */
function showInterview() {
  $("#interviewOverlay").hidden = false;
  $("#interviewText").scrollTop = 0;
  $("#closeInterview").focus();
}

function hideInterview() {
  if ($("#interviewOverlay").hidden) return;
  $("#interviewOverlay").hidden = true;
  // Only pull focus back when the button that opened it is actually on screen:
  // 關閉 also fires from Esc and from leaving the stage.
  if (!$("#workshop2Panel").hidden && !$("#tabW2Intake").hidden) $("#showInterview").focus();
}

/** The opt-out from a 35-minute form. It overwrites all six sections, so it
 *  always asks first. Then it fills the fields and stops there: the student still
 *  presses 套用, so this takes exactly the path a typed 建檔 takes and 取消變更
 *  still undoes it. Nothing is written to `workspace` from here. */
async function loadReferenceIntake() {
  const sure = await askConfirm({
    title: "確定要載入範例建檔嗎？",
    body: "六區會換成秀蘭阿嬤的參考答案，你填的內容會被蓋掉。載入後還是要按「套用」才算數；按「取消變更」可以還原。",
    ok: "確定，載入範例",
  });
  if (!sure) return;
  let data;
  try {
    const response = await fetch("/api/reference-intake");
    if (!response.ok) throw new Error(String(response.status));
    data = await response.json();
  } catch {
    notify("讀不到範例建檔，請確認伺服器還在跑。");
    return;
  }
  writeIntake({ elder: data.elder_profile, facts: data.memory.facts, events: data.memory.events });
  onIntakeChange();
  notify("範例建檔只填進表單，還沒生效，要按「套用」才會送給豆豆。");
}

/** 「問豆豆這一區」: apply what is on screen, then ask one fixed question that
 *  only the just-filled section can answer. Six small feedback loops instead of
 *  one 35-minute form. The 訪談稿 covers the chat, so it closes first; otherwise
 *  the answer arrives behind it and the button looks dead. */
async function askDodo(question) {
  hideInterview();
  await applyWorkshop2();
  if (dataChannel?.readyState !== "open") {
    notify("還沒連上線（要有 API Key）。建檔已經存起來了，連上以後再按一次就能問。");
    return;
  }
  sendText(question);
}

registerApplyGroup("workshop2", {
  button: "#saveWorkshop2",
  revert: "#revertWorkshop2",
  tabs: {
    tabW2Intake: {
      read: () => intakeFromFields(),
      write: (snapshot) => writeIntake(snapshot),
    },
    tabW2Prompt: {
      read: () => workshop2BlocksFromFields(),
      write: (blocks) => {
        WORKSHOP2_BLOCKS.forEach(([key, , selector]) => { $(selector).value = blocks[key] ?? ""; });
      },
    },
    tabW2Policy: {
      read: () => proactivePolicyFromFields(),
      write: (policy) => {
        $("#cooldown").value = policy.interval_minutes;
        $("#dailyLimit").value = policy.daily_limit;
      },
    },
  },
});
// The three types `choose_event` decides between. schema 1 had six, each with a
// priority number; 緊急／天氣／新聞／反向請教 left with it.
const PROACTIVE_EVENT_LABELS = {
  reminder: "reminder 重要提醒",
  health: "health 健康關心",
  chat: "chat 閒聊",
};

/** The event types the backend actually decides between. schema 1 had six, each
 *  with a priority number the student could type; schema 2 has three and no
 *  priorities at all, so the list is the server's. Rendering it from
 *  `proactive_policy.priorities` left the dropdown empty — and an empty dropdown
 *  means 待提醒 has nothing to schedule. The 主動 tab rebuild folds this into the
 *  merged single-line UI; here it only has to offer the real three. */
function renderProactiveEventOptions() {
  const types = bootstrapData?.event_types || {};
  const selected = $("#proactiveEventType").value;
  $("#proactiveEventType").innerHTML = Object.entries(types)
    .map(([type, label]) => `<option value="${type}">${escapeHtml(label)}</option>`)
    .join("");
  if (selected && types[selected]) $("#proactiveEventType").value = selected;
}

/** Workshop 2's half of core's loadFields(): the 建檔, the four attitude blocks
 *  and the proactive numbers. The previews that read them run afterwards, from core. */
function loadFields() {
  const { elder_profile: elder, proactive_policy: proactive } = workspace.profile;
  writeIntake({ elder, facts: caregiverEntries("facts"), events: caregiverEntries("events") });
  WORKSHOP2_BLOCKS.forEach(([key, , selector]) => {
    $(selector).value = workspace.profile.workshop2_blocks?.[key] ?? "";
  });
  // The two knobs are the whole of proactive_policy now.
  $("#cooldown").value = proactive.interval_minutes;
  $("#dailyLimit").value = proactive.daily_limit;
  // 累積量那兩格是 proactive_state 的顯示，不是常數：F5 之後它們以前一律停在
  // HTML 的 999／0，就算今天真的已經送了三則。
  budgetFieldsFollowState = true;
  syncBudgetFields();
  renderDeclineState();
  scheduleIntakeCheck();
}

function workshop2BlocksFromFields() {
  return Object.fromEntries(WORKSHOP2_BLOCKS.map(([key, , selector]) => [
    key,
    $(selector).value.trim(),
  ]));
}

/** 陪伴型 is whatever profile.py ships, so the preset list cannot drift from the
 *  defaults. Called once at boot, after bootstrap has arrived. */
function renderRulePresets() {
  RULE_PRESETS[0].blocks = structuredClone(bootstrapData.default_workspace.profile.workshop2_blocks);
  $("#rulePresets").innerHTML = RULE_PRESETS.map((preset) =>
    `<button type="button" class="preset-button" data-rule-preset="${preset.id}" title="${escapeHtml(preset.hint)}">${escapeHtml(preset.label)}<small>${escapeHtml(preset.hint)}</small></button>`).join("");
  $$("#rulePresets .preset-button").forEach((button) => {
    button.addEventListener("click", () => applyRulePreset(button.dataset.rulePreset));
  });
}

/** Load one 規範範例 into the four textareas. Touches nothing else — not 建檔,
 *  not the two 主動 numbers — which is the claim the tab is making: same data,
 *  different way of speaking. Nothing reaches the session until 套用. */
function applyRulePreset(id) {
  const preset = RULE_PRESETS.find((item) => item.id === id);
  if (!preset) return;
  WORKSHOP2_BLOCKS.forEach(([key, , selector]) => { $(selector).value = preset.blocks[key] ?? ""; });
  rebuildWorkshop2Prompt();
  // Assigning .value fires no input event, so 套用 has to be told by hand.
  refreshApplyState();
  notify(`已載入「${preset.label}」規範範例。建檔完全沒有動；按「套用」才會生效。`);
}

// --- 同一句話，前後對照 ----------------------------------------------------
// The demo the docs described in prose: ask, change the 規範, apply, ask the same
// thing again. Each press records 豆豆's answer *as the session is right now* —
// it deliberately does not 套用 first, because "before" has to mean before.
let compareTurns = [];

function renderCompareResult(pending = "") {
  const labels = ["套用前", "套用後"];
  const rows = compareTurns.map((turn, index) => `
    <div class="compare-turn ${index === 1 ? "is-after" : ""}">
      <b>${labels[index]}</b>${escapeHtml(turn.answer)}
    </div>`).join("");
  const note = pending
    ? `<p class="compare-note">${escapeHtml(pending)}</p>`
    : compareTurns.length === 1
      ? '<p class="compare-note">現在換一組規範範例、或改其中一格，按「套用」，再按一次「問這一句」。</p>'
      : compareTurns.length === 2
        ? '<p class="compare-note">兩份 System Prompt 的差別只有那四格：她的資料、記得的事、禁區完全一樣。再按一次會把「套用後」推成「套用前」，繼續比下去。</p>'
        : "";
  $("#compareResult").innerHTML = rows + note;
}

async function askCompare() {
  const question = $("#compareQuestion").value.trim();
  if (!question) {
    renderCompareResult("先寫一句要問的話。");
    return;
  }
  if (dataChannel?.readyState !== "open") {
    renderCompareResult("還沒連上 Realtime（需要 API Key），連線後再按一次。");
    return;
  }
  const button = $("#askCompare");
  button.disabled = true;
  // Two answers on screen means the next one starts a fresh pair: 套用後 becomes
  // the new 套用前, so a student can keep iterating without clearing anything.
  if (compareTurns.length >= 2) compareTurns = [compareTurns[1]];
  renderCompareResult("正在問豆豆…");
  try {
    sendText(question);
    const answer = await awaitDodoReply();
    if (!answer) {
      renderCompareResult("等不到回答。看一下聊天室發生什麼事，再按一次。");
      return;
    }
    compareTurns = [...compareTurns, { question, answer }];
    renderCompareResult();
  } finally {
    button.disabled = false;
  }
}

/** Wait for the next DODO bubble to appear and stop growing.
 *
 *  Reading the transcript is the same trick 今日摘要 uses: the reply arrives as
 *  streamed deltas into one bubble, so "finished" is "stopped changing" rather
 *  than any single event — audio and text modes end on different ones.
 *
 *  Two things a naive「最後一顆泡泡」would get wrong, and 「你記得我什麼？」 —
 *  the default question here — triggers both:
 *
 *  - A **preamble**（「我看一下記得什麼…」）is a real assistant bubble that is
 *    not the answer: it shares a response with the `read_memory` call, and the
 *    answer arrives in the next response. core stamps those `is-preamble` inside
 *    the `response.done` handler, before it awaits the tool, so they are already
 *    marked by the time this loop could mistake one for the reply. A **旁白**
 *    bubble is not the answer either: the model tagged that item `commentary`
 *    and core labels it rather than hiding it, before or at `response.done`,
 *    so the same exclusion catches it.
 *  - `responseActive` is still true while a reply streams, so a pause between
 *    deltas longer than settleMs cannot end the wait early. */
async function awaitDodoReply(timeoutMs = 40000, settleMs = 1200) {
  const existing = new Set($$("#messages .message.assistant"));
  const deadline = Date.now() + timeoutMs;
  let seen = "";
  let lastChange = Date.now();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    const fresh = $$("#messages .message.assistant").filter((bubble) => (
      !existing.has(bubble)
      && !bubble.classList.contains("is-preamble")
      && !bubble.classList.contains("is-narration")
    ));
    const text = fresh.length ? fresh[fresh.length - 1].querySelector("p")?.textContent.trim() || "" : "";
    if (text !== seen) { seen = text; lastChange = Date.now(); continue; }
    if (seen && !responseActive && Date.now() - lastChange >= settleMs) return seen;
  }
  return seen;
}

/** The whole of `proactive_policy`: two numbers. 安靜與不打擾 are derived from
 *  建檔, 每則句數 is fixed at MAX_MESSAGE_SENTENCES, and 事件優先權 left with
 *  schema 1 — so this is also exactly what gets stored, with no legacy keys to
 *  leak back into a snapshot. */
function proactivePolicyFromFields() {
  return {
    interval_minutes: Math.max(0, Number($("#cooldown").value) || 0),
    daily_limit: Math.max(0, Number($("#dailyLimit").value) || 0),
  };
}

function collectWorkshop2() {
  const { elder, facts, events } = intakeFromFields();
  workspace.profile.elder_profile = elder;
  workspace.memory.facts = mergeCaregiver(workspace.memory.facts, facts);
  workspace.memory.events = mergeCaregiver(workspace.memory.events, events);
  workspace.profile.workshop2_blocks = workshop2BlocksFromFields();
  const { interval_minutes, daily_limit } = proactivePolicyFromFields();
  workspace.profile.proactive_policy = { interval_minutes, daily_limit };
  saveProject();
}

// =====================================================================
// Prompt 組裝：mirrors prompt_sections.py. Change the fixture, not one side.
// =====================================================================
const clean = (value) => String(value ?? "").trim();

/** `key：value［護理員］` — the marker tells the model which A facts it may not touch. */
function memoryEntryText(entry) {
  if (!(entry && typeof entry === "object")) return String(entry ?? "").trim();
  const key = clean(entry.key);
  const value = clean(entry.value);
  const text = key && value ? `${key}：${value}` : key || value;
  return text ? text + (SOURCE_MARKERS[entry.source] || "") : "";
}

/** HH:MM of a stored write, for the viewer only. */
function memoryEntryTime(entry) {
  const stamp = entry && typeof entry === "object" ? entry.updated_at : null;
  if (!stamp) return "";
  const when = new Date(stamp);
  return Number.isNaN(when.getTime()) ? "" : when.toTimeString().slice(0, 5);
}

/** Render the three memory layers exactly as the model receives them. */
function buildMemoryContext(memory) {
  const lines = [];
  Object.entries(MEMORY_LAYER_HEADINGS).forEach(([field, title]) => {
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

function weekdaysText(weekdays) {
  const days = (weekdays || []).filter((day) => String(day).trim()).map(Number);
  return days.length ? `週${days.map((day) => WEEKDAY_NAMES[day] ?? String(day)).join("、")}` : "";
}

function routineText(routine) {
  const text = `${routine.label || "作息"} ${routine.start ?? ""}–${routine.end ?? ""}`;
  const days = weekdaysText(routine.weekdays);
  return days ? `${text}（${days}）` : text;
}

function medicationText(medication) {
  const text = `${medication.time ?? ""} ${medication.name || "用藥"}`.trim();
  const note = clean(medication.note);
  return note ? `${text}（${note}）` : text;
}

function appointmentText(appointment) {
  const when = appointment.weekday
    ? `每週${WEEKDAY_NAMES[Number(appointment.weekday)] ?? appointment.weekday}`
    : String(appointment.date ?? "");
  const text = `${when} ${appointment.time ?? ""} ${appointment.label || "回診"}`.trim();
  const note = clean(appointment.note);
  return note ? `${text}（${note}）` : text;
}

/** `# 長者資料`, generated from the 建檔. The emergency phone never enters the
 *  prompt: it is the caregiver's, not 豆豆's. */
function composeElderSection(elder, address) {
  const lines = [`稱呼：${address}`];
  const name = clean(elder.name);
  const room = clean(elder.room);
  if (name) lines.push(`姓名：${name}${room ? `（房號 ${room}）` : ""}`);
  else if (room) lines.push(`房號：${room}`);
  lines.push(`居住城市：${elder.city || "未提供"}（問天氣沒有指定城市時用這個）`);
  [["語言", "language"], ["背景", "background"]].forEach(([label, key]) => {
    if (clean(elder[key])) lines.push(`${label}：${clean(elder[key])}`);
  });
  const expertise = (elder.expertise || []).map(clean).filter(Boolean);
  if (expertise.length) lines.push(`她會的事（可以請教）：${expertise.join("、")}`);
  const wake = clean(elder.wake_time);
  const bed = clean(elder.bed_time);
  if (wake || bed) lines.push(`作息：${wake || "？"} 起床、${bed || "？"} 就寢`);
  const quiet = (elder.routines || []).filter((routine) => routine.do_not_disturb && routine.start);
  if (quiet.length) lines.push(`不打擾時段：${quiet.map(routineText).join("、")}`);
  const medications = (elder.medications || []).filter((item) => item.time || item.name);
  if (medications.length) lines.push(`用藥：${medications.map(medicationText).join("；")}`);
  const appointments = (elder.appointments || []).filter((item) => item.time || item.label);
  if (appointments.length) lines.push(`回診／復健：${appointments.map(appointmentText).join("；")}`);
  const contact = elder.emergency_contact || {};
  if (clean(contact.name)) {
    const relation = clean(contact.relation);
    lines.push(`緊急聯絡人：${relation ? `${relation} ` : ""}${contact.name}（電話由照護員保管，不要向長者複誦）`);
  }
  return `# 長者資料\n${lines.join("\n")}`;
}

/** `# 不主動提起`: remembered, known to the model, never raised first. */
function composeTabooSection(taboos) {
  const items = (taboos || []).filter((item) => clean(item.topic));
  if (!items.length) return "# 不主動提起\n（建檔沒有填。她自己提起的事都可以接著聊。）";
  return `# 不主動提起\n${items.map((item) => `- ${clean(item.topic)}${clean(item.rule) ? `：${clean(item.rule)}` : ""}`).join("\n")}`;
}

/** `# 主動訊息的程式規則` — stated to the model even though the program enforces them. */
function composeRulesSection(policy, elder) {
  const interval = Number(policy.interval_minutes);
  const limit = Number(policy.daily_limit);
  const wake = clean(elder.wake_time);
  const bed = clean(elder.bed_time);
  const quietLabels = (elder.routines || []).filter((routine) => routine.do_not_disturb).map((routine) => String(routine.label || "作息"));
  const lines = [
    "主動訊息分三類：重要提醒（不受任何限制、不算額度）、健康關心（追問還沒好的身體狀況）、閒聊。",
    `健康關心與閒聊：兩則之間至少間隔 ${interval} 分鐘，每天最多 ${limit} 則。`,
    wake && bed ? `她的睡眠時段（${bed}–${wake}）只送重要提醒。` : "建檔沒有填睡眠時段，所以沒有安靜時段。",
  ];
  if (quietLabels.length) lines.push(`不打擾時段（${quietLabels.join("、")}）只送重要提醒。`);
  lines.push(
    "她剛說不想聊時，健康關心與閒聊都不送。",
    `每則主動訊息最多 ${MAX_MESSAGE_SENTENCES} 句。`,
    "這些條件由程式先判斷；你收到主動事件時才開口，措辭要符合上面的態度。",
  );
  return `# 主動訊息的程式規則\n${lines.join("\n")}`;
}

/** Workshop 2's half of the instructions: four attitude blocks, then four
 *  generated sections. Mirrors `compose_workshop2_prompt`. */
function buildWorkshop2Prompt(source) {
  const profile = source.profile || {};
  const agent = profile.agent || {};
  const elder = profile.elder_profile || {};
  const policy = { ...DEFAULT_PROACTIVE_POLICY, ...(profile.proactive_policy || {}) };
  const address = String(elder.address || agent.address || "長者");
  const replacements = { "{AGENT_NAME}": String(agent.name || "豆豆"), "{USER_ADDRESS}": address };
  const defaults = bootstrapData?.default_workspace?.profile?.workshop2_blocks || {};
  const blocks = profile.workshop2_blocks || {};
  const sections = WORKSHOP2_BLOCKS.map(([key, title]) => {
    let content = clean(key in blocks ? blocks[key] : defaults[key]);
    if (!content) return null; // cleared on purpose — drop the whole section
    Object.entries(replacements).forEach(([placeholder, value]) => {
      content = content.replaceAll(placeholder, value);
    });
    return `# ${title}\n${content}`;
  }).filter(Boolean);
  sections.push(composeElderSection(elder, address));
  sections.push(`# 目前記得的事（三層記憶）\n${buildMemoryContext(source.memory || {})}`);
  sections.push(composeTabooSection(elder.taboos || []));
  sections.push(composeRulesSection(policy, elder));
  return sections.join("\n\n");
}

/** A workspace-shaped snapshot of the current fields, so the preview shows
 *  unsaved edits — including caregiver rows not yet applied. */
function workshop2Draft() {
  const { elder, facts, events } = intakeFromFields();
  const { interval_minutes, daily_limit } = proactivePolicyFromFields();
  return {
    profile: {
      agent: W1.agentFromFields(),
      workshop2_blocks: workshop2BlocksFromFields(),
      elder_profile: elder,
      proactive_policy: { interval_minutes, daily_limit },
    },
    memory: {
      facts: mergeCaregiver(workspace.memory.facts, facts),
      events: mergeCaregiver(workspace.memory.events, events),
      summaries: workspace.memory.summaries || [],
    },
  };
}

function rebuildWorkshop2Prompt() {
  $("#workshop2SystemPrompt").textContent = composeInstructions(workshop2Draft(), 2);
}

// =====================================================================
// 記憶寫入：the one place anything writes memory.
// =====================================================================
function memoryEntryKey(entry) {
  return entry && typeof entry === "object" ? String(entry.key || "").trim() : "";
}

function memoryEntryValue(entry) {
  return entry && typeof entry === "object" ? String(entry.value || "").trim() : String(entry ?? "").trim();
}

function layerFor(layerId) {
  return MEMORY_LAYERS.find(([id]) => id === String(layerId || "").toUpperCase()) || MEMORY_LAYERS[0];
}

/** The single place anything writes memory — the Realtime `update_memory` tool
 *  and the 建檔 form both come through here, so the two can never drift.
 *
 *  `mode` overrides the layer's own rule for one write: the model passes
 *  "replace" when a fact really is superseded (搬家、換藥、膝蓋好多了). Re-saving
 *  the exact same key+value is a no-op beyond the timestamp.
 *
 *  Caregiver lock: A-layer facts written by the caregiver cannot be replaced by
 *  the model — it may add beside them, never take them away. B is not locked:
 *  a caregiver-seeded symptom is exactly what 「好多了」 has to be able to replace.
 *
 *  Returns what happened so the caller can say it out loud. */
function upsertMemory(layerId, key, value, mode, options = {}) {
  const [layer, field, layerTitle] = layerFor(layerId);
  const rule = MEMORY_MERGE_RULES[layer];
  if (!Array.isArray(workspace.memory[field])) workspace.memory[field] = [];
  const updatedAt = new Date().toISOString();
  const source = options.source || "dodo";

  const identical = workspace.memory[field].find(
    (entry) => memoryEntryKey(entry) === key && memoryEntryValue(entry) === value,
  );
  if (identical) {
    identical.updated_at = updatedAt;
    return { layer, field, layerTitle, action: "unchanged", replaced: 0, dropped: 0, sameKey: 1 };
  }

  const accumulate = (mode || rule.merge) === "accumulate";
  const protectedValues = accumulate || source === "caregiver" ? [] : workspace.memory[field]
    .filter((entry) => layer === "A" && entry?.source === "caregiver" && memoryEntryKey(entry) === key)
    .map(memoryEntryValue);
  if (protectedValues.length) {
    return { layer, field, layerTitle, action: "locked", locked: true, protectedValues, replaced: 0, dropped: 0, sameKey: 0 };
  }
  const kept = accumulate
    ? workspace.memory[field]
    : workspace.memory[field].filter((entry) => memoryEntryKey(entry) !== key);
  // Named, not counted: 「覆蓋原本 1 筆」 gave a student no way to notice that
  // 芭樂 had just been thrown away by 柳丁.
  const superseded = workspace.memory[field]
    .filter((entry) => !kept.includes(entry))
    .map(memoryEntryValue);
  const replaced = superseded.length;
  const written = { key, value, updated_at: updatedAt, source, tag: options.tag || null };
  let entries = [...kept, written];
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

/** Retract exactly one remembered value. Matches on key AND value, so nothing
 *  else under that key is touched. Caregiver A facts are locked here too.
 *
 *  Returns what is left under the key, so a near-miss on the value can be
 *  retried precisely instead of the model guessing again. */
function forgetMemory(layerId, key, value) {
  const [layer, field, layerTitle] = layerFor(layerId);
  const entries = Array.isArray(workspace.memory[field]) ? workspace.memory[field] : [];
  const target = entries.find((entry) => memoryEntryKey(entry) === key && memoryEntryValue(entry) === value);
  if (target && layer === "A" && target.source === "caregiver") {
    return { layer, field, layerTitle, removed: 0, locked: true, remaining: entries.filter((entry) => memoryEntryKey(entry) === key).map(memoryEntryValue) };
  }
  const kept = entries.filter((entry) => entry !== target);
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
  if (result.action === "locked") return `已拒絕：「${key}」底下的「${result.protectedValues.join("、")}」是護理員建的，豆豆不能改，請告訴護理員`;
  if (result.action === "unchanged") return `${result.layerTitle}「${key}：${value}」已經記得，只更新時間`;
  if (result.action === "replaced") {
    return `已取代 ${result.layerTitle}「${key}」＝「${value}」（丟掉了：${result.superseded.join("、")}）${tail}`;
  }
  const alongside = result.sameKey > 1 ? `（同一個「${key}」現在並存 ${result.sameKey} 筆）` : "";
  return `已新增 ${result.layerTitle}「${key}」＝「${value}」${alongside}${tail}`;
}

/** Push memory into the live session. Baked instructions still hold the old
 *  state until a session.update replaces them. */
function pushMemoryToSession() {
  if (dataChannel?.readyState !== "open") return false;
  pendingRealtimeApply = true;
  dataChannel.send(JSON.stringify({ type: "session.update", session: realtimeSessionUpdate() }));
  return true;
}

/** Every stored memory, with who wrote it. Caregiver rows are edited in the
 *  建檔 form, so they carry no 刪除 here; what 豆豆 wrote, a human can delete.
 *  Entries outside the prompt window are marked, or deleting one would look
 *  like it changed nothing. */
function renderMemoryViewer() {
  $("#memoryViewer").innerHTML = MEMORY_LAYERS.map(([layer, field]) => {
    const entries = workspace.memory?.[field] || [];
    const firstShown = Math.max(0, entries.length - MEMORY_PREVIEW_LIMIT);
    const rows = entries.length
      ? entries.map((entry, index) => {
        const time = memoryEntryTime(entry);
        const source = entry?.source || "dodo";
        const plain = memoryEntryText({ ...entry, source: null });
        return `
          <li class="${index < firstShown ? "is-outside" : ""} is-${source}">
            <span>${escapeHtml(plain) || "（空白）"}</span>
            <small class="memory-source">${escapeHtml(SOURCE_LABELS[source] || source)}${entry?.tag ? `・${escapeHtml(MEMORY_TAG_LABELS[entry.tag] || entry.tag)}` : ""}</small>
            ${time ? `<time>${time}</time>` : ""}
            ${index < firstShown ? "<em>未進入 Prompt</em>" : ""}
            ${source === "caregiver"
              ? '<em class="memory-locked">在建檔區修改</em>'
              : `<button type="button" class="link-button" data-memory-layer="${layer}" data-memory-entry="${index}">刪除</button>`}
          </li>`;
      }).join("")
      : '<li class="is-empty">（目前沒有任何記錄）</li>';
    return `<div class="memory-layer">
      <h4>${escapeHtml(MEMORY_LAYER_HEADINGS[field])}</h4>
      <p class="memory-rule">${escapeHtml(MEMORY_MERGE_RULES[layer].label)}</p>
      <ul>${rows}</ul>
    </div>`;
  }).join("");
}

/** Delete one memory entry on the human's behalf, and push the change into the
 *  live session. Caregiver rows are not deletable here by design. */
function deleteMemoryEntry(layer, index) {
  const found = MEMORY_LAYERS.find(([id]) => id === layer);
  if (!found) return;
  const [, field, title] = found;
  const entries = workspace.memory?.[field];
  if (!Array.isArray(entries) || !entries[index] || entries[index].source === "caregiver") return;
  const removed = memoryEntryText({ ...entries[index], source: null });
  workspace.memory[field] = entries.filter((_, position) => position !== index);
  saveProject();
  renderMemoryViewer();
  rebuildWorkshop2Prompt();
  pushMemoryToSession();
  notify(`已從 ${title} 刪除「${removed}」，並更新豆豆的記憶。AI 記得的事，人隨時可以改掉。`);
}

/** After the model replaced or removed a caregiver-seeded symptom (「膝蓋好多了」),
 *  the form must stop listing it — otherwise the next 套用 would seed it again
 *  and the follow-up would never stop. Core calls this after memory tool writes. */
function syncIntakeAfterMemoryChange() {
  renderRows("symptom", caregiverEntries("events"));
  renderIntakeHints();
  // Only the symptom rows moved, so only their slice of the baseline moves with
  // them. Re-freezing the whole tab would quietly adopt a row the student typed
  // and never applied. `facts` needs no patch: a caregiver A fact is locked
  // against the model, and what 豆豆 adds beside it carries source "dodo", which
  // caregiverEntries() does not collect.
  patchAppliedSnapshot("tabW2Intake", "events", intakeFromFields().events);
}

/** Whoever 豆豆 is talking to, by name. */
function elderAddress() {
  return $("#elderAddress")?.value.trim()
    || workspace?.profile?.elder_profile?.address
    || $("#agentAddress")?.value.trim()
    || "長者";
}

const pad2 = (value) => String(value).padStart(2, "0");
const MINUTES_PER_DAY = 24 * 60;
const HHMM_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;
// Half-hour cells: a 13:00–14:30 午睡 has to land on a boundary, or the picture
// disagrees with the decider about the second half of hour 14.
const BAND_CELLS = 48;
const BAND_CELL_MINUTES = MINUTES_PER_DAY / BAND_CELLS;

/** Minutes past midnight for a well-formed HH:MM, else null — twin of
 *  `parse_hhmm`. Everything the student types comes through here, so a 建檔 with
 *  「早上七點」 in a time field loses that one row instead of breaking the day. */
function parseHhmm(text) {
  const value = String(text ?? "").trim();
  if (!HHMM_PATTERN.test(value)) return null;
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function formatMinutes(total) {
  const wrapped = ((Math.round(total) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

/** `start > end` wraps past midnight; `start === end` is no window at all.
 *  Twin of `Window.contains`. */
function windowContains(window, minute) {
  if (!window || window.start === window.end) return false;
  return window.start < window.end
    ? minute >= window.start && minute < window.end
    : minute >= window.start || minute < window.end;
}

/** An empty `weekdays` list means every day, matching `_applies_today`. */
function appliesToday(weekdays, weekday) {
  const days = (weekdays || []).map(Number).filter((day) => Number.isInteger(day) && day > 0);
  return !days.length || days.includes(weekday);
}

/** ISO weekday, Monday=1 … Sunday=7. `getDay()` is Sunday=0, so 0 becomes 7. */
function isoWeekday(date = new Date()) {
  return date.getDay() || 7;
}

/** The browser's twin of `build_schedule` (spec §3.1, §7.1 #8): 安靜 is
 *  睡眠時段（就寢→起床）, 不打擾 is every routine ticked 不打擾 that applies today.
 *
 *  It exists ONLY to draw the band and word the hints — every decision still
 *  goes through the server. That the two agree is not left to this comment:
 *  tests/browser/uicheck.js deep-equals this against the `schedule` the server
 *  computes for the same 建檔.
 *
 *  No 安靜 window until BOTH times are filled in — an empty 建檔 must not quietly
 *  inherit anyone's bedtime — and `bed === wake` also means none. A row with a
 *  malformed time is skipped, never thrown. */
function buildScheduleWindows(elder = {}, weekday = isoWeekday()) {
  const wake = parseHhmm(elder.wake_time);
  const bed = parseHhmm(elder.bed_time);
  const quiet = wake !== null && bed !== null && bed !== wake
    ? { label: "睡眠時段", start: bed, end: wake }
    : null;
  const dnd = (elder.routines || []).flatMap((routine) => {
    const start = parseHhmm(routine?.start);
    const end = parseHhmm(routine?.end);
    if (!routine?.do_not_disturb || start === null || end === null) return [];
    if (!appliesToday(routine.weekdays, weekday)) return [];
    return [{ label: String(routine.label || "作息"), start, end }];
  });
  // `wake` repeats quiet.end, and is 0 when 建檔 has no 起床時間 — which is what
  // makes the declined_until cap degrade to a flat 60 minutes (spec §2.3).
  return { quiet, dnd, wake: wake ?? 0 };
}

/** Her schedule as the form currently reads, not as it was last applied.
 *
 *  The band has to move while she types 作息 — nothing reaches `workspace` until
 *  套用, so reading the stored profile would leave the picture a whole edit
 *  behind, which is precisely the lie this phase set out to remove. */
function scheduleNow() {
  return buildScheduleWindows(intakeFromFields().elder);
}

/** Every minute the rules keep 豆豆 quiet, 安靜 and 不打擾 together. */
function closedWindows(schedule) {
  return [schedule.quiet, ...schedule.dnd].filter(Boolean);
}

function minutesClosed(schedule) {
  const windows = closedWindows(schedule);
  let count = 0;
  for (let minute = 0; minute < MINUTES_PER_DAY; minute += 1) {
    if (windows.some((window) => windowContains(window, minute))) count += 1;
  }
  return count;
}

// =====================================================================
// 「她剛說不想聊」：real state, not a what-if
// =====================================================================
const DECLINE_MINUTES = 60;

/** When a decline expires: 60 分鐘, but never past her next 起床.
 *
 *  The cap is what stops one press from silencing 豆豆 for good — a decline at
 *  23:30 must not run through the whole morning. With no 起床時間 in 建檔 there is
 *  nothing to clamp to, so it stays a flat 60 分 (spec §2.3). */
function declineExpiry(now = new Date()) {
  const flat = new Date(now.getTime() + DECLINE_MINUTES * 60000);
  const { wake } = scheduleNow();
  if (!wake) return flat;
  const nextWake = new Date(now);
  nextWake.setHours(0, wake, 0, 0);
  if (nextWake <= now) nextWake.setDate(nextWake.getDate() + 1);
  return nextWake < flat ? nextWake : flat;
}

/** Whether she has declined and it has not expired yet. This is the `user_declined`
 *  a *real* trigger sends; the 🧪 checkbox is a hypothesis for the manual one. */
function isDeclinedNow() {
  const until = proactiveState().declined_until;
  return Boolean(until) && new Date(until).getTime() > Date.now();
}

function declineChat() {
  const state = proactiveState();
  state.declined_until = declineExpiry().toISOString();
  saveProject();
  renderDeclineState();
  renderPolicyPreview();
  renderTriggerHints();
  const at = new Date(state.declined_until);
  notify(`已記錄她剛說不想聊：到 ${pad2(at.getHours())}:${pad2(at.getMinutes())} 之前只送重要提醒。`);
}

function clearDecline() {
  proactiveState().declined_until = null;
  saveProject();
  renderDeclineState();
  renderPolicyPreview();
  renderTriggerHints();
  notify("已取消「她剛說不想聊」，閒聊與健康關心恢復。");
}

/** The button has to show when it wears off, or it reads as a permanent mute. */
function renderDeclineState() {
  const until = proactiveState().declined_until;
  const active = isDeclinedNow();
  $("#declineChat").textContent = active ? "取消（她願意聊了）" : "她剛說不想聊";
  $("#declineChat").classList.toggle("is-active", active);
  if (!until) {
    $("#declineState").textContent = "現在沒有拒絕。";
    return;
  }
  const at = new Date(until);
  const clock = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
  $("#declineState").textContent = active
    ? `到 ${clock} 之前只送重要提醒。`
    : `上次拒絕已於 ${clock} 失效。`;
}

// =====================================================================
// The band and the two lines under it
// =====================================================================

/** Her day as a picture, drawn from 建檔 rather than typed here.
 *
 *  Grey is every minute the rules keep 豆豆 quiet. It is deliberately read-only:
 *  睡眠時段 and 不打擾 are facts about her life, not settings, so the band sends
 *  a click to the 建檔 作息 section instead of editing anything. */
function renderPolicyPreview() {
  const schedule = scheduleNow();
  const windows = closedWindows(schedule);
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes();
  $("#quietBand").innerHTML = Array.from({ length: BAND_CELLS }, (_, cell) => {
    const start = cell * BAND_CELL_MINUTES;
    const hit = windows.find((window) => windowContains(window, start));
    const isNow = nowMinute >= start && nowMinute < start + BAND_CELL_MINUTES;
    const classes = ["band-hour", hit ? "is-quiet" : "is-open", isNow ? "is-now" : ""];
    return `<span class="${classes.filter(Boolean).join(" ")}" title="${formatMinutes(start)} ${hit ? escapeHtml(hit.label) : "可以開口"}"></span>`;
  }).join("");

  const policy = proactivePolicyFromFields();
  const closed = minutesClosed(schedule);
  const openMinutes = MINUTES_PER_DAY - closed;
  const intervalCap = policy.interval_minutes > 0
    ? Math.ceil(openMinutes / policy.interval_minutes)
    : Infinity;
  const bands = [
    schedule.quiet
      ? `安靜 ${formatMinutes(schedule.quiet.start)}–${formatMinutes(schedule.quiet.end)}`
      : "<b>還沒填睡眠時段</b>（整天都能開口）",
    schedule.dnd.length
      ? `不打擾 ${schedule.dnd.map((window) => `${escapeHtml(window.label)} ${formatMinutes(window.start)}–${formatMinutes(window.end)}`).join("、")}`
      : "沒有不打擾時段",
  ];
  $("#policySummary").innerHTML = [
    ...bands,
    `可以開口 <b>${Math.round((openMinutes / 60) * 10) / 10}</b> 小時`,
    `間隔 <b>${policy.interval_minutes}</b> 分鐘 → 最多容得下 <b>${intervalCap === Infinity ? "不限" : intervalCap}</b> 則`,
    `每日上限 <b>${policy.daily_limit}</b> 則`,
  ].join(" ｜ ");
  renderBlockingRuleNow(schedule, policy, intervalCap);
}

/** 「現在哪條規則在卡人」：the same order as `choose_event`, evaluated against the
 *  real clock and the real accumulated spend for a 閒聊.
 *
 *  Display only: every actual decision goes to the server. What it answers is
 *  the question a student cannot otherwise ask without waiting — 「我現在按下去，
 *  會被哪一條擋住」；and why 重要提醒 would still get through. */
function renderBlockingRuleNow(schedule, policy, intervalCap) {
  const labels = bootstrapData?.rule_labels || {};
  const minute = new Date().getHours() * 60 + new Date().getMinutes();
  const state = proactiveState();
  const dnd = schedule.dnd.find((window) => windowContains(window, minute));
  let blocking;
  if (isDeclinedNow()) blocking = labels.declined || "她剛說不想聊";
  else if (windowContains(schedule.quiet, minute)) {
    blocking = `${labels.quiet || "安靜時段"}（${minute < schedule.wake ? "她還沒起床" : "她已經睡了"}）`;
  } else if (dnd) blocking = `${labels.dnd || "不打擾時段"}（她在${dnd.label}）`;
  else if (minutesSinceLastProactive() < policy.interval_minutes) {
    blocking = `${labels.interval || "間隔"}（距上一句才 ${minutesSinceLastProactive()} 分鐘）`;
  } else if (state.sent_today >= policy.daily_limit) {
    blocking = `${labels.limit || "每日上限"}（今天已經 ${state.sent_today} 則）`;
  }
  const tighter = intervalCap < policy.daily_limit
    ? `真正卡住一天的是<strong>間隔</strong>：每日上限 ${policy.daily_limit} 則用不完，最多只擠得出 ${intervalCap} 則。`
    : intervalCap > policy.daily_limit
      ? `真正卡住一天的是<strong>每日上限</strong>：時間夠塞 ${intervalCap === Infinity ? "不限" : intervalCap} 則，但一天只准講 ${policy.daily_limit} 則。`
      : `間隔與每日上限剛好一樣緊（都是 ${policy.daily_limit} 則）。`;
  $("#policyBinding").innerHTML = blocking
    ? `<strong>現在閒聊會被〈${blocking}〉擋下</strong>，但重要提醒照樣送得出去。${tighter}`
    : `<strong>現在閒聊過得去。</strong>${tighter}`;
}

/** The manual trigger's fields are the only inputs to 間隔 and 每日上限; 安靜與
 *  不打擾 come from 建檔 instead. These hints bring both numbers here and say
 *  which way each comparison goes. */
function renderTriggerHints() {
  const policy = proactivePolicyFromFields();
  const schedule = scheduleNow();

  const now = $("#proactiveNow").value || "12:00";
  const minute = parseHhmm(now) ?? 12 * 60;
  const dnd = schedule.dnd.find((window) => windowContains(window, minute));
  if (windowContains(schedule.quiet, minute)) {
    $("#nowHint").textContent = `${now} 落在她的安靜時段（${formatMinutes(schedule.quiet.start)}–${formatMinutes(schedule.quiet.end)}），只有重要提醒過得去。`;
  } else if (dnd) {
    $("#nowHint").textContent = `${now} 她在${dnd.label}（${formatMinutes(dnd.start)}–${formatMinutes(dnd.end)}），只有重要提醒過得去。`;
  } else {
    $("#nowHint").textContent = schedule.quiet
      ? `${now} 不在安靜或不打擾時段，這一關會通過。`
      : `建檔還沒填睡眠時段，所以沒有安靜時段，這一關一律通過。`;
  }

  const sinceLast = Number($("#proactiveSinceLast").value) || 0;
  $("#sinceLastHint").textContent = `對上間隔 ${policy.interval_minutes} 分鐘：小於 ${policy.interval_minutes} 就會被擋下。現在填 ${sinceLast} → ${sinceLast < policy.interval_minutes ? "會被擋下" : "會通過"}。`;

  const sentToday = Number($("#proactiveSentToday").value) || 0;
  $("#sentTodayHint").textContent = `對上每日上限 ${policy.daily_limit} 則：達到 ${policy.daily_limit} 就會被擋下。現在填 ${sentToday} → ${sentToday >= policy.daily_limit ? "會被擋下" : "會通過"}。重要提醒不算次數，所以這一關管不到它。`;
}

/** 健康關心 speaks about a symptom she actually has, so the content comes from
 *  the B layer rather than being typed twice. Only fills a blank field: what the
 *  student wrote always wins. */
function suggestTriggerTopic() {
  const type = $("#proactiveEventType").value;
  const hint = $("#topicHint");
  if (type !== "health") {
    hint.textContent = "";
    return;
  }
  const symptom = (workspace.memory?.events || [])
    .filter((entry) => entry?.tag === "symptom" && String(entry.value || "").trim())
    .at(-1);
  if (!symptom) {
    hint.textContent = "建檔的「近期狀況與念頭」還沒有症狀，健康關心就沒有東西可以問。";
    return;
  }
  const suggestion = `關心她的${symptom.key}（目前記錄：${symptom.value}）`;
  hint.textContent = `B 層最新的症狀是「${symptom.key}：${symptom.value}」。`;
  if (!$("#proactiveTopic").value.trim()) $("#proactiveTopic").value = suggestion;
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
    workspace.proactive_state = { last_spoken_at: null, sent_today: 0, day: "", declined_until: null };
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

// 累積量那兩格有兩個身分：平常是 `proactive_state` 的顯示，被改過之後才是 🧪 的假設。
// 預設「跟著真實紀錄」，學生一動手就停止跟隨（否則每 5 秒的 tick 會把他打的字洗掉），
// 按「把上面兩格改回真實數值」再跟回去。
//
// ⚠️ 這兩格**只餵手動觸發**：`fireScheduledItem()` 讀的是 `proactive_state`，不是欄位。
// 跟隨機制的用途是讓「顯示」這個身分名副其實：以前重新整理之後它們一律停在
// HTML 的 999／0，就算 proactive_state 記著今天已經送了三則也一樣。
let budgetFieldsFollowState = true;

/** Write the real accumulated numbers into the two fields, while they are still
 *  following. Assigning `.value` fires no input event, so this never counts as
 *  the student editing them. */
function syncBudgetFields() {
  if (budgetFieldsFollowState) {
    $("#proactiveSinceLast").value = minutesSinceLastProactive();
    $("#proactiveSentToday").value = proactiveState().sent_today;
    renderTriggerHints();
  }
  renderBudgetFollowState();
}

function renderBudgetFollowState() {
  $("#budgetFollowNote").textContent = budgetFieldsFollowState
    ? "上面兩格正跟著這一行走。"
    : "上面兩格已經改成你的假設，不再跟著這一行。";
  $("#resyncBudget").hidden = budgetFieldsFollowState;
  $("#budgetCard").classList.toggle("is-hypothetical", !budgetFieldsFollowState);
}

function resyncBudgetFields() {
  budgetFieldsFollowState = true;
  syncBudgetFields();
  notify("上面兩格已經改回真實的數字。");
}

/** One place records the cost of an actual proactive message, so the manual
 *  button and the scheduler can never disagree about the budget. After 豆豆 really
 *  speaks the two fields snap back to reality and resume following: a hypothesis
 *  that survived a real send would be a lie about what just happened.
 *
 *  A 重要提醒 moves the interval clock (she was just spoken to) but never spends
 *  the daily budget, exactly as simulate_day() treats it. */
function recordProactiveSpoken(type) {
  const state = proactiveState();
  state.last_spoken_at = new Date().toISOString();
  if (type !== "reminder") state.sent_today += 1;
  // 第二堂 is done the first time 豆豆 actually opens its mouth first: the rules
  // let it through and it spoke. There is no score to reach.
  workspace.progress.workshop_2_completed = true;
  budgetFieldsFollowState = true;
  syncBudgetFields();
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
// The three types schema 2 decides between — same set as bootstrap's
// `event_types`, shortened for the list's narrow column.
const SCHEDULE_KIND_LABELS = { reminder: "提醒", health: "健康", chat: "閒聊" };

function renderScheduleList() {
  const items = scheduledItems();
  const now = new Date();
  $("#scheduleClock").textContent = `現在真實時間 ${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  if (!items.length) {
    $("#scheduleList").innerHTML = '<p class="schedule-empty">現在沒有待提醒項目。上面選好類型和內容，挑一個時間，按「加入待提醒」。</p>';
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
      <span class="schedule-kind">${escapeHtml(SCHEDULE_KIND_LABELS[item.type] || item.type)}</span>
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
    type: item.type,
    minutes_since_last: minutesSinceLastProactive(),
    sent_today: proactiveState().sent_today,
    // The REAL decline, not the 🧪 checkbox beside the manual trigger: 「她剛說
    // 不想聊」 writes state with an expiry, so this is a signal a scheduled item
    // should respect. A 吃藥提醒 still gets through — `choose_event` clears
    // reminders before it ever looks at this — and that asymmetry is the lesson.
    user_declined: isDeclinedNow(),
  });
  if (!decision) {
    // A dead backend must not burn the item; it stays pending and retries.
    return;
  }

  let reason = decision.reason;
  if (decision.should_speak) {
    const outcome = await speakProactive(event, time);
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

/** Compare the pending list against the wall clock. 重要提醒 first, then the
 *  earliest, one per tick: firing two at once would let both pass the interval
 *  that the first one is supposed to impose on the second.
 *
 *  Ordered by the server's own `event_types`, which lists them by how much it
 *  matters that this one gets said — 重要提醒 is the type with a real-world
 *  consequence and the only one the rules never ration. schema 1 sorted by
 *  `proactive_policy.priorities`; schema 2 has no such field, so that sort had
 *  quietly become a no-op that always fell back to insertion order. */
async function tickScheduler() {
  renderScheduleList();
  renderProactiveLiveState();
  // 距上次 grows with the clock, so a field that claims to show it has to be
  // redrawn here too — but only while it is still following.
  syncBudgetFields();
  // A decline expires by itself, and so does the band's 現在 marker. Decisions
  // read isDeclinedNow() fresh so they were always right, but nothing redrew the
  // display — leaving the button claiming she still refuses long after she
  // stopped. This tick is the page's only clock; expiry has to be shown here.
  renderDeclineState();
  renderPolicyPreview();
  if (!$("#scheduleAuto").checked || schedulerBusy) return;
  const nowText = `${pad2(new Date().getHours())}:${pad2(new Date().getMinutes())}`;
  const order = Object.keys(bootstrapData?.event_types || {});
  const rank = (item) => {
    const index = order.indexOf(item.type);
    return index < 0 ? order.length : index;
  };
  const due = scheduledItems()
    .filter((item) => item.status === "pending" && item.time <= nowText)
    .sort((left, right) => rank(left) - rank(right) || String(left.time).localeCompare(String(right.time)));
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
  schedule: "看<strong>真實時鐘</strong>，也看她今天真的被找過幾次。時間一到，瀏覽器代替後台推一次事件，走同一套七條規則。每一筆只會發生一次。",
  manual: "現在幾點、她有沒有剛說不想聊，全部是<strong>你假設的</strong>；加上面那兩格的數字，一次一次去戳規則的邊界，例如「如果現在是凌晨三點呢」。不影響下面的待提醒清單。",
};

// 上面那張累積量卡在兩種模式下的意義不一樣，講清楚是哪一種才不會有人在 ⏰ 模式下
// 填了數字卻發現它不算數。
const BUDGET_MODE_NOTES = {
  schedule: "⏰ 排一個真的時間：規則看的是下面那一行真實紀錄。上面兩格在這個模式下<strong>只是顯示</strong>，改了不影響判斷。",
  manual: "🧪 自己編一個狀況：規則看的就是<strong>上面兩格</strong>，你填什麼它就信什麼。",
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
  $("#budgetModeNote").innerHTML = BUDGET_MODE_NOTES[target];
  renderBudgetFollowState();
}

// =====================================================================
// 今日摘要：the one memory write nobody makes by hand
// =====================================================================

/** Today's chat, as the summariser wants it. Read from the transcript rather
 *  than a parallel array: TOOL and SYSTEM rows are workshop instrumentation, not
 *  things she or 豆豆 said, and sending them would summarise the furniture. */
function chatTranscript() {
  return $$("#messages .message").flatMap((row) => {
    const role = row.classList.contains("user") ? "user"
      : row.classList.contains("assistant") ? "dodo" : null;
    const text = row.querySelector("p")?.textContent.trim() || "";
    return role && text ? [{ role, text: text.slice(0, 2000) }] : [];
  }).slice(-200);
}

/** C 層 is grown from the conversation, never typed — that is the whole point of
 *  the layer. Writes through upsertMemory like everything else, so the merge
 *  rule (C 重寫) applies and the viewer shows it immediately. */
async function runTodaySummary() {
  const button = $("#runTodaySummary");
  const transcript = chatTranscript();
  if (!transcript.length) {
    $("#todaySummary").textContent = "今天還沒有對話可以摘要。先跟豆豆聊幾句。";
    return;
  }
  button.disabled = true;
  $("#todaySummary").textContent = "正在整理今天的對話…";
  try {
    const response = await fetch("/api/day-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: elderAddress(), transcript }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "摘要失敗。");
    const written = upsertMemory("C", "今日摘要", result.summary, undefined, { source: "system" });
    saveProject();
    rebuildWorkshop2Prompt();
    renderMemoryViewer();
    pushMemoryToSession();
    $("#todaySummary").textContent = `已寫進 C 跨日摘要：「${result.summary}」`;
    addMessage("tool", `update_memory（今日摘要）：${describeMemoryWrite(written, "今日摘要", result.summary)}`);
  } catch (error) {
    $("#todaySummary").textContent = error.message || "無法連接本機服務。";
  } finally {
    button.disabled = false;
  }
}

/** The brief for one proactive turn. Response-level `instructions` *replace* the
 *  session instructions, so the whole composed prompt has to travel with it —
 *  otherwise 豆豆 would open its mouth as OpenAI's default assistant. */
// One line of 規範 per type. The four blocks on the 對話規範 tab say how 豆豆
// speaks in general; this is the reminder for *this* turn, and it mirrors them.
const PROACTIVE_TURN_NOTES = {
  reminder: "這是重要提醒：一句講清楚時間與該做的事，不解釋、不催。",
  health: "問的就是「事件內容」那件事，不要換成別的、也不要問成「你現在怎麼樣」。先問她的感覺，不要幫她斷定；她說好了就不要追問，並把那一筆換掉。",
  chat: "從她的興趣或她會的事起頭，可以請教她。不要製造壓力，也不要連續追問。",
};

function proactiveTurnInstructions(event, time) {
  return [
    realtimeInstructions(),
    [
      "# 這一次主動開口",
      `現在是 ${time}。你要「主動」開啟對話，不是回答問題，對方還沒說話。`,
      `事件類型：${event.type}`,
      `事件內容（這一句就是要講的題目，照它講）：${event.topic || "（未填寫）"}`,
      // Fixed at 2 (spec §2.3): 每則句數 stopped being a field, so `policy` no
      // longer carries it — reading it from there would print `undefined`.
      `最多 ${MAX_MESSAGE_SENTENCES} 句，直接說出口，不要說明你為什麼現在開口。`,
      PROACTIVE_TURN_NOTES[event.type] || PROACTIVE_TURN_NOTES.chat,
    ].join("\n"),
  ].filter((part) => part.trim()).join("\n\n");
}

/** Ask the server's `choose_event`. Returns null on
 *  a transport failure so callers can tell "the rules said no" apart from "the
 *  question never got asked" — the scheduler must not burn an item on the latter. */
async function decideProactive(policy, scenario) {
  try {
    const response = await fetch("/api/proactive-decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // 建檔 travels with it: schema 2 derives the 安靜／不打擾 windows from her
      // 作息 rather than from a quiet-hours field, so a decision made without
      // the profile is a decision made against no schedule at all.
      body: JSON.stringify({ policy, scenario, elder_profile: workspace.profile.elder_profile }),
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
async function speakProactive(event, time) {
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
  sendProactiveResponse(proactiveTurnInstructions(event, time));
  // The rules only mean something if speaking feeds them: the next attempt now
  // runs into the cooldown and (unless it was a 重要提醒) the daily budget,
  // exactly as it would live.
  recordProactiveSpoken(event.type);
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
    type: event.type,
    minutes_since_last: Number($("#proactiveSinceLast").value) || 0,
    sent_today: Number($("#proactiveSentToday").value) || 0,
    user_declined: $("#proactiveDeclined").checked,
  });
  if (!decision) return;

  $("#proactiveDecision").textContent = decision.should_speak
    ? `✓ 主動開口：${decision.reason}`
    : `× 保持安靜：${decision.reason}`;
  addMessage(
    "tool",
    `主動決策（${event.type} @ ${time}）：${decision.should_speak ? "主動開口" : "保持安靜"} — ${decision.reason}`,
  );
  if (decision.should_speak) await speakProactive(event, time);
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
    ? "第二堂設定已套用：建檔、記憶、對話規範與主動規則都寫進了同一份 instructions，正在確認更新…"
    : "第二堂設定已保存（尚未連線，下次連線時生效）。");
}

// Workshop 2's half of the field list core's bindFieldEvents() wires up.
const WORKSHOP2_FIELDS = [
  ...INTAKE_SCALARS.map(([selector]) => selector),
  "#elderExpertise", "#contactName", "#contactRelation", "#contactPhone",
  ...WORKSHOP2_BLOCKS.map(([, , selector]) => selector),
  "#cooldown", "#dailyLimit",
];

function onIntakeChange() {
  rebuildWorkshop2Prompt();
  refreshApplyState();
  renderIntakeHints();
  scheduleIntakeCheck();
}

/** Everything this lesson listens to. Called once, from core's initialize(). */
function init() {
  // Workshop 2 fields feed the composed instructions, so the VIEW panel has to
  // follow them live the same way Workshop 1's does.
  bindFieldEvents(WORKSHOP2_FIELDS, () => {
    onIntakeChange();
    // 主動規則 is numbers; the band and the hints are what make them legible.
    renderPolicyPreview();
    renderTriggerHints();
  });
  // List rows are re-rendered only on add／remove, so the listeners live on the
  // containers and the row being typed into never moves under the cursor.
  Object.values(ROW_KINDS).forEach(({ container }) => {
    ["input", "change"].forEach((event) => $(container).addEventListener(event, onIntakeChange));
    $(container).addEventListener("click", (event) => {
      const button = event.target.closest("[data-remove]");
      if (!button) return;
      const kind = Object.keys(ROW_KINDS).find((name) => ROW_KINDS[name].container === container);
      const rows = [...$(container).querySelectorAll(".row-item")].map((element) => readRow(kind, element));
      renderRows(kind, rows.filter((_, index) => index !== Number(button.dataset.remove)));
      onIntakeChange();
    });
  });
  $$("[data-add]").forEach((button) => button.addEventListener("click", () => {
    const kind = button.dataset.add;
    const rows = [...$(ROW_KINDS[kind].container).querySelectorAll(".row-item")].map((element) => readRow(kind, element));
    renderRows(kind, [...rows, ROW_KINDS[kind].empty()]);
    $(ROW_KINDS[kind].container).querySelector(".row-item:last-child input")?.focus();
    refreshApplyState();
  }));
  $$("[data-ask]").forEach((button) => button.addEventListener("click", () => askDodo(button.dataset.ask)));
  $("#loadReferenceIntake").addEventListener("click", loadReferenceIntake);
  $("#askCompare").addEventListener("click", askCompare);
  $("#showInterview").addEventListener("click", showInterview);
  $("#closeInterview").addEventListener("click", hideInterview);
  // 安靜與不打擾 live in 建檔, so the band has to redraw when 作息 changes — and
  // the band is on a different tab, which is exactly why it is easy to forget.
  Object.values(ROW_KINDS).forEach(({ container }) => {
    ["input", "change"].forEach((event) => $(container).addEventListener(event, renderPolicyPreview));
  });
  // Read-only on purpose: 睡眠時段 and 不打擾 are facts about her life, so the
  // band sends you to 建檔 rather than letting you edit them here.
  $$("[data-goto-intake]").forEach((element) => {
    const goto = () => {
      switchTab("tabW2Intake");
      $('[data-intake="routines"]').scrollIntoView({ behavior: "smooth", block: "center" });
    };
    element.addEventListener("click", goto);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); goto(); }
    });
  });
  // 主動規則 and 主動對話 are two halves of one line: the rules, then the only
  // place that runs them for real. Each end points at the other.
  $$("[data-goto-policy]").forEach((element) => element.addEventListener("click", () => switchTab("tabW2Policy")));
  $$("[data-goto-live]").forEach((element) => element.addEventListener("click", () => switchTab("tabW2Live")));
  $("#declineChat").addEventListener("click", () => (isDeclinedNow() ? clearDecline() : declineChat()));
  $("#proactiveEventType").addEventListener("change", suggestTriggerTopic);
  $$("[data-trigger-mode]").forEach((button) => {
    button.addEventListener("click", () => switchTriggerMode(button.dataset.triggerMode));
  });
  // The manual trigger's own fields are half of every comparison in the hints.
  bindFieldEvents(["#proactiveNow", "#proactiveSinceLast", "#proactiveSentToday"], renderTriggerHints);
  // Typing in either budget field turns it from a readout into a hypothesis.
  // Only a real `input`/`change` from the student counts — syncBudgetFields()
  // assigns `.value` directly, which fires neither.
  ["#proactiveSinceLast", "#proactiveSentToday"].forEach((selector) => {
    ["input", "change"].forEach((event) => $(selector).addEventListener(event, () => {
      budgetFieldsFollowState = false;
      renderBudgetFollowState();
    }));
  });
  $("#resyncBudget").addEventListener("click", resyncBudgetFields);

  $("#saveWorkshop2").addEventListener("click", applyWorkshop2);
  $("#runTodaySummary").addEventListener("click", runTodaySummary);
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
  buildWorkshop2Prompt,
  rebuildWorkshop2Prompt,
  renderInterview,
  renderRulePresets,
  applyRulePreset,
  askCompare,
  showInterview,
  hideInterview,
  loadReferenceIntake,
  renderProactiveEventOptions,
  renderMemoryViewer,
  renderPolicyPreview,
  renderTriggerHints,
  renderProactiveLiveState,
  syncBudgetFields,
  renderScheduleList,
  switchTriggerMode,
  startScheduler,
  // Read by core's executeRealtimeTool, which owns the Realtime tool loop.
  upsertMemory,
  forgetMemory,
  describeMemoryWrite,
  syncIntakeAfterMemoryChange,
  MEMORY_LAYERS,
  MEMORY_MERGE_RULES,
  renderDeclineState,
  // No production caller outside this file; tests/browser/uicheck.js drives
  // these directly to check the merge rules, the golden-fixture parity of the
  // prompt composer, and that the band's schedule matches the server's.
  memoryEntryText,
  intakeFromFields,
  buildScheduleWindows,
  windowContains,
  recordProactiveSpoken,
};
})();
