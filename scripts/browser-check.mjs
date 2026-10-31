// Look at a page in a real browser before calling a task done.
//
//   pnpm check:browser <chrome|chrome-phone|safari|ios> <path> [step ...]
//
//   chrome        Chromium (playwright-core), 1280×900
//   chrome-phone  Chromium at 390×844
//   safari        macOS Safari through safaridriver, 1280×900
//   ios           Mobile Safari in the "iPhone 16 Pro" iOS Simulator
//
// Steps run in order after logging in and opening <path>:
//   click|<css>   fill|<css>|<text>   wait|<ms>   shot|<name>   js|<expression>
// A screenshot named "start" is always taken first. Screenshots land in
// .browser-check/<browser>/<page>-NN-<name>.png (gitignored); `js` prints its result.
//
// Logs in as BUDGET_TEST_EMAIL / BUDGET_TEST_PASSWORD from .env.local against
// the dev server (BUDGET_URL, default http://localhost:3000).
//
// ios cannot be driven: the simulator's Safari has no Remote Automation
// setting, so safaridriver finds no session host there. It opens <path> by URL
// and takes a device screenshot (status bar and home indicator included), and
// takes only wait|/shot| steps. Log in once by hand in the simulator's Safari;
// it keeps the session like a real phone.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const [target, path = "/oversikt", ...steps] = process.argv.slice(2);
const base = process.env.BUDGET_URL ?? "http://localhost:3000";
const email = process.env.BUDGET_TEST_EMAIL;
const password = process.env.BUDGET_TEST_PASSWORD;
if (!["chrome", "chrome-phone", "safari", "ios"].includes(target) || !email || !password) {
  console.error(
    "Usage: pnpm check:browser <chrome|chrome-phone|safari|ios> <path> [step ...]\n" +
      "Needs BUDGET_TEST_EMAIL and BUDGET_TEST_PASSWORD in .env.local."
  );
  process.exit(1);
}
const out = `.browser-check/${target}`;
// Named after the page, so checking several pages keeps every screenshot.
const pageName = path.replace(/^\//, "").replace(/[^\w-]+/g, "-") || "root";
mkdirSync(out, { recursive: true });
const SIMULATOR = "iPhone 16 Pro";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function playwright(viewport) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => console.log("page error:", error.message));
  return {
    goto: (url) => page.goto(url),
    url: async () => page.url(),
    click: (sel) => page.locator(sel).first().click(),
    fill: (sel, text) => page.locator(sel).first().fill(text),
    js: (expr) => page.evaluate(expr),
    shot: (file) => page.screenshot({ path: file, fullPage: true }),
    close: () => browser.close(),
  };
}

// safaridriver speaks plain W3C WebDriver; this is the handful of endpoints
// the steps need.
function simulator() {
  const simctl = (...args) => execFileSync("xcrun", ["simctl", ...args], { stdio: "ignore" });
  // Boots the simulator if it is off, and waits until it is up.
  simctl("bootstatus", SIMULATOR, "-b");
  const unsupported = () => {
    throw new Error("ios takes only wait| and shot| steps (see the header)");
  };
  return {
    goto: (url) => simctl("openurl", SIMULATOR, url),
    url: async () => "(not readable on ios)",
    click: unsupported,
    fill: unsupported,
    js: unsupported,
    shot: (file) => simctl("io", SIMULATOR, "screenshot", file),
    close: async () => {},
  };
}

async function safari() {
  const port = 4500 + Math.floor(Math.random() * 400);
  const driver = spawn("safaridriver", ["-p", String(port)], { stdio: "ignore" });
  const root = `http://localhost:${port}`;
  async function wd(method, url, body) {
    const res = await fetch(root + url, {
      method,
      headers: { "content-type": "application/json" },
      body: body && JSON.stringify(body),
    });
    const json = await res.json();
    if (json.value?.error) throw new Error(`${url}: ${json.value.message || json.value.error}`);
    return json.value;
  }
  for (let i = 0; ; i++) {
    try {
      await wd("GET", "/status");
      break;
    } catch (error) {
      if (i > 40) throw error;
      await sleep(250);
    }
  }
  const { sessionId } = await wd("POST", "/session", {
    capabilities: {
      alwaysMatch: { browserName: "safari" },
    },
  });
  const s = (url) => `/session/${sessionId}${url}`;
  const find = async (sel) =>
    Object.values(await wd("POST", s("/element"), { using: "css selector", value: sel }))[0];
  await wd("POST", s("/window/rect"), { width: 1280, height: 900 });
  return {
    goto: (url) => wd("POST", s("/url"), { url }),
    url: () => wd("GET", s("/url")),
    click: async (sel) => wd("POST", s(`/element/${await find(sel)}/click`), {}),
    fill: async (sel, text) => {
      const element = await find(sel);
      await wd("POST", s(`/element/${element}/clear`), {});
      await wd("POST", s(`/element/${element}/value`), { text });
    },
    js: (expr) => wd("POST", s("/execute/sync"), { script: `return (${expr})`, args: [] }),
    shot: async (file) =>
      writeFileSync(file, Buffer.from(await wd("GET", s("/screenshot")), "base64")),
    close: async () => {
      await wd("DELETE", s("")).catch(() => {});
      driver.kill();
    },
  };
}

const browser =
  target === "chrome"
    ? await playwright({ width: 1280, height: 900 })
    : target === "chrome-phone"
      ? await playwright({ width: 390, height: 844 })
      : target === "safari"
        ? await safari()
        : simulator();

let shotCount = 0;
try {
  if (target === "ios") {
    await browser.goto(base + path);
    await sleep(4000);
  } else {
    await logIn();
  }
  console.log(`${target}: ${await browser.url()}`);

  for (const step of ["shot|start", ...steps]) {
    const [command, a, b] = step.split("|");
    if (command === "click") await browser.click(a);
    else if (command === "fill") await browser.fill(a, b);
    else if (command === "wait") await sleep(Number(a));
    else if (command === "js") console.log(await browser.js(a));
    else if (command === "shot") {
      const file = `${out}/${pageName}-${String(shotCount++).padStart(2, "0")}-${a}.png`;
      await browser.shot(file);
      console.log(file);
    } else throw new Error(`Unknown step: ${step}`);
  }
} finally {
  await browser.close();
}

async function logIn() {
  await browser.goto(`${base}/logg-inn`);
  await sleep(1500);
  await browser.fill("input[type=email]", email);
  await browser.fill("input[type=password]", password);
  await browser.click("button[type=submit]");
  for (let i = 0; (await browser.url()).includes("/logg-inn"); i++) {
    if (i > 40) throw new Error("Login did not leave /logg-inn");
    await sleep(500);
  }
  await browser.goto(base + path);
  await sleep(3000); // the ledger fetch and decrypt
}
