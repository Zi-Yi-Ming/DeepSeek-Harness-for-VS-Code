// DeepSeek Harness 设置面板 v2:通用设置(Web 同源,双向同步)/ 模型 / Agent 预设 / 插件 / 技能 / 服务器
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

interface SchemaNode {
  uid: number;
  type: string;
  meta?: { required?: boolean; default?: unknown; min?: number; max?: number; step?: number; role?: string; value?: unknown };
  dict?: Record<string, number>;
  inner?: number;
  list?: number[];
  sKey?: number;
}

interface NamespaceView {
  ns: string;
  schema: { uid: number; refs: Record<string, SchemaNode> };
  value: Record<string, unknown>;
  applies: string;
}

interface LlmGroup {
  id: string;
  name: string;
  models: { id: string; name: string; reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string } }[];
}

interface ProviderView {
  provider: string;
  displayName: string;
  active: boolean;
}

interface PresetView {
  id: string;
  trust: string;
  isDefault: boolean;
  name?: string;
  description?: string;
}

interface SettingsState {
  lang: string;
  language: string;
  serverUp: boolean;
  version?: string;
  parseError?: string;
  plugins: PluginInfo[];
  skills: SkillInfo[] | null;
  namespaces: NamespaceView[];
  llmGroups: LlmGroup[];
  providers: ProviderView[];
  credentials: Record<string, { configured: boolean; writable: boolean }>;
  defaultModel?: Record<string, unknown>;
  defaultPreset?: Record<string, unknown>;
  presets: PresetView[];
  tab: string;
}

const state: SettingsState = {
  lang: "zh-cn",
  language: "auto",
  serverUp: false,
  plugins: [],
  skills: null,
  namespaces: [],
  llmGroups: [],
  providers: [],
  credentials: {},
  presets: [],
  tab: "general",
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
  chip: "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z|M12 9V5|M12 19v-3|M5 12h4|M15 12h4",
  preset: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M9 13h6|M9 17h6",
  box: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z|M3.27 6.96 12 12.01l8.73-5.05|M12 22.08V12",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  cap: "M22 10 12 5 2 10l10 5 10-5z|M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36L21 8|M21 3v5h-5",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6",
  power: "M18.36 6.64a9 9 0 1 1-12.73 0|M12 2v10",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M2 12h20|M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z",
  copy: "M9 11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2z|M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  trash: "M3 6h18|M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2|M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6",
  check: "M20 6 9 17l-5-5",
  lock: "M5 11h14v9H5z|M8 11V7a4 4 0 0 1 8 0v4",
  chevron: "M6 9l6 6 6-6",
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
  "通用": "General",
  "模型": "Models",
  "Agent 预设": "Agent Presets",
  "插件": "Plugins",
  "技能": "Skills",
  "服务器": "Server",
  "界面语言": "Interface language",
  "跟随系统": "Follow system",
  "中文": "中文",
  "English": "English",
  "语言切换即时生效,所有 DSH 界面(聊天/设置)同步切换": "Applies immediately to all DSH surfaces (chat / settings)",
  "Web 界面主题": "Web theme",
  "对话行为": "Conversation behavior",
  "Agent 循环": "Agent loop",
  "Shell": "Shell",
  "权限默认值": "Default permission",
  "Web 语言": "Web locale",
  "Web 搜索(DeepSeek)": "Web search (DeepSeek)",
  "忙碌时回车行为": "Enter while busy",
  "并行工具调用上限": "Max parallel tool calls",
  "默认权限预设": "Default permission preset",
  "Web 界面语言偏好": "Web locale preference",
  "API 密钥(env 引用)": "API key env ref",
  "模型提供方": "Model provider",
  "模型名称": "Model name",
  "基础 URL": "Base URL",
  "API 版本": "API version",
  "最大 tokens": "Max tokens",
  "最大使用次数": "Max uses",
  "API 密钥": "API key",
  "工作目录": "Working directory",
  "超时(ms)": "Timeout (ms)",
  "最大超时(ms)": "Max timeout (ms)",
  "最大输出字节": "Max output bytes",
  "最大溢出字节": "Max spill bytes",
  "宽限(ms)": "Grace (ms)",
  "PowerShell 路径": "PowerShell path",
  "浅色": "Light",
  "深色": "Dark",
  "排队": "Queue",
  "插话": "Steer",
  "只读": "Read only",
  "工作区可写": "Workspace write",
  "完全访问(危险)": "Full access (danger)",
  "保存": "Save",
  "已保存,已同步到 Web 端": "Saved and synced to the web UI",
  "保存失败": "Save failed",
  "默认模型": "Default model",
  "可用模型": "Available models",
  "思考深度": "Reasoning effort",
  "保存默认模型": "Save default model",
  "凭据": "Credentials",
  "已配置": "configured",
  "未配置": "not configured",
  "设置凭据": "Set",
  "清除": "Clear",
  "确认清除?": "Confirm clear?",
  "默认 Agent 预设": "Default agent preset",
  "预设列表": "Preset list",
  "默认": "default",
  "系统": "system",
  "用户": "user",
  "复制": "Copy",
  "删除": "Remove",
  "确认删除?": "Confirm remove?",
  "复制预设": "Copy preset",
  "加载中…": "Loading…",
  "MCP 服务": "MCP Servers",
  "DSH 插件": "DSH Plugins",
  "MCP": "MCP",
  "Plugin": "Plugin",
  "已禁用": "disabled",
  "插件/MCP 开关写入 profile 的 cordis.patch.yml,重启 DSH 服务器后生效": "Toggles write to the profile's cordis.patch.yml and take effect after the DSH server restarts",
  "启用": "Enable",
  "禁用": "Disable",
  "技能由 DSH 自动加载,此处仅展示(模型可调用 {n} 个)": "Skills are auto-loaded by DSH; shown here for reference ({n} invocable by the model)",
  "未连接": "Not connected",
  "已连接": "Connected",
  "重启服务器": "Restart server",
  "打开配置文件": "Open config file",
  "没有已安装的插件(profile 中无条目)": "No plugins installed (empty profile patch)",
  "没有已安装的 MCP 服务": "No MCP servers installed",
  "注入": "injected",
  "无法解析插件配置,请用「打开配置文件」手动检查": "Cannot parse the plugin config; open the config file to inspect it manually",
  "配置已更改,重启 DSH 服务器后生效": "Config changed; restart the DSH server to apply",
  "服务器重启中…": "Server is restarting…",
  "服务器不在线,模型/预设设置不可用": "The server is offline; model/preset settings are unavailable",
  "正在读取…": "Reading…",
  "暂无技能": "No skills available",
  "暂无预设": "No presets",
  "该字段不支持可视化编辑(结构较复杂)": "This field is not editable in the UI (complex structure)",
  "设置已保存": "Saved",
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

// ---------- 命名空间字段的友好标签与枚举选项 ----------
const NS_TITLES: Record<string, string> = {
  "ui-theme": "Web 界面主题",
  "ui-conversation": "对话行为",
  "agent-loop": "Agent 循环",
  "shell": "Shell",
  "permission": "权限默认值",
  "locale": "Web 语言",
  "web-search-deepseek": "Web 搜索(DeepSeek)",
};

const FIELD_LABELS: Record<string, string> = {
  "ui-theme:preference": "Web 界面语言偏好",
  "ui-conversation:busyEnter": "忙碌时回车行为",
  "agent-loop:maxParallelToolCalls": "并行工具调用上限",
  "shell:cwd": "工作目录",
  "shell:timeoutMs": "超时(ms)",
  "shell:maxTimeoutMs": "最大超时(ms)",
  "shell:maxOutputBytes": "最大输出字节",
  "shell:maxSpillBytes": "最大溢出字节",
  "shell:graceMs": "宽限(ms)",
  "shell:pwshPath": "PowerShell 路径",
  "permission:defaultPreset": "默认权限预设",
  "locale:preference": "Web 界面语言偏好",
  "web-search-deepseek:apiKeyEnv": "API 密钥(env 引用)",
  "web-search-deepseek:baseURL": "基础 URL",
  "web-search-deepseek:model": "模型",
  "web-search-deepseek:apiVersion": "API 版本",
  "web-search-deepseek:maxTokens": "最大 tokens",
  "web-search-deepseek:maxUses": "最大使用次数",
  "web-search-deepseek:apiKey": "API 密钥",
};

const ENUM_LABELS: Record<string, Record<string, string>> = {
  "ui-theme:preference": { light: "浅色", dark: "深色", system: "跟随系统" },
  "ui-conversation:busyEnter": { queue: "排队", steer: "插话" },
  "permission:defaultPreset": { "read-only": "只读", "workspace-write": "工作区可写", "danger-full-access": "完全访问(危险)" },
  "locale:preference": { zh: "中文", en: "English" },
};

// ---------- 骨架 ----------
const app = document.getElementById("app")!;
const root = el("div", "settings-root");

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

const notice = el("div", "notice");
root.append(notice);

// 标签栏
const tabs = el("div", "settings-tabs");
const TAB_DEFS: { id: string; icon: string; label: string }[] = [
  { id: "general", icon: ICONS.gear, label: "通用" },
  { id: "models", icon: ICONS.chip, label: "模型" },
  { id: "presets", icon: ICONS.preset, label: "Agent 预设" },
  { id: "plugins", icon: ICONS.box, label: "插件" },
  { id: "skills", icon: ICONS.cap, label: "技能" },
  { id: "server", icon: ICONS.globe, label: "服务器" },
];
const tabButtons: { button: HTMLButtonElement; id: string }[] = [];
for (const def of TAB_DEFS) {
  const b = el("button", "settings-tab", def.label);
  b.dataset.label = def.label;
  b.append(lineIcon(def.icon, 13));
  b.dataset.tab = def.id;
  b.addEventListener("click", () => {
    state.tab = def.id;
    renderAll();
  });
  tabs.append(b);
  tabButtons.push({ button: b, id: def.id });
}
root.append(tabs);

// 各标签内容容器
const content = el("div", "settings-content");
root.append(content);

app.append(root);

function showNotice(message: string, kind: "info" | "error") {
  notice.textContent = clean(message);
  notice.className = "notice show " + kind;
  setTimeout(() => notice.classList.remove("show"), 4000);
}

// ---------- 通用设置:界面语言 + schema 驱动表单 ----------

function renderGeneral(host: HTMLElement) {
  host.innerHTML = "";
  // 界面语言
  const langSection = el("div", "section");
  const langHead = el("div", "section-head");
  langHead.append(lineIcon(ICONS.gear, 13), el("span", undefined, t("界面语言")));
  langSection.append(langHead);
  const langRow = el("div", "lang-row");
  const seg = el("div", "seg");
  for (const opt of [
    { value: "auto", label: t("跟随系统") },
    { value: "zh-cn", label: t("中文") },
    { value: "en", label: t("English") },
  ]) {
    const b = el("button", "", opt.label);
    b.dataset.value = opt.value;
    if (opt.value === state.language) b.classList.add("active");
    b.addEventListener("click", () => vscode.postMessage({ kind: "setLanguage", lang: opt.value }));
    seg.append(b);
  }
  langRow.append(seg, el("span", "section-note", t("语言切换即时生效,所有 DSH 界面(聊天/设置)同步切换")));
  langSection.append(langRow);
  host.append(langSection);

  // 每个命名空间一个表单
  for (const ns of state.namespaces) {
    const section = el("div", "section");
    const head = el("div", "section-head");
    head.append(lineIcon(ICONS.gear, 13), el("span", undefined, t(NS_TITLES[ns.ns] ?? ns.ns)));
    if (ns.applies === "restart") head.append(el("span", "hint", t("配置已更改,重启 DSH 服务器后生效")));
    section.append(head);
    const body = el("div", "section-body");
    const form = renderNamespaceForm(ns);
    if (form) body.append(form);
    else body.append(el("div", "section-note", t("该字段不支持可视化编辑(结构较复杂)")));
    section.append(body);
    host.append(section);
  }
}

/** 按 schema 渲染命名空间表单;返回收集控件值的容器。 */
function renderNamespaceForm(ns: NamespaceView): HTMLElement | null {
  const refs = ns.schema.refs;
  const rootNode = refs[String(ns.schema.uid)];
  if (!rootNode || rootNode.type !== "object") return null;
  const form = el("div", "ns-form");
  form.dataset.ns = ns.ns;
  let editable = false;

  const addField = (key: string, node: SchemaNode) => {
    const resolved = resolveField(refs, node);
    if (!resolved) return false;
    const wrap = el("div", "form-row");
    const label = el("label", "form-label", t(FIELD_LABELS[`${ns.ns}:${key}`] ?? key));
    label.dataset.key = key; // 保存时按真实字段名回读
    const current = (ns.value as Record<string, any>)[key];
    let control: HTMLElement;

    if (resolved.type === "select") {
      const sel = el("select", "form-select");
      for (const opt of resolved.options ?? []) {
        const o = el("option", "", ENUM_LABELS[`${ns.ns}:${key}`]?.[opt] ?? opt);
        o.value = opt;
        if (String(current) === opt) o.selected = true;
        sel.append(o);
      }
      sel.addEventListener("change", () => saveNs(ns.ns));
      control = sel;
    } else if (resolved.type === "number") {
      const inp = el("input", "form-input") as HTMLInputElement;
      inp.type = "number";
      if (resolved.min !== undefined) inp.min = String(resolved.min);
      if (resolved.max !== undefined) inp.max = String(resolved.max);
      if (resolved.step !== undefined) inp.step = String(resolved.step);
      if (current !== undefined) inp.value = String(current);
      inp.addEventListener("change", () => saveNs(ns.ns));
      control = inp;
    } else if (resolved.type === "boolean") {
      const cb = el("input", "form-checkbox") as HTMLInputElement;
      cb.type = "checkbox";
      cb.checked = current === true;
      cb.addEventListener("change", () => saveNs(ns.ns));
      control = cb;
    } else if (resolved.type === "multicheck") {
      const box = el("div", "form-multicheck");
      for (const opt of resolved.options ?? []) {
        const lab = el("label", "form-chip");
        const cb = el("input", "") as HTMLInputElement;
        cb.type = "checkbox";
        cb.value = opt;
        const arr = Array.isArray(current) ? (current as unknown[]) : [];
        cb.checked = arr.includes(opt);
        cb.addEventListener("change", () => saveNs(ns.ns));
        lab.append(cb, el("span", undefined, ENUM_LABELS[`${ns.ns}:${key}`]?.[opt] ?? opt));
        box.append(lab);
      }
      control = box;
    } else {
      // string(含 secret)
      const inp = el("input", "form-input") as HTMLInputElement;
      inp.type = node.meta?.role === "secret" ? "password" : "text";
      if (current !== undefined && current !== null) inp.value = String(current);
      inp.placeholder = node.meta?.role === "secret" ? "••••••" : "";
      inp.addEventListener("change", () => saveNs(ns.ns));
      control = inp;
    }
    wrap.append(label, control);
    form.append(wrap);
    return true;
  };

  for (const [key, refUid] of Object.entries(rootNode.dict ?? {})) {
    const node = refs[String(refUid)];
    if (!node) continue;
    if (addField(key, node)) editable = true;
  }
  if (!editable) return null;

  const saveRow = el("div", "form-actions");
  const btnSave = el("button", "btn primary btn-save");
  btnSave.append(lineIcon(ICONS.check, 12), el("span", undefined, t("保存")));
  btnSave.addEventListener("click", () => {
    const ok = saveNs(ns.ns);
    if (ok) showNotice(t("设置已保存"), "info");
  });
  saveRow.append(btnSave);
  form.append(saveRow);
  return form;
}

interface ResolvedField {
  type: "select" | "number" | "boolean" | "multicheck" | "string";
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

function resolveField(refs: Record<string, SchemaNode>, node: SchemaNode): ResolvedField | null {
  switch (node.type) {
    case "string":
      return { type: "string" };
    case "number":
      return { type: "number", min: node.meta?.min, max: node.meta?.max, step: node.meta?.step };
    case "boolean":
      return { type: "boolean" };
    case "union": {
      const members = (node.list ?? []).map((u) => refs[String(u)]);
      if (members.every((m) => m && m.type === "const")) {
        const options = members.map((m) => String(m!.meta?.value));
        if (options.every((o) => o !== "null" && o !== "undefined")) return { type: "select", options };
      }
      // 单个成员的 union(如 const null)视为不可编辑
      return null;
    }
    case "array": {
      const inner = refs[String(node.inner ?? 0)];
      if (inner && inner.type === "union") {
        const members = (inner.list ?? []).map((u) => refs[String(u)]);
        if (members.every((m) => m && m.type === "const")) {
          return { type: "multicheck", options: members.map((m) => String(m!.meta?.value)) };
        }
      }
      return null;
    }
    case "const":
      return null;
    case "object":
    case "dict":
      return null;
    default:
      return null;
  }
}

/** 收集命名空间表单控件的值并推送 settings.update。 */
function saveNs(ns: string): boolean {
  const form = content.querySelector<HTMLElement>(`.ns-form[data-ns="${ns}"]`);
  if (!form) return false;
  const patch: Record<string, unknown> = {};
  form.querySelectorAll<HTMLElement>(".form-row").forEach((row) => {
    const label = row.querySelector<HTMLElement>(".form-label");
    if (!label) return;
    const key = label.dataset.key ?? label.textContent ?? "";
    const sel = row.querySelector<HTMLSelectElement>("select.form-select");
    const num = row.querySelector<HTMLInputElement>("input[type=number].form-input");
    const txt = row.querySelector<HTMLInputElement>("input[type=text].form-input, input[type=password].form-input");
    const cb = row.querySelector<HTMLInputElement>("input[type=checkbox].form-checkbox");
    const multi = row.querySelector<HTMLElement>(".form-multicheck");
    if (sel) patch[key] = sel.value;
    else if (num) patch[key] = Number(num.value);
    else if (cb) patch[key] = cb.checked;
    else if (multi) {
      patch[key] = Array.from(multi.querySelectorAll<HTMLInputElement>("input:checked")).map((i) => i.value);
    } else if (txt) patch[key] = txt.value;
  });
  vscode.postMessage({ kind: "updateSetting", ns, patch });
  return true;
}

// ---------- 模型 ----------

function renderModels(host: HTMLElement) {
  host.innerHTML = "";
  if (!state.serverUp) {
    host.append(el("div", "empty", t("服务器不在线,模型/预设设置不可用")));
    return;
  }
  // 默认模型
  const dmSection = el("div", "section");
  const dmHead = el("div", "section-head");
  dmHead.append(lineIcon(ICONS.chip, 13), el("span", undefined, t("默认模型")));
  dmSection.append(dmHead);
  const dmBody = el("div", "section-body");
  const dm = state.defaultModel as Record<string, any> | undefined;
  const currentProvider = typeof dm?.provider === "string" ? dm.provider : state.llmGroups[0]?.id;
  const group = state.llmGroups.find((g) => g.id === currentProvider);
  const currentModel = typeof dm?.model === "string" ? dm.model : group?.models[0]?.id;
  const model = group?.models.find((m) => m.id === currentModel);

  const selProvider = el("select", "form-select");
  for (const g of state.llmGroups) {
    const o = el("option", "", g.name);
    o.value = g.id;
    if (g.id === currentProvider) o.selected = true;
    selProvider.append(o);
  }
  const selModel = el("select", "form-select");
  for (const m of group?.models ?? []) {
    const o = el("option", "", m.name);
    o.value = m.id;
    if (m.id === currentModel) o.selected = true;
    selModel.append(o);
  }
  const selEffort = el("select", "form-select");
  for (const e of model?.reasoning?.efforts ?? []) {
    const o = el("option", "", e.name);
    o.value = e.id;
    if ((typeof dm?.reasoningEffort === "string" ? dm.reasoningEffort : model?.reasoning?.defaultEffort) === e.id) o.selected = true;
    selEffort.append(o);
  }
  selProvider.addEventListener("change", () => {
    const g = state.llmGroups.find((x) => x.id === selProvider.value);
    selModel.innerHTML = "";
    for (const m of g?.models ?? []) {
      const o = el("option", "", m.name);
      o.value = m.id;
      selModel.append(o);
    }
    if (g?.models[0]) {
      const m = g.models[0];
      selEffort.innerHTML = "";
      for (const e of m.reasoning?.efforts ?? []) {
        const o = el("option", "", e.name);
        o.value = e.id;
        selEffort.append(o);
      }
    }
  });
  const row = (label: string, c: HTMLElement) => {
    const w = el("div", "form-row");
    w.append(el("label", "form-label", label), c);
    return w;
  };
  dmBody.append(
    row(t("模型提供方"), selProvider),
    row(t("模型名称"), selModel),
    row(t("思考深度"), selEffort),
  );
  const btn = el("button", "btn primary btn-save");
  btn.append(lineIcon(ICONS.check, 12), el("span", undefined, t("保存默认模型")));
  btn.addEventListener("click", () => {
    const g = state.llmGroups.find((x) => x.id === selProvider.value);
    const m = g?.models.find((x) => x.id === selModel.value);
    vscode.postMessage({
      kind: "updateDefaultModel",
      provider: selProvider.value,
      model: selModel.value,
      effort: selEffort.value,
    });
    showNotice(t("设置已保存"), "info");
  });
  const dmActions = el("div", "form-actions");
  dmActions.append(btn);
  dmBody.append(dmActions);
  dmSection.append(dmBody);
  host.append(dmSection);

  // 可用模型
  const avSection = el("div", "section");
  const avHead = el("div", "section-head");
  avHead.append(lineIcon(ICONS.chip, 13), el("span", undefined, t("可用模型")));
  avSection.append(avHead);
  const avBody = el("div", "section-body");
  for (const g of state.llmGroups) {
    const details = el("details", "model-group");
    const summary = el("summary", "model-group-summary");
    summary.append(el("span", undefined, g.name), el("span", "model-count", `${g.models.length}`));
    details.append(summary);
    const list = el("div", "model-list");
    for (const m of g.models) {
      const row = el("div", "model-item");
      const line = el("div", "model-item-name");
      line.append(el("span", undefined, m.name), el("span", "plugin-id", m.id));
      if (m.reasoning?.efforts?.length) {
        line.append(el("span", "badge", `${t("思考深度")}: ${m.reasoning.efforts.map((e) => e.name).join("/")}`));
      }
      row.append(line);
      list.append(row);
    }
    details.append(list);
    avBody.append(details);
  }
  avSection.append(avBody);
  host.append(avSection);

  // 凭据
  const credSection = el("div", "section");
  const credHead = el("div", "section-head");
  credHead.append(lineIcon(ICONS.lock, 13), el("span", undefined, t("凭据")));
  credSection.append(credHead);
  const credBody = el("div", "section-body");
  const active = state.providers.filter((p) => p.active);
  if (active.length === 0) credBody.append(el("div", "empty", t("暂无凭据")));
  for (const p of active) {
    const row = el("div", "plugin-row");
    const main = el("div", "plugin-main");
    const nameLine = el("div", "plugin-name");
    nameLine.append(el("span", undefined, p.displayName), el("span", "plugin-id", p.provider));
    const info = state.credentials[p.provider];
    nameLine.append(el("span", "badge" + (info?.configured ? "" : " off"), info?.configured ? t("已配置") : t("未配置")));
    main.append(nameLine);
    row.append(main);
    const input = el("input", "form-input cred-input") as HTMLInputElement;
    input.type = "password";
    input.placeholder = "••••••";
    input.hidden = true;
    const btnSet = el("button", "btn btn-sm", t("设置凭据"));
    btnSet.addEventListener("click", () => {
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value) {
        vscode.postMessage({ kind: "setCredential", ref: p.provider, value: input.value });
        input.value = "";
        input.hidden = true;
      }
    });
    const btnClear = el("button", "btn btn-sm btn-danger", t("清除"));
    let armed = false;
    btnClear.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        btnClear.textContent = t("确认清除?");
        setTimeout(() => {
          armed = false;
          btnClear.textContent = t("清除");
        }, 3000);
        return;
      }
      vscode.postMessage({ kind: "unsetCredential", ref: p.provider });
      armed = false;
      btnClear.textContent = t("清除");
    });
    const actions = el("div", "plugin-row-actions");
    actions.append(input, btnSet, btnClear);
    row.append(actions);
    credBody.append(row);
  }
  credSection.append(credBody);
  host.append(credSection);
}

// ---------- Agent 预设 ----------

function renderPresets(host: HTMLElement) {
  host.innerHTML = "";
  if (!state.serverUp) {
    host.append(el("div", "empty", t("服务器不在线,模型/预设设置不可用")));
    return;
  }
  const dpSection = el("div", "section");
  const dpHead = el("div", "section-head");
  dpHead.append(lineIcon(ICONS.preset, 13), el("span", undefined, t("默认 Agent 预设")));
  dpSection.append(dpHead);
  const dpBody = el("div", "section-body");
  const sel = el("select", "form-select");
  for (const p of state.presets) {
    const o = el("option", "", p.name ?? p.id);
    o.value = p.id;
    if ((state.defaultPreset as Record<string, any>)?.default === p.id) o.selected = true;
    sel.append(o);
  }
  const row = el("div", "form-row");
  row.append(el("label", "form-label", t("默认 Agent 预设")), sel);
  const btn = el("button", "btn primary btn-save");
  btn.append(lineIcon(ICONS.check, 12), el("span", undefined, t("保存")));
  btn.addEventListener("click", () => {
    vscode.postMessage({ kind: "updateDefaultPreset", id: sel.value });
    showNotice(t("设置已保存"), "info");
  });
  const dpActions = el("div", "form-actions");
  dpActions.append(btn);
  dpBody.append(row, dpActions);
  dpSection.append(dpBody);
  host.append(dpSection);

  const listSection = el("div", "section");
  const listHead = el("div", "section-head");
  listHead.append(lineIcon(ICONS.preset, 13), el("span", undefined, t("预设列表")));
  listSection.append(listHead);
  const listBody = el("div", "section-body");
  if (state.presets.length === 0) listBody.append(el("div", "empty", t("暂无预设")));
  for (const p of state.presets) {
    const row = el("div", "plugin-row");
    const main = el("div", "plugin-main");
    const nameLine = el("div", "plugin-name");
    nameLine.append(el("span", undefined, p.name ?? p.id), el("span", "plugin-id", p.id));
    nameLine.append(el("span", "badge", p.trust === "user" ? t("用户") : t("系统")));
    if (p.isDefault) nameLine.append(el("span", "badge mcp", t("默认")));
    main.append(nameLine);
    if (p.description) main.append(el("div", "plugin-detail", p.description.slice(0, 200)));
    row.append(main);
    const actions = el("div", "plugin-row-actions");
    const btnCopy = el("button", "btn btn-sm", t("复制"));
    btnCopy.title = t("复制预设");
    btnCopy.append(lineIcon(ICONS.copy, 11));
    btnCopy.addEventListener("click", () => vscode.postMessage({ kind: "presetAction", action: "copy", id: p.id }));
    actions.append(btnCopy);
    if (p.trust === "user") {
      const btnDel = el("button", "btn btn-sm btn-danger", t("删除"));
      btnDel.title = t("删除预设");
      btnDel.append(lineIcon(ICONS.trash, 11));
      let armed = false;
      btnDel.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          btnDel.textContent = t("确认删除?");
          setTimeout(() => {
            armed = false;
            btnDel.textContent = t("删除");
          }, 3000);
          return;
        }
        vscode.postMessage({ kind: "presetAction", action: "remove", id: p.id });
        armed = false;
        btnDel.textContent = t("删除");
      });
      actions.append(btnDel);
    }
    row.append(actions);
    listBody.append(row);
  }
  listSection.append(listBody);
  host.append(listSection);
}

// ---------- 插件(MCP + DSH 插件) ----------

function pluginRow(p: PluginInfo): HTMLDivElement {
  const row = el("div", "plugin-row");
  const icon = el("span", "plugin-icon" + (p.kind === "mcp" ? " mcp" : ""));
  icon.append(lineIcon(p.kind === "mcp" ? ICONS.link : ICONS.box, 14));
  const main = el("div", "plugin-main");
  const nameLine = el("div", "plugin-name");
  nameLine.append(el("span", undefined, p.serverName ?? p.name));
  const badge = el("span", "badge" + (p.kind === "mcp" ? " mcp" : ""));
  badge.textContent = p.kind === "mcp" ? t("MCP") : t("Plugin");
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

function renderPlugins(host: HTMLElement) {
  host.innerHTML = "";
  const mcpSection = el("div", "section");
  const mcpHead = el("div", "section-head");
  mcpHead.append(lineIcon(ICONS.link, 13), el("span", undefined, t("MCP 服务")));
  mcpSection.append(mcpHead);
  const mcpBody = el("div", "section-body");
  const mcps = state.plugins.filter((p) => p.kind === "mcp");
  if (state.parseError) {
    mcpBody.append(el("div", "empty", t("无法解析插件配置,请用「打开配置文件」手动检查")));
  } else if (mcps.length === 0) {
    mcpBody.append(el("div", "empty", t("没有已安装的 MCP 服务")));
  } else {
    for (const p of mcps) mcpBody.append(pluginRow(p));
  }
  mcpSection.append(mcpBody);
  host.append(mcpSection);

  const pluginSection = el("div", "section");
  const pluginHead = el("div", "section-head");
  pluginHead.append(lineIcon(ICONS.box, 13), el("span", undefined, t("DSH 插件")));
  pluginSection.append(pluginHead);
  const pluginNote = el("div", "section-note", t("插件/MCP 开关写入 profile 的 cordis.patch.yml,重启 DSH 服务器后生效"));
  pluginSection.append(pluginNote);
  const pluginBody = el("div", "section-body");
  const plugins = state.plugins.filter((p) => p.kind !== "mcp");
  if (state.parseError) {
    pluginBody.append(el("div", "empty", t("无法解析插件配置,请用「打开配置文件」手动检查")));
  } else if (plugins.length === 0) {
    pluginBody.append(el("div", "empty", t("没有已安装的插件(profile 中无条目)")));
  } else {
    for (const p of plugins) pluginBody.append(pluginRow(p));
  }
  pluginSection.append(pluginBody);
  host.append(pluginSection);
}

// ---------- 技能 ----------

function renderSkills(host: HTMLElement) {
  host.innerHTML = "";
  const skillSection = el("div", "section");
  const skillHead = el("div", "section-head");
  skillHead.append(lineIcon(ICONS.cap, 13), el("span", undefined, t("技能")));
  skillSection.append(skillHead);
  const skillNote = el("div", "section-note");
  skillSection.append(skillNote);
  const skillBody = el("div", "section-body");
  if (state.skills === null) {
    skillBody.append(el("div", "empty", t("正在读取…")));
  } else {
    const invocable = state.skills.filter((s) => s.modelInvocable).length;
    skillNote.textContent = clean(t("技能由 DSH 自动加载,此处仅展示(模型可调用 {n} 个)", { n: String(invocable) }));
    if (state.skills.length === 0) {
      skillBody.append(el("div", "empty", t("暂无技能")));
    } else {
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
  }
  skillSection.append(skillNote, skillBody);
  host.append(skillSection);
}

// ---------- 服务器 ----------

function renderServer(host: HTMLElement) {
  host.innerHTML = "";
  const serverSection = el("div", "section");
  const serverHead = el("div", "section-head");
  serverHead.append(lineIcon(ICONS.globe, 13), el("span", undefined, t("服务器")));
  serverSection.append(serverHead);
  const serverBody = el("div", "section-body");
  const actions = el("div", "server-actions");
  const btnRestart = el("button", "btn primary");
  btnRestart.append(lineIcon(ICONS.power, 12), el("span", undefined, t("重启服务器")));
  btnRestart.disabled = !state.serverUp;
  btnRestart.addEventListener("click", () => {
    btnRestart.disabled = true;
    btnRestart.querySelector("span")!.textContent = t("服务器重启中…");
    vscode.postMessage({ kind: "restartServer" });
  });
  const btnOpen = el("button", "btn");
  btnOpen.append(lineIcon(ICONS.file, 12), el("span", undefined, t("打开配置文件")));
  btnOpen.addEventListener("click", () => vscode.postMessage({ kind: "openPatch" }));
  actions.append(btnRestart, btnOpen);
  serverBody.append(actions);
  serverSection.append(serverBody);
  host.append(serverSection);
}

// ---------- 渲染 ----------

function renderAll() {
  titleText.textContent = t("设置");
  for (const { button, id } of tabButtons) {
    button.classList.toggle("active", id === state.tab);
    const key = button.dataset.label ?? "";
    if (key && button.firstChild) button.firstChild.textContent = clean(t(key));
  }
  const host = content;
  host.innerHTML = "";
  switch (state.tab) {
    case "general":
      renderGeneral(host);
      break;
    case "models":
      renderModels(host);
      break;
    case "presets":
      renderPresets(host);
      break;
    case "plugins":
      renderPlugins(host);
      break;
    case "skills":
      renderSkills(host);
      break;
    case "server":
      renderServer(host);
      break;
    default:
      renderGeneral(host);
  }
  serverBadge.classList.toggle("on", state.serverUp);
  serverText.textContent = state.serverUp ? t("已连接") : t("未连接");
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
      state.namespaces = msg.namespaces ?? [];
      state.llmGroups = msg.llmGroups ?? [];
      state.providers = msg.providers ?? [];
      state.credentials = msg.credentials ?? {};
      state.defaultModel = msg.defaultModel;
      state.defaultPreset = msg.defaultPreset;
      state.presets = msg.presets ?? [];
      renderAll();
      break;
    case "notice":
      showNotice(String(msg.message ?? ""), msg.level === "error" ? "error" : "info");
      break;
    case "languageApplied":
      state.language = String(msg.language ?? "auto");
      renderAll();
      break;
  }
});

// 就绪:请求初始状态
vscode.postMessage({ kind: "ready" });
