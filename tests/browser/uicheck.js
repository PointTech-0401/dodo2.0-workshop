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
  // The scheduler decides through the server, exactly as the classroom does —
  // and so do schema migration and the 建檔 completeness count, which are the
  // browser's two other server round-trips.
  if (["/api/proactive-decide", "/api/proactive-simulate",
       "/api/workspace/normalize", "/api/intake-check"].some((path) => String(url).includes(path))) {
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
  // Exactly the sequence core runs when 豆豆 calls update_memory, so a test can
  // check what a tool write does to the 建檔 tab's baseline.
  toolMemoryWrite: (layer, key, value, mode) => {
    const result = W2.upsertMemory(layer, key, value, mode);
    saveProject();
    W2.rebuildWorkshop2Prompt();
    W2.renderMemoryViewer();
    W2.syncIntakeAfterMemoryChange();
    return result;
  },
  renderMemoryViewer: W2.renderMemoryViewer, memoryEntryText: W2.memoryEntryText,
  // §4 前後端同文: the browser composer, driven straight off a fixture workspace.
  buildWorkshop2Prompt: W2.buildWorkshop2Prompt, intakeFromFields: W2.intakeFromFields,
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
ok("W2 opens on the 建檔 tab", shown("tabW2Intake") && !shown("tabW2Prompt"));
ok("the interview is on screen before the form", $("#interviewText").textContent.includes("秀蘭"));
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
$('.tab-button[data-tab="tabW2Prompt"]').click();
ok("clicking a tab shows it", shown("tabW2Prompt") && !shown("tabW2Intake"));
ok("aria-selected follows the click", $('.tab-button[data-tab="tabW2Prompt"]').getAttribute("aria-selected") === "true");
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
   Number($("#cooldown").value) === bootstrap.default_workspace.profile.proactive_policy.interval_minutes);
ok("W2 buttons hide after revert", $("#revertWorkshop2").hidden && $("#saveWorkshop2").hidden);

// --- 建檔's list rows survive a 取消變更 round-trip ------------------------
// The list sections share the same JSON snapshot as every scalar field, which
// only works if read() normalizes: an unfilled row is not data, times come back
// as zero-padded strings, weekdays as numbers, and rows sorted by start time. If
// read(write(x)) !== x the tab stays dirty forever — a dot nothing can clear.
const routineRows = () => $("#routineRows").querySelectorAll(".row-item").length;
const intakeDirty = () => $('.tab-button[data-tab="tabW2Intake"]').classList.contains("is-dirty");
const baselineRoutines = routineRows();
ok("建檔 starts clean and applied", !intakeDirty() && $("#saveWorkshop2").hidden);

$('[data-add="routine"]').click();
ok("＋ adds a row", routineRows() === baselineRoutines + 1);
// An empty row is not data, so it must not ask to be applied.
ok("...but a blank row is not an unapplied change", !intakeDirty() && $("#saveWorkshop2").hidden);

const added = [...$("#routineRows").querySelectorAll(".row-item")].at(-1);
added.querySelector('[data-field="label"]').value = "歌唱班";
added.querySelector('[data-field="start"]').value = "09:30";
added.querySelector('[data-field="end"]').value = "10:30";
fire("#routineRows", "input");
ok("filling it in does", intakeDirty() && !$("#saveWorkshop2").hidden);
ok("...and the hint says what the section will do", $("#hintRoutines").textContent.length > 0);

$("#revertWorkshop2").click();
ok("取消變更 drops the added row", routineRows() === baselineRoutines, `${routineRows()} rows`);
ok("...leaving no phantom dirty dot behind", !intakeDirty());
ok("...and hiding both buttons", $("#revertWorkshop2").hidden && $("#saveWorkshop2").hidden);
// Round-trip stability on the asymmetric row shape: an appointment keeps EITHER
// `weekday` or `date`, never both, so read() emits a different key set depending
// on which one is filled. If write(read(x)) does not re-read identically, the dot
// comes back on its own and 套用 can never be satisfied.
const appointmentRows = () => [...$("#appointmentRows").querySelectorAll(".row-item")];
$('[data-add="appointment"]').click();
const appt = appointmentRows().at(-1);
appt.querySelector('[data-field="label"]').value = "復健";
appt.querySelector('[data-field="weekday"]').value = "5";   // 每週五, so `date` drops out
appt.querySelector('[data-field="time"]').value = "14:00";
fire("#appointmentRows", "input");
ok("a weekly appointment is an unapplied change", intakeDirty());
// 套用 is async — it connects before it re-freezes the baseline.
$("#saveWorkshop2").click();
await new Promise((r) => setTimeout(r, 300));
ok("套用 then re-reading the form is a fixed point", !intakeDirty() && $("#saveWorkshop2").hidden);
ok("...and the applied row is still on screen", appointmentRows().length === 1
   && appt.querySelector('[data-field="weekday"]').value === "5");
ok("...and it reached the saved project", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  const saved = stored.profile?.elder_profile?.appointments || [];
  return saved.length === 1 && saved[0].weekday === 5 && !("date" in saved[0]);
})(), JSON.stringify(JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}")
  .profile?.elder_profile?.appointments || []));
// Now revert an edit made on top of a populated list.
appt.querySelector('[data-field="time"]').value = "16:00";
fire("#appointmentRows", "input");
ok("editing an applied row dots the tab again", intakeDirty());
$("#revertWorkshop2").click();
ok("取消變更 restores the applied row rather than dropping it",
   appointmentRows().length === 1
   && appointmentRows()[0].querySelector('[data-field="time"]').value === "14:00",
   appointmentRows().map((r) => r.querySelector('[data-field="time"]').value).join(","));
// The <select> is the part a re-render loses most easily, and losing it means the
// dot can never be cleared: read() would keep disagreeing with the snapshot.
ok("...including the <select> it was set to",
   appointmentRows()[0].querySelector('[data-field="weekday"]').value === "5",
   appointmentRows()[0].querySelector('[data-field="weekday"]').value);
ok("...with no dot left over", !intakeDirty());

// A routine carries both a checkbox and seven weekday boxes — the other two
// control types a re-render has to bring back.
$('[data-add="routine"]').click();
const routine = [...$("#routineRows").querySelectorAll(".row-item")].at(-1);
routine.querySelector('[data-field="label"]').value = "午睡";
routine.querySelector('[data-field="start"]').value = "13:00";
routine.querySelector('[data-field="end"]').value = "14:30";
routine.querySelector('[data-weekday="2"]').checked = true;
routine.querySelector('[data-weekday="4"]').checked = true;
fire("#routineRows", "input");
$("#saveWorkshop2").click();
await new Promise((r) => setTimeout(r, 300));
ok("a routine with weekdays applies cleanly", !intakeDirty() && $("#saveWorkshop2").hidden);
ok("...and 不打擾 defaults to ticked", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  const saved = (stored.profile?.elder_profile?.routines || [])[0];
  return saved && saved.do_not_disturb === true && String(saved.weekdays) === "2,4";
})(), JSON.stringify((JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}")
  .profile?.elder_profile?.routines || [])[0]));
// Untick 不打擾 and revert: the checkbox has to come back ticked.
const dnd = () => $("#routineRows").querySelector('[data-field="do_not_disturb"]');
dnd().checked = false;
fire("#routineRows", "change");
ok("unticking 不打擾 is an unapplied change", intakeDirty());
$("#revertWorkshop2").click();
ok("取消變更 re-ticks it", dnd().checked === true);
ok("...restores the weekday boxes", [...$("#routineRows").querySelectorAll("[data-weekday]:checked")]
   .map((b) => b.dataset.weekday).join(",") === "2,4",
   [...$("#routineRows").querySelectorAll("[data-weekday]:checked")].map((b) => b.dataset.weekday).join(","));
ok("...and clears the dot for good", !intakeDirty());

// --- a memory write must not absorb a pending 建檔 edit --------------------
// 豆豆 writing memory re-renders the symptom rows, so 建檔's baseline has to move
// with them — but only that slice. Re-freezing the whole tab would adopt a row
// the student typed and never applied: the dot clears, 套用 hides, and the row
// exists on screen only until the next F5 silently drops it.
$('[data-add="routine"]').click();
const pending = [...$("#routineRows").querySelectorAll(".row-item")].at(-1);
pending.querySelector('[data-field="label"]').value = "書法班";
pending.querySelector('[data-field="start"]').value = "15:00";
pending.querySelector('[data-field="end"]').value = "16:00";
fire("#routineRows", "input");
const routinesBefore = routineRows();
ok("a typed-but-unapplied routine is dirty", intakeDirty() && !$("#saveWorkshop2").hidden);

// `$t` is declared further down, so reach through the global it aliases.
globalThis.__t.toolMemoryWrite("B", "膝蓋", "好多了", "supersede");
ok("a memory write leaves the pending edit dirty", intakeDirty());
ok("...and 套用 still offered", !$("#saveWorkshop2").hidden);
ok("...without dropping the row from the screen", routineRows() === routinesBefore);
ok("...while the symptom rows did re-render", $("#memoryViewer").textContent.includes("好多了"));
// Applying now must still settle: the patched slice has to agree with read().
$("#saveWorkshop2").click();
await new Promise((r) => setTimeout(r, 300));
ok("...and 套用 afterwards still reaches a fixed point", !intakeDirty() && $("#saveWorkshop2").hidden);
ok("...with the routine actually saved", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  return (stored.profile?.elder_profile?.routines || []).some((r) => r.label === "書法班");
})());

// --- collapsible results --------------------------------------------------
// 記憶分類 was a quiz with a score; 建檔 is a form with a completeness count, so
// it has no result panel. The two lab runs still collapse.
ok("6-scenario result starts hidden", $("#proactiveOutcome").hidden);
ok("day result starts hidden", $("#dayOutcome").hidden);

// --- 觸發主動: the three event types the backend decides between -----------
// schema 1 offered six with a student-typed priority each; schema 2 has three
// and no priorities, so the list comes from the server.
const options = [...$("#proactiveEventType").options];
ok("the dropdown offers the server's event types",
   options.length === Object.keys(bootstrap.event_types).length,
   `${options.length} vs ${Object.keys(bootstrap.event_types).length}`);
ok("...and only the three that exist", options.every((o) => o.value in bootstrap.event_types),
   options.map((o) => o.value).join(","));
ok("...never the retired schema-1 types",
   !options.some((o) => ["emergency", "weather", "news", "reverse_mentor"].includes(o.value)));

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

// The cap is MEMORY_PREVIEW_LIMIT, which is 16 on both sides now — 秀蘭阿嬤's
// reference file alone carries 13 A-layer facts, so a window of 8 would have cut
// her own care file in half before it ever reached the model.
const CAP = 16;
for (let i = 0; i < CAP + 6; i += 1) $t.upsertMemory("B", `事件${i}`, `內容${i}`);
ok("B is capped so old days cannot pile up outside the prompt", layerTexts("events").length === CAP,
   `${layerTexts("events").length} entries`);
ok("the cap drops the oldest, not the newest", layerTexts("events").includes(`事件${CAP + 5}：內容${CAP + 5}`));
ok("...and the cap agrees with the prompt window", script.includes(`const MEMORY_PREVIEW_LIMIT = ${CAP};`));

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

// --- 跑一整天 names the rule that did the blocking ------------------------
// The most direct answer this page has to 「為什麼要設計這條規則」. The tally is the
// decider's own `blocked_by`, named through bootstrap's `rule_labels`, so a
// reworded reason sentence can no longer drop a rule into 「其他」 unnoticed.
$("#runDaySimulation").click();
await new Promise((r) => setTimeout(r, 900));
const daySummary = () => $("#daySummary").textContent;
ok("跑一整天 names the rule that blocked the most",
   daySummary().includes("擋掉最多的是"), daySummary().slice(0, 160));
ok("...and every rule it names is one the server defined",
   Object.values(bootstrap.rule_labels).some((label) => daySummary().includes(label)),
   daySummary().slice(0, 240));
ok("...with nothing falling through to 其他", !daySummary().includes("其他"));
// The two scores that pull against each other — neither may read `undefined`.
ok("both scores are real numbers", /漏掉的健康關心\s*\d+／\d+/.test(daySummary())
   && /打擾\s*\d+／\d+/.test(daySummary()), daySummary().slice(0, 200));
ok("the timeline names each event's type", [...$("#dayTimeline").querySelectorAll(".day-kind")]
   .every((cell) => ["提醒", "健康", "閒聊"].includes(cell.textContent.trim())),
   [...$("#dayTimeline").querySelectorAll(".day-kind")].map((c) => c.textContent).join(","));

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

// A due item can be refused by the rules rather than by the transport — and the
// window that refuses it is now derived from 建檔 作息, not typed into a
// quiet-hours field. 重要提醒 deliberately skips every gate, so the one that gets
// blocked has to be a 閒聊: that asymmetry IS the lesson.
$t.workspace.scheduled.length = 0;
$("#elderBed").value = "00:01"; fire("#elderBed", "input");
$("#elderWake").value = "23:58"; fire("#elderWake", "input");
$("#saveWorkshop2").click();
$("#proactiveEventType").value = "chat";
$("#proactiveTopic").value = "今天天氣不錯";
$("#scheduleTime").value = nowText;
$("#addSchedule").click();
await new Promise((r) => setTimeout(r, 600));
ok("her 作息 can block a due 閒聊 outright",
   /還沒起床|已經上床/.test($t.workspace.scheduled[0].reason), $t.workspace.scheduled[0].reason);

// --- a supersede has to name what it discarded ----------------------------
$t.workspace.memory = { facts: [], events: [], summaries: [] };
$t.upsertMemory("B", "今天想吃的東西", "芭樂");
const ate = $t.upsertMemory("B", "今天想吃的東西", "柳丁");
ok("B reports the value it threw away by name", ate.superseded.join("、") === "芭樂",
   ate.superseded.join("、"));
ok("...and the TOOL sentence says it out loud",
   $t.describeMemoryWrite(ate, "今天想吃的東西", "柳丁").includes("丟掉了：芭樂"),
   $t.describeMemoryWrite(ate, "今天想吃的東西", "柳丁"));

// --- 前後端同文: one fixture, two composers -------------------------------
// Spec §4. `compose_workshop2_prompt` is pinned against this same .txt in
// tests/test_profile.py, so the two halves cannot drift apart: whichever side
// changes wording, this comparison fails until the fixture is regenerated and
// the other side follows. A comment saying 「keep in sync」 never did that.
const fixtureWorkspace = JSON.parse(
  readFileSync(new URL("../fixtures/workshop2_workspace.json", import.meta.url).pathname
    .replace(/^\/(?=[A-Za-z]:)/, ""), "utf8"));
// CRLF-normalized: the fixture is LF in the repo, but core.autocrlf checks it out
// with CRLF on Windows. Python's read_text() translates newlines and this does
// not, so without this the two consumers would disagree about a file neither of
// them actually differs on.
const fixturePrompt = readFileSync(
  new URL("../fixtures/workshop2_prompt.txt", import.meta.url).pathname
    .replace(/^\/(?=[A-Za-z]:)/, ""), "utf8").replace(/\r\n/g, "\n");
const composed = $t.buildWorkshop2Prompt(fixtureWorkspace);
ok("the browser composes the backend's prompt byte for byte", composed === fixturePrompt, (() => {
  if (composed === fixturePrompt) return "";
  const mine = composed.split("\n");
  const theirs = fixturePrompt.split("\n");
  const at = mine.findIndex((line, i) => line !== theirs[i]);
  return at < 0
    ? `same lines, length ${composed.length} vs ${fixturePrompt.length}`
    : `first difference on line ${at + 1}:\n    browser: ${JSON.stringify(mine[at])}\n    fixture: ${JSON.stringify(theirs[at])}`;
})());

// --- the header block stays put while the fields scroll -------------------
ok("both panels have a sticky header", document.querySelectorAll(".lab-sticky").length === 2);
ok("the tab bar is inside it", document.querySelectorAll(".lab-sticky .tab-bar").length === 2);
ok("the intro paragraphs are gone", document.querySelectorAll(".layer-intro").length === 0);

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
