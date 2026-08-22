// 设置面板 webview 冒烟测试:jsdom 加载 dist/webview/settings.js,注入状态,验证标签页与表单
// 用法: node tests/smoke/settings.test.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const repo = path.resolve(__dirname, "..", "..");
const out = path.join(os.tmpdir(), "settings-test-" + process.pid + ".js");
const { buildSync } = require(path.join(repo, "node_modules/esbuild"));
buildSync({
  entryPoints: [path.join(repo, "src/webview/settings.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  outfile: out,
  logLevel: "silent",
});
const script = fs.readFileSync(out, "utf8");

const { JSDOM } = require(path.join(repo, "node_modules/jsdom"));
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
  url: "http://localhost/settings",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;
let posted = [];
window.acquireVsCodeApi = () => ({
  postMessage: (m) => posted.push(m),
  getState: () => null,
  setState: () => {},
});
window.eval(script);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function dispatch(kind, payload) {
  window.dispatchEvent(new window.MessageEvent("message", { data: { kind, ...payload } }));
}

const UI_THEME_NS = {
  ns: "ui-theme",
  applies: "live",
  value: { preference: "dark" },
  schema: {
    uid: 1,
    refs: {
      "1": { uid: 1, type: "object", dict: { preference: 2 } },
      "2": { uid: 2, type: "union", list: [3, 4, 5] },
      "3": { uid: 3, type: "const", meta: { value: "light" } },
      "4": { uid: 4, type: "const", meta: { value: "dark" } },
      "5": { uid: 5, type: "const", meta: { value: "system" } },
    },
  },
};
const SHELL_NS = {
  ns: "shell",
  applies: "live",
  value: { timeoutMs: 120000, maxOutputBytes: 64000 },
  schema: {
    uid: 10,
    refs: {
      "10": { uid: 10, type: "object", dict: { timeoutMs: 11, maxOutputBytes: 12 } },
      "11": { uid: 11, type: "number", meta: { step: 1, min: 1, default: 120000 } },
      "12": { uid: 12, type: "number", meta: { step: 1, min: 1, default: 64000 } },
    },
  },
};

async function main() {
  const checks = [];
  const check = (name, ok) => { checks.push([name, ok]); console.log((ok ? "OK  " : "FAIL") + " " + name); };

  dispatch("state", {
    lang: "zh-cn", language: "auto", serverUp: true,
    plugins: [
      { id: "mcp-figma", name: "@deepseek-ai/dsh-mcp-client", kind: "mcp", enabled: false, disabledOverride: true, source: "profile", serverName: "figma", transport: "streamable-http", url: "https://mcp.figma.com/mcp" },
      { id: "git-rollback", name: "dsh-git-rollback", kind: "plugin", enabled: true, disabledOverride: false, source: "profile" },
    ],
    skills: [{ name: "j-space", description: "inner workspace", modelInvocable: true }],
    namespaces: [UI_THEME_NS, SHELL_NS],
    llmGroups: [
      { id: "bai", name: "b.ai", models: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: { efforts: [{ id: "off", name: "Off" }, { id: "high", name: "High" }] } }] },
    ],
    providers: [{ provider: "bai", displayName: "b.ai", active: true }],
    credentials: { bai: { configured: true, writable: true } },
    defaultModel: { provider: "bai", model: "deepseek-v4-flash", reasoningEffort: "high" },
    defaultPreset: { default: "router-standard" },
    presets: [
      { id: "standard", trust: "system", isDefault: false, name: "标准模式", description: "完整编码 Agent" },
      { id: "router-standard", trust: "user", isDefault: true, name: "Router Standard", description: "task-aware routing" },
    ],
  });
  await wait(30);

  // 标签栏
  check("6 个标签", document.querySelectorAll(".settings-tab").length === 6);
  check("通用标签激活", !!document.querySelector(".settings-tab.active"));

  // 通用:schema 驱动表单
  const uiThemeSelect = document.querySelector('.ns-form[data-ns="ui-theme"] select.form-select');
  check("ui-theme 渲染为下拉", !!uiThemeSelect && uiThemeSelect.options.length === 3);
  check("当前值 dark 选中", uiThemeSelect?.value === "dark");
  const shellNum = document.querySelector('.ns-form[data-ns="shell"] input[type=number]');
  check("shell 数值输入", !!shellNum && shellNum.value === "120000");
  check("界面语言分段控件", !!document.querySelector(".seg button[data-value=auto]"));

  // 保存:修改 ui-theme 并触发 change → updateSetting
  if (uiThemeSelect) {
    uiThemeSelect.value = "light";
    uiThemeSelect.dispatchEvent(new window.Event("change", { bubbles: true }));
    const saved = posted.filter((m) => m.kind === "updateSetting").pop();
    check("保存发送 updateSetting(ns+真实字段名)", saved && saved.ns === "ui-theme" && saved.patch && saved.patch.preference === "light");
  }

  // 模型标签
  const tabModels = [...document.querySelectorAll(".settings-tab")].find((b) => b.dataset.tab === "models");
  tabModels.click();
  await wait(10);
  check("模型:默认模型 provider 下拉", !!document.querySelector('.form-select[value="bai"]') || document.querySelectorAll(".form-select").length >= 2);
  check("模型:可用模型分组", document.querySelectorAll(".model-group").length === 1);
  check("模型:凭据行显示已配置", [...document.querySelectorAll(".plugin-name")].some((n) => n.textContent.includes("b.ai")));

  // 预设标签
  const tabPresets = [...document.querySelectorAll(".settings-tab")].find((b) => b.dataset.tab === "presets");
  tabPresets.click();
  await wait(10);
  check("预设:默认预设下拉含 router-standard", [...document.querySelectorAll(".form-select option")].some((o) => o.value === "router-standard"));
  check("预设:2 行预设", document.querySelectorAll(".plugin-row").length === 2);
  check("预设:user 预设可删除(确认按钮)", document.querySelectorAll(".btn-danger").length >= 1);

  // 插件标签
  const tabPlugins = [...document.querySelectorAll(".settings-tab")].find((b) => b.dataset.tab === "plugins");
  tabPlugins.click();
  await wait(10);
  check("插件:MCP 区显示 figma", document.querySelector('.ns-form') === null && [...document.querySelectorAll(".plugin-name")].some((n) => n.textContent.includes("figma")));
  check("插件:插件区显示 git-rollback", [...document.querySelectorAll(".plugin-name")].some((n) => n.textContent.includes("git-rollback")));

  // 技能标签
  const tabSkills = [...document.querySelectorAll(".settings-tab")].find((b) => b.dataset.tab === "skills");
  tabSkills.click();
  await wait(10);
  check("技能:显示 j-space", [...document.querySelectorAll(".skill-name")].some((n) => n.textContent.includes("j-space")));

  // 切英文
  dispatch("state", { lang: "en", language: "en", serverUp: true, plugins: [], skills: [], namespaces: [], llmGroups: [], providers: [], credentials: {}, presets: [] });
  await wait(10);
  check("英文:标签显示 Settings", document.querySelector(".settings-title")?.textContent.includes("Settings") || document.querySelector(".settings-title")?.textContent.includes("设置") === false);

  let fail = 0;
  for (const [name, ok] of checks) if (!ok) fail++;
  try { fs.unlinkSync(out); } catch {}
  console.log("\n结果:", fail === 0 ? "全部通过 (" + checks.length + " 项)" : fail + " 项失败");
  process.exit(fail === 0 ? 0 : 1);
}
main();
