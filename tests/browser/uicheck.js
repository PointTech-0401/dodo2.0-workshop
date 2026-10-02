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
  if (["/api/proactive-decide", "/api/proactive-simulate", "/api/workspace/normalize",
       "/api/intake-check", "/api/day-summary", "/api/reference-intake"].some((path) => String(url).includes(path))) {
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
  describeMemoryWrite: W2.describeMemoryWrite,
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
  // §7.1 #8: the band's own window maths, pinned against the server's below.
  buildScheduleWindows: W2.buildScheduleWindows, windowContains: W2.windowContains,
  // 新聊天 and addMessage are core top-level bindings, reachable only from in here.
  startNewChat, addMessage, switchStage, composerLocked,
  // A reply in flight, without a session: what the 第二堂 send lock looks at.
  setReplying: (value) => { responseActive = value; refreshComposerLock(); },
  // As if a session had been opened with this voice: what 套用 compares against.
  setConnectedVoice: (value) => { connectedVoice = value; },
  get workspace() { return workspace; },
};
// eval() never fires DOMContentLoaded, so start the app by hand — fire and
// forget, exactly as app.js's own final \`initialize();\` did.
initialize();`;
try { eval(script + EXPOSE); } catch (e) { failures.push(`app.js threw: ${e.message}`); console.log(e); }
await new Promise((r) => setTimeout(r, 400));   // let initialize()'s awaits settle

const $ = (s) => document.querySelector(s);
const WORKSHOP2_BLOCK_SELECTORS = ["#promptMemoryUse", "#promptAttitudeReminder", "#promptAttitudeHealth", "#promptAttitudeChat"];
const shown = (id) => !document.getElementById(id).hidden;
const fire = (sel, type) => $(sel).dispatchEvent(new win.Event(type, { bubbles: true }));
const defaults = bootstrap.default_workspace.profile.agent;

ok("app.js + initialize() ran clean", failures.length === 0, failures.join(" | "));
ok("W1 opens on the persona tab", shown("tabPersona") && !shown("tabTurn"));
ok("W2 opens on the 建檔 tab", shown("tabW2Intake") && !shown("tabW2Prompt"));
// 訪談稿 is an overlay over the chat, not a panel inside the form: it starts
// closed, 顯示 covers the conversation, 關閉 gives it back. The lab panel is
// never covered — 建檔 is filled while the transcript is up.
ok("the interview overlay starts closed", !shown("interviewOverlay"));
ok("...but its content is already rendered", $("#interviewText").textContent.includes("秀蘭"));
$("#showInterview").click();
ok("顯示 covers the chat area", shown("interviewOverlay"));
ok("...and the form stays reachable behind it", shown("tabW2Intake") && !$("#elderAddress").disabled);
$("#closeInterview").click();
ok("關閉 gives the chat back", !shown("interviewOverlay"));
$("#showInterview").click();
// This harness has no API key, so the un-dismissable first-run sheet is still
// up and owns Esc. A student who got as far as 建檔 does not have it — put the
// page in that state before checking the overlay's own Esc.
$("#onboarding").hidden = true;
document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
ok("Esc closes it too", !shown("interviewOverlay"));
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

// --- 自訂: the student's own version survives trying a system preset --------
const presetButton = (id) => $(`#promptPresets .preset-button[data-preset="${id}"]`);
ok("溫柔陪伴 is lit for the default blocks", presetButton("gentle").classList.contains("is-active"));
ok("the edit 取消變更 just undid is still kept as 自訂",
   !presetButton("custom").disabled
   && JSON.parse(localStorage.getItem("dodo-workshop.project")).profile.agent.custom?.prompt_blocks.identity === "又改了一次");
$("#promptIdentity").value = "我是自己寫的豆豆"; fire("#promptIdentity", "input");
ok("an edit turns it into 自訂", presetButton("custom").classList.contains("is-active") && !presetButton("custom").disabled);
ok("...kept in the project at once",
   JSON.parse(localStorage.getItem("dodo-workshop.project")).profile.agent.custom?.prompt_blocks.identity === "我是自己寫的豆豆");
presetButton("neural").click();
ok("a system preset still loads", presetButton("neural").classList.contains("is-active") && $("#promptIdentity").value !== "我是自己寫的豆豆");
ok("...without touching the 自訂",
   JSON.parse(localStorage.getItem("dodo-workshop.project")).profile.agent.custom?.prompt_blocks.identity === "我是自己寫的豆豆");
presetButton("custom").click();
ok("自訂 brings the student's version back", $("#promptIdentity").value === "我是自己寫的豆豆" && presetButton("custom").classList.contains("is-active"));
$("#revertWorkshop1").click();
ok("取消變更 goes back to what was applied", presetButton("gentle").classList.contains("is-active") && $("#saveWorkshop1").hidden);
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

// --- 直接載入範例建檔 fills the form, and stops there ----------------------
// The opt-out for people who did not come to type for 35 minutes. It must land
// as an *unapplied* edit: if it wrote straight to `workspace` it would bypass
// 套用, and 取消變更 would have nothing to put back.
const savedRoutineCount = () => (JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}")
  .profile?.elder_profile?.routines || []).length;
const appliedRoutines = savedRoutineCount();
const confirmUp = () => !$("#confirmPrompt").hidden;
$("#loadReferenceIntake").click();
await new Promise((r) => setTimeout(r, 200));
ok("it asks before overwriting", confirmUp() && $("#confirmTitle").textContent.includes("確定") && routineRows() === 1,
   `${routineRows()} rows`);
$("#confirmCancel").click();
await new Promise((r) => setTimeout(r, 200));
ok("取消 leaves the form alone", !confirmUp() && routineRows() === 1, `${routineRows()} rows`);
$("#loadReferenceIntake").click();
await new Promise((r) => setTimeout(r, 200));
$("#confirmOk").click();
await new Promise((r) => setTimeout(r, 300));
ok("確定 fills 建檔 from the reference", !confirmUp() && routineRows() >= 6, `${routineRows()} rows`);
ok("...including the scalars", $("#elderAddress").value === "秀蘭阿嬤" && $("#elderBed").value === "21:30");
ok("...and the caregiver-written memory rows",
   $("#factRows").querySelectorAll(".row-item").length >= 4
   && $("#symptomRows").querySelectorAll(".row-item").length >= 3);
ok("it is an unapplied edit, not a write", intakeDirty() && !$("#saveWorkshop2").hidden);
ok("...so nothing reached the saved project yet", savedRoutineCount() === appliedRoutines,
   `${savedRoutineCount()} saved`);
$("#revertWorkshop2").click();
ok("取消變更 undoes the whole load", !intakeDirty() && routineRows() === 1, `${routineRows()} rows`);

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

// --- no scored runs left ---------------------------------------------------
// 記憶分類 was a quiz, 執行 6 個情境 a unit test with a tally, and 跑她的一天 the
// last run with a score. 建檔 counts; nothing else is graded.
ok("the day run is gone from the page", $("#dayOutcome") === null && $("#runDaySimulation") === null);
ok("the 6-scenario panel is gone with its runner", $("#proactiveOutcome") === null
   && !script.includes("runProactiveTests"));

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

// --- the band is DERIVED from 建檔, not typed on this tab -------------------
// 安靜 and 不打擾 are facts about her life, so the only way to move them is to
// edit 作息. The band redraws from there — across a tab boundary, which is
// exactly the wiring that is easy to forget.
// Earlier blocks left routines on the form; the band maths is easier to read
// against a known-empty 作息, so clear them before measuring.
while ($("#routineRows").querySelector("[data-remove]")) {
  $("#routineRows").querySelector("[data-remove]").click();
}
const cells = () => [...$("#quietBand").children];
const greyCells = () => cells().filter((c) => c.classList.contains("is-quiet")).length;
ok("the band has one cell per half hour", cells().length === 48, `${cells().length} cells`);

// An empty 建檔 must not inherit anyone's bedtime.
$("#elderWake").value = ""; fire("#elderWake", "input");
$("#elderBed").value = ""; fire("#elderBed", "input");
ok("no 睡眠時段 means no 安靜時段 at all", greyCells() === 0, `${greyCells()} grey`);
ok("...and the summary says so rather than showing 00:00–00:00",
   $("#policySummary").textContent.includes("還沒填睡眠時段"));

$("#elderBed").value = "22:00"; fire("#elderBed", "input");
$("#elderWake").value = "06:00"; fire("#elderWake", "input");
ok("就寢 22:00 → 起床 06:00 greys 8 hours", greyCells() === 16, `${greyCells()} half-hours`);
ok("the summary names the window it drew", $("#policySummary").textContent.includes("22:00–06:00"));
$("#elderBed").value = "20:00"; fire("#elderBed", "input");
ok("moving 就寢 earlier widens the band", greyCells() === 20, `${greyCells()} half-hours`);

// A 不打擾 routine greys its own window on top of 安靜 — and half-hour cells are
// why 13:00–14:30 lands where the decider puts it.
$('[data-add="routine"]').click();
const nap = [...$("#routineRows").querySelectorAll(".row-item")].at(-1);
nap.querySelector('[data-field="label"]').value = "午睡";
nap.querySelector('[data-field="start"]').value = "13:00";
nap.querySelector('[data-field="end"]').value = "14:30";
fire("#routineRows", "input");
ok("a 不打擾 routine greys its own window too", greyCells() === 23, `${greyCells()} half-hours`);
ok("...and the summary names it", $("#policySummary").textContent.includes("午睡 13:00–14:30"));

// §7.1 #8: the band is the browser's own window maths, so it has to mean the
// same thing as build_schedule. Pinned against the server's schedule further down.
const windowsNow = $t.buildScheduleWindows($t.intakeFromFields().elder, 2);
ok("buildScheduleWindows returns the server's window shape",
   windowsNow.quiet.start === 20 * 60 && windowsNow.quiet.end === 6 * 60
   && windowsNow.dnd.length === 1 && windowsNow.dnd[0].start === 13 * 60 + 0
   && windowsNow.dnd[0].end === 14 * 60 + 30,
   JSON.stringify(windowsNow));
// Cross-midnight is the case an hour-level band used to get wrong.
ok("a wrapping window contains both sides of midnight",
   $t.windowContains(windowsNow.quiet, 23 * 60) && $t.windowContains(windowsNow.quiet, 2 * 60)
   && !$t.windowContains(windowsNow.quiet, 12 * 60));
ok("a zero-length window contains nothing",
   !$t.windowContains({ start: 600, end: 600 }, 600));
// weekdays filter: a Tuesday-only routine is absent on Wednesday.
nap.querySelector('[data-weekday="2"]').checked = true;
fire("#routineRows", "input");
ok("a weekday-limited routine only applies on its day",
   $t.buildScheduleWindows($t.intakeFromFields().elder, 2).dnd.length === 1
   && $t.buildScheduleWindows($t.intakeFromFields().elder, 3).dnd.length === 0);

// Which of the two knobs actually binds the day.
$("#cooldown").value = "600"; fire("#cooldown", "input");
ok("the tighter of the two knobs is named", $("#policyBinding").textContent.includes("間隔"));
$("#cooldown").value = "30"; fire("#cooldown", "input");
ok("...and switches when the other one bites", $("#policyBinding").textContent.includes("每日上限"));

// --- 她剛說不想聊 writes real state with an expiry ---------------------------
// One press must never silence her for good, so the button says when it wears
// off — and pressing again lets her back in.
ok("no decline on a clean load", $("#declineState").textContent.includes("沒有拒絕"));
$("#declineChat").click();
ok("declining is recorded with an expiry", /到 \d{2}:\d{2} 之前/.test($("#declineState").textContent),
   $("#declineState").textContent);
ok("...and the button offers to undo it", $("#declineChat").textContent.includes("取消"));
ok("...and it is what blocks 閒聊 right now", $("#policyBinding").textContent.includes("不想聊"));
ok("...capped at her next 起床 rather than a flat hour", (() => {
  const until = new Date($t.workspace.proactive_state.declined_until);
  const wake = new Date(); wake.setHours(6, 0, 0, 0);
  if (wake <= new Date()) wake.setDate(wake.getDate() + 1);
  // 60 分 unless her 06:00 起床 comes first.
  return until <= new Date(Date.now() + 61 * 60000) && until <= wake;
})(), $t.workspace.proactive_state.declined_until);
ok("...and it survives into the saved project", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  return Boolean(stored.proactive_state?.declined_until);
})());
$("#declineChat").click();
ok("pressing again lets her back in", $("#declineChat").textContent.includes("她剛說不想聊")
   && !$("#policyBinding").textContent.includes("不想聊"));

// A decline EXPIRES. Decisions read isDeclinedNow() fresh, so they stay right —
// but nothing was redrawing the display, so an hour later the button still said
// 「取消（她願意聊了）」 and 現在哪條規則在卡人 still named 不想聊 until the student
// happened to touch a field. Same class of lie this tab exists to kill.
$t.workspace.proactive_state.declined_until = new Date(Date.now() - 60000).toISOString();
$("#declineChat").click();          // decline again, so the display is "active"
$t.workspace.proactive_state.declined_until = new Date(Date.now() - 60000).toISOString();
$("#scheduleAuto").checked = true; fire("#scheduleAuto", "change");
await new Promise((r) => setTimeout(r, 250));
ok("an expired decline stops claiming she is still refusing",
   $("#declineChat").textContent.includes("她剛說不想聊"), $("#declineChat").textContent);
ok("...and the blocking line lets 閒聊 through again",
   !$("#policyBinding").textContent.includes("不想聊"), $("#policyBinding").textContent.slice(0, 90));
ok("...and says the last decline已失效 rather than nothing",
   $("#declineState").textContent.includes("失效"), $("#declineState").textContent);
$("#scheduleAuto").checked = false; fire("#scheduleAuto", "change");

// §7.1 #8, the empirical half: the band's own window maths has to MEAN the same
// thing as build_schedule. The page no longer runs a day, so ask the engine for
// the schedule it derives from the same 建檔 and compare instead of trusting.
const serverRun = await (await fetch("/api/proactive-simulate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    policy: $t.workspace.profile.proactive_policy,
    elder_profile: $t.intakeFromFields().elder,
    memory: $t.workspace.memory,
    gates: "routines",
  }),
})).json();
const mine = $t.buildScheduleWindows($t.intakeFromFields().elder, serverRun.weekday);
ok("the band's schedule is the server's schedule",
   JSON.stringify({ quiet: mine.quiet, dnd: mine.dnd })
   === JSON.stringify({ quiet: serverRun.schedule.quiet, dnd: serverRun.schedule.dnd }),
   `browser ${JSON.stringify(mine.quiet)} / server ${JSON.stringify(serverRun.schedule.quiet)}`);

// --- 主動對話: two modes, one decline signal --------------------------------
// The what-if checkbox is gone: 「她剛說不想聊」 on 主動規則 is the one decline,
// and both modes read it.
ok("觸發主動 opens on the real-clock mode",
   shown("triggerModeSchedule") && !shown("triggerModeManual"));
ok("...and the note says which clock decides", $("#triggerModeNote").textContent.includes("真實時鐘"));
$('[data-trigger-mode="manual"]').click();
ok("switching to 自己編一個狀況 swaps the fields",
   shown("triggerModeManual") && !shown("triggerModeSchedule"));
ok("...and the note follows the switch", $("#triggerModeNote").textContent.includes("假設"));
ok("...but the pending list never hides with it", shown("scheduleList"));
ok("there is no what-if decline checkbox", !$("#proactiveDeclined"));
ok("...the decline note points at 主動規則", $("#manualDeclineNote").textContent.includes("主動規則"));
$("#proactiveSinceLast").value = "5"; fire("#proactiveSinceLast", "input");
ok("a typed 距上次 says which way it goes", $("#manualSinceHint").textContent.includes("會被擋下"));
$("#proactiveSinceLast").value = "60"; fire("#proactiveSinceLast", "input");
ok("...both ways", $("#manualSinceHint").textContent.includes("會通過"));
ok("a typed time names her 作息", /安靜|不打擾|睡眠時段/.test($("#manualNowHint").textContent), $("#manualNowHint").textContent);
$('[data-trigger-mode="schedule"]').click();
ok("switching back restores the schedule fields",
   shown("triggerModeSchedule") && !shown("triggerModeManual"));
const plusOne = new Date(Date.now() + 60000).toTimeString().slice(0, 5);
$("#scheduleTime").value = "";
$("#scheduleInOneMinute").click();
ok("「1 分鐘後」 fills in now + 1 minute", $("#scheduleTime").value === plusOne,
   `${$("#scheduleTime").value} vs ${plusOne}`);
ok("距上次 names the cooldown it must beat", $("#sinceLastHint").textContent.includes("間隔 30 分鐘"),
   $("#sinceLastHint").textContent);
ok("今日已發送 names the daily limit", $("#sentTodayHint").textContent.includes("每日上限"));
ok("the time hint measures that time against her 作息, not a quiet-hours field",
   /安靜|不打擾|睡眠時段/.test($("#nowHint").textContent), $("#nowHint").textContent);

// --- 主動規則 → 主動對話: rules on one tab, the place they run on the other --
// The cut is where the risk changes: nothing on 主動規則 reaches the student, and
// everything on 主動對話 does — a real response.create, and a summary of what was
// actually said. So the schedule and summary flows below start by going there.
$('.tab-button[data-tab="tabW2Policy"]').click();
ok("主動規則 holds the two knobs and her day",
   shown("tabW2Policy") && !shown("tabW2Live") && !$("#cooldown").closest(".tab-panel").hidden);
$("[data-goto-live]").click();
ok("...and points at the tab that runs them", shown("tabW2Live") && !shown("tabW2Policy"));
ok("真的開口 and 今日摘要 moved with it",
   !$("#addSchedule").closest(".tab-panel").hidden && !$("#triggerProactive").closest(".tab-panel").hidden
   && !$("#runTodaySummary").closest(".tab-panel").hidden);
$("[data-goto-policy]").click();
ok("...and the way back works too", shown("tabW2Policy") && !shown("tabW2Live"));
$('.tab-button[data-tab="tabW2Live"]').click();

// --- 待提醒項目: the time field finally means something --------------------
$("#scheduleAuto").checked = false; fire("#scheduleAuto", "change");
ok("the pending list starts empty", $("#scheduleList").textContent.includes("沒有待提醒項目"));
$("#proactiveTopic").value = "16:00 回診，要帶健保卡";
$("#proactiveEventType").value = "reminder";
$("#scheduleTime").value = "23:59";
$("#addSchedule").click();
ok("adding a reminder creates a row", $("#scheduleList").querySelectorAll(".schedule-row").length === 1);
ok("the row shows its time and topic", $("#scheduleList").textContent.includes("23:59")
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

// --- a minute that is already over never happens --------------------------
// 10:50 and a 09:50 reminder: it is added as 已過期 and nothing runs for it.
$("#scheduleAuto").checked = true;
$("#proactiveEventType").value = "chat";
$("#proactiveTopic").value = "早就過了";
$("#scheduleTime").value = "00:00";
$("#addSchedule").click();
await new Promise((r) => setTimeout(r, 600));
const expiredRow = $t.workspace.scheduled.at(-1);
ok("a past time is added as 已過期", expiredRow?.status === "expired"
   && $("#scheduleList").textContent.includes("已過期"), expiredRow?.status);
ok("...and never runs the rules", !$("#messages").textContent.includes("待提醒觸發"));
$t.workspace.scheduled.length = 0;
$("#scheduleAuto").checked = false;

// --- a due reminder fires against the real clock, once ---------------------
// The complaint this answers: setting a time did nothing when that time arrived.
const nowText = new Date().toTimeString().slice(0, 5);
$("#proactiveEventType").value = "reminder";
$("#proactiveTopic").value = "該吃藥了";
$("#scheduleTime").value = new Date().toTimeString().slice(0, 5);
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
$("#scheduleTime").value = new Date().toTimeString().slice(0, 5);
$("#addSchedule").click();
await new Promise((r) => setTimeout(r, 600));
ok("her 作息 can block a due 閒聊 outright",
   /還沒起床|已經睡了/.test($t.workspace.scheduled[0].reason), $t.workspace.scheduled[0].reason);

// --- a supersede has to name what it discarded ----------------------------
$t.workspace.memory = { facts: [], events: [], summaries: [] };
$t.upsertMemory("B", "今天想吃的東西", "芭樂");
const ate = $t.upsertMemory("B", "今天想吃的東西", "柳丁");
ok("B reports the value it threw away by name", ate.superseded.join("、") === "芭樂",
   ate.superseded.join("、"));
ok("...and the TOOL sentence says it out loud",
   $t.describeMemoryWrite(ate, "今天想吃的東西", "柳丁").includes("丟掉了：芭樂"),
   $t.describeMemoryWrite(ate, "今天想吃的東西", "柳丁"));

// --- 對話規範: presets swap the four blocks and nothing else ---------------
// The claim the tab makes is that these are the ONLY thing a 規範 changes: same
// 建檔, same memory, different way of speaking. So the check is as much about
// what stays put as about what moves.
$('.tab-button[data-tab="tabW2Prompt"]').click();
const ruleButtons = () => [...$("#rulePresets").querySelectorAll("[data-rule-preset]")];
ok("三組規範範例 and 自訂 are on the tab",
   ruleButtons().map((b) => b.dataset.rulePreset).join(",") === "companion,verbose,clinical,custom",
   ruleButtons().map((b) => b.dataset.rulePreset).join(","));
const beforePreset = {
  blocks: $("#promptMemoryUse").value + $("#promptAttitudeChat").value,
  routines: $("#routineRows").querySelectorAll(".row-item").length,
  address: $("#elderAddress").value,
  cooldown: $("#cooldown").value,
};
ruleButtons().find((b) => b.dataset.rulePreset === "verbose").click();
ok("a preset rewrites all four blocks",
   WORKSHOP2_BLOCK_SELECTORS.every((selector) => $(selector).value.length > 0)
   && $("#promptMemoryUse").value + $("#promptAttitudeChat").value !== beforePreset.blocks);
ok("...and 建檔 is untouched",
   $("#routineRows").querySelectorAll(".row-item").length === beforePreset.routines
   && $("#elderAddress").value === beforePreset.address);
ok("...and so are the two 主動 numbers", $("#cooldown").value === beforePreset.cooldown);
ok("...and it asks to be applied rather than applying itself",
   !$("#saveWorkshop2").hidden
   && $('.tab-button[data-tab="tabW2Prompt"]').classList.contains("is-dirty"));
ok("...and the preview followed it", $("#workshop2SystemPrompt").textContent.includes($("#promptAttitudeChat").value.slice(0, 20)));
$("#revertWorkshop2").click();
ok("取消變更 puts the previous 規範 back",
   $("#promptMemoryUse").value + $("#promptAttitudeChat").value === beforePreset.blocks);
ok("...with no dot left behind", !$('.tab-button[data-tab="tabW2Prompt"]').classList.contains("is-dirty"));
// 陪伴型 is read from bootstrap rather than copied into the preset list, so it
// has to match the shipped defaults exactly — a stale duplicate is the failure
// this catches.
ruleButtons().find((b) => b.dataset.rulePreset === "companion").click();
ok("陪伴型 is byte-identical to the shipped defaults",
   $("#promptMemoryUse").value === bootstrap.default_workspace.profile.workshop2_blocks.memory_use);
// 自訂, the same way 第一堂 keeps it: one edit is remembered, trying a preset
// does not lose it, and the 自訂 button brings it back.
const customButton = () => ruleButtons().find((b) => b.dataset.rulePreset === "custom");
$("#promptAttitudeChat").value = "我自己寫的閒聊規範";
fire("#promptAttitudeChat", "input");
ok("an edit makes 自訂 the active version",
   customButton().classList.contains("is-active") && !customButton().disabled
   && $t.workspace.profile.workshop2_custom?.blocks?.attitude_chat === "我自己寫的閒聊規範");
ruleButtons().find((b) => b.dataset.rulePreset === "clinical").click();
ok("...trying a preset keeps it",
   $t.workspace.profile.workshop2_custom?.blocks?.attitude_chat === "我自己寫的閒聊規範"
   && !customButton().classList.contains("is-active"));
customButton().click();
ok("...and 自訂 brings it back", $("#promptAttitudeChat").value === "我自己寫的閒聊規範"
   && customButton().classList.contains("is-active"));
$("#revertWorkshop2").click();

// 同一句話前後對照 needs a live session, which this harness never has — so what
// is checkable is that it says so instead of failing silently.
$("#compareQuestion").value = "";
$("#askCompare").click();
await new Promise((r) => setTimeout(r, 100));
ok("對照 asks for a question when there is none", $("#compareResult").textContent.includes("先寫一句"));
$("#compareQuestion").value = "你記得我什麼？";
$("#askCompare").click();
await new Promise((r) => setTimeout(r, 100));
ok("...and says why it cannot ask without a key", $("#compareResult").textContent.includes("Realtime"),
   $("#compareResult").textContent);

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

// --- 今日摘要: C 層 is grown from the conversation, never typed -------------
// TOOL and SYSTEM rows are workshop instrumentation, not things she or 豆豆
// said. The transcript so far holds only those, so the button must refuse
// rather than summarise the furniture.
ok("the transcript so far is instrumentation only",
   document.querySelectorAll("#messages .message.user, #messages .message.assistant").length === 0,
   `${document.querySelectorAll("#messages .message").length} rows total`);
$("#runTodaySummary").click();
await new Promise((r) => setTimeout(r, 150));
ok("今日摘要 refuses when nothing was actually said",
   $("#todaySummary").textContent.includes("還沒有對話"), $("#todaySummary").textContent);

// Now give it a real exchange. There is no API key in the harness, so the
// server answers 503 — what matters is that the reason reaches the student
// instead of the button failing silently.
["user", "assistant"].forEach((role, index) => {
  const row = document.createElement("article");
  row.className = `message ${role}`;
  row.innerHTML = `<span class="speaker">x</span><p>${index ? "那就好，記得慢慢走。" : "我今天膝蓋好多了。"}</p>`;
  $("#messages").append(row);
});
$("#runTodaySummary").click();
await new Promise((r) => setTimeout(r, 500));
ok("...and says why when there is no key, rather than failing silently",
   $("#todaySummary").textContent.includes("OPENAI_API_KEY"), $("#todaySummary").textContent);

// --- 健康關心 takes its content from the B layer, not a second typing --------
$t.workspace.memory.events = [{ key: "膝蓋", value: "上下樓會痛", tag: "symptom", source: "caregiver" }];
$("#proactiveTopic").value = "";
$("#proactiveEventType").value = "health";
fire("#proactiveEventType", "change");
ok("健康關心 names the symptom it would ask about",
   $("#topicHint").textContent.includes("膝蓋") && $("#topicHint").textContent.includes("上下樓會痛"),
   $("#topicHint").textContent);
ok("...and fills the blank 事件內容 from it", $("#proactiveTopic").value.includes("膝蓋"),
   $("#proactiveTopic").value);
// What the student wrote always wins.
$("#proactiveTopic").value = "我自己想問的事";
fire("#proactiveEventType", "change");
ok("...but never overwrites what the student typed", $("#proactiveTopic").value === "我自己想問的事");
$t.workspace.memory.events = [];
$("#proactiveTopic").value = "";
fire("#proactiveEventType", "change");
ok("...and says so when the B layer has no symptom",
   $("#topicHint").textContent.includes("沒有症狀"), $("#topicHint").textContent);
$("#proactiveEventType").value = "chat";
fire("#proactiveEventType", "change");
ok("閒聊 gets no symptom hint at all", $("#topicHint").textContent === "");

// --- 今天已經找過她幾次: the real record, read-only ------------------------
// `day` has to be today's key, or proactiveState()'s midnight rollover zeroes
// sent_today before the hints ever see it.
const nowForBudget = new Date();
const pad = (n) => String(n).padStart(2, "0");
$t.workspace.proactive_state = {
  last_spoken_at: new Date(Date.now() - 7 * 60000).toISOString(),
  sent_today: 3,
  day: `${nowForBudget.getFullYear()}-${pad(nowForBudget.getMonth() + 1)}-${pad(nowForBudget.getDate())}`,
  declined_until: null,
};
W2.loadFields();
W2.renderTriggerHints();
ok("the budget hints read proactive_state",
   $("#sinceLastHint").textContent.includes("7 分鐘前") && $("#sentTodayHint").textContent.includes("講了 3 則"),
   `${$("#sinceLastHint").textContent} / ${$("#sentTodayHint").textContent}`);
ok("...and say which way each rule goes right now",
   $("#sinceLastHint").textContent.includes("會被擋下") && $("#sentTodayHint").textContent.includes("會通過"));
ok("...with nothing to type into on the card itself",
   $("#budgetCard").querySelectorAll("input").length === 0 && !$("#resyncBudget"));
ok("only 自己編一個狀況 reads the typed numbers; the scheduler reads the state",
   /minutes_since_last: Number\(\$\("#proactiveSinceLast"\)\.value\)/.test(script)
   && /minutes_since_last: minutesSinceLastProactive\(\)/.test(script));

// --- 第一堂改聲線：重新連線，畫面也開一段新對話 --------------------------
// The new connection does not remember the old one; a transcript left on the
// screen would read as if 豆豆 did.
$t.switchStage(1);
$t.setConnectedVoice("sage");
$t.addMessage("user", "換聲線前講的一句話");
$("#agentVoice").value = "marin";
fire("#agentVoice", "change");
$("#saveWorkshop1").click();
await new Promise((r) => setTimeout(r, 300));
ok("改聲線套用後，舊的對話從畫面清掉", !$("#messages").textContent.includes("換聲線前講的一句話"));
ok("...並說明為什麼是新的對話", $("#messages").textContent.includes("中途換聲線"), $("#messages").textContent.slice(0, 80));
$t.setConnectedVoice("");
$("#agentVoice").value = "sage";
fire("#agentVoice", "change");
$("#saveWorkshop1").click();
await new Promise((r) => setTimeout(r, 300));
$t.switchStage(2);

// --- 新聊天: drop this conversation, keep the memory ----------------------
$t.addMessage("user", "阿嬤說了一句話");
$t.addMessage("assistant", "豆豆回了一句");
$t.workspace.memory.facts = [{ key: "喜歡的歌", value: "望春風", source: "caregiver" }];
const beforeFacts = JSON.stringify($t.workspace.memory.facts);
await $t.startNewChat();
ok("新聊天 empties the transcript",
   document.querySelectorAll("#messages .message.user, #messages .message.assistant").length === 0);
ok("...and says a new conversation began", $("#messages").textContent.includes("新的對話開始了"));
ok("...but never touches the memory", JSON.stringify($t.workspace.memory.facts) === beforeFacts);
ok("...nor the day's proactive budget", $t.workspace.proactive_state.sent_today === 3);

// --- a reminder that really gets spoken does not spend the daily budget ---
// The simulation never counted reminders (proactive.py: they are a separate
// system); the live path used to add one for every message, so the 21:45 重要提醒
// demo quietly pushed 今日已發送 up and could use up 每日上限 mid-lesson.
const spokenBefore = $t.workspace.proactive_state.last_spoken_at;
W2.recordProactiveSpoken("reminder");
ok("a spoken 重要提醒 leaves 今日已發送 alone", $t.workspace.proactive_state.sent_today === 3,
   String($t.workspace.proactive_state.sent_today));
ok("...but still resets the interval clock", $t.workspace.proactive_state.last_spoken_at !== spokenBefore);
W2.recordProactiveSpoken("chat");
ok("a spoken 閒聊 counts toward 今日已發送", $t.workspace.proactive_state.sent_today === 4,
   String($t.workspace.proactive_state.sent_today));
// 第二堂 is done once 豆豆 has actually spoken first; the day run that used to
// set this is gone.
ok("speaking first marks 第二堂 complete", $t.workspace.progress.workshop_2_completed === true);

// --- 第二堂: no new message while 豆豆 is still answering ------------------
// Every send is another paid turn; 第一堂 keeps typed barge-in, which is its lesson.
$t.switchStage(2);
$t.setReplying(true);
ok("第二堂 locks 送出 while a reply is in flight",
   $t.composerLocked() && $("#chatForm .send-button").disabled);
$("#chatInput").value = "再問一句";
$("#chatForm").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
ok("...and keeps what she typed instead of sending it", $("#chatInput").value === "再問一句");
$t.switchStage(1);
ok("第一堂 never locks: typing over 豆豆 is that lesson",
   !$t.composerLocked() && !$("#chatForm .send-button").disabled);
$t.setReplying(false);
$t.switchStage(2);
ok("the lock lifts when the reply is done", !$t.composerLocked() && !$("#chatForm .send-button").disabled);
$("#chatInput").value = "";

// --- the header block stays put while the fields scroll -------------------
ok("both panels have a sticky header", document.querySelectorAll(".lab-sticky").length === 2);
ok("the tab bar is inside it", document.querySelectorAll(".lab-sticky .tab-bar").length === 2);
ok("the intro paragraphs are gone", document.querySelectorAll(".layer-intro").length === 0);

// --- 套用 redraws everything that reads `workspace`, not only the form -----
// Loading the reference 建檔 and pressing 套用 used to leave the memory list
// (A／B／C) and 主動對話's symptom hint as they were until an F5.
$('.tab-button[data-tab="tabW2Intake"]').click();
$t.workspace.memory = { facts: [], events: [], summaries: [] };
W2.renderMemoryViewer();
$("#proactiveEventType").value = "health";
$("#proactiveTopic").value = "";
$("#loadReferenceIntake").click();
await new Promise((r) => setTimeout(r, 200));
$("#confirmOk").click();
await new Promise((r) => setTimeout(r, 300));
$("#saveWorkshop2").click();
await new Promise((r) => setTimeout(r, 300));
ok("套用 shows the new 建檔 in the memory list at once",
   $("#memoryViewer").textContent.includes("望春風") && $("#memoryViewer").textContent.includes("膝蓋"),
   $("#memoryViewer").textContent.slice(0, 80));
ok("...and 主動對話 picks up her latest symptom at once",
   $("#topicHint").textContent.includes("睡眠") && $("#proactiveTopic").value.includes("睡眠"),
   $("#topicHint").textContent);

// --- 問豆豆 must not answer behind the 訪談稿 --------------------------------
// The overlay covers the chat, and 建檔 is filled with it open, so the answer
// used to land where nobody could see it and the button looked dead. Last in
// the file because 問豆豆 applies the whole form.
$("#showInterview").click();
document.querySelector("[data-ask]").click();
ok("問豆豆這一區 closes the 訪談稿 so the answer is visible", !shown("interviewOverlay"));

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
