// workshop2.js —— 第二堂：建檔、態度分塊、三層記憶、主動關心規則與待提醒排程。
//
// 整支包在 IIFE 裡，只掛一個全域；IIFE 內一律零縮排 —— tests/test_web.py 用 `\n}`
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
//   A 累加   —— 興趣：唱歌 and 興趣：跳舞 are both true, so both stay. Caregiver
//               facts are locked: the model may add beside them, never replace.
//   B 取代   —— 近期事件 IS the latest state. 「膝蓋好多了」 replaces 「膝蓋痛」,
//               which is what stops the 健康關心 follow-up. Capped so stale days
//               cannot pile up outside the prompt window.
//   C 重寫   —— a summary is recomputed from scratch, never appended to.
const MEMORY_MERGE_RULES = {
  A: { merge: "accumulate", label: "累加：同一個 key 可以並存多筆事實；護理員建的豆豆不能改", capacity: 0 },
  B: { merge: "supersede", label: `取代：同一個 key 只留最新一筆，整層最多 ${MEMORY_PREVIEW_LIMIT} 筆`, capacity: MEMORY_PREVIEW_LIMIT },
  C: { merge: "rewrite", label: "重寫：摘要由系統重算，同一個 key 直接覆蓋", capacity: 0 },
};
// Workshop 2's editable blocks: attitudes only. 建檔決定資料，Prompt 只寫態度.
// Default text lives in profile.py and arrives via /api/bootstrap.
const WORKSHOP2_BLOCKS = [
  ["memory_use", "記憶使用規則", "#promptMemoryUse"],
  ["attitude_reminder", "重要提醒怎麼講", "#promptAttitudeReminder"],
  ["attitude_health", "健康關心怎麼問", "#promptAttitudeHealth"],
  ["attitude_chat", "閒聊從哪裡開始", "#promptAttitudeChat"],
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
    ? `${quiet} 段不打擾時段會變成主動分頁帶狀圖上的灰色；只有重要提醒能穿過。`
    : "還沒有不打擾時段：現在她的一天裡，豆豆什麼時候都能開口。";
  $("#hintCare").textContent = meds
    ? `${meds} 筆用藥會變成重要提醒 —— 不受間隔與上限限制，也不吃額度。`
    : "還沒有用藥：她的一天裡不會有任何重要提醒。";
  $("#hintSymptoms").textContent = symptoms
    ? `${symptoms} 筆症狀會變成健康關心候選：豆豆會在一天裡挑時間追問「還好嗎」，她說好了就用 replace 換掉。`
    : "還沒有症狀：她的一天裡不會有健康關心。";
  $("#hintTaboos").textContent = `${taboos} 個禁區會進 Prompt 的「# 不主動提起」；${declined} 句決定不記，不會進任何地方。`;
}

let intakeCheckTimer = null;
function scheduleIntakeCheck() {
  clearTimeout(intakeCheckTimer);
  intakeCheckTimer = setTimeout(runIntakeCheck, 400);
}

/** Counts per section against what the interview actually contains. Not a
 *  grade: whether the content is right is answered by 她的一天 and by 豆豆. */
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

/** 「問豆豆這一區」: apply what is on screen, then ask one fixed question that
 *  only the just-filled section can answer. Six small feedback loops instead of
 *  one 35-minute form. */
async function askDodo(question) {
  await applyWorkshop2();
  if (dataChannel?.readyState !== "open") {
    notify("還沒連上 Realtime（需要 API Key），建檔已經保存；連線後再按一次就能問。");
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
        $("#quietStart").value = policy.quiet_hours.start;
        $("#quietEnd").value = policy.quiet_hours.end;
        $("#maxSentences").value = policy.max_message_sentences;
        renderPriorityFields(policy.priorities);
        renderProactiveEventOptions();
      },
    },
  },
});
// Only Workshop 2 reads or writes this: 執行 6 個情境 gates on it (dead until
// the 主動 tab is rebuilt; the quiz that used to set it is gone).
let memoryPassed = true;

// The three types `choose_event` decides between. schema 1 had six, each with a
// priority number; 緊急／天氣／新聞／反向請教 left with it.
const PROACTIVE_EVENT_LABELS = {
  reminder: "reminder 重要提醒",
  health: "health 健康關心",
  chat: "chat 閒聊",
};

function renderPriorityFields(priorities = {}) {
  const entries = Object.entries(priorities || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  $("#priorityFields").innerHTML = entries.map(([type, score]) => `
    <label class="priority-field">
      <span>${escapeHtml(PROACTIVE_EVENT_LABELS[type] || type)}</span>
      <input type="number" min="0" max="999" data-priority="${escapeHtml(type)}" value="${Number(score) || 0}">
    </label>`).join("");
}

function prioritiesFromFields() {
  const inputs = [...document.querySelectorAll("#priorityFields [data-priority]")];
  return Object.fromEntries(inputs
    .map((input) => [input.dataset.priority, Math.max(0, Number(input.value) || 0)])
    .sort((left, right) => left[0].localeCompare(right[0])));
}

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
    .map(([type, label]) => `<option value="${type}">${escapeHtml(`${type} ${label}`)}</option>`)
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
  // The 主動 tab is rebuilt in the next phase; until then its two surviving
  // fields carry the two knobs and the rest sit at fixed values.
  $("#cooldown").value = proactive.interval_minutes;
  $("#dailyLimit").value = proactive.daily_limit;
  $("#quietStart").value = 22;
  $("#quietEnd").value = 8;
  $("#maxSentences").value = MAX_MESSAGE_SENTENCES;
  renderPriorityFields({});
  scheduleIntakeCheck();
}

function workshop2BlocksFromFields() {
  return Object.fromEntries(WORKSHOP2_BLOCKS.map(([key, , selector]) => [
    key,
    $(selector).value.trim(),
  ]));
}

/** Two knobs — plus, until the 主動 tab is rebuilt, the legacy preview fields
 *  the old band and hints still read. Only the two knobs are ever stored. */
function proactivePolicyFromFields() {
  return {
    interval_minutes: Math.max(0, Number($("#cooldown").value) || 0),
    daily_limit: Math.max(0, Number($("#dailyLimit").value) || 0),
    quiet_hours: { start: Number($("#quietStart").value), end: Number($("#quietEnd").value) },
    cooldown_minutes: Math.max(0, Number($("#cooldown").value) || 0),
    daily_message_limit: Math.max(0, Number($("#dailyLimit").value) || 0),
    max_message_sentences: MAX_MESSAGE_SENTENCES,
    priorities: prioritiesFromFields(),
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
// Prompt 組裝 —— mirrors prompt_sections.py. Change the fixture, not one side.
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
  if (wake || bed) lines.push(`作息：${wake || "？"} 起床、${bed || "？"} 上床`);
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
    wake && bed ? `她上床（${bed}）到起床（${wake}）之間只送重要提醒。` : "建檔沒有填起床與上床時間，所以沒有安靜時段。",
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
  $("#workshop2SystemPrompt").textContent = composeInstructions(workshop2Draft());
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
  notify(`已從 ${title} 刪除「${removed}」，並更新豆豆的記憶。人可以覆寫 AI 記得的事。`);
}

/** After the model replaced or removed a caregiver-seeded symptom (「膝蓋好多了」),
 *  the form must stop listing it — otherwise the next 套用 would seed it again
 *  and the follow-up would never stop. Core calls this after memory tool writes. */
function syncIntakeAfterMemoryChange() {
  renderRows("symptom", caregiverEntries("events"));
  renderIntakeHints();
  markTabApplied("tabW2Intake");
}

/** Whoever 豆豆 is talking to, by name. */
function elderAddress() {
  return $("#elderAddress")?.value.trim()
    || workspace?.profile?.elder_profile?.address
    || $("#agentAddress")?.value.trim()
    || "長者";
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
    type: item.type,
    minutes_since_last: minutesSinceLastProactive(),
    sent_today: proactiveState().sent_today,
    // NOT the 剛被拒絕 checkbox: that belongs to the manual what-if trigger, and
    // this client has no real signal for it. Reading it here would let a
    // hypothesis ticked in section B silently kill a scheduled 吃藥提醒.
    user_declined: false,
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

// The three types schema 2 decides between — same set as bootstrap's
// `event_types`, shortened for the timeline's narrow column.
const DAY_EVENT_LABELS = { reminder: "提醒", health: "健康", chat: "閒聊" };

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
    describe("漏掉的健康關心", lastDayRun.missed_health, result.missed_health),
    describe("打擾", lastDayRun.noise, result.noise),
  ].join("、")}</p>`;
}

// `choose_event` returns a sentence, not a code. Matching on the distinctive
// word is enough to total up which rule did the work — and that total is the
// most direct answer this page has to 「為什麼要設計這條規則」.
/** Which rule did the blocking, counted by the decider itself.
 *
 *  This used to sniff substrings out of each reason sentence, so a reworded
 *  reason fell through to 「其他」 without saying so. `blocked_by` is the decider's
 *  own tally, keyed by rule code, and `rule_labels` names them — one vocabulary
 *  for the band, the tally and the timeline. */
function renderDayBlockers(result) {
  const labels = bootstrapData?.rule_labels || {};
  const name = (rule) => labels[rule] || rule;
  const ranked = Object.entries(result.blocked_by || {}).sort((left, right) => right[1] - left[1]);
  if (!ranked.length) {
    return `<p class="day-blockers">這一天沒有任何事件被擋下 —— ${result.steps.length} 件全說出去了。</p>`;
  }
  const breakdown = ranked.map(([rule, count]) => `${name(rule)} <b>${count}</b> 次`).join("・");
  return `<p class="day-blockers">這一天擋掉最多的是〈<strong>${name(ranked[0][0])}</strong>〉：${breakdown}。</p>`;
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
      body: JSON.stringify({
        policy: workspace.profile.proactive_policy,
        // The shared 星期二 is grown from the reference 建檔, but her own file is
        // what supplies the schedule the gates read.
        elder_profile: workspace.profile.elder_profile,
        memory: workspace.memory,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "模擬失敗。");
    $("#daySummary").innerHTML = `
      <div class="day-score">
        <span>說出 <b>${result.spoken}</b> 則</span>
        <span>擋下 <b>${result.blocked}</b> 則</span>
        <span class="${result.missed_health ? "is-worse" : "is-better"}">漏掉的健康關心 <b>${result.missed_health}</b>／${result.health_total}</span>
        <span class="${result.noise > 2 ? "is-worse" : ""}">打擾 <b>${result.noise}</b>／${result.chat_total}</span>
      </div>
      ${renderDayBlockers(result)}
      ${renderDayDelta(result)}
      <p class="day-hint">兩個數字會互相拉扯：規則放寬，打擾變多；規則收緊，重要的事會被漏掉。沒有滿分答案。</p>`;
    // 重要提醒 is the type the rules never ration, which is what makes it the
    // one worth marking on the timeline.
    $("#dayTimeline").innerHTML = result.steps.map((step) => `
      <div class="day-row ${step.spoke ? "is-spoken" : "is-blocked"} ${step.type === "reminder" ? "is-critical" : ""}">
        <time>${step.time}</time>
        <span class="day-kind">${DAY_EVENT_LABELS[step.type] || step.type}</span>
        <span class="day-topic">${escapeHtml(step.topic)}</span>
        <span class="day-verdict">${step.spoke ? "說出" : "擋下"}：${escapeHtml(step.reason)}</span>
      </div>`).join("");
    showResult("#dayOutcome", "#dayScore",
      `漏掉的健康關心 ${result.missed_health}／${result.health_total} · 打擾 ${result.noise}／${result.chat_total}`);
    lastDayRun = result;
  } catch (error) {
    $("#daySummary").textContent = error.message || "無法連接本機服務。";
  } finally {
    button.disabled = false;
  }
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
  if (decision.should_speak) await speakProactive(event, time, policy);
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
    ? "第二堂設定已套用：建檔、記憶、態度與主動規則都寫進了同一份 instructions，正在確認更新…"
    : "第二堂設定已保存（尚未連線，下次連線時生效）。");
}

// Workshop 2's half of the field list core's bindFieldEvents() wires up.
const WORKSHOP2_FIELDS = [
  ...INTAKE_SCALARS.map(([selector]) => selector),
  "#elderExpertise", "#contactName", "#contactRelation", "#contactPhone",
  ...WORKSHOP2_BLOCKS.map(([, , selector]) => selector),
  "#quietStart", "#quietEnd", "#cooldown", "#dailyLimit", "#maxSentences",
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
  buildWorkshop2Prompt,
  rebuildWorkshop2Prompt,
  renderInterview,
  renderProactiveEventOptions,
  renderMemoryViewer,
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
  syncIntakeAfterMemoryChange,
  MEMORY_LAYERS,
  MEMORY_MERGE_RULES,
  // No production caller outside this file; tests/browser/uicheck.js drives
  // these directly to check the merge rules, the quiet-hour wrap-around and
  // the golden-fixture parity of the prompt composer.
  memoryEntryText,
  isQuietHour,
  intakeFromFields,
};
})();
