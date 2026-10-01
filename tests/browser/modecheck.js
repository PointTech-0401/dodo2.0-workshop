// start-w1.bat opens only Workshop 1; start-w2.bat opens only Workshop 2, typed
// and text only unless the server got --allow-voice, and from a clean starter on
// every server start. Each scenario runs the real
// client against the real bootstrap, with `workshop_mode`／`allow_voice` set the
// way that launcher's server reports them (tests/test_launch_mode.py pins the
// server side). Modelled on tests/browser/uicheck.js.
import { Window } from "happy-dom";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// 伺服器連接埠：預設 8123，可用 DODO_PORT 覆寫。
const PORT = process.env.DODO_PORT ?? "8123";
const SCENARIO = process.env.MODECHECK_SCENARIO;

const TEXT_SETUP = { version: 2, inputMode: "text", outputMode: "text", audioInputDeviceId: null, completed: true };
const VOICE_SETUP = { ...TEXT_SETUP, inputMode: "voice", outputMode: "voice" };
const W2_LEAD = "先填好 OpenAI 和天氣的 Key。這一堂都用打字，答案直接印在畫面上。";

// --- Scenarios ------------------------------------------------------------
// `launch` is what bootstrap reports, `seed` is what this browser already has
// for that address, `check` runs once initialize() has settled.
const SCENARIOS = {
  "mode1-remembered-stage-2": {
    launch: { workshop_mode: 1, allow_voice: true, fresh_start_id: "run-1" },
    seed: ({ bootstrap }) => ({ launch: "run-1", stage: "2", setup: TEXT_SETUP, project: finishedWorkshop1(bootstrap) }),
    async check({ ok, $, visible, M, win, bootstrap }) {
      ok("a remembered stage 2 still opens stage 1", visible($("#workshop1Panel")) && !visible($("#workshop2Panel")));
      ok("...and is overwritten with 1", localStorage.getItem("dodo-workshop.stage") === "1");
      ok("only the 01 stage button is shown",
         visible(stageButton(1)) && !visible(stageButton(2)) && stageButton(1).classList.contains("is-active"));
      M.switchStage(2);
      ok("switchStage(2) is refused", visible($("#workshop1Panel")) && !visible($("#workshop2Panel")));
      stageButton(2).click();
      ok("clicking the hidden 02 button is refused", !visible($("#workshop2Panel")));
      // A failed 匯入 also stays on stage 1, so the new name is what proves it loaded.
      const imported = finishedWorkshop1(bootstrap);
      imported.profile.agent.name = "小暖";
      await M.importProject({ text: async () => JSON.stringify(imported) });
      ok("匯入 a finished Workshop 1 project stays on stage 1",
         M.workspace.profile.agent.name === "小暖" && !visible($("#workshop2Panel")), M.workspace.profile.agent.name);
      $("#apiSettingsButton").click();
      ok("系統設定 still offers input and output", visible($("#inputModeChoice")) && visible($("#outputModeChoice")));
      ok("匯入 and 下載 stay in session 1", visible($("#importButton")) && visible($("#exportButton")));
      const instructions = M.composeInstructions(M.workspace);
      ok("the Taiwanese Traditional Chinese rule is sent in session 1", instructions.includes("臺灣國語（繁體中文）為主要語言"));
      ok("the session is told the persona and nothing of session 2",
         instructions.includes("# 角色與身分") && !instructions.includes("# 記憶使用規則") && !instructions.includes("# 長者資料"));
      ok("...and is handed get_weather only", M.realtimeTools().map((tool) => tool.name).join() === "get_weather");
      ok("the eyebrow says 第一堂", $("#stageEyebrow").textContent === "第一堂");
      ok("豆豆的臉 is shown in session 1", visible($("#dodoAvatar")));
    },
  },
  // Fifty open microphones in one room answer each other, so voice input starts
  // on Push-to-talk; 實作二 turns VAD on deliberately.
  "mode1-voice-input-starts-on-push-to-talk": {
    launch: { workshop_mode: 1, allow_voice: true, fresh_start_id: "run-1" },
    seed: () => ({}),
    async check({ ok, $, M }) {
      ok("the default turn mode is still Semantic VAD", M.workspace.profile.realtime.turn_detection.type === "semantic_vad");
      pickRadio($('input[name="inputMode"][value="voice"]'));
      M.setMicrophoneReady(true);
      M.setApiConfigured(true);
      await M.finishOnboarding();
      ok("choosing 語音 input switches it to Push-to-talk", M.workspace.profile.realtime.turn_detection.type === "push_to_talk",
         M.workspace.profile.realtime.turn_detection.type);
      ok("...on screen too", $("#turnDetectionMode").value === "push_to_talk");
      ok("...counted as applied, not waiting for 套用", $("#saveWorkshop1").hidden);
      ok("...and saved", JSON.parse(localStorage.getItem("dodo-workshop.project")).profile.realtime.turn_detection.type === "push_to_talk");
    },
  },
  "mode1-new-start-asks-too": {
    launch: { workshop_mode: 1, allow_voice: true, fresh_start_id: "run-2" },
    seed: ({ bootstrap }) => ({ launch: "run-1", setup: VOICE_SETUP, project: finishedWorkshop1(bootstrap) }),
    autosave: ({ bootstrap }) => {
      const record = finishedWorkshop1(bootstrap);
      record.profile.agent.custom = { prompt_blocks: { ...record.profile.agent.prompt_blocks, identity: "我是自己寫的豆豆" }, voice: "marin" };
      record.profile.agent.prompt_blocks.identity = "我是自己寫的豆豆";
      record.profile.agent.voice = "marin";
      return { workspace: record, saved_at: "2026-10-03T10:05:00+08:00" };
    },
    async check({ ok, $, visible, M }) {
      ok("a new start of start-w1.bat asks", visible($("#restorePrompt")));
      $("#restoreLoad").click();
      await settle();
      ok("載入 brings back the 自訂", M.workspace.profile.agent.custom?.prompt_blocks.identity === "我是自己寫的豆豆"
         && $("#promptIdentity").value === "我是自己寫的豆豆");
      ok("...lit as 自訂", $('#promptPresets [data-preset="custom"]').classList.contains("is-active"));
      ok("the 打字／語音 choice survives the restart", M.setup.inputMode === "voice" && M.setup.completed);
      ok("...and does not re-run the first-run sheet", !visible($("#onboarding")));
    },
  },
  "mode1-new-start-voice-starts-on-ptt": {
    // The 打字／語音 choice survives a new start but the project starts over from
    // the default (Semantic VAD). Voice input must still start on Push-to-talk.
    launch: { workshop_mode: 1, allow_voice: true, fresh_start_id: "run-2" },
    seed: ({ bootstrap }) => ({ launch: "run-1", setup: VOICE_SETUP, project: finishedWorkshop1(bootstrap) }),
    autosave: ({ bootstrap }) => ({ workspace: finishedWorkshop1(bootstrap), saved_at: "2026-10-03T10:05:00+08:00" }),
    async check({ ok, $, M }) {
      $("#restoreDiscard").click();
      await settle();
      ok("重新開始 under a voice setup starts on Push-to-talk",
         M.workspace.profile.realtime.turn_detection.type === "push_to_talk", M.workspace.profile.realtime.turn_detection.type);
      ok("...on screen too", $("#turnDetectionMode").value === "push_to_talk");
      ok("...and nothing waits for 套用", $("#saveWorkshop1").hidden);
    },
  },
  "mode1-first-run": {
    launch: { workshop_mode: 1, allow_voice: true, fresh_start_id: "run-1" },
    seed: () => ({}),
    check({ ok, $, visible, M }) {
      ok("the first-run sheet is up", visible($("#onboarding")));
      ok("no entry choice: 「要載入上次的資料嗎？」 replaced 繼續我的 Dodo", !visible($("#entryChoice")));
      ok("...and the default project is what is loaded", M.workspace.profile.agent.address === "王奶奶");
      ok("溫柔陪伴 is lit and 自訂 is empty", $('#promptPresets [data-preset="gentle"]').classList.contains("is-active")
         && $('#promptPresets [data-preset="custom"]').disabled);
      ok("input/output and the original lead are unchanged",
         visible($("#inputModeChoice")) && visible($("#outputModeChoice")) && $("#onboardingLead").textContent !== W2_LEAD);
    },
  },
  "mode2-first-run": {
    launch: { workshop_mode: 2, allow_voice: false, fresh_start_id: "run-1" },
    seed: () => ({ stage: "1" }),
    async check({ ok, $, visible, M }) {
      ok("stage 2 is shown even with stage 1 remembered", visible($("#workshop2Panel")) && !visible($("#workshop1Panel")));
      ok("only the 02 stage button is shown", visible(stageButton(2)) && !visible(stageButton(1)));
      ok("the first-run sheet is up", visible($("#onboarding")));
      ok("no entry choice", !visible($("#entryChoice")));
      ok("no input/output choices", !visible($("#inputModeChoice")) && !visible($("#outputModeChoice")));
      ok("no microphone check", !visible($("#voiceCheck")));
      ok("both key fields are there", visible($("#apiKeyInput")) && visible($("#weatherApiKeyInput")));
      ok("the lead says it is typing only", $("#onboardingLead").textContent === W2_LEAD);
      ok("the sheet is titled for the key", $("#onboardingTitle").textContent === "填入金鑰", $("#onboardingTitle").textContent);
      ok("no 匯入 and no 下載", !visible($("#importButton")) && !visible($("#exportButton")));
      ok("this start is remembered", localStorage.getItem("dodo-workshop.launch") === "run-1");
      ok("the chat intro does not point at the Workshop 1 tab", !$("#introMessage").textContent.includes("何時算說完"));
      ok("the Workshop 2 starter is loaded",
         M.workspace.progress.workshop_1_completed && M.workspace.profile.agent.address === "秀蘭阿嬤",
         M.workspace.profile.agent.address);
      ok("...and on screen", $("#agentAddress").value === "秀蘭阿嬤");
      M.setApiConfigured(true);   // what a pasted, tested key leaves behind
      await M.finishOnboarding();
      ok("開始 closes the sheet", !visible($("#onboarding")), $("#onboardingError").textContent);
      const saved = JSON.parse(localStorage.getItem("dodo-workshop.setup"));
      ok("...and saves 打字／文字", saved?.completed && saved.inputMode === "text" && saved.outputMode === "text");
      ok("...still on stage 2 with the starter", visible($("#workshop2Panel")) && M.workspace.profile.agent.address === "秀蘭阿嬤");
      M.switchStage(1);
      ok("switchStage(1) is refused", !visible($("#workshop1Panel")));
    },
  },
  // start-w2.bat clears what an earlier start left (a rehearsal, a click during
  // session 1): every session 2 begins from the starter and asks for the key again.
  "mode2-new-start-clears-the-last-one": {
    launch: { workshop_mode: 2, allow_voice: false, fresh_start_id: "run-2" },
    seed: ({ bootstrap }) => {
      const dirty = renamedStarter(bootstrap);
      dirty.profile.elder_profile.name = "邱秀蘭";
      dirty.memory.events.push({ key: "卡號", value: "後四碼 1234", source: "dodo" });
      return { launch: "run-1", stage: "1", setup: TEXT_SETUP, project: dirty };
    },
    check({ ok, $, visible, M }) {
      ok("the starter is loaded, not the earlier project",
         M.workspace.profile.agent.name === "豆豆" && M.workspace.profile.elder_profile.name === ""
           && M.workspace.memory.events.length === 0, M.workspace.profile.agent.name);
      ok("the saved setup is gone, so the sheet asks for the key", visible($("#onboarding")) && !M.setup?.completed);
      ok("...on stage 2", visible($("#workshop2Panel")));
      ok("the new start is remembered", localStorage.getItem("dodo-workshop.launch") === "run-2");
    },
  },
  "mode2-f5-in-the-same-start": {
    launch: { workshop_mode: 2, allow_voice: false, fresh_start_id: "run-1" },
    seed: ({ bootstrap }) => {
      const project = renamedStarter(bootstrap);
      project.profile.agent.prompt_blocks.identity = "你是一個很嗆的 AI。";
      return { launch: "run-1", stage: "1", setup: TEXT_SETUP, project };
    },
    check({ ok, $, visible, M }) {
      ok("the stored project carries on", M.workspace.profile.agent.name === "小暖" && $("#agentName").value === "小暖");
      ok("on stage 2, no sheet in the way", visible($("#workshop2Panel")) && !visible($("#onboarding")));
      const instructions = M.composeInstructions(M.workspace);
      ok("the persona is the default one, whatever the file says",
         !instructions.includes("很嗆") && instructions.includes("你是「小暖」，陪伴 秀蘭阿嬤 的虛擬孫女"));
      ok("...followed by session 2's sections", instructions.includes("# 記憶使用規則") && instructions.includes("# 長者資料"));
      ok("...and the Taiwanese Traditional Chinese rule is in it", instructions.includes("臺灣國語（繁體中文）為主要語言"));
      ok("...and the memory tools are handed over", M.realtimeTools().length === 3);
      ok("the eyebrow says 第二堂", $("#stageEyebrow").textContent === "第二堂");
      ok("no face in session 2", !visible($("#dodoAvatar")));
      $("#apiSettingsButton").click();
      ok("系統設定 opens with both key fields", visible($("#onboarding")) && visible($("#apiKeyInput")) && visible($("#weatherApiKeyInput")));
      ok("...and no input/output or microphone check",
         !visible($("#inputModeChoice")) && !visible($("#outputModeChoice")) && !visible($("#voiceCheck")));
      ok("...and no entry choice", !visible($("#entryChoice")));
      ok("...titled for keys only", $("#onboardingTitle").textContent === "API 設定", $("#onboardingTitle").textContent);
    },
  },
  // The record file (runtime/workshop2-autosave.json) outlives the browser's
  // data: a Terminal closed by mistake is offered back on the next start.
  "mode2-record-is-offered-and-loaded": {
    launch: { workshop_mode: 2, allow_voice: false, fresh_start_id: "run-2" },
    seed: ({ bootstrap }) => ({ launch: "run-1", setup: TEXT_SETUP, project: renamedStarter(bootstrap) }),
    autosave: ({ bootstrap }) => {
      const record = renamedStarter(bootstrap);
      record.profile.elder_profile.name = "邱秀蘭";
      return { workspace: record, saved_at: "2026-10-03T14:32:00+08:00" };
    },
    async check({ ok, $, visible, M, calls }) {
      ok("the question is up before anything else", visible($("#restorePrompt")) && !visible($("#onboarding")));
      ok("...saying when and whose", $("#restoreSummary").textContent.includes("10/3 14:32") && $("#restoreSummary").textContent.includes("小暖"),
         $("#restoreSummary").textContent);
      $("#restoreLoad").click();
      await settle();
      ok("載入 brings the record back", M.workspace.profile.elder_profile.name === "邱秀蘭" && M.workspace.profile.agent.name === "小暖");
      ok("...into localStorage for the next F5",
         JSON.parse(localStorage.getItem("dodo-workshop.project")).profile.elder_profile.name === "邱秀蘭");
      ok("the question is gone and the key is asked for", !visible($("#restorePrompt")) && visible($("#onboarding")));
      ok("nothing was deleted or rewritten yet", !calls.some(([method]) => method !== "GET"), JSON.stringify(calls));
      $("#elderName").value = "邱秀蘭阿嬤";
      M.saveProject();
      await new Promise((r) => setTimeout(r, 1000));
      ok("a change after that reaches the file", calls.some(([method]) => method === "POST"), JSON.stringify(calls));
    },
  },
  "mode2-record-is-offered-and-dropped": {
    launch: { workshop_mode: 2, allow_voice: false, fresh_start_id: "run-2" },
    seed: () => ({ launch: "run-1" }),
    autosave: ({ bootstrap }) => ({ workspace: renamedStarter(bootstrap), saved_at: "2026-10-03T14:32:00+08:00" }),
    async check({ ok, $, visible, M, calls }) {
      ok("the question is up", visible($("#restorePrompt")));
      $("#restoreDiscard").click();
      await settle();
      ok("重新開始 loads the starter", M.workspace.profile.agent.name === "豆豆");
      ok("...and deletes the record, so the next start does not ask", calls.some(([method]) => method === "DELETE"), JSON.stringify(calls));
      await new Promise((r) => setTimeout(r, 1000));
      ok("...and drawing the page does not write it back", !calls.some(([method]) => method === "POST"), JSON.stringify(calls));
    },
  },
  "mode1-cleared-browser-gets-the-record-back": {
    launch: { workshop_mode: 1, allow_voice: true },
    seed: () => ({}),
    autosave: ({ bootstrap }) => {
      const record = finishedWorkshop1(bootstrap);
      record.profile.agent.name = "小暖";
      return { workspace: record, saved_at: "2026-10-03T10:05:00+08:00" };
    },
    async check({ ok, $, visible, M }) {
      ok("the question is up", visible($("#restorePrompt")));
      $("#restoreLoad").click();
      await settle();
      ok("the first-run sheet does not ask where to start again", visible($("#onboarding")) && !visible($("#entryChoice")));
      M.setApiConfigured(true);
      await M.finishOnboarding();
      ok("開始 keeps the record instead of the default", M.workspace.profile.agent.name === "小暖", M.workspace.profile.agent.name);
    },
  },
  "mode2-stored-voice-setup": {
    launch: { workshop_mode: 2, allow_voice: false, fresh_start_id: "run-1" },
    seed: () => ({ launch: "run-1", setup: VOICE_SETUP }),
    check({ ok, $, visible, M }) {
      ok("a stored voice setup becomes text", M.setup.inputMode === "text" && M.setup.outputMode === "text");
      const saved = JSON.parse(localStorage.getItem("dodo-workshop.setup"));
      ok("...and is saved that way", saved.inputMode === "text" && saved.outputMode === "text" && saved.completed);
      ok("the badge says 打字／文字", $("#modeBadge").textContent === "輸入：打字 · 輸出：文字", $("#modeBadge").textContent);
      $("#apiSettingsButton").click();
      ok("系統設定 has the text radios checked behind the hidden choices",
         $('input[name="inputMode"][value="text"]').checked && $('input[name="outputMode"][value="text"]').checked);
      ok("...and no microphone check", !visible($("#voiceCheck")));
    },
  },
  "mode2-allow-voice": {
    launch: { workshop_mode: 2, allow_voice: true, fresh_start_id: "run-1" },
    seed: () => ({ launch: "run-1", setup: { ...TEXT_SETUP, outputMode: "voice" } }),
    check({ ok, $, visible, M, win }) {
      ok("a voice output setup is kept", M.setup.outputMode === "voice");
      ok("still stage 2 only", visible($("#workshop2Panel")) && !visible(stageButton(1)));
      ok("still no entry choice", $("#entryChoice").hidden);
      ok("the lead is the original one", $("#onboardingLead").textContent !== W2_LEAD);
      $("#apiSettingsButton").click();
      ok("系統設定 offers input and output again", visible($("#inputModeChoice")) && visible($("#outputModeChoice")));
      ok("...with 語音 output checked", $('input[name="outputMode"][value="voice"]').checked);
      pickRadio($('input[name="inputMode"][value="voice"]'));
      ok("choosing 語音 input brings the microphone check", visible($("#voiceCheck")));
    },
  },
  "no-mode": {
    launch: { workshop_mode: null, allow_voice: true },
    seed: ({ bootstrap }) => ({ stage: "2", setup: TEXT_SETUP, project: finishedWorkshop1(bootstrap) }),
    check({ ok, $, visible, M }) {
      ok("a remembered stage 2 opens stage 2", visible($("#workshop2Panel")));
      ok("...with session 2's prompt", M.composeInstructions(M.workspace).includes("# 記憶使用規則"));
      ok("both stage buttons are shown", visible(stageButton(1)) && visible(stageButton(2)));
      stageButton(1).click();
      ok("and 01 is one click away", visible($("#workshop1Panel")) && !visible($("#workshop2Panel")));
      ok("...where the prompt drops session 2", !M.composeInstructions(M.workspace).includes("# 記憶使用規則"));
      ok("a session without a mode has no fresh start", localStorage.getItem("dodo-workshop.launch") === null);
      ok("all three entry choices exist",
         !$("#entryChoice").hidden && ["workshop1", "continue", "workshop2"].every((value) => !entry(value).hidden));
      ok("input/output choices are offered", !$("#inputModeChoice").hidden && !$("#outputModeChoice").hidden);
    },
  },
};

const settle = () => new Promise((r) => setTimeout(r, 300));

function stageButton(stage) {
  return document.querySelector(`.stage-button[data-stage="${stage}"]`);
}

function entry(value) {
  return document.querySelector(`input[name="entry"][value="${value}"]`).closest(".choice");
}

/** Click a radio the way a student would. happy-dom caches `:checked` query
 *  results and a click alone does not clear that cache, so updateVoiceCheck()
 *  would read the old choice; moving the `checked` attribute does clear it. A
 *  real browser needs none of this. */
function pickRadio(input) {
  document.querySelectorAll(`input[name="${input.name}"]`).forEach((radio) => radio.removeAttribute("checked"));
  input.setAttribute("checked", "");
  input.click();
}

function finishedWorkshop1(bootstrap) {
  const project = structuredClone(bootstrap.default_workspace);
  project.progress.workshop_1_completed = true;
  return project;
}

function renamedStarter(bootstrap) {
  const project = structuredClone(bootstrap.workshop2_starter);
  project.profile.agent.name = "小暖";
  return project;
}

// --- Driver ----------------------------------------------------------------
// One process per scenario: the client starts a 5-second scheduler on the shared
// timers, which would otherwise keep ticking against the next scenario's DOM.
if (!SCENARIO) {
  const failed = Object.keys(SCENARIOS).filter((name) => {
    console.log(`\n--- ${name}`);
    const run = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, MODECHECK_SCENARIO: name },
      stdio: "inherit",
    });
    return run.status !== 0;
  });
  console.log(failed.length ? `\nFAILED scenarios: ${failed.join(", ")}` : "\nall scenarios passed");
  process.exit(failed.length ? 1 : 0);
}

const scenario = SCENARIOS[SCENARIO];
if (!scenario) {
  console.log(`unknown scenario: ${SCENARIO}`);
  process.exit(1);
}

const ROOT = new URL("../../web/", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const page = readFileSync(`${ROOT}index.html`, "utf8");
const CLIENT_FILES = ["core.js", "workshop1.js", "workshop2.js"];
const script = CLIENT_FILES.map((name) => readFileSync(`${ROOT}${name}`, "utf8")).join("\n");
const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`).then((r) => r.json());
bootstrap.api_configured = false;          // keep the harness away from WebRTC
bootstrap.weather_configured = false;
Object.assign(bootstrap, scenario.launch);

const win = new Window({ url: `http://localhost:${PORT}/` });
win.document.write(page);
for (const key of ["window", "document", "localStorage", "location", "history", "navigator",
                   "Event", "HTMLElement", "Node", "CustomEvent", "getComputedStyle"]) {
  globalThis[key] = key === "window" ? win : win[key];
}
const seed = scenario.seed({ bootstrap });
if (seed.launch) localStorage.setItem("dodo-workshop.launch", seed.launch);
if (seed.stage) localStorage.setItem("dodo-workshop.stage", seed.stage);
if (seed.setup) localStorage.setItem("dodo-workshop.setup", JSON.stringify(seed.setup));
if (seed.project) localStorage.setItem("dodo-workshop.project", JSON.stringify(seed.project));

const record = scenario.autosave?.({ bootstrap }) ?? { workspace: null, saved_at: null };
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("/api/bootstrap")) return { json: async () => bootstrap };
  if (String(url).includes("/api/autosave")) {
    calls.push([init?.method ?? "GET", String(url)]);
    return { ok: true, json: async () => ((init?.method ?? "GET") === "GET" ? record : {}) };
  }
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
const EXPOSE = `
globalThis.__m = {
  switchStage, finishOnboarding, importProject, composeInstructions, realtimeTools, saveProject,
  setApiConfigured: (value) => { apiConfigured = value; },
  setMicrophoneReady: (value) => { microphoneReady = value; },
  get setup() { return setup; },
  get workspace() { return workspace; },
};
// eval() never fires DOMContentLoaded, so start the app by hand.
initialize();`;
try { eval(script + EXPOSE); } catch (e) { failures.push(`client threw: ${e.message}`); console.log(e); }
await new Promise((r) => setTimeout(r, 400));   // let initialize()'s awaits settle

const $ = (s) => document.querySelector(s);
// Shown means neither it nor anything around it carries `hidden`, which the
// stylesheet turns into display: none.
const visible = (element) => {
  for (let node = element; node; node = node.parentElement) if (node.hidden) return false;
  return Boolean(element);
};
ok("client + initialize() ran clean", failures.length === 0, failures.join(" | "));
await scenario.check({ ok, $, visible, M: globalThis.__m, win, bootstrap, calls });
process.exit(failures.length ? 1 : 0);
