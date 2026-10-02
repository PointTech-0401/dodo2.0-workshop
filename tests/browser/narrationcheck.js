// Drives synthetic Realtime events through the real client, in a real DOM, to
// check the 旁白 label actually lands on the right bubble. Modelled on
// tests/browser/uicheck.js.
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";

const PORT = process.env.DODO_PORT ?? "8123";
const ROOT = new URL("../../web/", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const page = readFileSync(`${ROOT}index.html`, "utf8");
const CLIENT_FILES = ["core.js", "workshop1.js", "workshop2.js"];
const script = CLIENT_FILES.map((name) => readFileSync(`${ROOT}${name}`, "utf8")).join("\n");
const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`).then((r) => r.json());
bootstrap.api_configured = false;
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
  if (["/api/proactive-decide", "/api/proactive-simulate", "/api/workspace/normalize",
       "/api/intake-check", "/api/day-summary", "/api/reference-intake"].some((p) => String(url).includes(p))) {
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
globalThis.__n = { handleRealtimeEvent, markNarrationFromResponse, startNewChat, sendText,
  setSetup: (value) => { setup = value; },
  setChannel: (value) => { dataChannel = value; apiConfigured = Boolean(value); } };
initialize();`;
try { eval(script + EXPOSE); } catch (e) { failures.push(`client threw: ${e.message}`); console.log(e); }
await new Promise((r) => setTimeout(r, 400));

const { handleRealtimeEvent: fire, markNarrationFromResponse, startNewChat, setSetup } = globalThis.__n;
// response.done reads setup.inputMode to pick the idle note. The classroom
// always has it by then: 設定要先完成才連得上線.
setSetup({ completed: true, inputMode: "text", outputMode: "text" });
const bubbles = () => [...document.querySelectorAll("#messages .message.assistant")];
const last = () => bubbles()[bubbles().length - 1];
const label = (el) => el?.querySelector(".speaker")?.textContent ?? "";

const reset = () => { startNewChat(); };

// --- A. 旁白 tagged as the item arrives -----------------------------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_item.added", item: { id: "item_a", type: "message", phase: "commentary" } });
await fire({ type: "response.output_text.delta", item_id: "item_a", delta: "我想一下怎麼陪你聊這個" });
await fire({ type: "response.output_text.done", item_id: "item_a", text: "我想一下怎麼陪你聊這個" });
await fire({ type: "response.done", response: { output: [{ id: "item_a", type: "message", phase: "commentary" }] } });
ok("A 旁白泡泡標上 is-narration", last()?.classList.contains("is-narration"), label(last()));
ok("A 標籤文字正確", label(last()) === "DODO · 旁白（模型把心裡話講出來了）", label(last()));
ok("A 不會同時是 preamble", !last()?.classList.contains("is-preamble"));

// --- B. tag only shows up on the finished response -------------------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_text.delta", item_id: "item_b", delta: "我來想個話題" });
await fire({ type: "response.output_text.done", item_id: "item_b", text: "我來想個話題" });
await fire({ type: "response.done", response: { output: [{ id: "item_b", type: "message", phase: "commentary" }] } });
ok("B 標記遲到也追得回去", last()?.classList.contains("is-narration"), label(last()));

// --- C. a tool call wins the label ----------------------------------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_item.added", item: { id: "item_c", type: "message", phase: "commentary" } });
await fire({ type: "response.output_text.delta", item_id: "item_c", delta: "我幫您查一下臺北的天氣" });
await fire({ type: "response.output_item.added", item: { id: "call_c", type: "function_call" } });
ok("C 工具前的開場走 PREAMBLE", last()?.classList.contains("is-preamble"), label(last()));
ok("C 旁白 class 被清掉，不會兩個標籤疊在一起", !last()?.classList.contains("is-narration"));
ok("C 標籤文字是第一堂教的那個", label(last()) === "DODO · PREAMBLE（工具前的開場）", label(last()));

// --- D. a normal answer keeps the plain label ------------------------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_text.delta", item_id: "item_d", delta: "臺北現在 26 度。" });
await fire({ type: "response.output_text.done", item_id: "item_d", text: "臺北現在 26 度。" });
await fire({ type: "response.done", response: { output: [{ id: "item_d", type: "message", phase: "final_answer" }] } });
ok("D 正常回答不會被標", !last()?.classList.contains("is-narration") && label(last()) === "DODO", label(last()));

// --- E. an untagged item is left alone (no keyword guessing) ---------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_text.delta", item_id: "item_e", delta: "我想想，那時候我還在唱歌呢。" });
await fire({ type: "response.output_text.done", item_id: "item_e", text: "我想想，那時候我還在唱歌呢。" });
await fire({ type: "response.done", response: { output: [{ id: "item_e", type: "message" }] } });
ok("E 沒有標記就不動它，不靠字面猜", !last()?.classList.contains("is-narration"), label(last()));

// --- F. the tag does not leak into the next response -----------------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_item.added", item: { id: "item_f", type: "message", phase: "commentary" } });
await fire({ type: "response.output_text.delta", item_id: "item_f", delta: "我想一下" });
await fire({ type: "response.output_text.done", item_id: "item_f", text: "我想一下" });
await fire({ type: "response.done", response: { output: [{ id: "item_f", type: "message", phase: "commentary" }] } });
const narrationBubble = last();
await fire({ type: "response.created" });
await fire({ type: "response.output_text.delta", item_id: "item_f", delta: "你剛說膝蓋比較不痛了。" });
await fire({ type: "response.output_text.done", item_id: "item_f", text: "你剛說膝蓋比較不痛了。" });
await fire({ type: "response.done", response: { output: [{ id: "item_f", type: "message", phase: "final_answer" }] } });
ok("F 上一輪的標記不會滲進下一輪", !last()?.classList.contains("is-narration") && last() !== narrationBubble, label(last()));

// --- G. the sweep declines a response that carries a tool call -------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_text.delta", item_id: "item_g", delta: "我幫您查一下" });
markNarrationFromResponse({ output: [
  { id: "item_g", type: "message", phase: "commentary" },
  { id: "call_g", type: "function_call" },
] });
ok("G 有工具呼叫時整輪讓給 PREAMBLE", !last()?.classList.contains("is-narration"), label(last()));

// --- H. 前後對照 must not mistake a 旁白 bubble for the answer ---------------
reset();
await fire({ type: "response.created" });
await fire({ type: "response.output_item.added", item: { id: "item_h1", type: "message", phase: "commentary" } });
await fire({ type: "response.output_text.delta", item_id: "item_h1", delta: "我想一下怎麼回你" });
await fire({ type: "response.output_text.done", item_id: "item_h1", text: "我想一下怎麼回你" });
await fire({ type: "response.output_text.delta", item_id: "item_h2", delta: "你上次說喜歡唱歌。" });
await fire({ type: "response.output_text.done", item_id: "item_h2", text: "你上次說喜歡唱歌。" });
await fire({ type: "response.done", response: { output: [
  { id: "item_h1", type: "message", phase: "commentary" },
  { id: "item_h2", type: "message", phase: "final_answer" },
] } });
const notAnswer = bubbles().filter((b) => b.classList.contains("is-preamble") || b.classList.contains("is-narration"));
const answers = bubbles().filter((b) => !notAnswer.includes(b));
ok("H 同一輪兩個 item，只有旁白那顆被標",
   notAnswer.length === 1 && notAnswer[0].querySelector("p").textContent === "我想一下怎麼回你",
   notAnswer.map((b) => b.querySelector("p").textContent).join(" | "));
ok("H 真正的答案留給前後對照",
   answers.length === 1 && answers[0].querySelector("p").textContent === "你上次說喜歡唱歌。",
   answers.map((b) => b.querySelector("p").textContent).join(" | "));

// --- I. 豆豆's face follows what it is doing, and flinches when cut off -----
const { sendText, setChannel } = globalThis.__n;
const face = () => document.querySelector("#dodoAvatar").dataset.state;
// The state bar's lit step (收聽中／思考中／回應中) and the line under it.
const bar = () => document.querySelector(".state-list li.is-current")?.dataset.state;
const barNote = () => document.querySelector("#connectionNote").textContent;
const sent = [];
setChannel({ readyState: "open", send: (data) => sent.push(JSON.parse(data).type), close: () => {} });
await fire({ type: "response.done", response: { output: [] } });
await new Promise((r) => setTimeout(r, 600));
ok("I 連上線、沒事做：聆聽", face() === "listening", face());
await fire({ type: "response.created" });
ok("I 收到回合：思考", face() === "thinking", face());
await fire({ type: "response.output_text.delta", item_id: "item_i", delta: "我跟你講一個" });
ok("I 文字一出來：講話", face() === "speaking", face());
await sendText("等一下");
ok("I 打字插話：被打斷", face() === "interrupted" && sent.includes("response.cancel"), `${face()} ${sent.join(",")}`);
await new Promise((r) => setTimeout(r, 1500));
ok("I 一下子之後回到現在的狀態", face() === "thinking", face());
// Voice output: response.done arrives while the audio still has seconds to play.
// The face and the bar both follow the sound, so neither says 收聽中 yet.
setSetup({ completed: true, inputMode: "text", outputMode: "voice" });
await fire({ type: "output_audio_buffer.started" });
await fire({ type: "response.done", response: { output: [] } });
await new Promise((r) => setTimeout(r, 600));
ok("I 聲音還在播：還在講話", face() === "speaking", face());
ok("I 聲音還在播：狀態列也是回應中，不是收聽中", bar() === "speaking", `${bar()} ${barNote()}`);
await fire({ type: "output_audio_buffer.stopped" });
ok("I 播完：聆聽", face() === "listening", face());
ok("I 播完：狀態列回到收聽中", bar() === "listening" && barNote() === "等待下一段文字", `${bar()} ${barNote()}`);
await fire({ type: "output_audio_buffer.started" });
await fire({ type: "output_audio_buffer.cleared" });
ok("I 她開口把聲音切掉（VAD 插話）：被打斷", face() === "interrupted", face());
setChannel(undefined);
await fire({ type: "output_audio_buffer.stopped" });
await new Promise((r) => setTimeout(r, 1500));
ok("I 斷線：沒醒", face() === "idle", face());

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(", ")}` : "\nall narration checks passed");
process.exit(failures.length ? 1 : 0);
