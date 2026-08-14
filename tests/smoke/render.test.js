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

  // 权限切换:change → permission 消息 → 乐观更新 → 投影校准
  const PERMS = { options: [{ value: "read-only", name: "read-only" }, { value: "workspace-write", name: "workspace-write" }, { value: "danger-full-access", name: "danger-full-access" }], currentValue: "read-only" };
  dispatch("init", { mode: "chat", locked: true, lang: "zh-cn", status: { connected: true }, sessions: [], current: "s1", events: [], approvals: [], questions: [], running: false, goal: undefined, context: undefined, permissions: PERMS, stats: undefined, todos: [], hasMore: false, queue: [] });
  await wait(80);
  let permSel = null;
  for (const s of document.querySelectorAll("select.tool-select")) {
    if ((s.closest(".tool-item")?.getAttribute("title") ?? "").includes("权限")) { permSel = s; break; }
  }
  check("权限选择器存在", !!permSel);
  if (permSel) {
    check("权限初始显示 read-only", permSel.value === "read-only");
    permSel.value = "workspace-write";
    permSel.dispatchEvent(new window.Event("change", { bubbles: true }));
    await wait(30);
    const permMsg = posted.find((p) => p.kind === "permission");
    check("权限 change 发出 permission 消息", !!permMsg && permMsg.preset === "workspace-write");
    check("权限乐观更新显示新值", permSel.value === "workspace-write");
    dispatch("permissions", { sessionId: "s1", value: { ...PERMS, currentValue: "workspace-write" } });
    await wait(50);
    check("权限投影校准后保持新值", permSel.value === "workspace-write");
  }

  let fail = 0;
  for (const [name, ok] of checks) {
    console.log((ok ? "OK  " : "FAIL") + " " + name);
    if (!ok) fail++;
  }
  console.log("\n结果:", fail === 0 ? "全部通过 (" + checks.length + " 项)" : fail + " 项失败");
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
