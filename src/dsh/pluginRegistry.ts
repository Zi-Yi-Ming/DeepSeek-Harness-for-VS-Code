import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as yaml from "js-yaml";

/**
 * DSH 插件注册表(profile 级 cordis.patch.yml 的读写器)。
 *
 * DSH 服务器的插件树由多层 patch 组成:包内置 bundle 层 + profile 的
 * `cordis.patch.yml`(用户层)+ 主目录层 + --patch 覆盖层。用户"已下载/
 * 已安装"的插件(MCP 服务、dsh-git-rollback 等)都写在 profile 的
 * cordis.patch.yml 里,格式为 YAML patch 条目数组:
 *
 *   - insert:
 *       - id: mcp-codebase-memory
 *         name: '@deepseek-ai/dsh-mcp-client'
 *         config: { ... }
 *   - id: mcp-codebase-memory      # 按 id 覆盖行(禁用/改配置)
 *     disabled: true
 *
 * 启用/禁用的标准做法(与 DSH 内部 telemetry 开关一致):追加/移除
 * `{ id, disabled: true }` 覆盖条目。改动在下一次服务器启动时生效。
 * 本模块只做文件读写,不依赖 vscode,便于独立测试。
 */

export const DEFAULT_PROFILE = "web";

/** 插件条目(扁平化后的展示形态)。 */
export interface PluginEntry {
  id: string;
  name: string;
  /** mcp = @deepseek-ai/dsh-mcp-client 实例;plugin = 普通 DSH 插件。 */
  kind: "mcp" | "plugin";
  enabled: boolean;
  /** 覆盖条目是否存在于 patch 文件中(禁用状态的真实来源)。 */
  disabledOverride: boolean;
  config: Record<string, unknown>;
  /** MCP 实例的展示信息(从 config 提取)。 */
  serverName?: string;
  transport?: string;
  command?: string;
  url?: string;
}

export interface RegistrySnapshot {
  profileDir: string;
  patchPath: string;
  exists: boolean;
  parseError?: string;
  plugins: PluginEntry[];
}

/** DSH 主目录:优先 DSH_HOME 环境变量(测试用),否则 ~/.dsh。 */
export function dshHome(): string {
  const env = process.env.DSH_HOME?.trim();
  if (env) return env;
  return join(homedir(), ".dsh");
}

export function profileDir(profile = DEFAULT_PROFILE): string {
  return join(dshHome(), "profiles", profile);
}

export function patchPath(profile = DEFAULT_PROFILE): string {
  return join(profileDir(profile), "cordis.patch.yml");
}

const MCP_PACKAGE = "@deepseek-ai/dsh-mcp-client";

/** 读取 patch 文件并扁平化为插件条目列表(按文件内顺序,后出现的覆盖条目生效)。 */
export function readRegistry(profile = DEFAULT_PROFILE): RegistrySnapshot {
  const dir = profileDir(profile);
  const file = patchPath(profile);
  const base: RegistrySnapshot = { profileDir: dir, patchPath: file, exists: existsSync(file), plugins: [] };
  if (!base.exists) return base;

  let raw: string;
  try {
    raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch (error) {
    return { ...base, parseError: String(error) };
  }
  if (!raw.trim()) return base;

  let ops: unknown[];
  try {
    const parsed = yaml.load(raw);
    ops = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return { ...base, parseError: String(error) };
  }

  // 按 patch 应用顺序扁平化:insert 推入行;{ id, disabled } 覆盖行状态
  const rows = new Map<string, PluginEntry>();
  for (const op of ops) {
    if (!op || typeof op !== "object") continue;
    const o = op as Record<string, any>;
    if (Array.isArray(o.insert)) {
      for (const row of o.insert as unknown[]) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, any>;
        if (typeof r.id !== "string" || !r.id) continue;
        rows.set(r.id, rowToEntry(r));
      }
      continue;
    }
    if (typeof o.id === "string" && o.insert === undefined) {
      const target = rows.get(o.id);
      if (!target) continue; // 覆盖 bundle 层条目的情况:本文件不可见,跳过
      if (o.disabled === true) {
        target.enabled = false;
        target.disabledOverride = true;
      } else if (o.disabled === false) {
        target.enabled = true;
        target.disabledOverride = false;
      }
    }
  }
  return { ...base, plugins: [...rows.values()] };
}

function rowToEntry(row: Record<string, any>): PluginEntry {
  const config = (row.config && typeof row.config === "object" ? row.config : {}) as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name : row.id;
  const isMcp = name === MCP_PACKAGE || name.endsWith("/dsh-mcp-client");
  const entry: PluginEntry = {
    id: row.id,
    name,
    kind: isMcp ? "mcp" : "plugin",
    enabled: row.disabled !== true,
    disabledOverride: row.disabled === true,
    config,
  };
  if (isMcp) {
    if (typeof config.serverName === "string") entry.serverName = config.serverName;
    if (typeof config.transport === "string") entry.transport = config.transport;
    if (typeof config.command === "string") entry.command = config.command;
    if (typeof config.url === "string") entry.url = config.url;
  }
  return entry;
}

export interface ToggleResult {
  ok: boolean;
  error?: string;
  snapshot: RegistrySnapshot;
}

/**
 * 启用/禁用插件:追加 `{ id, disabled: true }` 覆盖条目(禁用)或移除该条目(启用)。
 * 保留文件头部注释;插件行本身不动。改动在服务器下次启动时生效。
 */
export function togglePlugin(id: string, enabled: boolean, profile = DEFAULT_PROFILE): ToggleResult {
  const file = patchPath(profile);
  const snapshot = readRegistry(profile);
  if (snapshot.parseError) {
    return { ok: false, error: snapshot.parseError, snapshot };
  }
  if (!snapshot.exists) {
    return { ok: false, error: `profile patch not found: ${file}`, snapshot };
  }
  const exists = snapshot.plugins.some((p) => p.id === id);
  if (!exists) {
    return { ok: false, error: `plugin not found in patch: ${id}`, snapshot };
  }
  try {
    const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    const ops = (yaml.load(text) as unknown[]) ?? [];
    // 移除该 id 的旧覆盖条目(仅非 insert 的覆盖行),保持其余条目原样
    const kept = ops.filter((op) => {
      if (!op || typeof op !== "object") return true;
      const o = op as Record<string, any>;
      return !(o.insert === undefined && o.id === id);
    });
    if (!enabled) kept.push({ id, disabled: true });
    const header = leadingComments(text);
    writeFileSync(file, header + yaml.dump(kept, { noRefs: true, lineWidth: -1, quotingType: '"' }));
    return { ok: true, snapshot: readRegistry(profile) };
  } catch (error) {
    return { ok: false, error: String(error), snapshot };
  }
}

/** 保留文件开头的注释(含空行),作为重写后的文件头。 */
function leadingComments(text: string): string {
  const lines = text.split("\n");
  let header = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      header += line + "\n";
      continue;
    }
    break;
  }
  return header;
}
