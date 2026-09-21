// Drives the 系統設定 sheet in a real DOM with a stubbed, deliberately uneven
// network, to check the two API keys test and save side by side without their
// status lines overwriting each other. Modelled on tests/browser/uicheck.js.
import { Window } from "happy-dom";
import { readFileSync } from "node:fs";

const PORT = process.env.DODO_PORT ?? "8123";
const ROOT = new URL("../../web/", import.meta.url).pathname.replace(/^[/](?=[A-Za-z]:)/, "");
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

// The knobs each scenario turns: how slow each key's endpoint is, and whether it
// passes. OpenAI is deliberately the fast one, so it always finishes first and
// gets the chance to overwrite the weather line if the guard is missing.
const net = { openaiMs: 10, weatherMs: 140, openaiOk: true, weatherOk: true,
              openaiSaveOk: true, weatherSaveOk: true };
const log = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const path = String(url);
  if (path.includes("/api/bootstrap")) return { json: async () => bootstrap };
  const openai = path.includes("/api/settings/api-key");
  const weather = path.includes("/api/settings/weather-api-key");
  if (openai || weather) {
    const saving = !path.endsWith("/test");
    const name = `${openai ? "openai" : "weather"}${saving ? ":save" : ":test"}`;
    const entry = { name, start: Date.now(), end: 0 };
    log.push(entry);
    await sleep(openai ? net.openaiMs : net.weatherMs);
    entry.end = Date.now();
    const ok = (openai ? net.openaiOk : net.weatherOk)
      && (!saving || (openai ? net.openaiSaveOk : net.weatherSaveOk));
    return {
      ok,
      json: async () => (ok
        ? (openai
          ? { configured: true, source: "session", realtime_model: bootstrap.realtime_model,
              realtime_voice: bootstrap.realtime_voice, weather_configured: false }
          : { configured: true, source: "session" })
        : { detail: openai ? "API Key 無效或沒有權限。" : "天氣 API Key 無效。" }),
    };
  }
  if (["/api/proactive-decide", "/api/proactive-simulate", "/api/workspace/normalize",
       "/api/intake-check", "/api/day-summary", "/api/reference-intake"].some((p) => path.includes(p))) {
    return realFetch(`http://127.0.0.1:${PORT}${path}`, init);
  }
  throw new Error(`unexpected fetch: ${path}`);
};

const failures = [];
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "   " + extra : ""}`);
  if (!cond) failures.push(label);
};

const EXPOSE = `
globalThis.__k = {
  finishOnboarding, commitApiKey, commitWeatherApiKey, testApiKey, testWeatherApiKey,
  refreshApiUi,
  setSetup: (value) => { setup = value; },
  reset: () => {
    apiConfigured = false; weatherConfigured = false;
    testedApiKey = ""; testedWeatherApiKey = "";
    bootstrapData.api_configured = false; bootstrapData.weather_configured = false;
    apiKeyStatusOwned = false; weatherApiKeyStatusOwned = false;
    refreshApiUi();
  },
  owned: () => ({ api: apiKeyStatusOwned, weather: weatherApiKeyStatusOwned }),
  configured: () => ({ api: apiConfigured, weather: weatherConfigured }),
};
initialize();`;
try { eval(script + EXPOSE); } catch (e) { failures.push(`client threw: ${e.message}`); console.log(e); }
await new Promise((r) => setTimeout(r, 400));

const K = globalThis.__k;
const $ = (s) => document.querySelector(s);
const text = (s) => $(s).textContent;
const ready = (s) => $(s).classList.contains("is-ready");
const typeKey = (selector, value) => {
  $(selector).value = value;
  $(selector).dispatchEvent(new win.Event("input", { bubbles: true }));
};
const span = (name) => log.find((e) => e.name === name);
const resetAll = () => {
  log.length = 0;
  Object.assign(net, { openaiMs: 10, weatherMs: 140, openaiOk: true, weatherOk: true,
                       openaiSaveOk: true, weatherSaveOk: true });
  K.reset();
  $("#onboardingError").textContent = "";
};

K.setSetup({ completed: true, inputMode: "text", outputMode: "text" });

// --- A. 儲存 sends both keys at once --------------------------------------
resetAll();
$("#apiKeyInput").value = "sk-test";
$("#weatherApiKeyInput").value = "weather-test";
// finishOnboarding carries on to Realtime after the keys land, which this DOM
// cannot do; the key half is over by then.
net.weatherMs = 300;   // 讓下面這一眼穩穩落在天氣還在跑的中間，慢機器也一樣。
const saving = K.finishOnboarding().catch(() => {});
await sleep(80);   // OpenAI 的測試加儲存共 20ms，早就好了；天氣要 300ms。
ok("A 天氣那行還在跑，沒有被 OpenAI 存完後的重繪洗掉",
   text("#weatherApiKeyStatus").includes("正在儲存") || text("#weatherApiKeyStatus").includes("正在測試"),
   text("#weatherApiKeyStatus"));
ok("A 儲存中兩顆測試按鈕都停用", $("#testApiKey").disabled && $("#testWeatherApiKey").disabled);
await saving;
await sleep(20);
ok("A 兩組的測試請求重疊，不是排隊",
   span("weather:test").start < span("openai:test").end,
   `weather 起 ${span("weather:test").start - span("openai:test").start}ms，openai 終 ${span("openai:test").end - span("openai:test").start}ms`);
ok("A 兩組都存成功", K.configured().api && K.configured().weather);
ok("A 存完 OpenAI 那行回到已連接", text("#apiKeyStatus").includes("✓ API 已連接"), text("#apiKeyStatus"));
ok("A 存完天氣那行回到已連接", text("#weatherApiKeyStatus").includes("✓ 天氣 API 已連接"), text("#weatherApiKeyStatus"));
ok("A 存完兩行都交還給重繪", !K.owned().api && !K.owned().weather, JSON.stringify(K.owned()));
ok("A 按鈕都放回去", !$("#testApiKey").disabled && !$("#testWeatherApiKey").disabled && !$("#finishOnboarding").disabled);

// --- B. the two 測試 buttons overlap --------------------------------------
resetAll();
// Both round trips are slow here, so the sample below lands while each is still
// in flight. A 10ms OpenAI test finishes inside the sampling gap itself.
net.openaiMs = 90;
net.weatherMs = 500;
$("#apiKeyInput").value = "sk-test";
$("#weatherApiKeyInput").value = "weather-test";
// dispatchEvent 回傳的是布林值，不是監聽器那個 promise，所以底下等的是時間，
// 每一次取樣都離兩端至少 100ms，慢機器才不會剛好卡在交界上。
$("#testApiKey").dispatchEvent(new win.Event("click", { bubbles: true }));
$("#testWeatherApiKey").dispatchEvent(new win.Event("click", { bubbles: true }));
await sleep(20);
ok("B 兩行同時顯示正在測試",
   text("#apiKeyStatus").includes("正在測試 OpenAI API") && text("#weatherApiKeyStatus").includes("正在測試天氣 API"),
   `${text("#apiKeyStatus")} ／ ${text("#weatherApiKeyStatus")}`);
ok("B 兩顆按鈕各自停用自己", $("#testApiKey").disabled && $("#testWeatherApiKey").disabled);
await sleep(180);
ok("B OpenAI 測完了，天氣那行還在跑",
   text("#apiKeyStatus").includes("✓ 測試通過") && text("#weatherApiKeyStatus").includes("正在測試"),
   `${text("#apiKeyStatus")} ／ ${text("#weatherApiKeyStatus")}`);
ok("B OpenAI 測完不會停用天氣那顆", !$("#testApiKey").disabled && $("#testWeatherApiKey").disabled);
await sleep(520);
ok("B 兩行最後都是測試通過",
   text("#apiKeyStatus").includes("✓ 測試通過") && text("#weatherApiKeyStatus").includes("✓ 測試通過"),
   `${text("#apiKeyStatus")} ／ ${text("#weatherApiKeyStatus")}`);
ok("B 測試請求重疊", span("weather:test").start < span("openai:test").end);

// --- C. editing a tested key puts the line back ----------------------------
ok("C 前置：OpenAI 現在是測試通過且亮綠", text("#apiKeyStatus").includes("✓ 測試通過") && ready("#apiKeyStatus"));
typeKey("#apiKeyInput", "sk-test-changed");
ok("C 改了之後退回原本那行，不是第三種訊息",
   text("#apiKeyStatus") === "還沒填。Key 只留在這台電腦上，程式一關就沒了。", text("#apiKeyStatus"));
ok("C 綠色跟著收掉", !ready("#apiKeyStatus"));
ok("C 只動被改的那一欄，天氣那行不受影響",
   text("#weatherApiKeyStatus").includes("✓ 測試通過"), text("#weatherApiKeyStatus"));
typeKey("#weatherApiKeyInput", "weather-changed");
ok("C 天氣改了也退回去",
   text("#weatherApiKeyStatus") === "要讓豆豆查得到天氣，填第一版用的那把天氣 API Key。", text("#weatherApiKeyStatus"));

// --- D. 已連接 之後再改，退回的是「已連接」那一行 ---------------------------
resetAll();
$("#apiKeyInput").value = "sk-test";
$("#weatherApiKeyInput").value = "weather-test";
await K.finishOnboarding().catch(() => {});
await sleep(20);
await K.testApiKey();
ok("D 前置：再測一次會顯示測試通過", text("#apiKeyStatus").includes("✓ 測試通過"), text("#apiKeyStatus"));
typeKey("#apiKeyInput", "sk-test-again");
ok("D 已連接的情況下，退回的是已連接那一行",
   text("#apiKeyStatus").includes("✓ API 已連接"), text("#apiKeyStatus"));

// --- E. 沒測過就打字，不該動那一行 -----------------------------------------
resetAll();
ok("E 前置：基準那一行", text("#apiKeyStatus") === "還沒填。Key 只留在這台電腦上，程式一關就沒了。", text("#apiKeyStatus"));
typeKey("#apiKeyInput", "s");
ok("E 打第一個字不會把說明換掉",
   text("#apiKeyStatus") === "還沒填。Key 只留在這台電腦上，程式一關就沒了。", text("#apiKeyStatus"));

// --- F. OpenAI 壞掉，天氣還是有被試過 --------------------------------------
resetAll();
net.openaiOk = false;
$("#apiKeyInput").value = "sk-bad";
$("#weatherApiKeyInput").value = "weather-test";
await K.finishOnboarding().catch(() => {});
await sleep(20);
ok("F OpenAI 失敗時天氣仍然被送出去測", Boolean(span("weather:test")), log.map((e) => e.name).join(", "));
ok("F 天氣照樣存起來", K.configured().weather === true);
ok("F OpenAI 說不通的理由還在那一行，沒被天氣存完後的重繪洗掉",
   text("#apiKeyStatus").includes("API Key 無效"), text("#apiKeyStatus"));
ok("F 錯誤只點名 OpenAI",
   text("#onboardingError") === "OpenAI API Key 沒有儲存成功，請看上方訊息。", text("#onboardingError"));

// --- G. 兩把都壞，錯誤訊息一次講完 -----------------------------------------
resetAll();
net.openaiOk = false;
net.weatherOk = false;
$("#apiKeyInput").value = "sk-bad";
$("#weatherApiKeyInput").value = "weather-bad";
await K.finishOnboarding().catch(() => {});
await sleep(20);
ok("G 兩把都失敗時一次講完，用「、」分隔",
   text("#onboardingError") === "OpenAI API Key、天氣 API Key 沒有儲存成功，請看上方訊息。", text("#onboardingError"));
ok("G 失敗後按鈕都放回去",
   !$("#testApiKey").disabled && !$("#testWeatherApiKey").disabled && !$("#finishOnboarding").disabled);
ok("G 兩行各自留著自己的理由",
   text("#apiKeyStatus").includes("API Key 無效") && text("#weatherApiKeyStatus").includes("天氣 API Key 無效"),
   `${text("#apiKeyStatus")} ／ ${text("#weatherApiKeyStatus")}`);

// --- H. F 的鏡像：先壞的是天氣，後存成功的是 OpenAI -------------------------
resetAll();
net.openaiMs = 140;   // 這次讓 OpenAI 當慢的那一邊，重繪才會發生在天氣失敗之後。
net.weatherMs = 10;
net.weatherOk = false;
$("#apiKeyInput").value = "sk-test";
$("#weatherApiKeyInput").value = "weather-bad";
await K.finishOnboarding().catch(() => {});
await sleep(20);
ok("H 天氣說不通的理由還在那一行，沒被 OpenAI 存完後的重繪洗掉",
   text("#weatherApiKeyStatus").includes("天氣 API Key 無效"), text("#weatherApiKeyStatus"));
ok("H 錯誤只點名天氣",
   text("#onboardingError") === "天氣 API Key 沒有儲存成功，請看上方訊息。", text("#onboardingError"));
ok("H OpenAI 照樣存起來", K.configured().api === true);

// --- I. 改這一格的字，不會把另一格的理由擦掉 --------------------------------
await K.testApiKey();
ok("I 前置：OpenAI 重測一次是通過的", text("#apiKeyStatus").includes("✓ 測試通過"), text("#apiKeyStatus"));
typeKey("#apiKeyInput", "sk-test-2");
ok("I 改 OpenAI 那一格，天氣那行的理由還在",
   text("#weatherApiKeyStatus").includes("天氣 API Key 無效"), text("#weatherApiKeyStatus"));

// --- J. 測試過了，存的時候才被打回票 ---------------------------------------
resetAll();
net.openaiSaveOk = false;
$("#apiKeyInput").value = "sk-test";
$("#weatherApiKeyInput").value = "weather-test";
await K.finishOnboarding().catch(() => {});
await sleep(20);
ok("J 存的時候被打回票，那一行說得出理由", text("#apiKeyStatus").includes("API Key 無效"), text("#apiKeyStatus"));
ok("J 測試時亮起來的綠色要收掉，別讓失敗的那行看起來像成功", !ready("#apiKeyStatus"));
ok("J 天氣那把照樣存起來", K.configured().weather === true);

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(", ")}` : "\nall api key checks passed");
process.exit(failures.length ? 1 : 0);
