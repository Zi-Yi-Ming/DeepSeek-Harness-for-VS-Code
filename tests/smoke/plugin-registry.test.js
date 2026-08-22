// pluginRegistry 读写 cordis.patch.yml 的冒烟测试(esbuild 编译后运行)
// 用法: node tests/smoke/plugin-registry.test.js
const { buildSync } = require("C:/Users/lihe4/Downloads/DeepSeek-Harness-for-VS-Code/node_modules/esbuild");
const fs = require("fs");
const os = require("os");
const path = require("path");
const repo = path.resolve(__dirname, "..", "..");
const out = path.join(os.tmpdir(), "registry-test-" + process.pid + ".cjs");
buildSync({
  entryPoints: [path.join(repo, "src/dsh/pluginRegistry.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: out,
  logLevel: "silent",
});

// 独立 DSH_HOME:测试不碰用户真实 profile
const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-home-"));
process.env.DSH_HOME = home;
const profileDir = path.join(home, "profiles", "web");
fs.mkdirSync(profileDir, { recursive: true });
const patchFile = path.join(profileDir, "cordis.patch.yml");
const PATCH = `# 头部注释(应保留)
# mcp 与插件混排
- insert:
    - id: mcp-codebase-memory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codebase-memory
        transport: stdio
        command: C:/tmp/mcp.exe
- insert:
    - id: mcp-figma
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: figma
        transport: streamable-http
        url: https://mcp.figma.com/mcp
- id: mcp-figma
  disabled: true
- insert:
    - id: git-rollback
      name: dsh-git-rollback
      config:
        enabled: true
        gitBin: git
`;
fs.writeFileSync(patchFile, PATCH);

const { readRegistry, togglePlugin } = require(out);
let fail = 0;
function check(name, ok) { console.log((ok ? "OK  " : "FAIL") + " " + name); if (!ok) fail++; }

// 1) 解析
let r = readRegistry();
check("解析无错误", !r.parseError && r.exists);
check("共 3 个插件条目", r.plugins.length === 3);
const mcp = r.plugins.find((p) => p.id === "mcp-codebase-memory");
const figma = r.plugins.find((p) => p.id === "mcp-figma");
const rollback = r.plugins.find((p) => p.id === "git-rollback");
check("MCP 识别(mcp-codebase-memory)", mcp && mcp.kind === "mcp" && mcp.serverName === "codebase-memory" && mcp.transport === "stdio");
check("MCP 识别(mcp-figma)", figma && figma.kind === "mcp" && figma.url === "https://mcp.figma.com/mcp");
check("普通插件识别(git-rollback)", rollback && rollback.kind === "plugin" && rollback.enabled === true);
check("disabled 覆盖生效(mcp-figma 禁用)", figma && figma.enabled === false && figma.disabledOverride === true);

// 2) 禁用 git-rollback
let toggled = togglePlugin("git-rollback", false);
check("禁用成功", toggled.ok && !toggled.snapshot.parseError);
const afterDisable = readRegistry();
check("禁用后 enabled=false", afterDisable.plugins.find((p) => p.id === "git-rollback")?.enabled === false);
const text1 = fs.readFileSync(patchFile, "utf8");
check("文件含 disabled 覆盖条目", text1.includes("disabled: true"));
check("头部注释保留", text1.startsWith("#"));

// 3) 重新启用 git-rollback
toggled = togglePlugin("git-rollback", true);
check("启用成功", toggled.ok);
const afterEnable = readRegistry();
check("启用后 enabled=true", afterEnable.plugins.find((p) => p.id === "git-rollback")?.enabled === true);
const yaml = require("js-yaml");
const ops2 = yaml.load(fs.readFileSync(patchFile, "utf8"));
const disableOps = ops2.filter((op) => op && typeof op === "object" && op.insert === undefined);
check("git-rollback 覆盖条目已移除", !disableOps.some((op) => op.id === "git-rollback"));
check("mcp-figma 覆盖条目仍在(不受影响)", disableOps.some((op) => op.id === "mcp-figma" && op.disabled === true));
// 原有条目保持
const still = readRegistry();
check("其余条目不受影响", still.plugins.length === 3 && still.plugins.find((p) => p.id === "mcp-figma")?.enabled === false);

// 4) 不存在的插件
toggled = togglePlugin("no-such-plugin", false);
check("未知插件返回错误", !toggled.ok && toggled.error);

// 5) 损坏 YAML
fs.writeFileSync(patchFile, "- insert: [broken\n  : : :");
r = readRegistry();
check("损坏 YAML 报告 parseError", r.parseError !== undefined);

try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
try { fs.unlinkSync(out); } catch {}
console.log("\n结果:", fail === 0 ? "全部通过 (" + 15 + " 项)" : fail + " 项失败");
process.exit(fail === 0 ? 0 : 1);
