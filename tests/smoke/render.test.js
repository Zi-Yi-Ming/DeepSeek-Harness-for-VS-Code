// webview 渲染冒烟测试:jsdom 加载 dist/webview/ui.js,注入消息,验证 DOM
// 用法: node tests/smoke/render.test.js [dist路径]
const fs = require("fs");
const path = require("path");
const repo = path.resolve(__dirname, "..", "..");
const distDir = process.argv[2] || path.join(repo, "dist");
const jsdomPath = path.join(repo, "node_modules", "jsdom");
const uiJs = fs.readFileSync(path.join(distDir, "webview", "ui.js"), "utf8");

const { JSDOM } = require(jsdomPath);
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
  url: "http://localhost/chat",
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
window.location.reload = () => {};

window.eval(uiJs);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function dispatch(kind, payload) {
  window.dispatchEvent(new window.MessageEvent("message", { data: { kind, ...payload } }));
}

async function main() {
  const checks = [];
  const check = (name, ok) => { checks.push([name, ok]); };

  dispatch("init", { mode: "tab", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(50);

  // todo 面板:1 完成 + 1 进行中 + 2 待处理
  dispatch("todos", { sessionId: "s1", value: [
    { content: "完成的任务", status: "completed" },
    { content: "进行中的任务", status: "in_progress" },
    { content: "待处理任务A", status: "pending" },
    { content: "待处理任务B", status: "pending" },
  ] });
  await wait(50);

  const panel = document.querySelector(".todo-panel");
  check("todo 面板可见", !!panel && !panel.hidden);
  const summaryText = panel ? panel.querySelector(".todo-panel-summary").textContent : "";
  check("摘要含任务标题", summaryText.includes("任务"));
  check("摘要 1 已完成", summaryText.includes("1 已完成"));
  check("摘要 1 进行中", summaryText.includes("1 进行中"));
  check("摘要 2 待处理", summaryText.includes("2 待处理"));
  const rows = document.querySelectorAll(".todo-row");
  check("todo 行数=4", rows.length === 4);
  check("完成行 done 类", !!document.querySelector(".todo-row.done"));
  check("进行中行 active 类", !!document.querySelector(".todo-row.active"));
  check("待处理行 pending 类 x2", document.querySelectorAll(".todo-row.pending").length === 2);
  check("完成行有 svg 图标", !!document.querySelector(".todo-row.done .todo-status svg"));
  check("有 chevron 图标", !!document.querySelector(".todo-panel-chevron svg"));

  dispatch("todos", { sessionId: "s1", value: [] });
  await wait(50);
  check("空列表隐藏面板", panel.hidden === true);
  dispatch("todos", { sessionId: "s1", value: null });
  await wait(50);
  check("null 隐藏面板", panel.hidden === true);

  dispatch("todos", { sessionId: "s1", value: [
    { content: "a", status: "completed" },
    { content: "b", status: "completed" },
  ] });
  await wait(50);
  const s2 = document.querySelector(".todo-panel-summary").textContent;
  check("全完成摘要只显示已完成段", s2.includes("2 已完成") && !s2.includes("进行中") && !s2.includes("待处理"));

  // init 带 queue 恢复排队消息
  dispatch("init", { mode: "tab", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [], current: "s1", events: [], approvals: [], questions: [], running: true, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [
    { id: "q1", placement: "queued", message: { id: "m1", content: [{ type: "text", text: "排队消息一" }] } },
    { id: "q2", placement: "queued", message: { id: "m2", content: [{ type: "text", text: "排队消息二" }] } },
    { id: "q3", placement: "steering", message: { id: "m3", content: [{ type: "text", text: "转正中的不渲染" }] } },
  ] });
  await wait(50);
  const qRows = document.querySelectorAll(".msg-queued");
  check("init 恢复排队消息=2", qRows.length === 2);
  check("排队消息有插话按钮 x2", document.querySelectorAll(".btn-queued-steer").length === 2);
  check("steering 项不渲染", !Array.from(document.querySelectorAll(".msg-queued")).some((n) => n.textContent.includes("转正中")));

  dispatch("queue", { sessionId: "s1", items: [{ id: "q2", placement: "queued", message: { id: "m2", content: [{ type: "text", text: "排队消息二" }] } }] });
  await wait(50);
  check("差集清理后剩 1 条", document.querySelectorAll(".msg-queued").length === 1);
  check("剩余为 q2", document.querySelector(".msg-queued")?.textContent.includes("排队消息二") ?? false);

  posted = [];
  document.querySelector(".btn-queued-steer")?.click();
  await wait(10);
  const action = posted.find((p) => p.kind === "queueAction");
  check("插话按钮发 queueAction(steer)", !!action && action.itemId === "q2" && action.action?.kind === "steer");

  // 列表模式:聊天渲染类消息被忽略,会话类消息正常处理
  dispatch("init", { mode: "list", locked: false, lang: "zh-cn", status: { connected: true }, sessions: [{ sessionId: "s1", title: "会话A" }], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(50);
  check("列表模式渲染会话列表", !!document.querySelector(".list-view"));
  dispatch("todos", { sessionId: "s1", value: [{ content: "x", status: "pending" }] });
  dispatch("queue", { sessionId: "s1", items: [{ id: "qx", placement: "queued", message: { id: "mx", content: [{ type: "text", text: "q" }] } }] });
  await wait(50);
  check("列表模式忽略 todo 消息", !document.querySelector(".todo-panel") || document.querySelector(".todo-panel").hidden === true);
  check("列表模式忽略 queue 消息", document.querySelectorAll(".msg-queued").length === 0);
  dispatch("sessions", { sessions: [{ sessionId: "s1", title: "会话A" }, { sessionId: "s2", title: "会话B" }] });
  await wait(50);
  check("列表模式处理 sessions 消息", (document.querySelectorAll(".list-item").length ?? 0) > 0);

  // 流式渲染:chunk 节流 + streaming 光标类生命周期
  dispatch("init", { mode: "chat", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [], current: "s1", events: [], approvals: [], questions: [], running: true, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(50);
  dispatch("delta", { sessionId: "s1", events: [
    { event: { type: "turn/start", seq: 1, time: 1, data: { turn: 1 } } },
    { event: { type: "assistant/chunk", seq: 2, time: 2, data: { turn: 1, step: 0, chunk: { type: "block-start", index: 0, blockType: "text" } } } },
    { event: { type: "assistant/chunk", seq: 3, time: 3, data: { turn: 1, step: 0, chunk: { type: "text-delta", text: "你好" } } } },
    { event: { type: "assistant/chunk", seq: 4, time: 4, data: { turn: 1, step: 0, chunk: { type: "text-delta", text: "世界" } } } },
  ] });
  await wait(200); // 等待节流渲染
  check("流式文本渲染(你好世界)", (document.querySelector(".msg-assistant")?.textContent ?? "").includes("你好世界"));
  check("流式期间有 streaming 类", document.querySelectorAll(".streaming").length >= 1);
  dispatch("delta", { sessionId: "s1", events: [
    { event: { type: "assistant/message", seq: 5, time: 5, data: { turn: 1, step: 0, message: { content: [{ type: "text", text: "你好世界" }] } } } },
  ] });
  await wait(100);
  check("assistant/message 后 streaming 类移除", document.querySelectorAll(".streaming").length === 0);
  check("最终文本完整", (document.querySelector(".msg-assistant")?.textContent ?? "").includes("你好世界"));

  // 权限切换:点击胶囊 → 弹出菜单选项 → permission 消息 → 乐观更新 → 投影校准
  const PERMS = { options: [{ value: "read-only", name: "read-only" }, { value: "workspace-write", name: "workspace-write" }, { value: "danger-full-access", name: "danger-full-access" }], currentValue: "read-only" };
  dispatch("init", { mode: "chat", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: PERMS, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(80);
  let permPop = null;
  for (const p of document.querySelectorAll(".tool-pop")) {
    if ((p.getAttribute("title") ?? "").includes("权限")) { permPop = p; break; }
  }
  check("权限选择器存在", !!permPop);
  if (permPop) {
    check("权限初始显示只读", (permPop.querySelector(".tool-pop-value")?.textContent ?? "").includes("只读"));
    permPop.querySelector(".tool-pop-btn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await wait(20);
    check("权限菜单展开", !permPop.querySelector(".tool-pop-menu").hidden);
    const items = [...permPop.querySelectorAll(".tool-pop-item")];
    const target = items.find((i) => i.textContent.includes("工作区可写"));
    check("菜单含工作区可写项", !!target);
    target?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await wait(30);
    const permMsg = posted.find((p) => p.kind === "permission");
    check("权限点击发出 permission 消息", !!permMsg && permMsg.preset === "workspace-write");
    check("权限乐观更新显示新值", (permPop.querySelector(".tool-pop-value")?.textContent ?? "").includes("工作区可写"));
    dispatch("permissions", { sessionId: "s1", value: { ...PERMS, currentValue: "workspace-write" } });
    await wait(50);
    check("权限投影校准后保持新值", (permPop.querySelector(".tool-pop-value")?.textContent ?? "").includes("工作区可写"));
  }

  // 预设:已开始会话(blank=false)预设固定——胶囊标注当前模式,菜单只读展示当前一项
  dispatch("init", { mode: "chat", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [{ sessionId: "s1", title: "旧会话", running: false, blank: false, agentPreset: "router-standard", cwd: "/x", updatedAt: 1 }], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [] });
  dispatch("presets", { value: { presets: [
    { id: "standard", isDefault: false, name: "标准模式" },
    { id: "router-standard", isDefault: true, name: "Router Standard (experimental)" },
  ], authorable: true, hasDocument: false } });
  await wait(50);
  let presetPop = null;
  for (const p of document.querySelectorAll(".tool-pop")) {
    if ((p.getAttribute("title") ?? "").includes("预设")) { presetPop = p; break; }
  }
  check("旧会话预设胶囊显示当前模式", !!presetPop && (presetPop.querySelector(".tool-pop-value")?.textContent ?? "").includes("Router Standard"));
  if (presetPop) {
    presetPop.querySelector(".tool-pop-btn").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await wait(20);
    const items = [...presetPop.querySelectorAll(".tool-pop-item")];
    check("旧会话预设菜单只含当前模式", items.length === 1 && items[0].textContent.includes("Router Standard"));
    check("旧会话预设菜单标注固定", items[0].textContent.includes("固定") || items[0].textContent.includes("fixed"));
  }

  // 回合检查点分隔线 + 回退确认卡片
  dispatch("init", { mode: "chat", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(50);
  dispatch("rollbackCheckpointsData", { requestId: "init", sessionId: "s1", head: "abc", dirty: 0, checkpoints: [{ turn: 1, time: 1, commit: "c1", files: [], addedTotal: 0, deletedTotal: 0, truncated: false, hasAfter: true }] });
  await wait(50);
  dispatch("delta", { sessionId: "s1", events: [
    { event: { type: "turn/start", seq: 10, time: 10, data: { turn: 1 } } },
    { event: { type: "assistant/chunk", seq: 11, time: 11, data: { turn: 1, step: 0, chunk: { type: "block-start", index: 0, blockType: "text" } } } },
    { event: { type: "assistant/chunk", seq: 12, time: 12, data: { turn: 1, step: 0, chunk: { type: "text-delta", text: "回复" } } } },
  ] });
  await wait(150);
  check("渲染回合分隔线", document.querySelectorAll(".rb-divider").length >= 1);
  check("分隔线带还原按钮", document.querySelectorAll(".rb-divider-btn").length >= 1);
  posted = [];
  document.querySelector(".rb-divider-btn")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await wait(30);
  const rp = posted.find((p) => p.kind === "rollbackPreview");
  check("点击还原发 rollbackPreview", !!rp && rp.turn === 1);
  check("确认卡片出现(加载中)", !!document.querySelector(".rb-review-card"));
  dispatch("rollbackPreviewData", { requestId: rp?.requestId, sessionId: "s1", preview: { turn: 1, time: 1, commit: "c1", files: [{ path: "src/a.ts", added: 3, deleted: 1 }], addedTotal: 3, deletedTotal: 1, removedUntracked: [], untrackedUnknown: false, truncated: false } });
  await wait(50);
  check("预览显示文件行", !!document.querySelector(".rb-file-row"));
  check("预览有确认按钮", !!document.querySelector(".rb-confirm"));
  posted = [];
  document.querySelector(".rb-confirm")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  await wait(30);
  const cmd = posted.find((p) => p.kind === "command");
  check("确认回退发 /rollback 命令", !!cmd && cmd.line === "/rollback 1");

  // 语言切换回归:列表模式切语言后列表必须保留(不得 reload / 清空)
  dispatch("init", { mode: "list", locked: false, lang: "zh-cn", status: { connected: true }, sessions: [{ sessionId: "s1", title: "中文标题会话", running: false, blank: false, cwd: "C:/ws", updatedAt: 1 }], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: undefined, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(50);
  check("列表模式渲染", !!document.querySelector(".list-view"));
  check("列表项存在", document.querySelectorAll(".list-item").length === 1);
  dispatch("lang", { lang: "en" });
  await wait(30);
  check("切英文后列表仍在", !!document.querySelector(".list-view"));
  check("切英文后列表项仍在(用户内容不翻译)", document.querySelectorAll(".list-item").length === 1);
  check("切英文后标题翻译", document.querySelector(".list-title")?.textContent === "Conversations");
  dispatch("lang", { lang: "zh-cn" });
  await wait(30);
  check("切回中文列表仍在", !!document.querySelector(".list-view") && document.querySelectorAll(".list-item").length === 1);

  let fail = 0;
  for (const [name, ok] of checks) {
    console.log((ok ? "OK  " : "FAIL") + " " + name);
    if (!ok) fail++;
  }
  console.log("\n结果:", fail === 0 ? "全部通过 (" + checks.length + " 项)" : fail + " 项失败");
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
