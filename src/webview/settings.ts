// DeepSeek Harness 设置面板:语言切换 + DSH 插件(MCP/插件)启停 + 技能展示 + 服务器操作
// 与 ui.ts 同一套风格:纯线条 SVG 图标、无 emoji、双语(中文为源语言)。
declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): any; setState(state: any): void };

const vscode = acquireVsCodeApi();

interface PluginInfo {
  id: string;
  name: string;
  kind: "mcp" | "plugin";
  enabled: boolean;
  disabledOverride: boolean;
  source?: "profile" | "bundle" | "injected";
  serverName?: string;
  transport?: string;
  command?: string;
  url?: string;
}

interface SkillInfo {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
}

interface SettingsState {
  lang: string;
  language: string;
  serverUp: boolean;
  version?: string;
  parseError?: string;
  plugins: PluginInfo[];
  skills: SkillInfo[] | null;
}

const state: SettingsState = {
  lang: "zh-cn",
  language: "auto",
  serverUp: false,
  plugins: [],
  skills: null,
};

// ---------- 无 emoji 清洗与 DOM 工具(与 ui.ts 一致) ----------
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2714}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23E9}-\u{23FA}\u{2139}\u{2B06}\u{2B07}\u{25B6}\u{25C0}]/gu;
function clean(text: string): string {
  return text.replace(EMOJI_RE, "");
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = clean(text);
  return node;
}

// ---------- 简约线条图标 ----------
const ICONS: Record<string, string> = {
  gear: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z|M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  box: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|M3.27 6.96 12 12.01l8.73-5.05|M12 22.08V12",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  cap: "M22 10 12 5 2 10l10 5 10-5z|M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36L21 8|M21 3v5h-5",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6",
  power: "M18.36 6.64a9 9 0 1 1-12.73 0|M12 2v10",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
};

function lineIcon(paths: string, size = 14): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths.split("|")) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

// ---------- 国际化(中文为源语言,英文词典翻译) ----------
const EN_TEXT: Record<string, string> = {
  "设置": "Settings",
  "跟随系统": "Follow system",
  "中文": "中文",
  "English": "English",
  "界面语言": "Interface language",
  "语言切换即时生效,所有 DSH 界面(聊天/设置)同步切换": "Applies immediately to all DSH surfaces (chat / settings)",
  "MCP 服务": "MCP Servers",
  "DSH 插件": "DSH Plugins",
  "MCP": "MCP",
  "插件": "Plugin",
  "已禁用": "disabled",
  "插件/MCP 开关写入 profile 的 cordis.patch.yml,重启 DSH 服务器后生效": "Toggles write to the profile's cordis.patch.yml and take effect after the DSH server restarts",
  "启用": "Enable",
  "禁用": "Disable",
  "技能": "Skills",
  "技能由 DSH 自动加载,此处仅展示(模型可调用 {n} 个)": "Skills are auto-loaded by DSH; shown here for reference ({n} invocable by the model)",
  "未连接": "Not connected",
  "已连接": "Connected",
  "服务器": "Server",
  "重启服务器": "Restart server",
  "打开配置文件": "Open config file",
  "加载中…": "Loading…",
  "没有已安装的插件(profile 中无条目)": "No plugins installed (empty profile patch)",
  "没有已安装的 MCP 服务": "No MCP servers installed",
  "注入": "injected",
  "无法解析插件配置,请用「打开配置文件」手动检查": "Cannot parse the plugin config; open the config file to inspect it manually",
  "配置已更改,重启 DSH 服务器后生效": "Config changed; restart the DSH server to apply",
  "操作失败": "Operation failed",
  "服务器已重启": "Server restarted",
  "服务器重启中…": "Server is restarting…",
  "重启需要服务器在线": "Restart requires the server to be online",
  "正在读取…": "Reading…",
  "暂无技能": "No skills available",
  "打开设置面板后按会话读取技能,需要 DSH 服务器在线并有会话": "Skills are read per session; requires the DSH server online with a session",
};

function t(zh: string, params?: Record<string, string | number>): string {
  const lang = (state.lang ?? "zh-cn").toLowerCase();
  let text = lang.startsWith("zh") ? zh : EN_TEXT[zh] ?? zh;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return clean(text);
}

// ---------- 骨架 ----------
const app = document.getElementById("app")!;
const root = el("div", "settings-root");

// 头部
const header = el("div", "settings-header");
const title = el("div", "settings-title");
const titleText = el("span", undefined, t("设置"));
title.append(lineIcon(ICONS.gear, 16), titleText);
const serverBadge = el("div", "settings-server");
const dot = el("span", "dot");
const serverText = el("span", "server-text");
serverBadge.append(dot, serverText);
header.append(title, serverBadge);
root.append(header);

// 消息条
const notice = el("div", "notice");
root.append(notice);

// ---------- 语言 ----------
const langSection = el("div", "section");
const langHead = el("div", "section-head");
const langHeadTitle = el("span", undefined, t("界面语言"));
langHead.append(lineIcon(ICONS.gear, 13), langHeadTitle);
langSection.append(langHead);
const langBody = el("div", "section-body");
const langRow = el("div", "lang-row");
const seg = el("div", "seg");
const segButtons: { button: HTMLButtonElement; value: string }[] = [];
for (const opt of [
  { value: "auto", label: "跟随系统" },
  { value: "zh-cn", label: "中文" },
  { value: "en", label: "English" },
]) {
  const b = el("button", "", opt.label);
  b.dataset.value = opt.value;
  b.addEventListener("click", () => {
    vscode.postMessage({ kind: "setLanguage", lang: opt.value });
  });
  seg.append(b);
  segButtons.push({ button: b, value: opt.value });
}
const langNoteText = el("span", "section-note", t("语言切换即时生效,所有 DSH 界面(聊天/设置)同步切换"));
langRow.append(seg, langNoteText);
langBody.append(langRow);
langSection.append(langBody);
root.append(langSection);

// ---------- MCP 服务 ----------
const mcpSection = el("div", "section");
const mcpHead = el("div", "section-head");
const mcpHeadTitle = el("span", undefined, t("MCP 服务"));
mcpHead.append(lineIcon(ICONS.link, 13), mcpHeadTitle);
mcpSection.append(mcpHead);
const mcpBody = el("div", "section-body");
mcpSection.append(mcpBody);
root.append(mcpSection);

// ---------- DSH 插件 ----------
const pluginSection = el("div", "section");
const pluginHead = el("div", "section-head");
const pluginHeadTitle = el("span", undefined, t("DSH 插件"));
pluginHead.append(lineIcon(ICONS.box, 13), pluginHeadTitle);
pluginSection.append(pluginHead);
const pluginNote = el("div", "section-note", t("插件/MCP 开关写入 profile 的 cordis.patch.yml,重启 DSH 服务器后生效"));
pluginSection.append(pluginNote);
const pluginBody = el("div", "section-body");
pluginSection.append(pluginBody);
root.append(pluginSection);

// ---------- 技能 ----------
const skillSection = el("div", "section");
const skillHead = el("div", "section-head");
const skillHeadTitle = el("span", undefined, t("技能"));
skillHead.append(lineIcon(ICONS.cap, 13), skillHeadTitle);
skillSection.append(skillHead);
const skillNote = el("div", "section-note");
skillSection.append(skillNote);
const skillBody = el("div", "section-body");
skillSection.append(skillBody);
root.append(skillSection);

// ---------- 服务器 ----------
const serverSection = el("div", "section");
const serverHead = el("div", "section-head");
const serverHeadTitle = el("span", undefined, t("服务器"));
serverHead.append(lineIcon(ICONS.globe, 13), serverHeadTitle);
serverSection.append(serverHead);
const serverBody = el("div", "section-body");
const actions = el("div", "server-actions");
const btnRestart = el("button", "btn primary");
const btnRestartText = el("span", undefined, t("重启服务器"));
btnRestart.append(lineIcon(ICONS.power, 12), btnRestartText);
btnRestart.addEventListener("click", () => {
  btnRestart.disabled = true;
  btnRestartText.textContent = t("服务器重启中…");
  vscode.postMessage({ kind: "restartServer" });
});
const btnOpen = el("button", "btn");
const btnOpenText = el("span", undefined, t("打开配置文件"));
btnOpen.append(lineIcon(ICONS.file, 12), btnOpenText);
btnOpen.addEventListener("click", () => vscode.postMessage({ kind: "openPatch" }));
actions.append(btnRestart, btnOpen);
serverBody.append(actions);
serverSection.append(serverBody);
root.append(serverSection);

app.append(root);

/** 按当前语言刷新全部静态文案(语言切换后整页重刷)。 */
function applyStaticTexts() {
  titleText.textContent = t("设置");
  langHeadTitle.textContent = t("界面语言");
  langNoteText.textContent = t("语言切换即时生效,所有 DSH 界面(聊天/设置)同步切换");
  for (const { button, value } of segButtons) {
    button.textContent = t(value === "auto" ? "跟随系统" : value === "zh-cn" ? "中文" : "English");
  }
  mcpHeadTitle.textContent = t("MCP 服务");
  pluginHeadTitle.textContent = t("DSH 插件");
  pluginNote.textContent = t("插件/MCP 开关写入 profile 的 cordis.patch.yml,重启 DSH 服务器后生效");
  skillHeadTitle.textContent = t("技能");
  serverHeadTitle.textContent = t("服务器");
  btnRestartText.textContent = t("重启服务器");
  btnOpenText.textContent = t("打开配置文件");
}

// ---------- 渲染 ----------

function renderLanguage() {
  for (const { button, value } of segButtons) {
    button.classList.toggle("active", value === state.language);
  }
}

function showNotice(message: string, kind: "info" | "error") {
  notice.textContent = clean(message);
  notice.className = "notice show " + kind;
  setTimeout(() => notice.classList.remove("show"), 5000);
}

function pluginRow(p: PluginInfo): HTMLDivElement {
  const row = el("div", "plugin-row");
  const icon = el("span", "plugin-icon" + (p.kind === "mcp" ? " mcp" : ""));
  icon.append(lineIcon(p.kind === "mcp" ? ICONS.link : ICONS.box, 14));
  const main = el("div", "plugin-main");
  const nameLine = el("div", "plugin-name");
  nameLine.append(el("span", undefined, p.serverName ?? p.name));
  const badge = el("span", "badge" + (p.kind === "mcp" ? " mcp" : ""));
  badge.textContent = p.kind === "mcp" ? t("MCP") : t("插件");
  nameLine.append(badge);
  if (p.source === "injected") nameLine.append(el("span", "badge", t("注入")));
  else if (p.source === "bundle") nameLine.append(el("span", "badge", "bundle"));
  if (!p.enabled) {
    nameLine.append(el("span", "badge off", t("已禁用")));
  }
  main.append(nameLine);
  if (p.kind === "mcp") {
    const detail: string[] = [];
    if (p.transport) detail.push(p.transport);
    if (p.command) detail.push(p.command);
    if (p.url) detail.push(p.url);
    if (detail.length > 0) main.append(el("div", "plugin-detail", detail.join(" · ")));
  } else {
    main.append(el("div", "plugin-detail", p.id));
  }
  row.append(icon, main);
  const sw = el("label", "switch");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = p.enabled;
  input.title = p.enabled ? t("禁用") : t("启用");
  input.addEventListener("change", () => {
    vscode.postMessage({ kind: "togglePlugin", id: p.id, enabled: input.checked });
  });
  const track = el("span", "track");
  sw.append(input, track);
  row.append(sw);
  return row;
}

function renderPlugins() {
  mcpBody.innerHTML = "";
  pluginBody.innerHTML = "";
  if (state.parseError) {
    pluginBody.append(el("div", "empty", t("无法解析插件配置,请用「打开配置文件」手动检查")));
    return;
  }
  const mcps = state.plugins.filter((p) => p.kind === "mcp");
  const plugins = state.plugins.filter((p) => p.kind !== "mcp");
  if (mcps.length === 0) {
    mcpBody.append(el("div", "empty", t("没有已安装的 MCP 服务")));
  } else {
    for (const p of mcps) mcpBody.append(pluginRow(p));
  }
  if (plugins.length === 0) {
    pluginBody.append(el("div", "empty", t("没有已安装的插件(profile 中无条目)")));
  } else {
    for (const p of plugins) pluginBody.append(pluginRow(p));
  }
}

function renderSkills() {
  skillBody.innerHTML = "";
  if (state.skills === null) {
    skillBody.append(el("div", "empty", t("正在读取…")));
    skillNote.textContent = "";
    return;
  }
  const invocable = state.skills.filter((s) => s.modelInvocable).length;
  skillNote.textContent = clean(t("技能由 DSH 自动加载,此处仅展示(模型可调用 {n} 个)", { n: String(invocable) }));
  if (state.skills.length === 0) {
    skillBody.append(el("div", "empty", t("暂无技能")));
    return;
  }
  for (const s of state.skills) {
    const row = el("div", "skill-row");
    const iconWrap = el("span", "plugin-icon");
    iconWrap.append(lineIcon(ICONS.cap, 13));
    const main = el("div", "skill-main");
    const nameLine = el("div", "skill-name");
    nameLine.append(el("span", undefined, s.name));
    if (!s.modelInvocable) nameLine.append(el("span", "badge", "info"));
    main.append(nameLine);
    if (s.description || s.whenToUse) {
      main.append(el("div", "skill-desc", (s.description || s.whenToUse || "").slice(0, 240)));
    }
    row.append(iconWrap, main);
    skillBody.append(row);
  }
}

function renderServer() {
  serverBadge.classList.toggle("on", state.serverUp);
  dot.className = "dot";
  serverText.textContent = state.serverUp ? t("已连接") : t("未连接");
  btnRestart.disabled = !state.serverUp;
  btnRestartText.textContent = t("重启服务器");
}

function renderAll() {
  applyStaticTexts();
  renderLanguage();
  renderPlugins();
  renderSkills();
  renderServer();
}

// ---------- 消息接收 ----------
window.addEventListener("message", (event) => {
  const msg = event.data as { kind: string; [key: string]: any };
  switch (msg.kind) {
    case "state":
      state.lang = msg.lang ?? "zh-cn";
      state.language = msg.language ?? "auto";
      state.serverUp = !!msg.serverUp;
      state.version = msg.version;
      state.parseError = msg.parseError;
      state.plugins = msg.plugins ?? [];
      state.skills = msg.skills ?? null;
      renderAll();
      break;
    case "notice":
      showNotice(String(msg.message ?? ""), msg.level === "error" ? "error" : "info");
      break;
    case "languageApplied":
      state.language = String(msg.language ?? "auto");
      renderLanguage();
      break;
  }
});

// 就绪:请求初始状态
vscode.postMessage({ kind: "ready" });
