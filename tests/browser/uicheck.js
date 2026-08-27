import { Window } from "happy-dom";

// 伺服器連接埠：預設 8123，可用 DODO_PORT 覆寫。
const PORT = process.env.DODO_PORT ?? "8123";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../web/", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const page = readFileSync(`${ROOT}index.html`, "utf8");
const script = readFileSync(`${ROOT}app.js`, "utf8");
const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`).then((r) => r.json());
bootstrap.api_configured = false;          // keep the harness away from WebRTC
bootstrap.weather_configured = false;

const win = new Window({ url: `http://localhost:${PORT}/` });
win.document.write(page);
for (const key of ["window", "document", "localStorage", "location", "history", "navigator",
                   "Event", "HTMLElement", "Node", "CustomEvent", "getComputedStyle"]) {
  globalThis[key] = key === "window" ? win : win[key];
}
globalThis.fetch = async (url) => {
  if (String(url).includes("/api/bootstrap")) return { json: async () => bootstrap };
  throw new Error(`unexpected fetch: ${url}`);
};

const failures = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
  if (!cond) failures.push(label);
};
try { eval(script); } catch (e) { failures.push(`app.js threw: ${e.message}`); console.log(e); }
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

// --- the exported project -------------------------------------------------
ok("no max_output_tokens in a fresh project",
   !JSON.stringify(bootstrap.default_workspace).includes("max_output_tokens"));
ok("no max_output_tokens after a legacy project is merged in", (() => {
  const stored = JSON.parse(localStorage.getItem("dodo-workshop.project") || "{}");
  return !JSON.stringify(stored).includes("max_output_tokens");
})());

console.log(failures.length ? `\n${failures.length} FAILURE(S): ${failures.join(" | ")}` : "\nALL CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
