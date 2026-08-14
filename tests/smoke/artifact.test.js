// 构建产物冒烟验证:关键特征串 + emoji 白名单检查
// 用法: node tests/smoke/artifact.test.js [dist路径] [扩展安装目录]
const fs = require("fs");
const path = require("path");
const repo = path.resolve(__dirname, "..", "..");
const distDir = process.argv[2] || path.join(repo, "dist");

let fail = 0;
function check(name, ok) { console.log((ok ? "OK  " : "FAIL") + " " + name); if (!ok) fail++; }

if (fs.existsSync(path.join(distDir, "webview/ui.js")) && fs.existsSync(path.join(distDir, "extension.js"))) {
  const ui = fs.readFileSync(path.join(distDir, "webview/ui.js"), "utf8");
  const ext = fs.readFileSync(path.join(distDir, "extension.js"), "utf8");
  const css = fs.readFileSync(path.join(repo, "media/chat.css"), "utf8");
  check("ui: queueAction 处理", ui.includes("queueAction"));
  check("ui: 插话按钮类", ui.includes("btn-queued-steer"));
  check("ui: todo 摘要(转义)", ui.includes("\\u4EFB\\u52A1")); // 任务
  check("ui: todo 已完成段(转义)", ui.includes("\\u5DF2\\u5B8C\\u6210"));
  check("ext: applyTodos", ext.includes("applyTodos"));
  check("ext: emit todos", ext.includes('emit("todos"'));
  check("ext: queueActionFailed", ext.includes("notice.queueActionFailed"));
  check("css: chevron 旋转", css.includes("todo-panel[open] .todo-panel-chevron"));
  check("css: 待处理虚线圆", css.includes("stroke-dasharray: 2.4 2.6"));
} else {
  check("dist 目录存在", false);
}

// emoji 检查(→↪✓ 排版符号白名单外)
const install = process.argv[3];
if (install && fs.existsSync(install)) {
  const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{23E9}-\u{23FA}\u{2139}\u{25B6}\u{25C0}]/u;
  let found = [];
  function walk(d) {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!/\.(js|json|md|css|ts)$/.test(f.name)) continue;
      const c = fs.readFileSync(p, "utf8");
      const m = c.match(EMOJI_RE);
      if (m) found.push(path.basename(p) + " :: " + m[0]);
    }
  }
  walk(install);
  check("安装目录 emoji=0", found.length === 0);
  if (found.length) console.log("  emoji:", found.slice(0, 5));
}

console.log("\n结果:", fail === 0 ? "全部通过" : fail + " 项失败");
process.exit(fail === 0 ? 0 : 1);
