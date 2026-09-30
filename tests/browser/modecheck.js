// start-w1.bat opens only Workshop 1; start-w2.bat opens only Workshop 2, typed
// and text only unless the server got --allow-voice. Each scenario runs the real
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
    launch: { workshop_mode: 1, allow_voice: true },
    seed: ({ bootstrap }) => ({ stage: "2", setup: TEXT_SETUP, project: finishedWorkshop1(bootstrap) }),
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
    },
  },
  "mode1-first-run": {
    launch: { workshop_mode: 1, allow_voice: true },
    seed: () => ({}),
    check({ ok, $, visible }) {
      ok("the first-run sheet is up", visible($("#onboarding")));
      ok("the entry choice is offered", visible($("#entryChoice")));
      ok("...with 參加 Workshop 1 and 繼續我的 Dodo", visible(entry("workshop1")) && visible(entry("continue")));
      ok("...but not 只參加 Workshop 2", !visible(entry("workshop2")));
      ok("input/output and the original lead are unchanged",
         visible($("#inputModeChoice")) && visible($("#outputModeChoice")) && $("#onboardingLead").textContent !== W2_LEAD);
    },
  },
  "mode2-first-run": {
    launch: { workshop_mode: 2, allow_voice: false },
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
  "mode2-first-run-with-a-project": {
    launch: { workshop_mode: 2, allow_voice: false },
    seed: ({ bootstrap }) => ({ project: renamedStarter(bootstrap) }),
    async check({ ok, $, visible, M }) {
      ok("a project already in this browser is continued, not replaced", M.workspace.profile.agent.name === "小暖",
         M.workspace.profile.agent.name);
      M.setApiConfigured(true);
      await M.finishOnboarding();
      ok("...and still after 開始", !visible($("#onboarding")) && M.workspace.profile.agent.name === "小暖");
    },
  },
  "mode2-restarted-black-window": {
    launch: { workshop_mode: 2, allow_voice: false },
    seed: ({ bootstrap }) => ({ stage: "1", setup: TEXT_SETUP, project: renamedStarter(bootstrap) }),
    check({ ok, $, visible, M }) {
      ok("the stored project carries on", M.workspace.profile.agent.name === "小暖" && $("#agentName").value === "小暖");
      ok("on stage 2, no sheet in the way", visible($("#workshop2Panel")) && !visible($("#onboarding")));
      $("#apiSettingsButton").click();
      ok("系統設定 opens with both key fields", visible($("#onboarding")) && visible($("#apiKeyInput")) && visible($("#weatherApiKeyInput")));
      ok("...and no input/output or microphone check",
         !visible($("#inputModeChoice")) && !visible($("#outputModeChoice")) && !visible($("#voiceCheck")));
      ok("...and no entry choice", !visible($("#entryChoice")));
      ok("...titled for keys only", $("#onboardingTitle").textContent === "API 設定", $("#onboardingTitle").textContent);
    },
  },
  // The course tells anyone whose session-2 data is dirty (clicked start-w2.bat
  // during session 1, or the instructor after rehearsing) to 匯入 the starter.
  "mode2-import-starter-over-dirty-data": {
    launch: { workshop_mode: 2, allow_voice: false },
    seed: ({ bootstrap }) => {
      const dirty = renamedStarter(bootstrap);
      dirty.profile.elder_profile.name = "邱秀蘭";
      dirty.profile.elder_profile.wake_time = "05:00";
      dirty.memory.events.push({ key: "卡號", value: "後四碼 1234", source: "dodo" });
      return { setup: TEXT_SETUP, project: dirty };
    },
    async check({ ok, $, visible, M }) {
      ok("the dirty project is what loads first", M.workspace.profile.elder_profile.name === "邱秀蘭");
      const starterFile = readFileSync(new URL("../../starter/workshop2-default-dodo.json", import.meta.url), "utf8");
      await M.importProject({ text: async () => starterFile });
      const saved = JSON.parse(localStorage.getItem("dodo-workshop.project"));
      ok("匯入 the starter clears the 建檔 and the memory",
         M.workspace.profile.elder_profile.name === "" && M.workspace.profile.elder_profile.wake_time === ""
           && M.workspace.memory.events.length === 0,
         JSON.stringify(M.workspace.profile.elder_profile).slice(0, 80));
      ok("...back to 豆豆 and 秀蘭阿嬤", M.workspace.profile.agent.name === "豆豆" && M.workspace.profile.agent.address === "秀蘭阿嬤");
      ok("...saved for the next F5", saved.profile.elder_profile.name === "" && saved.profile.agent.address === "秀蘭阿嬤");
      ok("...and still on stage 2", visible($("#workshop2Panel")) && !visible($("#workshop1Panel")));
    },
  },
  "mode2-stored-voice-setup": {
    launch: { workshop_mode: 2, allow_voice: false },
    seed: () => ({ setup: VOICE_SETUP }),
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
    launch: { workshop_mode: 2, allow_voice: true },
    seed: () => ({ setup: { ...TEXT_SETUP, outputMode: "voice" } }),
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
    check({ ok, $, visible }) {
      ok("a remembered stage 2 opens stage 2", visible($("#workshop2Panel")));
      ok("both stage buttons are shown", visible(stageButton(1)) && visible(stageButton(2)));
      stageButton(1).click();
      ok("and 01 is one click away", visible($("#workshop1Panel")) && !visible($("#workshop2Panel")));
      ok("all three entry choices exist",
         !$("#entryChoice").hidden && ["workshop1", "continue", "workshop2"].every((value) => !entry(value).hidden));
      ok("input/output choices are offered", !$("#inputModeChoice").hidden && !$("#outputModeChoice").hidden);
    },
  },
};

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
if (seed.stage) localStorage.setItem("dodo-workshop.stage", seed.stage);
if (seed.setup) localStorage.setItem("dodo-workshop.setup", JSON.stringify(seed.setup));
if (seed.project) localStorage.setItem("dodo-workshop.project", JSON.stringify(seed.project));

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes("/api/bootstrap")) return { json: async () => bootstrap };
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
  switchStage, finishOnboarding, importProject,
  setApiConfigured: (value) => { apiConfigured = value; },
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
await scenario.check({ ok, $, visible, M: globalThis.__m, win, bootstrap });
process.exit(failures.length ? 1 : 0);
