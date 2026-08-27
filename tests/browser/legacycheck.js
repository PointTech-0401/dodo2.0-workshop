import { Window } from "happy-dom";

// 伺服器連接埠：預設 8123，可用 DODO_PORT 覆寫。
const PORT = process.env.DODO_PORT ?? "8123";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../web/", import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, "");
const bootstrap = await fetch(`http://127.0.0.1:${PORT}/api/bootstrap`).then((r) => r.json());
bootstrap.api_configured = false;

const win = new Window({ url: `http://localhost:${PORT}/` });
win.document.write(readFileSync(`${ROOT}index.html`, "utf8"));
for (const key of ["window", "document", "localStorage", "location", "history", "navigator",
                   "Event", "HTMLElement", "Node", "CustomEvent", "getComputedStyle"]) {
  globalThis[key] = key === "window" ? win : win[key];
}
globalThis.fetch = async () => ({ json: async () => bootstrap });

// Exactly what a student who used the previous build has in their browser.
const legacy = structuredClone(bootstrap.default_workspace);
legacy.profile.agent.max_output_tokens = 180;
localStorage.setItem("dodo-workshop.project", JSON.stringify(legacy));
console.log("seeded localStorage contains the cap:",
  localStorage.getItem("dodo-workshop.project").includes("max_output_tokens"));

// Capture what 下載我的 Dodo would hand the student.
let downloaded = "";
const realCreate = win.document.createElement.bind(win.document);
win.document.createElement = (tag) => {
  const el = realCreate(tag);
  if (tag === "a") el.click = () => {};
  return el;
};
const RealBlob = globalThis.Blob;
globalThis.Blob = class extends RealBlob { constructor(parts, opts) { super(parts, opts); downloaded = parts.join(""); } };
globalThis.URL = { createObjectURL: () => "blob:x", revokeObjectURL: () => {} };

eval(readFileSync(`${ROOT}app.js`, "utf8"));
await new Promise((r) => setTimeout(r, 400));

document.querySelector("#exportButton").click();
const clean = !downloaded.includes("max_output_tokens");
console.log("downloaded bytes:", downloaded.length);
console.log(clean ? "PASS  下載我的 Dodo has no max_output_tokens" : "FAIL  cap survived the download");
console.log("agent keys:", Object.keys(JSON.parse(downloaded).profile.agent).join(", "));
process.exit(clean ? 0 : 1);
