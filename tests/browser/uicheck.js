import { Window } from "happy-dom";

// 伺服器連接埠：預設 8123，可用 DODO_PORT 覆寫。
const PORT = process.env.DODO_PORT ?? "8123";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../web/", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const page = readFileSync(`${ROOT}index.html`, "utf8");
// index.html loads these three in this order. Concatenating them reproduces what
// the browser ends up with: one shared script scope, core first.
const CLIENT_FILES = ["core.js", "workshop1.js", "workshop2.js"];
const script = CLIENT_FILES.map((name) => readFileSync(`${ROOT}${name}`, "utf8")).join("\n");
const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`).then((r) => r.json());
bootstrap.api_configured = false;          // keep the harness away from WebRTC
bootstrap.weather_configured = false;

const win = new Window({ url: `http://localhost:${PORT}/` });
win.document.write(page);
for (const key of ["window", "document", "localStorage", "location", "history", "navigator",
                   "Event", "HTMLElement", "Node", "CustomEvent", "getComputedStyle"]) {
  globalThis[key] = key === "window" ? win : win[key];
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("/api/bootstrap")) return { json: async () => bootstrap };
  // The scheduler decides through the server, exactly as the classroom does.
  if (String(url).includes("/api/proactive-decide")
      || String(url).includes("/api/proactive-simulate")) {
    return realFetch(`http://127.0.0.1:${PORT}${url}`, init);
  }
  throw new Error(`unexpected fetch: ${url}`);
};

const failures = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
  if (!cond) failures.push(label);
};
// The memory helpers live inside workshop2.js's IIFE now, so they are reachable
// only through W2. `workspace` is still a core top-level binding, and the getter
// closes over it from inside the same eval scope.
const EXPOSE = `
globalThis.__t = {
  upsertMemory: W2.upsertMemory, forgetMemory: W2.forgetMemory,
  describeMemoryWrite: W2.describeMemoryWrite, isQuietHour: W2.isQuietHour,
  renderMemoryViewer: W2.renderMemoryViewer, memoryEntryText: W2.memoryEntryText,
  migrateWorkshop2Blocks: W2.migrateWorkshop2Blocks,
  get workspace() { return workspace; },
};
// eval() never fires DOMContentLoaded, so start the app by hand — fire and
// forget, exactly as app.js's own final \`initialize();\` did.
initialize();`;
try { eval(script + EXPOSE); } catch (e) { failures.push(`app.js threw: ${e.message}`); console.log(e); }
await new Promise((r) => setTimeout(r, 400));   // let initialize()'s awaits settle

const $ = (s) => document.querySelector(s);
const shown = (id) => !document.getElementById(id).hidden;
const fire = (sel, type) => $(sel).dispatchEvent(new win.Event(type, { bubbles: true }));
const defaults = bootstrap.default_workspace.profile.agent;

ok("app.js + initialize() ran clean", failures.length === 0, failures.join(" | "));
ok("W1 opens on the persona tab", shown("tabPersona") && !shown("tabTurn"));
ok("W2 opens on the C Prompt tab", shown("tabW2Prompt") && !shown("tabW2Memory"));
ok("fields populated from bootstrap", $("#agentName").value === defaults.name, `agentName="${$("#agentName").value}"`);
ok("W1 prompt preview rendered", $("#agentSystemPrompt").textContent.includes("# 角色與身分"));
ok("W1+2 preview rendered", $("#workshop2SystemPrompt").textContent.includes("# 主動訊息的程式規則"));

// --- 套用 only when something is unapplied ---------------------------------
ok("套用 hidden on a clean load", $("#saveWorkshop1").hidden && $("#saveWorkshop2").hidden);
ok("no dirty dots on a clean load", document.querySelectorAll(".tab-button.is-dirty").length === 0);

$("#promptIdentity").value = "改過的身分"; fire("#promptIdentity", "input");
ok("套用 appears after a block edit", !$("#saveWorkshop1").hidden);
ok("dot lands on the persona tab", $('.tab-button[data-tab="tabPersona"]').classList.contains("is-dirty"));
ok("turn tab stays clean", !$('.tab-button[data-tab="tabTurn"]').classList.contains("is-dirty"));
ok("W2 套用 unaffected", $("#saveWorkshop2").hidden);
ok("preview followed the edit", $("#agentSystemPrompt").textContent.includes("改過的身分"));

// The four controls that had no listener at all before this change.
$("#agentVoice").value = "ash"; fire("#agentVoice", "change");
ok("<select> voice change is detected", $('.tab-button[data-tab="tabPersona"]').classList.contains("is-dirty"));
$("#interruptResponse").checked = !$("#interruptResponse").checked; fire("#interruptResponse", "change");
ok("checkbox change dots the turn tab", $('.tab-button[data-tab="tabTurn"]').classList.contains("is-dirty"));
$("#semanticEagerness").value = "high"; fire("#semanticEagerness", "change");
ok("eagerness change keeps the turn tab dirty", $('.tab-button[data-tab="tabTurn"]').classList.contains("is-dirty"));

// Revert every edit → the button has to go away again.
$("#promptIdentity").value = defaults.prompt_blocks.identity; fire("#promptIdentity", "input");
$("#agentVoice").value = defaults.voice; fire("#agentVoice", "change");
$("#interruptResponse").checked = !$("#interruptResponse").checked; fire("#interruptResponse", "change");
$("#semanticEagerness").value = "low"; fire("#semanticEagerness", "change");
ok("套用 hides once every edit is reverted", $("#saveWorkshop1").hidden);
ok("dots clear on revert", document.querySelectorAll(".tab-button.is-dirty").length === 0);

$("#cooldown").value = "45"; fire("#cooldown", "input");
ok("W2 套用 appears for a policy edit", !$("#saveWorkshop2").hidden);
ok("dot lands on the policy tab", $('.tab-button[data-tab="tabW2Policy"]').classList.contains("is-dirty"));
ok("W1 套用 still hidden", $("#saveWorkshop1").hidden);

// --- tabs -----------------------------------------------------------------
$('.tab-button[data-tab="tabW2Memory"]').click();
ok("clicking a tab shows it", shown("tabW2Memory") && !shown("tabW2Prompt"));
ok("aria-selected follows the click", $('.tab-button[data-tab="tabW2Memory"]').getAttribute("aria-selected") === "true");
ok("one active tab per bar", [...document.querySelectorAll(".tab-bar")]
  .every((bar) => bar.querySelectorAll(".is-active").length === 1));
ok("dirty dot survives switching away", $('.tab-button[data-tab="tabW2Policy"]').classList.contains("is-dirty"));
ok("W1 tabs untouched by a W2 click", shown("tabPersona"));

// --- transcript noise -----------------------------------------------------
const rows = () => document.querySelectorAll("#messages .message").length;
const before = rows();
$('#promptPresets .preset-button[data-preset="neural"]').click();
ok("preset load writes no transcript row", rows() === before, `rows ${before} → ${rows()}`);
ok("preset load lands in the status line",
   !$("#activityNote").hidden && $("#activityNote").textContent.includes("神經模式"));
ok("preset load surfaces 套用", !$("#saveWorkshop1").hidden);
ok("preset kept the student's own name", $("#agentName").value === defaults.name);

$("#chatOnly").checked = true; fire("#chatOnly", "change");
ok("只看對話 sets the filter class", $("#messages").classList.contains("is-chat-only"));
$("#chatOnly").checked = false; fire("#chatOnly", "change");
ok("unchecking restores the rows", !$("#messages").classList.contains("is-chat-only"));

// --- 取消變更 --------------------------------------------------------------
// Revert has to restore fields the writer set programmatically AND let the
// ordinary dirty computation hide both buttons again.
$("#promptIdentity").value = "又改了一次"; fire("#promptIdentity", "input");
$("#agentVoice").value = "coral"; fire("#agentVoice", "change");
$("#turnDetectionMode").value = "server_vad"; fire("#turnDetectionMode", "change");
ok("取消變更 appears with 套用", !$("#revertWorkshop1").hidden && !$("#saveWorkshop1").hidden);
ok("server_vad reveals the silence field", !$("#silenceDurationField").hidden);
$("#revertWorkshop1").click();
ok("revert restores the textarea", $("#promptIdentity").value === defaults.prompt_blocks.identity,
   `got "${$("#promptIdentity").value.slice(0, 12)}…"`);
ok("revert restores the <select>", $("#agentVoice").value === defaults.voice);
ok("revert restores the turn mode", $("#turnDetectionMode").value === "semantic_vad");
ok("revert re-hides the mode-specific field", $("#silenceDurationField").hidden);
ok("revert rebuilt the preview", !$("#agentSystemPrompt").textContent.includes("又改了一次"));
ok("both buttons hide after revert", $("#revertWorkshop1").hidden && $("#saveWorkshop1").hidden);
ok("revert cleared the W1 dots", document.querySelectorAll("#workshop1Panel .tab-button.is-dirty").length === 0);
// The W2 policy edit further up is deliberately still pending: reverting one
// group must not touch the other.
ok("revert left the other group alone", $('.tab-button[data-tab="tabW2Policy"]').classList.contains("is-dirty"));

$("#cooldown").value = "45"; fire("#cooldown", "input");
$("#revertWorkshop2").click();
ok("W2 revert restores the policy field",
   Number($("#cooldown").value) === bootstrap.default_workspace.profile.proactive_policy.cooldown_minutes);
ok("W2 buttons hide after revert", $("#revertWorkshop2").hidden && $("#saveWorkshop2").hidden);

// --- collapsible results --------------------------------------------------
ok("memory result starts hidden", $("#memoryOutcome").hidden);
ok("6-scenario result starts hidden", $("#proactiveOutcome").hidden);
ok("day result starts hidden", $("#dayOutcome").hidden);
$("#checkMemory").click();
ok("checking memory reveals the panel", !$("#memoryOutcome").hidden && $("#memoryOutcome").open);
ok("the score lives in the summary, so it survives collapsing",
   $("#memoryOutcome").querySelector("summary").contains($("#memoryResult")) && /\d\/\d/.test($("#memoryResult").textContent));
$("#memoryOutcome").open = false;
ok("panel can be collapsed with the score still readable",
   !$("#memoryOutcome").open && $("#memoryResult").textContent.length > 0);

// --- 觸發主動: priorities render from the project, not hardcoded -----------
const priorities = bootstrap.default_workspace.profile.proactive_policy.priorities;
const options = [...$("#proactiveEventType").options];
ok("every priority becomes an option", options.length === Object.keys(priorities).length,
   `${options.length} vs ${Object.keys(priorities).length}`);
ok("options are ordered by priority", options[0].value === "emergency");
ok("each label shows its own priority number",
   options.every((o) => o.textContent.includes(String(priorities[o.value]))));

// --- an audio m-line is always offered ------------------------------------
// text/text used to produce a data-channel-only offer, which OpenAI rejects
// with `invalid_offer: Offer did not have an audio media section.`
ok("no output-mode guard left on the transceiver",
   !script.includes('} else if (setup.outputMode === "voice") {'));
ok("the audio section is added unconditionally",
   script.includes('peerConnection.addTransceiver("audio", { direction: "recvonly" });'));

// --- the exported project -------------------------------------------------
ok("no max_output_tokens in a fresh project",
   !JSON.stringify(bootstrap.default_workspace).includes("max_output_tokens"));
ok("no max_output_tokens after a legacy project is merged in", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  return !JSON.stringify(stored).includes("max_output_tokens");
})());

// --- memory writes: A accumulates, B supersedes, C rewrites ---------------
// 「我喜歡唱歌」then「我喜歡跳舞」used to leave only 跳舞, because any key match
// overwrote. This is that exact sequence.
const layerTexts = (field) => $t.workspace.memory[field].map($t.memoryEntryText);
const $t = globalThis.__t;
$t.workspace.memory = { facts: [], events: [], summaries: [] };

$t.upsertMemory("A", "興趣", "唱歌");
$t.upsertMemory("A", "興趣", "跳舞");
ok("A keeps both facts under one key", layerTexts("facts").length === 2, layerTexts("facts").join(" / "));
ok("the first fact survived the second", layerTexts("facts").includes("興趣：唱歌"));

$t.upsertMemory("A", "興趣", "跳舞");
ok("re-saving the same key+value is idempotent", layerTexts("facts").length === 2);

$t.upsertMemory("A", "居住地", "台中");
$t.upsertMemory("A", "居住地", "台南", "supersede");
ok("an explicit replace does overwrite", layerTexts("facts").filter((t) => t.startsWith("居住地")).length === 1);
ok("...and keeps the new value", layerTexts("facts").includes("居住地：台南"));
ok("...without touching the other key", layerTexts("facts").filter((t) => t.startsWith("興趣")).length === 2);

$t.upsertMemory("B", "睡眠狀況", "昨晚沒睡好");
$t.upsertMemory("B", "睡眠狀況", "今天睡得好");
ok("B supersedes the same key by default", layerTexts("events").length === 1, layerTexts("events").join(" / "));
ok("B keeps the newest", layerTexts("events")[0] === "睡眠狀況：今天睡得好");

for (let i = 0; i < 12; i += 1) $t.upsertMemory("B", `事件${i}`, `內容${i}`);
ok("B is capped so old days cannot pile up outside the prompt", layerTexts("events").length === 8,
   `${layerTexts("events").length} entries`);
ok("the cap drops the oldest, not the newest", layerTexts("events").includes("事件11：內容11"));

$t.upsertMemory("C", "睡眠趨勢", "第一版摘要");
$t.upsertMemory("C", "睡眠趨勢", "重算後的摘要");
ok("C rewrites a summary in place", layerTexts("summaries").length === 1);

// --- retracting one value: the sequence 鳳梨 → 西瓜 → 芭樂 → 不吃西瓜 -------
$t.workspace.memory = { facts: [], events: [], summaries: [] };
["鳳梨", "西瓜", "芭樂"].forEach((fruit) => $t.upsertMemory("A", "喜歡的食物", fruit));
ok("three fruits accumulate under one key", layerTexts("facts").length === 3);
const gone = $t.forgetMemory("A", "喜歡的食物", "西瓜");
ok("removing 西瓜 takes exactly one row", gone.removed === 1);
ok("...and leaves the other two", layerTexts("facts").join(",") === "喜歡的食物：鳳梨,喜歡的食物：芭樂",
   layerTexts("facts").join(","));
ok("...and reports what is left under the key", gone.remaining.join("、") === "鳳梨、芭樂", gone.remaining.join("、"));
const miss = $t.forgetMemory("A", "喜歡的食物", "香蓮");
ok("a value that is not stored removes nothing", miss.removed === 0 && layerTexts("facts").length === 2);
ok("...and hands back the real values so it can be retried", miss.remaining.join("、") === "鳳梨、芭樂");
ok("an unknown key removes nothing", $t.forgetMemory("A", "沒這個 key", "x").removed === 0
   && layerTexts("facts").length === 2);

// --- 記憶分類 writes into 豆豆現在記得什麼 --------------------------------
$t.workspace.memory = { facts: [], events: [], summaries: [] };
$t.renderMemoryViewer();
const cards = bootstrap.memory_cards;
cards.forEach((card, index) => {
  const select = $(`[data-memory-index="${index}"]`);
  select.value = card.answer;
  fire(`[data-memory-index="${index}"]`, "change");
});
$("#checkMemory").click();
const viewer = () => $("#memoryViewer").textContent;
ok("a right A answer lands in 重要事實", viewer().includes("過敏：花生嚴重過敏"));
ok("a right C answer lands in 跨日摘要", $t.workspace.memory.summaries.length === 2,
   `${$t.workspace.memory.summaries.length} summaries`);
ok("長期偏好 lands in A alongside the other facts, not in the superseding B",
   $t.workspace.memory.facts.map($t.memoryEntryText).includes("音樂偏好：喜歡鄧麗君的歌"),
   $t.workspace.memory.facts.map($t.memoryEntryText).join(" / "));
ok("the X card writes nothing anywhere",
   !JSON.stringify($t.workspace.memory).includes("提款卡"));
const afterFirst = JSON.stringify($t.workspace.memory).length;
$("#checkMemory").click();
ok("re-checking does not duplicate the cards",
   JSON.stringify($t.workspace.memory).length === afterFirst);
ok("the result rows say where each card was stored", $("#memoryExplanations").textContent.includes("已寫進"));
ok("每一層 shows its own merge rule", $("#memoryViewer").textContent.includes("累加")
   && $("#memoryViewer").textContent.includes("取代") && $("#memoryViewer").textContent.includes("重寫"));

// --- the cards address the elder by the student's own 稱呼 ----------------
ok("cards start with the configured 長者稱呼", $("#memoryCards").textContent.includes("王奶奶"));
const keptAnswer = $('[data-memory-index="0"]').value;
$("#elderAddress").value = "陳爺爺"; fire("#elderAddress", "input");
ok("renaming the elder renames the cards", $("#memoryCards").textContent.includes("陳爺爺")
   && !$("#memoryCards").textContent.includes("王奶奶"));
ok("...without wiping answers already chosen", $('[data-memory-index="0"]').value === keptAnswer);
ok("no placeholder leaks through", !$("#memoryCards").textContent.includes("{USER_ADDRESS}"));

// --- 主動規則 draws itself ------------------------------------------------
$("#quietStart").value = "22"; fire("#quietStart", "input");
$("#quietEnd").value = "8"; fire("#quietEnd", "input");
ok("the band has one cell per hour", $("#quietBand").children.length === 24);
ok("22:00–08:00 silences 10 hours",
   [...$("#quietBand").children].filter((c) => c.classList.contains("is-quiet")).length === 10);
ok("the summary line is filled in", $("#policySummary").textContent.includes("安靜"));
$("#quietStart").value = "20"; fire("#quietStart", "input");
ok("widening 安靜時段 widens the band",
   [...$("#quietBand").children].filter((c) => c.classList.contains("is-quiet")).length === 12);
$("#cooldown").value = "600"; fire("#cooldown", "input");
ok("the binding limit is named", $("#policyBinding").textContent.includes("冷卻時間"));
$("#cooldown").value = "30"; fire("#cooldown", "input");
ok("...and switches when the other one bites", $("#policyBinding").textContent.includes("每日上限"));

// Reverting writes fields programmatically, which fires no input event — the
// band and the hints have to be told, or they keep showing reverted-away numbers.
$("#cooldown").value = "600"; fire("#cooldown", "input");
$("#revertWorkshop2").click();
ok("取消變更 takes the band's numbers back too",
   $("#policySummary").textContent.includes("冷卻 30 分鐘"), $("#policySummary").textContent);

// --- 事件優先權 is a field now, and the dropdown follows it before 套用 ------
const priorityTypes = Object.keys(bootstrap.default_workspace.profile.proactive_policy.priorities);
ok("事件優先權 renders one field per event type",
   $("#priorityFields").querySelectorAll("[data-priority]").length === priorityTypes.length,
   `${$("#priorityFields").querySelectorAll("[data-priority]").length}/${priorityTypes.length}`);
$('#priorityFields [data-priority="news"]').value = "999";
fire('#priorityFields [data-priority="news"]', "input");
ok("raising a priority reaches the 觸發主動 dropdown without 套用",
   [...$("#proactiveEventType").options][0].value === "news",
   [...$("#proactiveEventType").options].map((o) => o.value).join(","));
ok("...and the Prompt's 事件優先權 line with it",
   $("#workshop2SystemPrompt").textContent.includes("news(999)"));
ok("...and it counts as an unapplied change",
   $('.tab-button[data-tab="tabW2Policy"]').classList.contains("is-dirty"));
$("#revertWorkshop2").click();
ok("取消變更 puts the priority rows back",
   Number($('#priorityFields [data-priority="news"]').value)
   === bootstrap.default_workspace.profile.proactive_policy.priorities.news);
// The rows are re-sorted on revert, so the dirty check has to compare the
// numbers rather than their order — otherwise 取消變更 leaves a phantom dot.
ok("...leaving no phantom dirty dot behind",
   !$('.tab-button[data-tab="tabW2Policy"]').classList.contains("is-dirty"));

// --- 跑一整天 names the rule that did the blocking ------------------------
// The most direct answer this page has to 「為什麼要設計這條規則」, so it has to
// keep matching `choose_event`'s wording — the tally reads its sentences.
$("#runDaySimulation").click();
await new Promise((r) => setTimeout(r, 900));
ok("跑一整天 names the rule that blocked the most",
   $("#daySummary").textContent.includes("擋掉最多的是")
   && $("#daySummary").textContent.includes("冷卻時間"),
   $("#daySummary").textContent.slice(0, 160));
ok("...and totals every rule that blocked something", ["安靜時段", "每日上限", "尊重拒絕"]
   .every((label) => $("#daySummary").textContent.includes(label)),
   $("#daySummary").textContent.slice(0, 240));
ok("...with nothing falling through to 其他",
   !$("#daySummary").textContent.includes("其他"));

// --- 觸發主動: one event block, two modes, no A/B headings -----------------
ok("觸發主動 opens on the real-clock mode",
   shown("triggerModeSchedule") && !shown("triggerModeManual"));
ok("...and the note says which clock decides", $("#triggerModeNote").textContent.includes("真實時鐘"));
$('[data-trigger-mode="manual"]').click();
ok("switching to 假設 mode swaps the fields",
   shown("triggerModeManual") && !shown("triggerModeSchedule"));
ok("...and the note follows the switch", $("#triggerModeNote").textContent.includes("假設"));
ok("...but the pending list never hides with it", shown("scheduleList"));
$('[data-trigger-mode="schedule"]').click();
ok("switching back restores the schedule fields",
   shown("triggerModeSchedule") && !shown("triggerModeManual"));

// --- the manual trigger's fields carry the rule they are measured against --
ok("距上次 names the cooldown it must beat", $("#sinceLastHint").textContent.includes("30 分鐘"));
$("#proactiveSinceLast").value = "5"; fire("#proactiveSinceLast", "input");
ok("...and says which way this value goes", $("#sinceLastHint").textContent.includes("會被擋下"));
$("#proactiveSinceLast").value = "999"; fire("#proactiveSinceLast", "input");
ok("...both ways", $("#sinceLastHint").textContent.includes("會通過"));
ok("今日已發送 names the daily limit", $("#sentTodayHint").textContent.includes("每日上限"));
ok("模擬現在時間 names the quiet window", $("#nowHint").textContent.includes("安靜時段"));

// --- 待提醒項目: the time field finally means something --------------------
$("#scheduleAuto").checked = false; fire("#scheduleAuto", "change");
ok("the pending list starts empty", $("#scheduleList").textContent.includes("沒有待提醒項目"));
$("#proactiveTopic").value = "16:00 回診，要帶健保卡";
$("#proactiveEventType").value = "reminder";
$("#scheduleTime").value = "16:00";
$("#addSchedule").click();
ok("adding a reminder creates a row", $("#scheduleList").querySelectorAll(".schedule-row").length === 1);
ok("the row shows its time and topic", $("#scheduleList").textContent.includes("16:00")
   && $("#scheduleList").textContent.includes("要帶健保卡"));
// 刪除 used to be pushed onto a line of its own by the status cell's column span.
ok("刪除 rides on the row itself, with no reason line yet", (() => {
  const row = $("#scheduleList").querySelector(".schedule-row");
  return Boolean(row.querySelector(".schedule-delete")) && !row.querySelector(".schedule-reason");
})());
ok("the reminder is persisted with the project", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  return (stored.scheduled || []).length === 1;
})());
$("#scheduleList").querySelector("[data-schedule-id]").click();
ok("刪除 removes it", $("#scheduleList").querySelectorAll(".schedule-row").length === 0);
ok("...and from the saved project", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  return (stored.scheduled || []).length === 0;
})());

// --- a due reminder fires against the real clock, once ---------------------
// The complaint this answers: setting a time did nothing when that time arrived.
const nowText = new Date().toTimeString().slice(0, 5);
$("#proactiveEventType").value = "reminder";
$("#proactiveTopic").value = "該吃藥了";
$("#scheduleTime").value = nowText;
$("#scheduleAuto").checked = true;
$("#addSchedule").click();
await new Promise((r) => setTimeout(r, 600));
const fired = $t.workspace.scheduled[0];
ok("a due reminder stops being pending on its own", fired && fired.status !== "pending",
   `status=${fired && fired.status}`);
ok("...and records the rule's reason", Boolean(fired && fired.reason), fired && fired.reason);
ok("...and the TOOL row explains it", $("#messages").textContent.includes("待提醒觸發"));
ok("...but says 保持安靜 rather than claiming it spoke with no API key",
   fired.status === "blocked" && fired.reason.includes("說不出話"), fired.reason);
ok("...and a blocked row grows a second line for that reason",
   Boolean($("#scheduleList").querySelector(".schedule-reason")));
const firedTwice = $("#messages").textContent.split("待提醒觸發").length - 1;
await new Promise((r) => setTimeout(r, 600));
ok("a fired reminder never fires again",
   $("#messages").textContent.split("待提醒觸發").length - 1 === firedTwice);

// A quiet-hours reminder is refused by the rules, not by the transport.
$t.workspace.scheduled.length = 0;
$("#quietStart").value = "0"; fire("#quietStart", "input");
$("#quietEnd").value = "23"; fire("#quietEnd", "input");
$("#saveWorkshop2").click();
$("#scheduleTime").value = nowText;
$("#addSchedule").click();
await new Promise((r) => setTimeout(r, 600));
ok("the rules can block a due reminder outright",
   $t.workspace.scheduled[0].reason.includes("安靜"), $t.workspace.scheduled[0].reason);

// --- a project saved before the merge rule existed gets told about it ------
const OLD_BLOCK = [
  "用 read_memory 讀取 {USER_ADDRESS} 的三層記憶，用 update_memory 保存新資訊，並在保存時指定層級：",
  "A 重要事實（layer=A）：過敏、慢性病、緊急聯絡人、長期偏好；由真人確認管理，不要自行推測或改寫。",
  "提起記憶時要像家人記得，而不是唸資料庫；不確定的事先問一句，不要假裝記得。",
].join("\n");
ok("a legacy block gains the guidance lines", (() => {
  const migrated = globalThis.__t.migrateWorkshop2Blocks({ memory_use: OLD_BLOCK });
  const lines = migrated.memory_use.split("\n");
  return migrated.memory_use.includes('mode="replace"')
    && migrated.memory_use.includes('mode="remove"')
    && migrated.memory_use.includes("一律存 layer=A")
    && lines.length === 5
    // Inserted above the closing line, not appended after it.
    && lines[4].startsWith("提起記憶時要像家人記得");
})());
ok("running it twice changes nothing more", (() => {
  const once = globalThis.__t.migrateWorkshop2Blocks({ memory_use: OLD_BLOCK });
  const twice = globalThis.__t.migrateWorkshop2Blocks(once);
  return once.memory_use === twice.memory_use;
})());
// The first migration gated on `mode="replace"`, which its own inserted line
// contained — so a project migrated once was frozen at that revision forever.
ok("a project stuck on the first revision is brought forward", (() => {
  const V1 = [
    "用 read_memory 讀取 {USER_ADDRESS} 的三層記憶，用 update_memory 保存新資訊，並在保存時指定層級：",
    '同一個 key 再存一次時：新資訊和舊的都成立就直接存；只有新內容真的取代舊內容才傳 mode="replace"。',
    "提起記憶時要像家人記得，而不是唸資料庫；不確定的事先問一句，不要假裝記得。",
  ].join("\n");
  const migrated = globalThis.__t.migrateWorkshop2Blocks({ memory_use: V1 });
  const lines = migrated.memory_use.split("\n");
  return migrated.memory_use.includes('mode="remove"')
    && migrated.memory_use.includes("一律存 layer=A")
    // The stale revision is replaced, not left sitting beside the new one.
    && lines.filter((l) => l.startsWith("同一個 key 再存一次時：")).length === 1
    && lines.length === 4;
})());
ok("a deliberately emptied block stays empty",
   globalThis.__t.migrateWorkshop2Blocks({ memory_use: "" }).memory_use === "");
ok("a block the student rewrote is left alone", (() => {
  const mine = { memory_use: "我自己寫的規則。" };
  return globalThis.__t.migrateWorkshop2Blocks(mine).memory_use === "我自己寫的規則。";
})());
ok("a fresh project already has it and is not touched", (() => {
  const fresh = bootstrap.default_workspace.profile.workshop2_blocks;
  return fresh.memory_use.includes('mode="replace"')
    && globalThis.__t.migrateWorkshop2Blocks(fresh) === fresh;
})());

// --- a supersede has to name what it discarded ----------------------------
$t.workspace.memory = { facts: [], events: [], summaries: [] };
$t.upsertMemory("B", "今天想吃的東西", "芭樂");
const ate = $t.upsertMemory("B", "今天想吃的東西", "柳丁");
ok("B reports the value it threw away by name", ate.superseded.join("、") === "芭樂",
   ate.superseded.join("、"));
ok("...and the TOOL sentence says it out loud",
   $t.describeMemoryWrite(ate, "今天想吃的東西", "柳丁").includes("丟掉了：芭樂"),
   $t.describeMemoryWrite(ate, "今天想吃的東西", "柳丁"));

// --- the header block stays put while the fields scroll -------------------
ok("both panels have a sticky header", document.querySelectorAll(".lab-sticky").length === 2);
ok("the tab bar is inside it", document.querySelectorAll(".lab-sticky .tab-bar").length === 2);
ok("the intro paragraphs are gone", document.querySelectorAll(".layer-intro").length === 0);

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
